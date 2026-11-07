// Minimal OpenAI-compatible chat client on global fetch. No dependencies, never logs the key.
// The only model on the team endpoint is a reasoning model: it thinks in a separate `reasoning` field and answers in
// `content`, which is null when it ran out of tokens. That case is retried like a network error.

export interface CompleteRequest {
  system: string;
  user: string;
  /** Include room for the model's reasoning: 1500 or more. */
  maxTokens: number;
}

/** Injectable completion function: tests pass a fake, production uses `createComplete`. */
export type Complete = (req: CompleteRequest) => Promise<string>;

export interface LlmConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
  /** Per-request timeout in ms. */
  timeoutMs: number;
  /** Retries after the first attempt (network error, timeout, 5xx, empty content). */
  retries: number;
}

export const DEFAULT_LLM_MODEL = "ornith";

/** Reads LLM_BASE_URL, LLM_API_KEY and LLM_MODEL from an env-like object. Throws when URL or key is missing. */
export function llmConfigFromEnv(env: Record<string, string | undefined> = process.env): LlmConfig {
  const baseUrl = env["LLM_BASE_URL"]?.trim();
  const apiKey = env["LLM_API_KEY"]?.trim();
  if (!baseUrl) throw new Error("LLM_BASE_URL is not set");
  if (!apiKey) throw new Error("LLM_API_KEY is not set");
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey, model: env["LLM_MODEL"]?.trim() || DEFAULT_LLM_MODEL, timeoutMs: 180_000, retries: 2 };
}

class RetryableError extends Error {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function createComplete(config: LlmConfig = llmConfigFromEnv(), fetchImpl: typeof fetch = fetch): Complete {
  const attempt = async (req: CompleteRequest): Promise<string> => {
    let res: Response;
    try {
      res = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json; charset=utf-8", Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
          model: config.model,
          messages: [
            { role: "system", content: req.system },
            { role: "user", content: req.user },
          ],
          max_tokens: req.maxTokens,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(config.timeoutMs),
      });
    } catch (e) {
      // Network error or timeout. Only the error name goes into the message, never request details.
      throw new RetryableError(`LLM request failed: ${e instanceof Error ? e.name : "error"}`);
    }
    if (res.status >= 500) throw new RetryableError(`LLM server error ${res.status}`);
    if (!res.ok) throw new Error(`LLM request rejected with status ${res.status}`);
    let body: { choices?: { message?: { content?: string | null } }[] };
    try {
      body = (await res.json()) as typeof body;
    } catch {
      throw new RetryableError("LLM returned a non-JSON body");
    }
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.trim() === "") throw new RetryableError("LLM returned empty content (out of tokens?)");
    return content;
  };

  return async (req) => {
    let last: unknown;
    for (let i = 0; i <= config.retries; i++) {
      try {
        return await attempt(req);
      } catch (e) {
        last = e;
        if (!(e instanceof RetryableError)) throw e;
        if (i < config.retries) await sleep(1000 * 2 ** i);
      }
    }
    throw last;
  };
}
