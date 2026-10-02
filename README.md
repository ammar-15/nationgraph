# SLED Scout

A growth prototype for NationGraph: find the deal before the RFP, then hand it to the vendor who can win it.

**The motion:** an agent scans public SLED sources for buying signals, finds vendors who sell into them (NationGraph's potential customers), matches the two, and builds the campaign to convert the vendor: ads, a personalized landing page with an email CTA, and outreach drafts for both sides. Offer: **1 hand-researched lead + 5 free signals.**

## What it does

| Step | How |
|---|---|
| **Gov data** | Legistar Web API: recent contract-related city council items across several cities |
| **Signal agent** | Claude + web search + web fetch: expiring contracts, upcoming/open RFPs, approved budgets, board discussions, agencies with no vendor in place, blogs and social posts calling for contractors |
| **Vendor agent** | Claude + web tools: growth-stage companies selling into the niche, their public gov customers, GTM pain points and sales leaders |
| **Verify** | Every source URL is fetched server-side; unreachable sources are flagged |
| **Match** | Claude Haiku scores vendor ↔ agency fit |
| **Campaign** | Vendor brief, agency brief, 3 ads, landing page, 3 email drafts, 1 A/B experiment |
| **Landing page** | `/lp`: personalized, lead teaser gated by email CTA, funnel events (PostHog-ready) |
| **Chat** | Claude Haiku, grounded only in the current report |
| **Daily run** | Vercel cron at 22:00 UTC (`/api/cron`) |

## Guardrails

- Public sources only; every signal and vendor must cite a URL or it is dropped (zod validation).
- Source URLs are fetched to verify they exist; private/internal hosts are blocked (SSRF guard).
- Contact emails are kept **only if printed on the cited page**. No guessed email patterns, no freemail/personal addresses.
- Scraped content is treated as untrusted data (prompt-injection instructions in prompts + input neutralizing).
- Outreach is always a draft for human review; generated copy is scrubbed of guarantees.
- Per-IP rate limits on every AI route, optional `ACCESS_CODE` to protect API spend, honeypot on the lead form.
- Chat refuses off-topic requests and never invents contacts.

## Setup

```bash
npm install
cp .env.example .env   # add ANTHROPIC_API_KEY (and optionally ANTHROPIC_CHAT_API_KEY)
npm run dev
```

| Variable | Purpose |
|---|---|
| `ANTHROPIC_API_KEY` | Required. Research agents (web search/fetch) and campaign generation |
| `ANTHROPIC_CHAT_API_KEY` | Optional. Separate key for the fast chat (falls back to the main key) |
| `SCOUT_MODEL` / `CHAT_MODEL` | Optional model overrides |
| `ACCESS_CODE` | Optional. Required code before any AI call runs |
| `CRON_SECRET` | Enables the daily end-of-day scout on Vercel |
| `NEXT_PUBLIC_POSTHOG_KEY` | Optional. Sends landing-page funnel events to PostHog |

## Production next steps

- Persist reports and leads (Postgres) and sync leads to the CRM via webhook
- Add school-board sources (BoardDocs, Simbli) and state procurement portals
- Attribution: carry `utm_campaign` (vendor-signal id) from ad → landing page → CRM opportunity
- Monitoring: alert when a daily run returns zero verified signals or the verify rate drops

Independent prototype by Ammar Faruqui. Not affiliated with NationGraph.
