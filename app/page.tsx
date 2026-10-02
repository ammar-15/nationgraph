"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { NICHES } from "@/lib/niches";
import type { Assets, Contact, LandingPayload, Report, Signal, Vendor } from "@/lib/types";

const SIGNAL_LABEL: Record<string, string> = {
  expiring_contract: "Expiring contract",
  upcoming_rfp: "Upcoming RFP",
  open_rfp: "Open RFP",
  budget_approved: "Budget approved",
  board_discussion: "Board discussion",
  no_vendor_in_place: "No vendor in place",
  call_for_contractors: "Call for contractors",
  grant_awarded: "Grant awarded",
};

type Tab = "matches" | "signals" | "vendors";

function b64url(obj: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function storage<T>(key: string, value?: T): T | null {
  try {
    if (value === undefined) {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    }
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
  return null;
}

function Contacts({ list }: { list: Contact[] }) {
  if (!list.length) return <div className="contacts meta">No public decision-maker found. Research the role on the source page.</div>;
  return (
    <div className="contacts">
      {list.map((c, i) => (
        <div key={i}>
          <b>{c.name ?? "Name not public"}</b> · {c.role}
          {c.publicEmail && (
            <>
              {" · "}
              <a href={`mailto:${c.publicEmail}`}>{c.publicEmail}</a> <span className="pill">on source</span>
            </>
          )}
          {c.publicPhone && ` · ${c.publicPhone}`}
          {c.linkedinUrl && (
            <>
              {" · "}
              <a href={c.linkedinUrl} target="_blank" rel="noreferrer">LinkedIn</a>
            </>
          )}
          {" · "}
          <a href={c.sourceUrl} target="_blank" rel="noreferrer" className="meta">source</a>
        </div>
      ))}
    </div>
  );
}

function SourceBadge({ ok }: { ok?: boolean }) {
  return ok ? <span className="pill">Source verified</span> : <span className="pill red">Source unreachable</span>;
}

function SignalCard({ s }: { s: Signal }) {
  return (
    <div className="card">
      <div className="row">
        <span className="pill amber">{SIGNAL_LABEL[s.signalType] ?? s.signalType}</span>
        <SourceBadge ok={s.sourceVerified} />
        <span className="pill plain">{Math.round(s.confidence * 100)}% conf.</span>
      </div>
      <h3>
        <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="title-link">{s.title} ↗</a>
      </h3>
      <div className="meta">
        {s.agency}
        {s.state ? `, ${s.state}` : ""}
        {s.agencyType ? ` · ${s.agencyType}` : ""}
      </div>
      <p>{s.summary}</p>
      <p><b>Need:</b> {s.painPoint}</p>
      <div className="row meta">
        {s.timeline && <span>⏱ {s.timeline}</span>}
        {s.estimatedValue && <span>💲 {s.estimatedValue}</span>}
      </div>
      <div className="row">
        <a className="btn ghost sm" href={s.sourceUrl} target="_blank" rel="noreferrer">
          {s.signalType === "open_rfp" || s.signalType === "upcoming_rfp" ? "Open RFP" : "Open source"} ↗
        </a>
        <span className="meta">{s.sourceName || s.sourceUrl.replace(/^https?:\/\//, "").split("/")[0]}</span>
      </div>
      <Contacts list={s.contacts} />
    </div>
  );
}

function VendorCard({ v }: { v: Vendor }) {
  return (
    <div className="card">
      <div className="row">
        <span className="pill">{v.sledFocus === "core" ? "SLED core" : v.sledFocus === "partial" ? "SLED partial" : "SLED emerging"}</span>
        <SourceBadge ok={v.sourceVerified} />
      </div>
      <h3>
        <a href={v.website} target="_blank" rel="noreferrer">{v.name}</a>
      </h3>
      <div className="meta">{v.category}</div>
      <p>{v.summary}</p>
      {v.sledIntent && <p><b>SLED intent:</b> {v.sledIntent}</p>}
      {v.knownGovCustomers.length > 0 && <p><b>Public gov customers:</b> {v.knownGovCustomers.join(", ")}</p>}
      {v.painPoints.length > 0 && <p><b>GTM pain:</b> {v.painPoints.join(" · ")}</p>}
      <p><b>Why NationGraph:</b> {v.whyNationGraph}</p>
      <div className="row">
        <a className="btn ghost sm" href={v.website} target="_blank" rel="noreferrer">Website ↗</a>
        <a className="btn ghost sm" href={v.sourceUrl} target="_blank" rel="noreferrer">Evidence ↗</a>
      </div>
      <Contacts list={v.contacts} />
    </div>
  );
}

function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="btn ghost sm"
      onClick={() => {
        navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? "Copied" : "Copy"}
    </button>
  );
}

function Email({ title, subject, body, to }: { title: string; subject: string; body: string; to?: string | null }) {
  return (
    <div className="box">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <b>{title}</b>
        <div className="row">
          <Copy text={`Subject: ${subject}\n\n${body}`} />
          {to && (
            <a className="btn ghost sm" href={`mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`}>
              Open draft
            </a>
          )}
        </div>
      </div>
      <div className="meta">To: {to ?? "find on source page"} · Subject: {subject}</div>
      <div className="email">{body}</div>
    </div>
  );
}

function Campaign({ assets, vendor, signal, niche }: { assets: Assets; vendor: Vendor; signal: Signal; niche: string }) {
  const lpHref = useMemo(() => {
    const payload: LandingPayload = {
      vendorName: vendor.name,
      vendorWebsite: vendor.website,
      niche,
      page: assets.landingPage,
      campaign: `${vendor.id}-${signal.id}`,
    };
    return `/lp?utm_source=sled-scout&utm_campaign=${encodeURIComponent(vendor.name)}#${b64url(payload)}`;
  }, [assets, vendor, signal, niche]);

  const vendorEmail = vendor.contacts.find((c) => c.publicEmail)?.publicEmail;
  const agencyEmail = signal.contacts.find((c) => c.publicEmail)?.publicEmail;

  return (
    <div className="panel" id="campaign">
      <div className="row" style={{ justifyContent: "space-between" }}>
        <div>
          <h2>Campaign: {vendor.name} → {signal.agency}</h2>
          <div className="meta">Drafts only. A human reviews and sends everything.</div>
        </div>
        <a className="btn" href={lpHref} target="_blank" rel="noreferrer">Open landing page</a>
      </div>

      <div className="two" style={{ marginTop: 14 }}>
        <div className="box">
          <b>Vendor brief · NationGraph prospect</b>
          <p>{assets.vendorBrief.summary}</p>
          <p className="meta"><b>SLED readiness:</b> {assets.vendorBrief.sledReadiness}</p>
          <p className="meta"><b>Why NationGraph:</b> {assets.vendorBrief.whyNationGraph}</p>
          <ul>{assets.vendorBrief.talkingPoints.map((t, i) => <li key={i}>{t}</li>)}</ul>
        </div>
        <div className="box">
          <b>Agency brief · the hand-delivered lead</b>
          <p>{assets.agencyBrief.summary}</p>
          <p className="meta"><b>Need:</b> {assets.agencyBrief.need}</p>
          <p className="meta"><b>Timeline:</b> {assets.agencyBrief.timeline} · <b>Stage:</b> {assets.agencyBrief.buyingStage}</p>
          {assets.agencyBrief.risks.length > 0 && <ul>{assets.agencyBrief.risks.map((t, i) => <li key={i}>{t}</li>)}</ul>}
        </div>
      </div>

      <h4>Ads</h4>
      <div className="grid">
        {assets.ads.map((a, i) => (
          <div className="box" key={i}>
            <div className="row" style={{ justifyContent: "space-between" }}>
              <span className="pill plain">{a.channel}</span>
              <Copy text={`${a.headline}\n${a.body}\nCTA: ${a.cta}`} />
            </div>
            <b style={{ display: "block", marginTop: 8 }}>{a.headline}</b>
            <p className="meta" style={{ margin: "4px 0" }}>{a.body}</p>
            <span className="pill">{a.cta}</span>
          </div>
        ))}
      </div>

      <h4>Outreach</h4>
      <div className="two">
        <Email title="1 · NationGraph rep → vendor" to={vendorEmail} {...assets.emails.toVendor} />
        <Email title="2 · Vendor → agency (handed to vendor)" to={agencyEmail} {...assets.emails.vendorToAgency} />
      </div>
      <div style={{ marginTop: 14 }}>
        <Email title="3 · Follow-up, day 4 (introduces Compass)" to={vendorEmail} {...assets.emails.followUp} />
      </div>

      <h4>Experiment</h4>
      <div className="box">
        <p><b>Hypothesis:</b> {assets.experiment.hypothesis}</p>
        <div className="two" style={{ marginTop: 8 }}>
          <div><span className="pill plain">A</span> {assets.experiment.variantA}</div>
          <div><span className="pill plain">B</span> {assets.experiment.variantB}</div>
        </div>
        <p className="meta" style={{ marginTop: 8 }}>Primary metric: {assets.experiment.primaryMetric}</p>
      </div>
    </div>
  );
}

function Chat({ report, code }: { report: Report | null; code: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<{ role: "user" | "assistant"; content: string }[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView({ behavior: "smooth" }), [msgs]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    const next = [...msgs, { role: "user" as const, content: text }];
    setMsgs([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": code },
        body: JSON.stringify({ messages: next, report }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: "Chat failed" }));
        setMsgs([...next, { role: "assistant", content: err.error }]);
        return;
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        setMsgs([...next, { role: "assistant", content: acc }]);
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button className="btn chat-toggle" onClick={() => setOpen(!open)}>{open ? "Close" : "Ask the scout"}</button>
      {open && (
        <div className="chat">
          <header>
            <span>Scout chat</span>
            <span className="meta">{report ? `${report.signals.length} signals loaded` : "run a scout first"}</span>
          </header>
          <div className="msgs">
            {!msgs.length && (
              <div className="meta">
                Try: “Which lead should I hand over first and why?” · “Rewrite email 1 shorter” · “Which vendors have no public gov customers yet?”
              </div>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={`m ${m.role}`}>{m.content || "…"}</div>
            ))}
            <div ref={end} />
          </div>
          <form onSubmit={send}>
            <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about today's leads" maxLength={2000} />
            <button className="btn sm" disabled={busy}>Send</button>
          </form>
        </div>
      )}
    </>
  );
}

export default function Home() {
  const [niche, setNiche] = useState(NICHES[0].id);
  const [region, setRegion] = useState("");
  const [code, setCode] = useState("");
  const [log, setLog] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [tab, setTab] = useState<Tab>("matches");
  const [building, setBuilding] = useState<string | null>(null);
  const [buildError, setBuildError] = useState<{ key: string; msg: string } | null>(null);
  const [campaign, setCampaign] = useState<{ assets: Assets; vendor: Vendor; signal: Signal } | null>(null);

  useEffect(() => {
    const r = storage<Report>("sled-scout:report");
    if (r) setReport(r);
    const c = storage<string>("sled-scout:code");
    if (c) setCode(c);
  }, []);

  async function runScout() {
    setRunning(true);
    setError(null);
    setLog(["Starting scout"]);
    setCampaign(null);
    storage("sled-scout:code", code);
    try {
      const res = await fetch("/api/scout", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": code },
        body: JSON.stringify({ niche, region }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
        throw new Error(err.error);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "progress") setLog((l) => [...l, ev.detail || ev.step]);
          if (ev.type === "error") throw new Error(ev.error);
          if (ev.type === "report") {
            setReport(ev.report);
            storage("sled-scout:report", ev.report);
            setLog((l) => [...l, "Done"]);
          }
        }
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setRunning(false);
    }
  }

  async function build(vendor: Vendor, signal: Signal) {
    const key = `${vendor.id}-${signal.id}`;
    setBuilding(key);
    setBuildError(null);
    try {
      const res = await fetch("/api/assets", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-access-code": code },
        body: JSON.stringify({ vendor, signal, niche: report?.niche }),
      });
      const data = await res.json().catch(() => ({ error: `Request failed (${res.status})` }));
      if (!res.ok) throw new Error(data.error || "Campaign build failed");
      setCampaign({ assets: data.assets, vendor, signal });
      setTimeout(() => document.getElementById("campaign")?.scrollIntoView({ behavior: "smooth" }), 50);
    } catch (e) {
      setBuildError({ key, msg: `Campaign build failed: ${(e as Error).message}` });
    } finally {
      setBuilding(null);
    }
  }

  const byId = useMemo(() => {
    const s = new Map(report?.signals.map((x) => [x.id, x]));
    const v = new Map(report?.vendors.map((x) => [x.id, x]));
    return { s, v };
  }, [report]);

  return (
    <>
      <div className="top">
        <div className="wrap">
          <div className="brand">
            SLED Scout <small>Growth prototype for NationGraph · built by Ammar Faruqui</small>
          </div>
          <a className="meta" href="https://github.com/ammar-15/nationgraph" target="_blank" rel="noreferrer">GitHub</a>
        </div>
      </div>

      <main className="wrap">
        <section className="hero">
          <h1>Find the deal before the RFP. Then hand it to the vendor who can win it.</h1>
          <p>
            Scans procurement portals, board minutes, council records, news and social posts for SLED buying signals,
            finds the vendors who sell into them, and builds the ad, landing page and outreach to turn that vendor into a customer.
          </p>
          <div className="controls">
            <label className="f">
              Niche
              <select value={niche} onChange={(e) => setNiche(e.target.value)}>
                {NICHES.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}
              </select>
            </label>
            <label className="f">
              Region (optional)
              <input value={region} onChange={(e) => setRegion(e.target.value)} placeholder="e.g. Texas, Pacific Northwest" maxLength={80} />
            </label>
            <label className="f">
              Access code
              <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="if set" type="password" />
            </label>
            <button className="btn" onClick={runScout} disabled={running}>{running ? "Scouting… (1-3 min)" : "Run scout"}</button>
          </div>
          {log.length > 0 && (
            <div className="log">{log.map((l, i) => <div key={i}>{l}</div>)}</div>
          )}
          {error && <div className="err">{error}</div>}
        </section>

        {!report && !running && (
          <div className="empty">
            Pick a niche and run the scout. It also runs daily at end of day on a schedule.
          </div>
        )}

        {report && (
          <>
            <div className="meta">
              {report.niche} · {report.region} · {new Date(report.generatedAt).toLocaleString()}
            </div>
            <div className="stats">
              <div className="stat"><b>{report.signals.length}</b><span>Buying signals</span></div>
              <div className="stat"><b>{report.signals.filter((s) => s.sourceVerified).length}</b><span>Verified sources</span></div>
              <div className="stat"><b>{report.vendors.length}</b><span>NationGraph prospects</span></div>
              <div className="stat"><b>{report.matches.length}</b><span>Vendor ↔ agency matches</span></div>
              <div className="stat"><b>{report.govRecords}</b><span>Council records scanned</span></div>
            </div>
            {report.warnings.map((w, i) => <div key={i} className="warn">{w}</div>)}

            <div className="tabs">
              {(["matches", "signals", "vendors"] as Tab[]).map((t) => (
                <button key={t} className={`tab ${tab === t ? "on" : ""}`} onClick={() => setTab(t)}>
                  {t === "matches" ? "Matches" : t === "signals" ? "Agency signals" : "Vendors (prospects)"}
                </button>
              ))}
            </div>

            {tab === "matches" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {!report.matches.length && <div className="empty">No strong matches today. Check the signals and vendors tabs.</div>}
                {report.matches.map((m, i) => {
                  const v = byId.v.get(m.vendorId);
                  const s = byId.s.get(m.signalId);
                  if (!v || !s) return null;
                  const key = `${v.id}-${s.id}`;
                  return (
                    <div className="card" key={i}>
                      <div className="match">
                        <div className="side">
                          <div className="lbl">Vendor · NationGraph prospect</div>
                          <a href={v.website} target="_blank" rel="noreferrer" className="title-link"><b>{v.name} ↗</b></a>
                          <div className="meta">{v.category}</div>
                          {v.sledIntent && <div className="meta">{v.sledIntent}</div>}
                        </div>
                        <div className="score">{m.score}</div>
                        <div className="side">
                          <div className="lbl">{SIGNAL_LABEL[s.signalType]} · {s.agency}</div>
                          <a href={s.sourceUrl} target="_blank" rel="noreferrer" className="title-link"><b>{s.title} ↗</b></a>
                          <div className="meta">{s.timeline ?? "timeline unknown"}</div>
                        </div>
                      </div>
                      <p>{m.rationale}</p>
                      <div className="row">
                        <button className="btn sm" onClick={() => build(v, s)} disabled={building !== null}>
                          {building === key ? "Building campaign…" : "Build campaign"}
                        </button>
                        <a className="btn ghost sm" href={s.sourceUrl} target="_blank" rel="noreferrer">
                          {s.signalType === "open_rfp" || s.signalType === "upcoming_rfp" ? "Open RFP" : "Open source"} ↗
                        </a>
                        <a className="btn ghost sm" href={v.website} target="_blank" rel="noreferrer">Vendor site ↗</a>
                        <SourceBadge ok={s.sourceVerified} />
                      </div>
                      {buildError?.key === key && <div className="err">{buildError.msg}</div>}
                    </div>
                  );
                })}
              </div>
            )}
            {tab === "signals" && <div className="grid">{report.signals.map((s) => <SignalCard key={s.id} s={s} />)}</div>}
            {tab === "vendors" && <div className="grid">{report.vendors.map((v) => <VendorCard key={v.id} v={v} />)}</div>}

            {campaign && <Campaign {...campaign} niche={report.niche} />}
          </>
        )}

        <footer className="foot">
          Public data only. Contact emails are shown only when printed on the cited page. All outreach is a draft for human review.
          Independent prototype, not affiliated with NationGraph.
        </footer>
      </main>
      <Chat report={report} code={code} />
    </>
  );
}
