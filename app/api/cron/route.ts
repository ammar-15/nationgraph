import { NICHES } from "@/lib/niches";
import { runScout } from "@/lib/scout";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * End-of-day scout (vercel.json cron, 22:00 UTC). Runs the default niche and logs a summary.
 * Prototype has no database: connect Postgres/Supabase or a CRM webhook to persist results.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  const report = await runScout(NICHES[0], "United States");
  const summary = {
    niche: report.niche,
    signals: report.signals.length,
    verified: report.signals.filter((s) => s.sourceVerified).length,
    vendors: report.vendors.length,
    topMatches: report.matches.slice(0, 5),
    warnings: report.warnings,
  };
  console.log("[daily-scout]", JSON.stringify(summary));
  return Response.json(summary);
}
