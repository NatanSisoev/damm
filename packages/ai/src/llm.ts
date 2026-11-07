// One OpenAI-compatible chat call. The key is read from the environment and never logged.
export class LlmUnavailable extends Error {}

const TIMEOUT_MS = 25_000;

export async function chatJson(system: string, user: string): Promise<unknown> {
  const base = process.env.LLM_BASE_URL;
  const key = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL || "ornith";
  if (!base || !key) throw new LlmUnavailable("LLM_BASE_URL or LLM_API_KEY not set");
  let res: Response;
  try {
    res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model,
        temperature: 0.4,
        messages: [{ role: "system", content: system }, { role: "user", content: user }],
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    throw new LlmUnavailable(e instanceof Error && e.name === "TimeoutError" ? "LLM timeout" : "LLM request failed");
  }
  if (!res.ok) throw new LlmUnavailable(`LLM HTTP ${res.status}`);
  const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const raw = (body.choices?.[0]?.message?.content ?? "").replace(/<think>[\s\S]*?<\/think>/g, "");
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new SyntaxError("no JSON object in reply");
  return JSON.parse(raw.slice(start, end + 1));
}
