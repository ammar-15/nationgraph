import type { Contact } from "./types";

/* ---------- Access + rate limiting ---------- */

const buckets = new Map<string, { count: number; reset: number }>();

/** Fixed-window, per-IP limiter. In-memory per instance: enough to stop runaway spend on a demo URL. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    return { ok: true, retryAfter: 0 };
  }
  if (b.count >= limit) return { ok: false, retryAfter: Math.ceil((b.reset - now) / 1000) };
  b.count++;
  return { ok: true, retryAfter: 0 };
}

export function clientIp(req: Request) {
  return (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "local";
}

/** Returns an error Response if the request is not allowed, otherwise null. */
export function guardRequest(req: Request, scope: string, limit: number, windowMs = 60 * 60 * 1000) {
  const code = process.env.ACCESS_CODE;
  if (code && req.headers.get("x-access-code") !== code) {
    return Response.json({ error: "Access code required." }, { status: 401 });
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { error: "ANTHROPIC_API_KEY is not configured. Add it in .env or Vercel env vars." },
      { status: 500 },
    );
  }
  const rl = rateLimit(`${scope}:${clientIp(req)}`, limit, windowMs);
  if (!rl.ok) {
    return Response.json(
      { error: `Rate limit reached. Try again in ${rl.retryAfter}s.` },
      { status: 429, headers: { "Retry-After": String(rl.retryAfter) } },
    );
  }
  return null;
}

/* ---------- Input hygiene ---------- */

/** Collapse whitespace, strip control chars and angle brackets, cap length. */
export function cleanInput(v: unknown, max = 200) {
  if (typeof v !== "string") return "";
  return v
    .replace(/[\u0000-\u001f\u007f<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Strip anything that looks like an instruction aimed at the model from scraped text. */
export function neutralizeScraped(text: string, max = 600) {
  return text
    .replace(/<[^>]*>/g, " ")
    .replace(/(ignore|disregard) (all|any|previous|prior) (instructions|prompts?)/gi, "[removed]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/* ---------- URL safety + verification ---------- */

const PRIVATE_HOST = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|0\.|169\.254\.|\[?::1\]?)/i;

export function isSafePublicUrl(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (PRIVATE_HOST.test(u.hostname)) return false;
    if (u.username || u.password) return false;
    return u.hostname.includes(".");
  } catch {
    return false;
  }
}

const pageCache = new Map<string, Promise<string | null>>();

/** Fetch up to ~300KB of a public page's text. null when unreachable. */
export function fetchPageText(raw: string): Promise<string | null> {
  if (!isSafePublicUrl(raw)) return Promise.resolve(null);
  const hit = pageCache.get(raw);
  if (hit) return hit;
  const p = (async () => {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 7000);
      const res = await fetch(raw, {
        redirect: "follow",
        signal: ctrl.signal,
        headers: { "User-Agent": "Mozilla/5.0 (compatible; SLEDScout/0.1; research prototype)" },
      });
      clearTimeout(t);
      if (!res.ok && res.status !== 403) return null; // 403 = bot-blocked but exists
      if (res.status === 403) return "";
      const reader = res.body?.getReader();
      if (!reader) return "";
      let size = 0;
      const chunks: Uint8Array[] = [];
      while (size < 300_000) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value);
        size += value.length;
      }
      reader.cancel().catch(() => {});
      return new TextDecoder().decode(Buffer.concat(chunks.map((c) => Buffer.from(c))));
    } catch {
      return null;
    }
  })();
  pageCache.set(raw, p);
  return p;
}

/** Run async work over items with a concurrency cap. */
export async function pool<T, R>(items: T[], size: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/* ---------- Contact guardrails ---------- */

const FREEMAIL = /@(gmail|yahoo|hotmail|outlook|aol|icloud|proton(mail)?|live|msn|me)\./i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Keep only work contacts published on public pages.
 * - drops personal/freemail addresses
 * - an email is kept only if it literally appears on its cited source page
 * - unverifiable emails are removed (never guessed from name patterns)
 */
export async function sanitizeContacts(contacts: Contact[]): Promise<Contact[]> {
  const safe = contacts.filter((c) => isSafePublicUrl(c.sourceUrl));
  return pool(safe, 4, async (c) => {
    const next: Contact = { ...c, emailVerified: false };
    if (next.publicEmail) {
      const email = next.publicEmail.toLowerCase();
      if (!EMAIL.test(email) || FREEMAIL.test(email)) {
        next.publicEmail = null;
      } else {
        const page = await fetchPageText(c.sourceUrl);
        if (page && page.toLowerCase().includes(email)) next.emailVerified = true;
        else next.publicEmail = null;
      }
    }
    if (next.publicPhone && !/^[+\d][\d\s().-]{6,}$/.test(next.publicPhone)) next.publicPhone = null;
    if (next.linkedinUrl && !/^https:\/\/([a-z]+\.)?linkedin\.com\//i.test(next.linkedinUrl)) next.linkedinUrl = null;
    return next;
  });
}

/** Never let generated copy promise things NationGraph can't stand behind. */
export function scrubClaims(text: string) {
  return text
    .replace(/\bguarantee(d|s)?\b/gi, "aim")
    .replace(/\b100% (accurate|accuracy)\b/gi, "high-accuracy");
}
