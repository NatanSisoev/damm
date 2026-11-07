// One OpenAI-compatible chat call. The key is read from the environment and never logged.
export class LlmUnavailable extends Error {}

// With thinking off, ornith answers in a few seconds; the timeout is only a safety net.
const TIMEOUT_MS = Number(process.env.LLM_TIMEOUT_MS) || 45_000;
/** Extra attempts on 429 / 5xx / network errors (shared gateway). */
const MAX_RETRIES = 3;

export interface ChatOptions {
  temperature?: number;
  /** Reasoning pass. Off by default: it is the main latency cost (13-22 s vs about 3 s). */
  thinking?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
  /** Earlier turns, used to ask the model to repair its previous reply. */
  history?: { role: "assistant" | "user"; content: string }[];
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function chatJson(system: string, user: string, opts: ChatOptions = {}): Promise<unknown> {
  const base = process.env.LLM_BASE_URL;
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "ornith";
  if (!base || !key) throw new LlmUnavailable("LLM_BASE_URL or LLM_API_KEY not set");
  const body = JSON.stringify({
    model,
    temperature: opts.temperature ?? 0.4,
    max_tokens: opts.maxTokens ?? 2000,
    messages: [{ role: "system", content: system }, { role: "user", content: user }, ...(opts.history ?? [])],
    // DCC guide: skip the reasoning pass (main latency cost) and force a JSON object reply.
    chat_template_kwargs: { enable_thinking: opts.thinking ?? false },
    response_format: { type: "json_object" },
  });
  let res: Response | null = null;
  let why = "LLM request failed";
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: { "content-type": "application/json; charset=utf-8", authorization: `Bearer ${key}` },
        body,
        signal: AbortSignal.timeout(opts.timeoutMs ?? TIMEOUT_MS),
      });
    } catch (e) {
      if (e instanceof Error && e.name === "TimeoutError") throw new LlmUnavailable("LLM timeout");
      res = null;
      why = "LLM request failed";
    }
    if (res && res.ok) break;
    if (res) {
      why = `LLM HTTP ${res.status}`;
      if (res.status !== 429 && res.status < 500) throw new LlmUnavailable(why); // 4xx other than 429: do not retry
    }
    if (attempt === MAX_RETRIES) throw new LlmUnavailable(why);
    const retryAfter = Number(res?.headers.get("retry-after"));
    await sleep(retryAfter > 0 ? Math.min(retryAfter, 20) * 1000 : 1000 * 3 ** attempt);
  }
  const json = (await res!.json()) as { choices?: { message?: { content?: string | null } }[] };
  const raw = (json.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("no JSON object in reply");
  return JSON.parse(raw.slice(start, end + 1));
}
