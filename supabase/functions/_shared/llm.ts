// One JSON-returning chat call to OpenAI if OPENAI_API_KEY is set, else null
// (callers fall back to templates, so Overture runs with no model at all).

export type Env = (k: string) => string | undefined;
export type Msg = { role: 'user' | 'assistant'; content: string };
export type JsonReply = { json: any; model: string; ms: number };

export function modelName(env: Env): string | null {
  return env('OPENAI_API_KEY') ? env('OV_MODEL') || 'gpt-5-mini' : null;
}

export function parseJson(text: string): any {
  const s = text.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(s); } catch { /* fall through */ }
  const m = s.match(/\{[\s\S]*\}/);
  if (m) return JSON.parse(m[0]);
  throw new Error('model did not return JSON');
}

export async function callJson(env: Env, system: string, messages: Msg[], maxTokens = 500): Promise<JsonReply | null> {
  const t0 = Date.now();
  const key = env('OPENAI_API_KEY');
  if (!key) return null;
  const model = modelName(env)!;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model,
      // JSON mode requires the word "JSON" somewhere in the messages.
      messages: [{ role: 'system', content: system + '\nReply with one JSON object only.' }, ...messages],
      response_format: { type: 'json_object' },
      max_completion_tokens: maxTokens + 600,
      ...(/^gpt-5/.test(model) ? { reasoning_effort: 'minimal' } : {}),
    }),
  });
  if (!res.ok) throw new Error(`openai ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { json: parseJson(j.choices?.[0]?.message?.content ?? ''), model, ms: Date.now() - t0 };
}
