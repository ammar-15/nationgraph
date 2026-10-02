import { runStructured, type SubmitTool } from "./anthropic";
import { scrubClaims } from "./guardrails";
import { AssetsSchema, type Assets, type Signal, type Vendor } from "./types";

const SYSTEM = `You are a growth engineer and copywriter at NationGraph, a pre-RFP public sector sales intelligence platform.
Write like a thoughtful human: specific, plain, warm, no hype, no buzzwords, no exclamation marks, no emojis.
Rules:
- Use only facts given in the brief. Do not invent numbers, customers, results or quotes. If a number is unknown, leave it out.
- Never promise guaranteed outcomes. No fake urgency, no deceptive claims.
- Emails are drafts a human will review and send. Keep them short (under 140 words), one clear ask, an easy opt-out line.
- The offer is: one hand-researched, ready-to-pitch agency lead plus 5 free signals in their territory.
- Ad copy must respect platform norms (Google headline <= 30 chars per line is ideal, LinkedIn body <= 2 short sentences).
- Return everything by calling submit_campaign.`;

const str = { type: "string" };
const strArr = { type: "array", items: str };
const emailJson = { type: "object", properties: { subject: str, body: str }, required: ["subject", "body"] };
const SUBMIT_CAMPAIGN: SubmitTool = {
  name: "submit_campaign",
  description: "Submit the finished campaign assets.",
  schema: {
    type: "object",
    properties: {
      vendorBrief: {
        type: "object",
        properties: { summary: str, sledReadiness: str, painPoints: strArr, whyNationGraph: str, talkingPoints: strArr },
        required: ["summary", "sledReadiness", "painPoints", "whyNationGraph", "talkingPoints"],
      },
      agencyBrief: {
        type: "object",
        properties: { summary: str, need: str, timeline: str, buyingStage: str, risks: strArr },
        required: ["summary", "need", "timeline", "buyingStage", "risks"],
      },
      ads: {
        type: "array",
        items: {
          type: "object",
          properties: { channel: { type: "string", enum: ["LinkedIn", "Google Search", "Meta", "X"] }, headline: str, body: str, cta: str },
          required: ["channel", "headline", "body", "cta"],
        },
      },
      landingPage: {
        type: "object",
        properties: {
          eyebrow: str,
          headline: str,
          subhead: str,
          painPoints: { type: "array", items: { type: "object", properties: { title: str, body: str }, required: ["title", "body"] } },
          previewSignal: {
            type: "object",
            properties: { agency: str, title: str, why: str, timeline: str },
            required: ["agency", "title", "why", "timeline"],
          },
          offer: str,
          ctaLabel: str,
          proof: strArr,
          faq: { type: "array", items: { type: "object", properties: { q: str, a: str }, required: ["q", "a"] } },
        },
        required: ["eyebrow", "headline", "subhead", "painPoints", "previewSignal", "offer", "ctaLabel", "proof", "faq"],
      },
      emails: {
        type: "object",
        properties: { toVendor: emailJson, vendorToAgency: emailJson, followUp: emailJson },
        required: ["toVendor", "vendorToAgency", "followUp"],
      },
      experiment: {
        type: "object",
        properties: { hypothesis: str, variantA: str, variantB: str, primaryMetric: str },
        required: ["hypothesis", "variantA", "variantB", "primaryMetric"],
      },
    },
    required: ["vendorBrief", "agencyBrief", "ads", "landingPage", "emails", "experiment"],
  },
};

export async function generateAssets(vendor: Vendor, signal: Signal, niche: string): Promise<Assets> {
  const vendorContact = vendor.contacts[0];
  const agencyContact = signal.contacts[0];
  const prompt = `Build a personalized campaign that turns this vendor into a NationGraph customer by handing them this agency opportunity.

VENDOR (NationGraph prospect)
Name: ${vendor.name} (${vendor.website})
Category: ${vendor.category}
What they do: ${vendor.summary}
SLED focus: ${vendor.sledFocus}
Known gov customers: ${vendor.knownGovCustomers.join(", ") || "none public"}
Likely GTM pain points: ${vendor.painPoints.join("; ") || "unknown"}
Why NationGraph: ${vendor.whyNationGraph}
Contact: ${vendorContact ? `${vendorContact.name ?? "(name unknown)"}, ${vendorContact.role}` : "unknown, address the sales leader"}

AGENCY OPPORTUNITY (the hand-delivered lead)
Agency: ${signal.agency}${signal.state ? `, ${signal.state}` : ""}
Signal: ${signal.signalType} — ${signal.title}
What happened: ${signal.summary}
Need: ${signal.painPoint}
Value: ${signal.estimatedValue ?? "unknown"}
Timeline: ${signal.timeline ?? "unknown"}
Source: ${signal.sourceUrl}
Agency contact: ${agencyContact ? `${agencyContact.name ?? "(name unknown)"}, ${agencyContact.role}` : "unknown, address the relevant department lead"}

Niche: ${niche}

Write:
1. vendorBrief and agencyBrief for the NationGraph rep.
2. 3 ads (LinkedIn, Google Search, Meta) aimed at companies like this vendor, built around the pain of finding deals before the RFP.
3. A personalized landing page for this vendor: it shows a teaser of the agency lead and gates the full lead behind an email CTA.
4. Emails: toVendor (from a NationGraph rep, opens with the specific agency lead), vendorToAgency (a draft the vendor could send the agency, referencing the public need respectfully), followUp (to the vendor, 4 days later, introduces Compass, NationGraph's AI agent that researches accounts and drafts outreach).
5. One A/B experiment for the landing page.

Call submit_campaign with all of it.`;

  const data = await runStructured({ system: SYSTEM, prompt, maxTokens: 8000, submit: SUBMIT_CAMPAIGN }, "assets");
  const result = AssetsSchema.safeParse(data);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new Error(`Campaign came back incomplete (${issue.path.join(".")}: ${issue.message}). Try again.`);
  }
  const parsed = result.data;
  // Final guardrail pass over everything a prospect will read.
  return JSON.parse(scrubClaims(JSON.stringify(parsed))) as Assets;
}
