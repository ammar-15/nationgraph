import { neutralizeScraped } from "../guardrails";

/**
 * Legistar Web API (Granicus): public city council legislation for many US cities.
 * Docs: https://webapi.legistar.com/Help
 * Some clients require a token; failures are skipped, never fatal.
 */
export const LEGISTAR_CLIENTS: { client: string; city: string; state: string }[] = [
  { client: "seattle", city: "Seattle", state: "WA" },
  { client: "sanjose", city: "San Jose", state: "CA" },
  { client: "oakland", city: "Oakland", state: "CA" },
  { client: "mesa", city: "Mesa", state: "AZ" },
  { client: "sanantonio", city: "San Antonio", state: "TX" },
  { client: "denver", city: "Denver", state: "CO" },
];

export type GovRecord = {
  city: string;
  state: string;
  file: string;
  title: string;
  type: string | null;
  status: string | null;
  body: string | null;
  date: string | null;
  url: string;
};

type LegistarMatter = {
  MatterId: number;
  MatterGuid?: string;
  MatterFile?: string;
  MatterName?: string;
  MatterTitle?: string;
  MatterTypeName?: string;
  MatterStatusName?: string;
  MatterBodyName?: string;
  MatterIntroDate?: string;
  MatterLastModifiedUtc?: string;
};

const CONTRACT_WORDS = /(contract|agreement|purchase|procure|rfp|request for proposal|bid|award|renew|extension|amendment|license|vendor|services)/i;

async function fetchClient(c: (typeof LEGISTAR_CLIENTS)[number], keywords: string[], sinceIso: string) {
  const filter = encodeURIComponent(`MatterLastModifiedUtc ge datetime'${sinceIso}'`);
  const url = `https://webapi.legistar.com/v1/${c.client}/matters?$top=250&$orderby=MatterLastModifiedUtc%20desc&$filter=${filter}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: "application/json" } });
    if (!res.ok) return [];
    const rows = (await res.json()) as LegistarMatter[];
    if (!Array.isArray(rows)) return [];
    const kw = keywords.map((k) => k.toLowerCase());
    return rows
      .filter((m) => {
        const text = `${m.MatterTitle ?? ""} ${m.MatterName ?? ""}`.toLowerCase();
        return CONTRACT_WORDS.test(text) && kw.some((k) => text.includes(k));
      })
      .slice(0, 8)
      .map<GovRecord>((m) => ({
        city: c.city,
        state: c.state,
        file: m.MatterFile ?? String(m.MatterId),
        title: neutralizeScraped(m.MatterTitle || m.MatterName || "", 400),
        type: m.MatterTypeName ?? null,
        status: m.MatterStatusName ?? null,
        body: m.MatterBodyName ?? null,
        date: (m.MatterIntroDate || m.MatterLastModifiedUtc || "").slice(0, 10) || null,
        url: m.MatterGuid
          ? `https://${c.client}.legistar.com/LegislationDetail.aspx?ID=${m.MatterId}&GUID=${m.MatterGuid}`
          : `https://${c.client}.legistar.com/Legislation.aspx`,
      }));
  } catch {
    return [];
  } finally {
    clearTimeout(t);
  }
}

/** Recent contract-related council items matching the niche, across several cities. */
export async function fetchLegistarRecords(keywords: string[], days = 60): Promise<GovRecord[]> {
  const since = new Date(Date.now() - days * 86400_000).toISOString().slice(0, 10);
  const results = await Promise.all(LEGISTAR_CLIENTS.map((c) => fetchClient(c, keywords, since)));
  return results.flat().slice(0, 30);
}
