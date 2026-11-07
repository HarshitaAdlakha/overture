// Edge function `ov`: the only way in or out of Overture's tables.
//   POST /functions/v1/ov  { action, ... }
//
// Public:     join, room
// Token:      me, update, find, decide         (bearer token from `join`, kept on the phone)
// Admin:      pair                              (x-ov-admin secret; seeding and the leak eval)
//
// Tables have RLS on with no policies, so the browser can't touch them; this
// function uses the service role and checks the person's token on every call.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { callJson } from '../_shared/llm.ts';
import { buildIntro, extract, negotiate, rank, type Ask, type Person } from '../_shared/agents.ts';
import type { Item } from '../_shared/gate.ts';
import type { Card } from '../_shared/score.ts';

const env = (k: string) => Deno.env.get(k);
const db = createClient(env('SUPABASE_URL')!, env('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });
const ask: Ask = (system, messages, max) => callJson(env, system, messages, max);
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info, x-ov-token, x-ov-admin',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'content-type': 'application/json' } });
class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);

async function sha256(s: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(24));
  return 'ov_' + [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}
function slug(name: string) {
  const base = name.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 28) || 'agent';
  return `${base}-${Math.random().toString(36).slice(2, 6)}`;
}

async function me(req: Request, body: any) {
  const token = str(req.headers.get('x-ov-token') ?? body.token, 100);
  if (!token) throw new HttpError(401, 'missing token');
  const { data, error } = await db.from('ov_people').select('*').eq('token_hash', await sha256(token)).maybeSingle();
  if (error) throw error;
  if (!data) throw new HttpError(401, 'unknown token');
  return data;
}

async function card(personId: string): Promise<Card & { instructions: string; email: string | null }> {
  const [{ data: p, error: e1 }, { data: items, error: e2 }] = await Promise.all([
    db.from('ov_people').select('id,name,headline,instructions,email').eq('id', personId).single(),
    db.from('ov_items').select('id,kind,text,policy').eq('person_id', personId).order('created_at'),
  ]);
  if (e1 || e2) throw e1 ?? e2;
  return { ...p, items: (items ?? []) as Item[] };
}

// Run one negotiation and store it, turn by turn, so the room board shows it live.
async function runPair(aId: string, bId: string, seed: { score?: number; reciprocity?: number; unexpected?: number; why?: string }, gate = true) {
  const [a, b] = await Promise.all([card(aId), card(bId)]);
  const { data: m, error } = await db.from('ov_matches')
    .insert({ a: aId, b: bId, status: 'negotiating', score: seed.score ?? null, reciprocity: seed.reciprocity ?? null, unexpected: seed.unexpected ?? null, why: seed.why ?? '' })
    .select('id').single();
  if (error) throw error;
  const out = await negotiate(ask, a, b, {
    gate,
    onTurn: async (t, blocked) => {
      await db.from('ov_turns').insert({ match_id: m.id, speaker: t.speaker, turn: t.turn, text: t.text, verdict: t.verdict });
      if (blocked.length) await db.from('ov_gate_log').insert(blocked.map((x) => ({ match_id: m.id, speaker: x.speaker, item_id: x.item_id ?? null, rule: x.rule })));
      await db.from('ov_matches').update({ updated_at: new Date().toISOString() }).eq('id', m.id);
    },
  });
  await db.from('ov_matches').update({
    status: out.status, why: out.why || seed.why || '', a_gets: out.a_gets, b_gets: out.b_gets, agenda: out.agenda,
    model: out.model, updated_at: new Date().toISOString(),
  }).eq('id', m.id);
  return { id: m.id, ...out };
}

async function myView(personId: string) {
  const self = await card(personId);
  const { data: ms, error } = await db.from('ov_matches').select('*').or(`a.eq.${personId},b.eq.${personId}`).order('updated_at', { ascending: false });
  if (error) throw error;
  const ids = (ms ?? []).map((m) => m.id);
  const [turns, decisions] = await Promise.all([
    ids.length ? db.from('ov_turns').select('match_id,speaker,turn,text,verdict').in('match_id', ids).order('turn') : { data: [] },
    ids.length ? db.from('ov_decisions').select('match_id,person_id,decision').in('match_id', ids) : { data: [] },
  ]);
  const otherIds = [...new Set((ms ?? []).map((m) => (m.a === personId ? m.b : m.a)))];
  const { data: others } = otherIds.length ? await db.from('ov_people').select('id,name,headline,handle').in('id', otherIds) : { data: [] };
  const { data: otherItems } = otherIds.length ? await db.from('ov_items').select('person_id,kind,text').in('person_id', otherIds).eq('policy', 'share') : { data: [] };
  const matches = (ms ?? []).map((m) => {
    const otherId = m.a === personId ? m.b : m.a;
    const o = (others ?? []).find((x: any) => x.id === otherId);
    const mine = m.a === personId;
    return {
      id: m.id, status: m.status, score: m.score, reciprocity: m.reciprocity, unexpected: m.unexpected,
      why: m.why, i_get: mine ? m.a_gets : m.b_gets, they_get: mine ? m.b_gets : m.a_gets, agenda: m.agenda,
      reached_out: mine, model: m.model, updated_at: m.updated_at,
      other: { ...o, offers: (otherItems ?? []).filter((i: any) => i.person_id === otherId && i.kind === 'offer').map((i: any) => i.text),
               needs: (otherItems ?? []).filter((i: any) => i.person_id === otherId && i.kind === 'need').map((i: any) => i.text) },
      turns: (turns.data ?? []).filter((t: any) => t.match_id === m.id).map((t: any) => ({ ...t, mine: t.speaker === personId })),
      my_decision: (decisions.data ?? []).find((d: any) => d.match_id === m.id && d.person_id === personId)?.decision ?? null,
      their_decision: (decisions.data ?? []).find((d: any) => d.match_id === m.id && d.person_id === otherId)?.decision ?? null,
      intro: m.status === 'introduced' ? m.intro : null, // only ever returned to a or b
    };
  });
  const { count: blocked } = await db.from('ov_gate_log').select('id', { count: 'exact', head: true }).eq('speaker', personId);
  return { person: { id: self.id, name: self.name, headline: self.headline, instructions: self.instructions, email: self.email }, items: self.items, matches, blocked: blocked ?? 0 };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json().catch(() => ({}));
    const action = str(body.action, 20);

    if (action === 'room') {
      const { data, error } = await db.rpc('ov_room', { p_limit: 40 });
      if (error) throw error;
      return json(data);
    }

    if (action === 'join') {
      const name = str(body.name, 80);
      if (!name) throw new HttpError(400, 'name is required');
      const email = str(body.email, 120) || null;
      if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, 'that email looks wrong');
      const o = { building: str(body.building, 600), good_at: str(body.good_at, 600), looking_for: str(body.looking_for, 600), private: str(body.private, 600) };
      if (!o.good_at && !o.building) throw new HttpError(400, 'tell your agent what you are building or good at');
      const ex = await extract(ask, o);
      const token = newToken();
      const { data: p, error } = await db.from('ov_people').insert({
        handle: slug(name), name, email, headline: str(body.headline, 160) || ex.headline || o.building.slice(0, 90),
        instructions: str(body.instructions, 600), token_hash: await sha256(token), is_demo: body.is_demo === true && req.headers.get('x-ov-admin') === env('OV_ADMIN_SECRET'),
      }).select('id').single();
      if (error) throw error;
      const { error: e2 } = await db.from('ov_items').insert(ex.items.map((i: any) => ({ ...i, person_id: p.id })));
      if (e2) throw e2;
      return json({ token, model: ex.model, ...(await myView(p.id)) });
    }

    if (action === 'me') return json(await myView((await me(req, body)).id));

    if (action === 'update') {
      const p = await me(req, body);
      const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (typeof body.instructions === 'string') patch.instructions = str(body.instructions, 600);
      if (typeof body.headline === 'string') patch.headline = str(body.headline, 160);
      if (typeof body.email === 'string') patch.email = str(body.email, 120) || null;
      await db.from('ov_people').update(patch).eq('id', p.id);
      for (const it of (Array.isArray(body.items) ? body.items : []).slice(0, 30)) {
        if (!['share', 'after_accept', 'never'].includes(it.policy)) continue;
        await db.from('ov_items').update({ policy: it.policy, updated_at: new Date().toISOString() }).eq('id', it.id).eq('person_id', p.id);
      }
      for (const it of (Array.isArray(body.add) ? body.add : []).slice(0, 10)) {
        const text = str(it.text, 280);
        if (text.length > 2 && ['offer', 'need', 'fact'].includes(it.kind)) {
          await db.from('ov_items').insert({ person_id: p.id, kind: it.kind, text, policy: it.kind === 'fact' ? 'never' : (it.policy ?? 'share') });
        }
      }
      const remove = (Array.isArray(body.remove) ? body.remove : []).map(String).slice(0, 30);
      if (remove.length) await db.from('ov_items').delete().in('id', remove).eq('person_id', p.id);
      return json(await myView(p.id));
    }

    if (action === 'find') {
      const p = await me(req, body);
      const [self, { data: people }, { data: existing }] = await Promise.all([
        card(p.id),
        db.from('ov_people').select('id').neq('id', p.id).order('created_at', { ascending: false }).limit(60),
        db.from('ov_matches').select('a,b').or(`a.eq.${p.id},b.eq.${p.id}`),
      ]);
      const done = new Set((existing ?? []).flatMap((m: any) => [m.a, m.b]));
      const pool = await Promise.all((people ?? []).filter((x: any) => !done.has(x.id)).slice(0, 40).map((x: any) => card(x.id)));
      if (!pool.length) return json({ found: 0, note: 'Your agent has already talked to every agent in the room.', ...(await myView(p.id)) });
      const n = Math.max(1, Math.min(3, Number(body.limit) || 2));
      const { ranked, model } = await rank(ask, self, pool, n);
      const results = await Promise.all(ranked.map((r) => runPair(p.id, r.id, r).catch((e) => ({ error: (e as Error).message }))));
      return json({ found: results.length, rank_model: model, ...(await myView(p.id)) });
    }

    if (action === 'decide') {
      const p = await me(req, body);
      const matchId = str(body.match_id, 40);
      const decision = body.decision === 'accept' ? 'accept' : 'decline';
      const { data: m } = await db.from('ov_matches').select('*').eq('id', matchId).maybeSingle();
      if (!m || (m.a !== p.id && m.b !== p.id)) throw new HttpError(404, 'no such intro');
      if (!['proposed', 'accepted'].includes(m.status)) throw new HttpError(409, `this intro is ${m.status}`);
      await db.from('ov_decisions').upsert({ match_id: m.id, person_id: p.id, decision, note: str(body.note, 280) });
      const { data: ds } = await db.from('ov_decisions').select('person_id,decision').eq('match_id', m.id);
      const yes = (ds ?? []).filter((d: any) => d.decision === 'accept').map((d: any) => d.person_id);
      let status = m.status;
      if (decision === 'decline') status = 'declined';
      else if (yes.includes(m.a) && yes.includes(m.b)) {
        // Double opt-in reached: release after_accept items and contact details, to these two only.
        const [a, b] = await Promise.all([card(m.a), card(m.b)]);
        const intro = buildIntro(a as Person, b as Person, m);
        await db.from('ov_matches').update({ status: 'introduced', intro, updated_at: new Date().toISOString() }).eq('id', m.id);
        status = 'introduced';
      } else status = 'accepted';
      if (status !== 'introduced') await db.from('ov_matches').update({ status, updated_at: new Date().toISOString() }).eq('id', m.id);
      return json({ status, ...(await myView(p.id)) });
    }

    if (action === 'diag') {
      if (!env('OV_ADMIN_SECRET') || req.headers.get('x-ov-admin') !== env('OV_ADMIN_SECRET')) throw new HttpError(403, 'admin only');
      try { return json({ ok: true, reply: await ask('Return {"ok": true}.', [{ role: 'user', content: 'ping' }], 50) }); }
      catch (e) { return json({ ok: false, error: (e as Error).message }); }
    }

    if (action === 'pair') {
      if (!env('OV_ADMIN_SECRET') || req.headers.get('x-ov-admin') !== env('OV_ADMIN_SECRET')) throw new HttpError(403, 'admin only');
      const aId = str(body.a, 40), bId = str(body.b, 40), gate = body.gate !== false;
      // Eval runs (persist: false) are not stored: an ungated transcript may contain planted secrets.
      if (body.persist === false) {
        const [a, b] = await Promise.all([card(aId), card(bId)]);
        return json(await negotiate(ask, a, b, { gate }));
      }
      return json(await runPair(aId, bId, {}, true));
    }

    throw new HttpError(400, 'unknown action');
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    console.error(JSON.stringify({ error: (e as Error).message }));
    return json({ error: status === 500 ? 'something went wrong' : (e as Error).message }, status);
  }
});
