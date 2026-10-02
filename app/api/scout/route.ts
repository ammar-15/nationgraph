import { cleanInput, guardRequest } from "@/lib/guardrails";
import { getNiche } from "@/lib/niches";
import { runScout } from "@/lib/scout";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/** Streams NDJSON: {type:"progress"} lines, then one {type:"report"} or {type:"error"}. */
export async function POST(req: Request) {
  const blocked = guardRequest(req, "scout", 6);
  if (blocked) return blocked;

  const body = await req.json().catch(() => ({}));
  const niche = getNiche(cleanInput(body.niche, 40));
  const region = cleanInput(body.region, 80);

  const enc = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(enc.encode(JSON.stringify(obj) + "\n"));
      const ping = setInterval(() => send({ type: "ping" }), 15000);
      try {
        const report = await runScout(niche, region, (step, detail) => send({ type: "progress", step, detail }));
        send({ type: "report", report });
      } catch (e) {
        send({ type: "error", error: (e as Error).message || "Scout failed" });
      } finally {
        clearInterval(ping);
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
