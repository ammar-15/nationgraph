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

function webTools(opts: RunOpts) {
  const tools: unknown[] = [];
  if (opts.webSearchUses) {
    tools.push({
      type: "web_search_20250305",
      name: "web_search",
      max_uses: opts.webSearchUses,
      ...(opts.blockedDomains?.length ? { blocked_domains: opts.blockedDomains } : {}),
      user_location: { type: "approximate", country: "US" },
    });
  }
  if (opts.webFetchUses) {
    tools.push({
      type: "web_fetch_20250910",
      name: "web_fetch",
      max_uses: opts.webFetchUses,
      max_content_tokens: 12000,
      ...(opts.blockedDomains?.length ? { blocked_domains: opts.blockedDomains } : {}),
    });
  }
  return tools;
}

/**
 * Runs an agent turn with Claude's server-side web tools, continuing through
 * `pause_turn`. When `submit` is given, the model returns its result by calling
 * that tool, so the output needs no JSON parsing. The choice is left to the
 * model: some models reject a forced `tool_choice`, and the prompts ask for the
 * call explicitly. `runStructured` falls back to parsing the text if it skips it.
 */
export async function runAgent(opts: RunOpts & { submit?: SubmitTool }): Promise<{ data?: unknown; text: string }> {
  const client = researchClient();
  const tools = webTools(opts);
  if (opts.submit) {
    tools.push({ name: opts.submit.name, description: opts.submit.description, input_schema: opts.submit.schema });
  }
  const messages: Anthropic.Messages.MessageParam[] = [{ role: "user", content: opts.prompt }];
  let text = "";
  for (let i = 0; i < 5; i++) {
    const res = await client.messages.create({
      model: opts.model || SCOUT_MODEL,
      max_tokens: opts.maxTokens || 12000,
      system: opts.system,
      messages,
      ...(tools.length ? { tools: tools as Anthropic.Messages.ToolUnion[] } : {}),
    });
    text += textOf(res.content);
    const call = res.content.find(
      (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use" && b.name === opts.submit?.name,
    );
    if (call) return { data: call.input, text };
    if (res.stop_reason !== "pause_turn") break;
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
