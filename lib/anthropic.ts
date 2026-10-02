import Anthropic from "@anthropic-ai/sdk";
import { jsonrepair } from "jsonrepair";

export const SCOUT_MODEL = process.env.SCOUT_MODEL || "claude-sonnet-5-5";
export const CHAT_MODEL = process.env.CHAT_MODEL || "claude-haiku-4-5-20251001";

let research: Anthropic | null = null;
let chat: Anthropic | null = null;

export function hasKeys() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/** Client for deep research: web search, web fetch, campaign generation. */
export function researchClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set");
  research ??= new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  return research;
}

/** Client for fast chat. Uses its own key when provided. */
export function chatClient() {
  const key = process.env.ANTHROPIC_CHAT_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_CHAT_API_KEY / ANTHROPIC_API_KEY is not set");
  chat ??= new Anthropic({ apiKey: key, maxRetries: 2 });
  return chat;
}

/** Concatenate all text blocks of a message. */
export function textOf(content: Anthropic.Messages.ContentBlock[]) {
  return content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n");
}

type RunOpts = {
  system: string;
  prompt: string;
  model?: string;
  maxTokens?: number;
  webSearchUses?: number;
  webFetchUses?: number;
  blockedDomains?: string[];
};

export type SubmitTool = {
  name: string;
  description: string;
  /** JSON Schema for the tool input. Zod still validates afterwards. */
  schema: Record<string, unknown>;
};

/** Stop offering web tools past this prompt size, leaving room to finish the turn. */
const PROMPT_TOKEN_BUDGET = 600_000;

/** Models that reject a forced `tool_choice`, learned from the first 400 and cached. */
const noForcedToolChoice = new Set<string>();

function isForcedToolChoiceRejected(e: unknown) {
  return e instanceof Anthropic.BadRequestError && /tool_choice/i.test(String((e as Error).message));
}

/** Rough prompt size. Search and fetch results are JSON text, so ~3.5 chars per token. */
function estimateTokens(system: string, messages: Anthropic.Messages.MessageParam[]) {
  return Math.ceil((system.length + JSON.stringify(messages).length) / 3.5);
}

/** Web tools for one request, sized to what is left of the run's budget. `max_uses` must be > 0. */
function webTools(opts: RunOpts, searchLeft: number, fetchLeft: number) {
  const tools: unknown[] = [];
  if (searchLeft > 0) {
    tools.push({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: searchLeft,
      ...(opts.blockedDomains?.length ? { blocked_domains: opts.blockedDomains } : {}),
      user_location: { type: "approximate", country: "US" },
    });
  }
  if (fetchLeft > 0) {
    tools.push({
      type: "web_fetch_20250910",
      name: "web_fetch",
      max_uses: fetchLeft,
      max_content_tokens: 12000,
      ...(opts.blockedDomains?.length ? { blocked_domains: opts.blockedDomains } : {}),
    });
  }
  return tools;
}

/**
 * Runs an agent turn with Claude's server-side web tools, continuing through
 * `pause_turn`. When `submit` is given, the model returns its result by calling
 * that tool, so the output needs no JSON parsing. The call is forced when there is
 * nothing to research; on models that reject a forced `tool_choice` the prompts ask
 * for it instead, and `runStructured` parses the text if the model skips the call.
 */
export async function runAgent(opts: RunOpts & { submit?: SubmitTool }): Promise<{ data?: unknown; text: string }> {
  const client = researchClient();
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: opts.prompt }];
  // `max_uses` is per request, so a paused turn resumed with the same tools would get a
  // fresh budget every time while all earlier results stay in the prompt — that overflowed
  // the context window. Spend one pool across the whole run instead.
  let searchLeft = opts.webSearchUses ?? 0;
  let fetchLeft = opts.webFetchUses ?? 0;
  let text = "";
  for (let i = 0; i < 5; i++) {
    const roomToSearch = estimateTokens(opts.system, messages) < PROMPT_TOKEN_BUDGET;
    const tools = roomToSearch ? webTools(opts, searchLeft, fetchLeft) : [];
    if (opts.submit) {
      tools.push({ name: opts.submit.name, description: opts.submit.description, input_schema: opts.submit.schema });
    }
    const model = opts.model || SCOUT_MODEL;
    // With the submit tool alone there is nothing to research, so require the call rather
    // than hope for it. Models that reject a forced choice fall back to picking it freely;
    // the prompts ask for the call and `runStructured` can still parse it out of the text.
    const force = Boolean(opts.submit) && tools.length === 1 && !noForcedToolChoice.has(model);
    const send = (forced: boolean) =>
      client.messages.create({
        model,
        max_tokens: opts.maxTokens || 12000,
        system: opts.system,
        messages,
        ...(tools.length ? { tools: tools as Anthropic.Messages.ToolUnion[] } : {}),
        ...(forced ? { tool_choice: { type: "tool" as const, name: opts.submit!.name } } : {}),
      });

    let res;
    try {
      res = await send(force);
    } catch (e) {
      if (!force || !isForcedToolChoiceRejected(e)) throw e;
      noForcedToolChoice.add(model);
      res = await send(false);
    }
    text += textOf(res.content);
    const call = res.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === opts.submit?.name,
    );
    if (call) return { data: call.input, text };
    if (res.stop_reason !== "pause_turn") break;
    // Charge this turn's searches and fetches against the run's budget. Once a budget hits
    // zero the tool is dropped; leaving its past results in the history is fine.
    searchLeft -= res.usage.server_tool_use?.web_search_requests ?? 0;
    fetchLeft -= res.usage.server_tool_use?.web_fetch_requests ?? 0;
    // Send the paused assistant turn back unchanged to let it continue.
    messages.push({ role: "assistant", content: res.content as Anthropic.Messages.ContentBlockParam[] });
  }
  return { text };
}

/** Plain-text research turn (kept for simple calls). */
export async function runResearch(opts: RunOpts): Promise<string> {
  return (await runAgent(opts)).text;
}

/** Structured result: submit-tool input when called, otherwise JSON recovered from the text. */
export async function runStructured(opts: RunOpts & { submit: SubmitTool }, tag?: string): Promise<unknown> {
  const r = await runAgent(opts);
  if (r.data !== undefined) return r.data;
  return extractJson(r.text, tag);
}

/** Pull the JSON object out of a model reply (tagged, fenced, or bare), repairing minor syntax errors. */
export function extractJson(text: string, tag?: string): unknown {
  let body = text;
  if (tag) {
    const m = text.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
    if (m) body = m[1];
  }
  const fenced = body.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenced) body = fenced[1];
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end <= start) throw new Error("The model did not return structured data. Try again.");
  const raw = body.slice(start, end + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return JSON.parse(jsonrepair(raw));
  }
}
