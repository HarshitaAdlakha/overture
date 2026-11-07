// Apply supabase/migrations/*.sql in order. Overture shares a Supabase project
// with Spoke, so it applies its own ov_ migrations directly instead of `db push`.
// Every statement is idempotent (if not exists / create or replace).
import fs from 'node:fs';
import { withDb } from './db.mjs';

const dir = 'supabase/migrations';
await withDb(async (db) => {
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.query(fs.readFileSync(`${dir}/${f}`, 'utf8'));
    console.log('applied', f);
  }
});
