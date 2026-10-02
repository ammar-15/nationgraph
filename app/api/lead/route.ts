import { cleanInput, clientIp, rateLimit } from "@/lib/guardrails";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/**
 * Landing page CTA capture. Prototype: logs the lead (visible in Vercel logs).
 * Swap the console.log for a CRM webhook (HubSpot/Salesforce) in production.
 */
export async function POST(req: Request) {
  const rl = rateLimit(`lead:${clientIp(req)}`, 10, 60 * 60 * 1000);
  if (!rl.ok) return Response.json({ error: "Too many submissions." }, { status: 429 });
  const body = await req.json().catch(() => ({}));
  const email = cleanInput(body.email, 200).toLowerCase();
  if (!EMAIL.test(email)) return Response.json({ error: "Enter a valid work email." }, { status: 400 });
  if (cleanInput(body.company_website, 200)) return Response.json({ ok: true }); // honeypot
  const lead = {
    email,
    vendor: cleanInput(body.vendor, 160),
    campaign: cleanInput(body.campaign, 120),
    utm: cleanInput(body.utm, 300),
    at: new Date().toISOString(),
  };
  console.log("[lead]", JSON.stringify(lead));
  return Response.json({ ok: true });
}
