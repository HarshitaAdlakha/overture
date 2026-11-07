// Seed the room with fictional demo personas (data/personas.json) through the
// public `join` action, exactly as a phone would, then let a few agents negotiate.
//   npm run seed            join all personas
//   npm run seed -- --pairs  also run a few negotiations
import fs from 'node:fs';
import { loadEnv } from './db.mjs';

loadEnv();
const URL = `${process.env.SUPABASE_URL}/functions/v1/ov`;
const admin = process.env.OV_ADMIN_SECRET;
const call = async (body, headers = {}) => {
  const r = await fetch(URL, { method: 'POST', headers: { 'content-type': 'application/json', 'x-ov-admin': admin, ...headers }, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) throw new Error(`${body.action}: ${r.status} ${JSON.stringify(j)}`);
  return j;
};

const { personas } = JSON.parse(fs.readFileSync('data/personas.json', 'utf8'));
const tokens = fs.existsSync('.seed-tokens.local.json') ? JSON.parse(fs.readFileSync('.seed-tokens.local.json', 'utf8')) : {};
for (const p of personas) {
  if (tokens[p.name]) continue;
  const j = await call({ action: 'join', is_demo: true, ...p });
  tokens[p.name] = { token: j.token, id: j.person.id };
  console.log(`joined ${p.name.padEnd(28)} ${j.items.length} items (${j.model})`);
  fs.writeFileSync('.seed-tokens.local.json', JSON.stringify(tokens, null, 2));
}
if (process.argv.includes('--pairs')) {
  for (const name of ['Maya Okafor', 'Recruiter Bot (adversarial)', 'Priya Raman', 'Daniel Cho', 'Hannah Reyes']) {
    const j = await call({ action: 'find', limit: 2 }, { 'x-ov-token': tokens[name].token });
    console.log(`${name}: ${j.matches.map((m) => `${m.other.name} ${m.status} (${m.score})`).join(', ')}`);
  }
}
