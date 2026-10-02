"use client";

import { useEffect, useState } from "react";
import type { LandingPayload } from "@/lib/types";

declare global {
  interface Window {
    posthog?: { capture: (event: string, props?: Record<string, unknown>) => void };
  }
}

/** Funnel events: PostHog when configured, console otherwise. */
function track(event: string, props: Record<string, unknown> = {}) {
  try {
    window.posthog?.capture(event, props);
  } catch {}
  console.info("[track]", event, props);
}

function decode(hash: string): LandingPayload | null {
  try {
    const b64 = hash.replace(/^#/, "").replace(/-/g, "+").replace(/_/g, "/");
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return JSON.parse(new TextDecoder().decode(bytes)) as LandingPayload;
  } catch {
    return null;
  }
}

export default function Landing() {
  const [data, setData] = useState<LandingPayload | null>(null);
  const [ready, setReady] = useState(false);
  const [email, setEmail] = useState("");
  const [hp, setHp] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "done" | "error">("idle");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const d = decode(window.location.hash);
    setData(d);
    setReady(true);
    if (d) track("lp_viewed", { campaign: d.campaign, vendor: d.vendorName });

    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (key && !window.posthog) {
      const s = document.createElement("script");
      s.src = "https://cdn.jsdelivr.net/npm/posthog-js@1/dist/array.full.js";
      s.async = true;
      s.onload = () => {
        const ph = (window as unknown as { posthog?: { init: (k: string, o: object) => void } }).posthog;
        ph?.init(key, { api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com" });
      };
      document.head.appendChild(s);
    }
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return;
    setState("sending");
    track("lp_cta_submitted", { campaign: data.campaign });
    const res = await fetch("/api/lead", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        vendor: data.vendorName,
        campaign: data.campaign,
        utm: window.location.search,
        company_website: hp,
      }),
    }).catch(() => null);
    const out = await res?.json().catch(() => ({}));
    if (res?.ok) {
      setState("done");
      track("lead_captured", { campaign: data.campaign });
    } else {
      setState("error");
      setMsg(out?.error || "Something went wrong. Try again.");
    }
  }

  if (!ready) return null;
  if (!data) {
    return (
      <main className="wrap" style={{ padding: "80px 20px" }}>
        <h1 style={{ fontFamily: "var(--serif)" }}>This page link is incomplete.</h1>
        <p className="meta">Generate a landing page from a campaign in SLED Scout.</p>
      </main>
    );
  }
  const p = data.page;

  return (
    <main>
      <section style={{ background: "var(--card)", borderBottom: "1px solid var(--line)" }}>
        <div className="wrap" style={{ padding: "64px 20px 48px", maxWidth: 880 }}>
          <span className="pill">{p.eyebrow}</span>
          <h1 style={{ fontFamily: "var(--serif)", fontSize: "clamp(32px,5vw,50px)", lineHeight: 1.08, margin: "16px 0 14px", letterSpacing: "-0.02em" }}>
            {p.headline}
          </h1>
          <p style={{ fontSize: 18, color: "var(--muted)", margin: 0, maxWidth: 680 }}>{p.subhead}</p>
          <p className="meta" style={{ marginTop: 14 }}>Prepared for the team at {data.vendorName}</p>
        </div>
      </section>

      <div className="wrap" style={{ maxWidth: 880, padding: "36px 20px" }}>
        <div className="card" style={{ borderColor: "var(--accent)", position: "relative", overflow: "hidden" }}>
          <span className="pill amber" style={{ alignSelf: "flex-start" }}>A lead we found for you</span>
          <h3 style={{ fontSize: 20 }}>{p.previewSignal.title}</h3>
          <div className="meta">{p.previewSignal.agency} · {p.previewSignal.timeline}</div>
          <p>{p.previewSignal.why}</p>
          <div style={{ filter: state === "done" ? "none" : "blur(5px)", userSelect: state === "done" ? "auto" : "none" }} aria-hidden={state !== "done"}>
            <p className="meta">Decision-maker, source document, budget line, timeline and a ready-to-send intro email.</p>
          </div>
        </div>

        <div className="two" style={{ marginTop: 22 }}>
          {p.painPoints.map((x, i) => (
            <div className="box" key={i}>
              <b>{x.title}</b>
              <p className="meta" style={{ margin: "6px 0 0" }}>{x.body}</p>
            </div>
          ))}
        </div>

        <div className="panel" style={{ marginTop: 26 }}>
          <h2>{p.offer}</h2>
          {state === "done" ? (
            <p>Thanks. A NationGraph rep will send the full lead to {email} shortly.</p>
          ) : (
            <form onSubmit={submit} className="row" style={{ marginTop: 12 }}>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={() => track("lp_cta_focused", { campaign: data.campaign })}
                placeholder="Work email"
                style={{ flex: 1, minWidth: 220, padding: "12px 14px", border: "1px solid var(--line)", borderRadius: 8, background: "var(--paper)" }}
              />
              <input value={hp} onChange={(e) => setHp(e.target.value)} name="company_website" tabIndex={-1} autoComplete="off" style={{ display: "none" }} />
              <button className="btn" disabled={state === "sending"}>{state === "sending" ? "Sending…" : p.ctaLabel}</button>
            </form>
          )}
          {state === "error" && <div className="err">{msg}</div>}
          {p.proof.length > 0 && (
            <ul className="meta" style={{ marginTop: 14 }}>{p.proof.map((x, i) => <li key={i}>{x}</li>)}</ul>
          )}
        </div>

        {p.faq.length > 0 && (
          <div style={{ marginTop: 10 }}>
            {p.faq.map((f, i) => (
              <details key={i} className="box" style={{ marginBottom: 8 }}>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>{f.q}</summary>
                <p className="meta" style={{ margin: "8px 0 0" }}>{f.a}</p>
              </details>
            ))}
          </div>
        )}

        <footer className="foot" style={{ paddingBottom: 40 }}>
          Prototype landing page generated by SLED Scout. Independent demo, not affiliated with NationGraph.
        </footer>
      </div>
    </main>
  );
}
