import { z } from "zod";

const url = z.preprocess(
  (v) => (typeof v === "string" && v && !/^https?:\/\//i.test(v.trim()) ? `https://${v.trim()}` : v),
  z.string().trim().url().max(2000),
);
const conf = z.coerce.number().min(0).max(1).catch(0.5);

/** Array that silently drops invalid elements instead of failing the parent object. */
function lenientArray<T extends z.ZodTypeAny>(item: T, max: number) {
  return z
    .array(z.unknown())
    .nullish()
    .transform((arr) =>
      (arr ?? [])
        .map((x) => item.safeParse(x))
        .filter((r) => r.success)
        .map((r) => r.data as z.infer<T>)
        .slice(0, max),
    );
}
const shortText = (max: number) => z.string().trim().min(1).max(max);
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((v) => (v ? v : null));

export const ContactSchema = z.object({
  name: optText(120),
  role: shortText(160),
  organization: optText(200),
  publicEmail: optText(200),
  publicPhone: optText(60),
  linkedinUrl: optText(500),
  sourceUrl: url,
  // set by guardrails, never by the model
  emailVerified: z.boolean().optional(),
});
export type Contact = z.infer<typeof ContactSchema>;

export const SIGNAL_TYPES = [
  "expiring_contract",
  "upcoming_rfp",
  "open_rfp",
  "budget_approved",
  "board_discussion",
  "no_vendor_in_place",
  "call_for_contractors",
  "grant_awarded",
] as const;

export const SignalSchema = z.object({
  id: shortText(40),
  agency: shortText(200),
  agencyType: optText(80),
  state: optText(40),
  signalType: z.enum(SIGNAL_TYPES),
  title: shortText(240),
  summary: shortText(800),
  painPoint: shortText(400),
  estimatedValue: optText(80),
  timeline: optText(160),
  sourceName: optText(160),
  sourceUrl: url,
  evidence: optText(400),
  confidence: conf,
  contacts: lenientArray(ContactSchema, 5),
  sourceVerified: z.boolean().optional(),
});
export type Signal = z.infer<typeof SignalSchema>;

export const VendorSchema = z.object({
  id: shortText(40),
  name: shortText(160),
  website: url,
  category: shortText(160),
  summary: shortText(600),
  sledFocus: z.enum(["core", "partial", "emerging"]),
  knownGovCustomers: lenientArray(shortText(160), 8),
  painPoints: lenientArray(shortText(240), 6),
  whyNationGraph: shortText(500),
  contacts: lenientArray(ContactSchema, 5),
  sourceUrl: url,
  confidence: conf,
  sourceVerified: z.boolean().optional(),
});
export type Vendor = z.infer<typeof VendorSchema>;

export const MatchSchema = z.object({
  vendorId: shortText(40),
  signalId: shortText(40),
  score: z.coerce.number().min(0).max(100),
  rationale: shortText(500),
});
export type Match = z.infer<typeof MatchSchema>;

export type Report = {
  niche: string;
  region: string;
  generatedAt: string;
  signals: Signal[];
  vendors: Vendor[];
  matches: Match[];
  govRecords: number;
  warnings: string[];
};

export const AssetsSchema = z.object({
  vendorBrief: z.object({
    summary: shortText(800),
    sledReadiness: shortText(400),
    painPoints: z.array(shortText(240)).max(6),
    whyNationGraph: shortText(500),
    talkingPoints: z.array(shortText(240)).max(6),
  }),
  agencyBrief: z.object({
    summary: shortText(800),
    need: shortText(400),
    timeline: shortText(240),
    buyingStage: shortText(160),
    risks: z.array(shortText(240)).max(5),
  }),
  ads: z
    .array(
      z.object({
        channel: z.enum(["LinkedIn", "Google Search", "Meta", "X"]),
        headline: shortText(120),
        body: shortText(400),
        cta: shortText(40),
      }),
    )
    .min(1)
    .max(4),
  landingPage: z.object({
    eyebrow: shortText(80),
    headline: shortText(140),
    subhead: shortText(300),
    painPoints: z.array(z.object({ title: shortText(80), body: shortText(260) })).min(2).max(4),
    previewSignal: z.object({
      agency: shortText(200),
      title: shortText(240),
      why: shortText(300),
      timeline: shortText(160),
    }),
    offer: shortText(260),
    ctaLabel: shortText(40),
    proof: z.array(shortText(160)).max(4),
    faq: z.array(z.object({ q: shortText(160), a: shortText(400) })).max(4),
  }),
  emails: z.object({
    toVendor: z.object({ subject: shortText(120), body: shortText(1600) }),
    vendorToAgency: z.object({ subject: shortText(120), body: shortText(1600) }),
    followUp: z.object({ subject: shortText(120), body: shortText(1200) }),
  }),
  experiment: z.object({
    hypothesis: shortText(300),
    variantA: shortText(200),
    variantB: shortText(200),
    primaryMetric: shortText(120),
  }),
});
export type Assets = z.infer<typeof AssetsSchema>;

export type LandingPayload = {
  vendorName: string;
  vendorWebsite: string;
  niche: string;
  page: Assets["landingPage"];
  campaign: string;
};
