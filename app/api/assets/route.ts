import { generateAssets } from "@/lib/assets";
import { cleanInput, guardRequest } from "@/lib/guardrails";
import { SignalSchema, VendorSchema } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const blocked = guardRequest(req, "assets", 30);
  if (blocked) return blocked;
  const body = await req.json().catch(() => ({}));
  const vendor = VendorSchema.safeParse(body.vendor);
  const signal = SignalSchema.safeParse(body.signal);
  if (!vendor.success || !signal.success) {
    return Response.json({ error: "A valid vendor and signal are required." }, { status: 400 });
  }
  try {
    const assets = await generateAssets(vendor.data, signal.data, cleanInput(body.niche, 60));
    return Response.json({ assets });
  } catch (e) {
    return Response.json({ error: (e as Error).message || "Generation failed" }, { status: 502 });
  }
}
