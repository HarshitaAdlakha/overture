-- Overture: agents that negotiate introductions on behalf of their people.
-- Every table is prefixed ov_ (it shares a Supabase project with Spoke) and has
-- row-level security on with NO policies: the browser cannot read or write any
-- of them directly. Everything goes through the `ov` edge function (service role,
-- token-checked) or the public, privacy-safe `ov_room()` RPC below.

create extension if not exists pgcrypto;

create table if not exists ov_people (
  id          uuid primary key default gen_random_uuid(),
  handle      text not null unique check (handle ~ '^[a-z0-9-]{2,40}$'),
  name        text not null check (length(name) between 1 and 80),
  headline    text not null default '' check (length(headline) <= 160),
  email       text check (email is null or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  instructions text not null default '' check (length(instructions) <= 600), -- standing orders to the agent
  token_hash  text not null,              -- sha256 of the bearer token kept on the person's phone
  is_demo     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- What a person offers, needs, and private facts their agent knows.
--   share         the agent may say it to any other agent
--   after_accept  released only inside the intro, after BOTH people accept
--   never         the agent may use it to decide, never to say
create table if not exists ov_items (
  id         uuid primary key default gen_random_uuid(),
  person_id  uuid not null references ov_people(id) on delete cascade,
  kind       text not null check (kind in ('offer', 'need', 'fact')),
  text       text not null check (length(text) between 2 and 280),
  policy     text not null check (policy in ('share', 'after_accept', 'never')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists ov_items_person on ov_items(person_id);

create table if not exists ov_matches (
  id           uuid primary key default gen_random_uuid(),
  a            uuid not null references ov_people(id) on delete cascade, -- the agent that reached out
  b            uuid not null references ov_people(id) on delete cascade,
  status       text not null default 'negotiating'
               check (status in ('negotiating', 'proposed', 'no_match', 'accepted', 'declined', 'introduced')),
  score        real check (score between 0 and 1),
  reciprocity  real check (reciprocity between 0 and 1),
  unexpected   real check (unexpected between 0 and 1),
  why          text not null default '',
  a_gets       text not null default '',
  b_gets       text not null default '',
  agenda       text not null default '',
  model        text not null default '',
  intro        jsonb,                        -- released only to a and b, after both accept
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  check (a <> b)
);
create unique index if not exists ov_matches_pair on ov_matches (least(a, b), greatest(a, b));

-- The agent-to-agent conversation. Every row has already passed the disclosure gate.
create table if not exists ov_turns (
  id         bigint generated always as identity primary key,
  match_id   uuid not null references ov_matches(id) on delete cascade,
  speaker    uuid not null references ov_people(id) on delete cascade,
  turn       int not null check (turn between 0 and 20),
  text       text not null check (length(text) <= 1200),
  verdict    text not null check (verdict in ('pass', 'rewritten', 'redacted')),
  created_at timestamptz not null default now()
);
create index if not exists ov_turns_match on ov_turns(match_id, turn);

-- What the gate stopped. The blocked text itself is never stored, only the rule
-- and which protected item it would have revealed.
create table if not exists ov_gate_log (
  id         bigint generated always as identity primary key,
  match_id   uuid references ov_matches(id) on delete cascade,
  speaker    uuid references ov_people(id) on delete cascade,
  item_id    uuid references ov_items(id) on delete set null,
  rule       text not null,
  created_at timestamptz not null default now()
);

create table if not exists ov_decisions (
  match_id   uuid not null references ov_matches(id) on delete cascade,
  person_id  uuid not null references ov_people(id) on delete cascade,
  decision   text not null check (decision in ('accept', 'decline')),
  note       text not null default '' check (length(note) <= 280),
  created_at timestamptz not null default now(),
  primary key (match_id, person_id)
);

-- Leak evaluation runs (scripts/eval.mjs): gate on vs off on planted canaries.
create table if not exists ov_eval_runs (
  id          bigint generated always as identity primary key,
  gate        boolean not null,
  negotiations int not null,
  messages    int not null,
  leaks       int not null,
  blocked     int not null,
  model       text not null,
  detail      jsonb not null default '{}',
  created_at  timestamptz not null default now()
);

alter table ov_people    enable row level security;
alter table ov_items     enable row level security;
alter table ov_matches   enable row level security;
alter table ov_turns     enable row level security;
alter table ov_gate_log  enable row level security;
alter table ov_decisions enable row level security;
alter table ov_eval_runs enable row level security;

-- The room board: public, privacy-safe. Agent cards show only `share` items;
-- matches show status and gated turns, never intros, emails or protected items.
create or replace function ov_room(p_limit int default 30)
returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'people', (select coalesce(jsonb_agg(jsonb_build_object(
        'id', p.id, 'handle', p.handle, 'name', p.name, 'headline', p.headline, 'is_demo', p.is_demo,
        'offers', (select coalesce(jsonb_agg(i.text order by i.created_at), '[]') from ov_items i
                   where i.person_id = p.id and i.kind = 'offer' and i.policy = 'share'),
        'needs',  (select coalesce(jsonb_agg(i.text order by i.created_at), '[]') from ov_items i
                   where i.person_id = p.id and i.kind = 'need' and i.policy = 'share'),
        'protected', (select count(*) from ov_items i where i.person_id = p.id and i.policy <> 'share')
      ) order by p.created_at desc), '[]') from ov_people p),
    'matches', (select coalesce(jsonb_agg(m order by m.updated_at desc), '[]') from (
        select m.id, m.a, m.b, m.status, m.score, m.reciprocity, m.unexpected, m.why, m.updated_at,
          (select coalesce(jsonb_agg(jsonb_build_object('speaker', t.speaker, 'turn', t.turn, 'text', t.text, 'verdict', t.verdict) order by t.turn), '[]')
             from ov_turns t where t.match_id = m.id) as turns,
          (select count(*) from ov_gate_log g where g.match_id = m.id) as blocked
        from ov_matches m order by m.updated_at desc limit greatest(1, least(p_limit, 100))) m),
    'stats', jsonb_build_object(
        'agents', (select count(*) from ov_people),
        'negotiations', (select count(*) from ov_matches),
        'proposed', (select count(*) from ov_matches where status in ('proposed', 'accepted', 'introduced')),
        'introduced', (select count(*) from ov_matches where status = 'introduced'),
        'messages', (select count(*) from ov_turns),
        'blocked', (select count(*) from ov_gate_log),
        'protected_items', (select count(*) from ov_items where policy <> 'share')),
    'eval', (select coalesce(jsonb_agg(e order by e.gate), '[]') from (
        select distinct on (gate) gate, negotiations, messages, leaks, blocked, model, created_at
        from ov_eval_runs order by gate, created_at desc) e),
    'at', now());
$$;
revoke all on function ov_room(int) from public;
grant execute on function ov_room(int) to anon, authenticated;
