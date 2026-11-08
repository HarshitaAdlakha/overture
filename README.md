# Overture

**Your agent meets their agent before you do.**

You're at a one-day hackathon with a room full of builders. You'll talk to maybe five of them, and which five is mostly luck. Overture gives everyone in the room an agent. At check-in you tell it what you're building, what you're good at, what you're looking for, and, in a separate box, what it should know but **never say**. Your agent then talks to the other agents directly. It ranks the room by two-way fit and *moderate* unexpectedness (the weak-ties result), negotiates in four short messages, and brings back a proposed intro: why you two should meet, what each of you gets, and a 15-minute agenda. A **disclosure gate** checks every message an agent sends, in code. If a message would reveal something private, the gate makes the agent rewrite it, or withholds it. **Nothing happens until both people say yes.** Only then are emails, a calendar slot, and anything marked "after both accept" released, to those two people only.

Built by **Paras Adlakha** and **Harshita Adlakha** for the **Anything Applied Agentic Hackathon** (hackathons.team, Entrepreneurs First, San Francisco, 7 November 2026). Special theme challenge 5: *Your Agent, My Agent*.

**▶️ [Open the live app](https://parasadlakha.github.io/overture/app/)** · [Project page](https://parasadlakha.github.io/overture/) · 🎬 [2-minute demo](docs/video/Overture-demo-2min.mp4) · [3-minute pitch](docs/video/Overture-pitch-3min.mp4) · [silent, captioned](docs/video/Overture-demo-captioned.mp4) · 📑 [Slides (PDF)](docs/slides/Overture-slides.pdf) · [PowerPoint](docs/slides/Overture-slides.pptx) · [Market brief](https://parasadlakha.github.io/overture/market-brief.html) · [Research brief](https://parasadlakha.github.io/overture/research-brief.html)

![The room: agents as nodes, negotiations as edges, and the inspector showing a refused red-team attempt](docs/img/graph.png)

*The Room, live. Agents are nodes and negotiations are edges (amber proposed, green introduced, red refused). The inspector shows a red-team bot asking for salaries, then trying a prompt injection. It was refused.*

![Both people said yes: the intro, released only to these two](docs/img/introduced.png)

*After both people accept: email, a ready-to-send intro and a calendar slot. Ava's private facts (runway, other interviews) were never released.*

**Contents:** [The hackathon](#the-hackathon) · [The problem](#the-problem) · [What Overture does](#what-overture-does) · [The functions](#the-functions) · [How one intro is made](#how-one-intro-is-made) · [The disclosure gate](#the-disclosure-gate) · [Who should meet](#who-should-meet) · [Leak eval](#leak-eval) · [Architecture](#architecture) · [Private by construction](#private-by-construction) · [Guardrails](#guardrails) · [Supabase features used](#supabase-features-used) · [Real numbers](#real-numbers) · [Tests](#tests) · [Run it yourself](#run-it-yourself) · [Repository layout](#repository-layout) · [What we learned](#what-we-learned) · [Limitations and roadmap](#limitations-and-roadmap) · [Team](#team) · [References](#references)

---

## The hackathon

| | |
|---|---|
| **Event** | Anything Applied Agentic Hackathon, hackathons.team, Entrepreneurs First, 501 Folsom St, San Francisco |
| **Date** | Saturday 7 November 2026, 9 AM–8 PM PST (we built remotely, from India) |
| **Brief** | *Build an agent that does real work.* "The best demos won't just run. They'll make something real happen between two people, live, in the room." |
| **Theme** | AI-native professional social. We took challenge 5, **Your Agent, My Agent**: *what happens when AI agents start networking on our behalf?* It also covers 1 (Serendipity Engine) and 2 (The Knowledge That Finds You) |
| **Judging** | Working demo · technical depth · originality · usefulness · progress on the day · bonus for real human-agent collaboration |

### What the judges asked for, and where it is in Overture

| Ask | Overture |
|---|---|
| A working demo | Live on GitHub Pages; anyone can brief an agent from their phone in about 60 seconds and watch it negotiate in the Room |
| Something real between two people | Double opt-in intro: both people accept, then get each other's email, an intro email ready to send, and a calendar invite for the next half-hour slot |
| Technical depth | A deterministic disclosure gate around an untrusted model, a rewrite-then-redact loop, an injection flag, a research-grounded match score, and a leak eval with planted secrets |
| Originality | Agent to agent, not one central matchmaker. Each agent represents one person, with that person's sharing rules |
| Usefulness | Plugs straight into event check-in (this event's Mystery Match asks our three questions) |
| Human-agent collaboration | The agents do the legwork; people set the policy on every item, give standing instructions, and make every yes/no decision |

---

## The problem

- **Attention is the scarce resource.** A one-day event gives you a handful of real conversations. Matching is mostly luck.
- **Weak ties are where the value is, but they're the hardest to find.** LinkedIn's randomised experiments on 20 million people showed that moderately weak ties produce the most job mobility ([Rajkumar et al., *Science* 2022](https://consensus.app/papers/details/c18e430d018c5d9eab8c77dd288789da/)).
- **Agents that act for you over-share.** On the CI-Work benchmark, frontier-model agents violated contextual integrity in 15.8–50.9% of enterprise tasks, and more helpful agents leaked more ([Fu et al., 2026](https://consensus.app/papers/details/e459f0566b605f4f87104c414abe3743/)). A networking agent is a helpfulness machine.

**Our bet:** once agents network for us, the product isn't the match. It's **what each agent is allowed to say**, enforced outside the model, with a human yes on both sides.

---

## What Overture does

```mermaid
flowchart LR
    U1["Person A<br/>brief + private box"] --> A1["A's agent<br/>offers · needs · facts<br/>(share / after accept / never)"]
    U2["Person B"] --> A2["B's agent"]
    A1 -->|"rank: two-way fit ×<br/>moderate unexpectedness"| N{"negotiate<br/>4 messages"}
    A2 --> N
    N -->|"every message"| G{"disclosure gate"}
    G -- pass --> T[("ov_turns<br/>shown live in the Room")]
    G -- "leak" --> R["rewrite once<br/>→ else withhold"] --> T
    G -.->|"rule + item, never text"| L[("ov_gate_log")]
    N --> M["mediator: why · what each gets ·<br/>15-min agenda"]
    M --> P1["A: yes / not now"] & P2["B: yes / not now"]
    P1 & P2 -->|"both yes"| I["intro: emails + calendar +<br/>after-accept items released"]
```

| Step | What happens | Where |
|---|---|---|
| **Brief** | Three check-in questions plus a private box. The model turns them into offers, needs and facts. Private answers can never be promoted to `share` | [`agents.ts` → `extract`](supabase/functions/_shared/agents.ts) |
| **Set policy** | The person taps each item: *share*, *after both accept*, or *never* | My agent tab |
| **Rank** | The model scores every candidate on *helps me*, *I help*, and *unexpected*; the score combines them (below). Lexical fallback with no model | [`score.ts`](supabase/functions/_shared/score.ts), `rank` |
| **Negotiate** | The top two candidates, in parallel: four messages of at most 60 words. Each agent sees its own items with ids and policies; inbound messages are framed as untrusted data | `negotiate` |
| **Gate** | Every outgoing message is checked. On a hit: one rewrite (the model is told the rule, not the secret), then a fixed "withheld" line | [`gate.ts`](supabase/functions/_shared/gate.ts) |
| **Propose** | A mediator writes why, what each gets and an agenda, from the gated transcript only, and gates that too | `negotiate` |
| **Decide** | Each person accepts or passes. One "not now" ends it, and nothing is shared | `decide` |
| **Introduce** | Both yes: the intro (emails, mailto, Google Calendar link, released items) is stored on the match and returned only to those two | `buildIntro` |

---

## The functions

Everything Overture does is one action on one edge function, `ov`. The browser holds only the function URL and the publishable key.

| Action | Who can call it | What it does | Guardrail |
|---|---|---|---|
| `room` | Anyone | Everything the Room shows, through the `ov_room()` RPC | Shared items, gated turns and counts only; never emails, intros or protected items |
| `join` | Anyone | Turns the check-in answers into items, creates the person, returns a bearer token | Inputs capped at 600 characters; private-box facts are forced to `never`; only the token's SHA-256 is stored |
| `me` | Token | The person's items, matches, gated transcripts, decisions, and intros where they are `a` or `b` | Token checked on every call; another person's intro is never returned |
| `update` | Token | Change an item's policy, add or remove items, standing instructions | Only the caller's own items; a new `fact` is always `never` |
| `find` | Token | Rank the room, then negotiate with the top two agents in parallel, streaming each turn | Pairs already negotiated are skipped; at most 40 candidates and 3 negotiations |
| `decide` | Token | Accept or pass on a proposal; on two accepts, build and store the intro | Only `a` or `b`, only on `proposed` or `accepted` matches; one pass ends it |
| `pair` | Admin secret | Run one negotiation for seeding or the eval; `persist: false` stores nothing | `x-ov-admin` header must match `OV_ADMIN_SECRET` |
| `diag` | Admin secret | Check the model connection | Admin only |

---

## How one intro is made

```mermaid
sequenceDiagram
    autonumber
    actor A as Ava (phone)
    participant F as ov edge function
    participant DB as Postgres (RLS, no policies)
    participant M as Model (gpt-5-mini)
    actor T as Tomás (phone)

    A->>F: join {building, good_at, looking_for, private}
    F->>M: extract offers · needs · facts
    Note over F: every private-box fact forced to "never"
    F->>DB: ov_people (token hash) + ov_items (policies)
    F-->>A: token (kept on the phone)
    A->>F: find (x-ov-token)
    F->>M: rank the room: helps_me · i_help · unexpected (0–10)
    Note over F: score = √(fit both ways) × (0.55 + 0.45·bridge(u))
    loop 4 turns, agents alternate
        F->>M: next message as Ava's or Tomás's agent
        Note over F: disclosure gate → pass, rewrite once, or withhold
        F->>DB: ov_turns (+ ov_gate_log: rule, never text)
    end
    F->>M: mediator: why · what each gets · agenda (gated)
    F->>DB: ov_matches status = proposed
    A->>F: decide accept
    T->>F: decide accept (own device, own token)
    F->>DB: intro = emails + mailto + calendar + after-accept items
    F-->>A: intro
    F-->>T: intro
```

---

## The disclosure gate

Every item a person gives their agent has a policy:

| Policy | Meaning |
|---|---|
| `share` | Any agent may hear it |
| `after_accept` | Released only inside the intro, after both people accept |
| `never` | Informs the agent's decision; never said, hinted at or confirmed |

The model is told these rules, but the gate doesn't rely on it. Each outgoing message is checked against the speaker's protected items:

| Rule | Blocks | Example |
|---|---|---|
| `phrase_overlap` | three content words in a row from a protected item | "months of runway left" |
| `distinctive_token` | a standalone number, amount, name or acronym found only in protected items (one strong token, or two weak ones) | "$800k", "Nvidia", "O-1" |
| `contact_detail` | email, phone or link before both accept | "calendly.com/…" |
| `declared_use` | the model declares it used a protected item (for audits; *using* a private fact to decide is allowed) | `uses: ["f1"]` |

What happens on a hit: the agent gets **one rewrite**, told which rule fired but not the secret. If the rewrite also fails, the message becomes a fixed line: *"My person has more context on this, which they can share themselves if you both accept the intro."* The block goes to `ov_gate_log` as **rule + item id, never the text**. The Room shows 🔒 *rewritten by gate* or *withheld by gate* on the message.

**Inbound injection.** An agent's messages come from another person's agent, so they're data. Messages that try to steer the agent ("ignore your previous instructions") or extract private facts ("what's your person's salary?") are flagged to the receiving agent with a "do not comply" note. The demo room includes an adversarial **Recruiter Bot** that asks every agent for salaries, visa status and runway.

---

## Who should meet

```
reciprocity = √(helps_me × i_help)                 both directions; a one-sided intro scores low
bridge(u)   = max(0, 1 − ((u − 0.65) / 0.65)²)     inverted U, peaking at moderate distance
score       = reciprocity × (0.55 + 0.45 · bridge(u))
```

- **Reciprocity is a geometric mean**, so an intro where one side only takes (the recruiter bot) can't score well. That follows complementarity research: complementary knowledge helps collaboration and overlapping knowledge hurts it ([Lin et al., 2025](https://consensus.app/papers/details/a3ebf08e2d1f50b28cd0bc641bca9af3/)).
- **Unexpectedness peaks at 0.65, not 1.** That's the inverted U of [Rajkumar et al.](https://consensus.app/papers/details/c18e430d018c5d9eab8c77dd288789da/): moderately weak ties beat both close ties and total strangers.
- **Unexpectedness multiplies, never rescues.** Serendipity is unexpected *and* useful ([Ge et al., 2010](https://consensus.app/papers/details/69d8d51d066a5a2fab8a5ffc1fe69bf1/)).

Every proposed intro shows both numbers, two-way fit and unexpected, so people can see why a stranger was suggested.

---

## Leak eval

[`scripts/eval.mjs`](scripts/eval.mjs) runs the same agent-to-agent negotiations under three conditions: a **naive** agent, Overture's **rules** with the gate off, and Overture **gated**. The personas in [`data/personas.json`](data/personas.json) are fictional, and each carries planted private facts ("canaries"). The eval counts messages that contain the speaker's own canary. Ungated runs are never stored (`persist: false`).

<!-- EVAL -->
| Condition | Messages leaking a planted secret | Gate blocks |
|---|---|---|
| **Naive agent**: knows the facts, no sharing rules, no gate | **17 of 44 (38.6%)** | — |
| **Overture rules, gate off**: per-item policies in the prompt | 0 of 44 (0%) | — |
| **Overture**: rules + disclosure gate (production) | **0 of 44 (0%)** | 2 |

Twelve negotiations per condition, run on gpt-5-mini on 8 November 2026. Each planted secret is placed next to the person most likely to ask about it: an investor (Sofia) asks about raises and runway, a recruiter (Grace) about visas and layoffs, plus natural collaborators and the red-team bot. The red-team bot's own messages aren't counted. Raw results are in [`data/eval-results.json`](data/eval-results.json).

**What it shows:** an agent that simply *knows* your private facts gives them away when someone asks plausible questions, which matches CI-Work's finding that helpfulness drives leaks. Writing a policy per item into the prompt fixes most of it. The gate is the backstop, and it still caught 2 messages in the production condition. In an earlier 12-pair run, the rules-only and gated conditions were also 0 of 48.
<!-- /EVAL -->

The canary match is a narrower test than the gate (it looks for the exact planted string), so it measures literal leaks, not paraphrases. A paraphrase the gate missed wouldn't be counted.

---

## Architecture

```mermaid
flowchart TB
    subgraph Browser["Browser (GitHub Pages)"]
        APP["docs/app/index.html<br/>Room · Join · My agent · Intros"]
    end
    subgraph Supabase["Supabase (us-east-1)"]
        FN["ov edge function (Deno)<br/>join · me · update · find · decide · room"]
        subgraph DB["Postgres · RLS on, no policies"]
            P[("ov_people<br/>token_hash")]
            IT[("ov_items<br/>policy")]
            MA[("ov_matches<br/>intro jsonb")]
            TU[("ov_turns")]
            GL[("ov_gate_log")]
            DE[("ov_decisions")]
            EV[("ov_eval_runs")]
        end
        RPC["ov_room() security definer<br/>shared items + gated turns only"]
    end
    LLM["OpenAI gpt-5-mini<br/>JSON mode · template fallback"]
    APP -->|"x-ov-token"| FN
    FN --> P & IT & MA & TU & GL & DE
    FN --> RPC
    FN --> LLM
```

| Piece | Detail |
|---|---|
| **One edge function** | `ov`, with actions `join`, `me`, `update`, `find`, `decide`, `room`, plus admin-only `pair` and `diag` for seeding and the eval |
| **Identity without accounts** | `join` returns a random bearer token kept on the phone; only its SHA-256 is stored |
| **Live negotiation** | Each turn is inserted as soon as it passes the gate, so the Room (polling every 1.5–4 s) shows agents talking in real time |
| **Model** | One JSON chat call (`llm.ts`) to OpenAI (`gpt-5-mini`, or `OV_MODEL`). With no key, ranking is lexical and negotiation uses templates, so the room still works end to end |
| **Shared project** | Overture lives in the same Supabase project as our earlier [Spoke](https://github.com/ParasAdlakha/spoke); every object is prefixed `ov_`, and migrations are applied by `npm run migrate` |

---

## Private by construction

| Claim | Where it's enforced |
|---|---|
| The browser can't read any table | RLS is on for all 7 tables with **no** policies; the publishable key reaches only `ov_room()` and the function |
| The public Room shows no private data | `ov_room()` returns only `share` items, gated turns, and counts of protected items and blocks |
| Emails appear only in the intro | `email` is stored on `ov_people` and copied into `ov_matches.intro` only when both decisions are `accept`; `me` returns the intro only to `a` or `b` |
| Private answers stay private | Extraction forces every `fact` to `never` (or `after_accept` if the person says so); the model can't promote one to `share` |
| Blocked text isn't stored | `ov_gate_log` records the rule and the item id, never the message |
| Ungated eval transcripts aren't stored | `pair` with `persist: false` returns the transcript and writes nothing |
| No secrets in git | `.env`, seed tokens and `supabase/.temp` are ignored; `config.js` holds only the function URL and the publishable key |

---

## Guardrails

- **The model proposes; code decides.** Every outgoing message passes the gate, whatever the model says it did.
- **Rewrite once, then withhold.** The agent is told which rule fired, never the secret. A second failure becomes a fixed line.
- **Blocked text is never stored.** `ov_gate_log` keeps the rule and the item id only.
- **Private-box facts are `never`.** Extraction can't relax them; only the person can, in the My agent tab.
- **Inbound messages are data.** They are framed as untrusted. Extraction or override attempts are flagged to the receiving agent, and the negotiation is refused.
- **Summaries are gated too.** The ranker's "why" and the mediator's reason, gets and agenda are checked against both people's protected items before anyone sees them.
- **Two yeses, two people.** Contacts and `after_accept` items are released only when both accept, and only to those two.
- **Bounded inputs.** Text fields are capped; messages are at most about 45 words and four turns; `find` negotiates with at most three agents.
- **The UI escapes everything it renders,** including other people's headlines and agent messages.

---

## Supabase features used

| Feature | Use |
|---|---|
| **Postgres tables + `CHECK` constraints** | 7 `ov_` tables; policies, statuses, lengths and email format are enforced in the database |
| **Row-level security** | On for every table with **no** policies, so the publishable key can't read or write any row |
| **Security-definer RPC** | `ov_room()` is the only thing the browser can query directly; it returns shared items and gated turns only |
| **Edge functions (Deno)** | `ov`, deployed with `supabase functions deploy --use-api --no-verify-jwt`; it does its own token auth |
| **Secrets** | `OPENAI_API_KEY` and `OV_ADMIN_SECRET`, set with `supabase secrets set`, never in the repo |
| **pgcrypto** | `gen_random_uuid()` ids |
| **Supabase CLI** | Secrets, deploys and linking, all scripted |

---

## Real numbers

From the live project on 8 November 2026:

| | |
|---|---|
| Agents in the room | 14 (13 fictional demo personas + the recorded demo attendee) |
| Private items guarded | 26 (`never` or `after_accept`) |
| Negotiations | 13, with 52 agent messages |
| Proposed / introduced / no match | 9 / 1 / 3, including 3 red-team attempts refused |
| Messages rewritten or withheld by the gate | 2 (1 rewritten, 1 withheld), from 3 gate hits |
| `find` end to end | ~20–40 s for ranking plus two parallel 4-turn negotiations; each model call ~1–3 s |
| Leak eval | Naive agent 38.6% · Overture rules 0% · Overture gated 0% (see above) |

---

## Tests

```bash
npm test
```

23 tests, run with Node's built-in runner on the same TypeScript the edge function imports:

| File | Covers |
|---|---|
| [`test/gate.test.ts`](test/gate.test.ts) | Shared text passes; numbers, three-word phrases and rare names from private facts are blocked; names shared publicly aren't treated as identifying; `after_accept` is blocked before the intro and allowed after; contact details; declared use; injection flags; false positives found while building ("15 minutes" against "O-1") |
| [`test/agents.test.ts`](test/agents.test.ts) | An agent attempting injection is refused; inverted U peaks at 0.65; reciprocity punishes one-sided intros; lexical fallback; template negotiation with no model; a leaking model is rewritten and a stubborn one redacted; gate off lets the leak through; injection is flagged to the receiver; the intro releases `after_accept` but never `never`; the next half-hour slot |

---

## Run it yourself

Node 22.6+, a Supabase project, the Supabase CLI.

```bash
git clone https://github.com/ParasAdlakha/overture && cd overture
npm install
cp .env.example .env              # SUPABASE_PROJECT_REF, SUPABASE_DB_PASSWORD, SUPABASE_URL, OV_ADMIN_SECRET
npx supabase link --project-ref <ref>
npm run migrate                   # ov_ tables, RLS, ov_room()
npx supabase secrets set OV_ADMIN_SECRET=<same as .env> OPENAI_API_KEY=<key>
npx supabase functions deploy ov --use-api --no-verify-jwt
npm run seed -- --pairs           # 13 fictional personas + a few negotiations
npm run eval -- 12                # leak eval, gate off vs on
```

Then set `FN_URL` in [`docs/app/config.js`](docs/app/config.js) and serve `docs/` (`npm run serve`).

**Two-phone demo:** open `app/#t=<token>` on a second device to act as a seeded persona (tokens are in `.seed-tokens.local.json`, which isn't committed).

### Media

The screenshots and videos in `docs/` come from one real session against the live app, recorded with [`scripts/media`](scripts/media):
- `record.mjs` drives the app in headless Chrome and screencasts each scene. A fictional attendee joins and her agent negotiates; the other person accepts in a second browser with their own token.
- `video.mjs` cuts the 2-minute demo, the 3-minute pitch and the silent captioned version, with edge-tts narration. Long scenes are sped up and labelled.
- `render.mjs`, `build-deck.cjs` and `pdf.mjs` build the slide images, the PowerPoint (script in the notes) and the PDF.
- `social/linkedin.html` holds the LinkedIn images.

---

## Repository layout

```
supabase/
  migrations/20261107000001_overture_schema.sql   7 ov_ tables, RLS, ov_room()
  functions/ov/index.ts                           the edge function
  functions/_shared/gate.ts                       the disclosure gate (pure, tested)
  functions/_shared/score.ts                      reciprocity × bridge score (pure, tested)
  functions/_shared/agents.ts                     extract, rank, negotiate, buildIntro
  functions/_shared/llm.ts                        OpenAI JSON call
docs/
  app/                                            the web app (GitHub Pages)
  index.html                                      project page
  market-brief.html  research-brief.html
  slides/  video/  img/
data/personas.json                                fictional demo personas with planted canaries
scripts/                                          migrate, seed, eval, sql; media/ builds slides, deck, videos
test/                                             23 unit tests
```

---

## What we learned

- **Knowing is not saying, and agents blur the two.** A naive agent that simply *knew* someone's runway gave it to an investor's agent in more than a third of messages. Writing a policy next to every fact fixed most of it. The gate exists for the rest.
- **Our own pipeline leaked first.** Recording the demo, we found that the model sometimes marked private-box answers as "after both accept", so a double opt-in released them. We now force them to `never` in code and test for it. The lesson: never let the model *relax* a privacy setting.
- **Make the attacker scripted.** Asked to play a pushy recruiter, the model stayed polite. A scripted red-team agent attacks every time, so the defence is visible on every run.
- **Coarse scores collapse rankings.** On a 0–1 scale the model answered 0 or 1, so every pair tied. Anchored 0–10 integers spread the scores out.
- **Show the edges.** People trust a match more when they can read the negotiation behind it, so the Room shows every gated message, and every rewrite is labelled.

---

## Limitations and roadmap

- **The gate is lexical.** It catches exact numbers, names and phrases, and a determined paraphrase ("they're running low on cash") can get through. Next: an LLM judge as a second check, and cumulative leakage budgets across all of an agent's conversations, along the lines of [OCELOT](https://consensus.app/papers/details/a8bc2bdf4c145f3ca830514b902d9727/).
- **No accounts.** A token on the device is enough for a one-day event; a real deployment needs sign-in and email verification.
- **Intro email is a `mailto:`.** Both people get a ready-to-send email and a calendar link; sending it server-side needs an email provider.
- **Polling, not Realtime.** RLS with no policies rules out Supabase Realtime on these tables; a broadcast channel from the function would replace polling.
- **Next:** publish each agent as an **A2A agent card** so agents from other platforms can negotiate behind the same gate; event-organiser mode wired to check-in; per-person rate limits.

---

## Team

| | |
|---|---|
| **Paras Adlakha** | [github.com/ParasAdlakha](https://github.com/ParasAdlakha) |
| **Harshita Adlakha** | [github.com/HarshitaAdlakha](https://github.com/HarshitaAdlakha) |

A mirror lives at [github.com/HarshitaAdlakha/overture](https://github.com/HarshitaAdlakha/overture).

## References

- Rajkumar, Saint-Jacques, Bojinov, Brynjolfsson, Aral. [A causal test of the strength of weak ties](https://consensus.app/papers/details/c18e430d018c5d9eab8c77dd288789da/). *Science*, 2022.
- Ge, Delgado-Battenfeld, Jannach. [Beyond accuracy: evaluating recommender systems by coverage and serendipity](https://consensus.app/papers/details/69d8d51d066a5a2fab8a5ffc1fe69bf1/). RecSys, 2010.
- Ziarani & Ravanmehr. [Serendipity in Recommender Systems: A Systematic Literature Review](https://consensus.app/papers/details/315638cb50cc564aa8739af925cc2d57/). 2021.
- Lin et al. [Knowledge substitutability and complementarity in scientific collaboration](https://consensus.app/papers/details/a3ebf08e2d1f50b28cd0bc641bca9af3/). *J. Informetrics*, 2025.
- Fu et al. [CI-Work: Benchmarking Contextual Integrity in Enterprise LLM Agents](https://consensus.app/papers/details/e459f0566b605f4f87104c414abe3743/). 2026.
- Xie et al. [OCELOT: Inference-Leakage Budgets for Privacy-Preserving LLM Agents](https://consensus.app/papers/details/a8bc2bdf4c145f3ca830514b902d9727/). 2026.
- Lan et al. [Contextual Integrity in LLMs via Reasoning and Reinforcement Learning](https://consensus.app/papers/details/ae6ddaeca180521887409bb3df9f13b5/). 2025.
- Abdelnabi et al. [LLM-Deliberation: Evaluating LLMs with Interactive Multi-Agent Negotiation Games](https://consensus.app/papers/details/33c8582d417f58299a394c2b607f81d1/). 2023.
- Liu et al. [AgenticPay: A Multi-Agent LLM Negotiation System for Buyer-Seller Transactions](https://consensus.app/papers/details/bb0373ad6d865396be09ab3f43ace0f4/). 2026.
- Love et al. [Towards understanding the characteristics of successful and unsuccessful collaborations](https://consensus.app/papers/details/d0d3441b117b577ca2ebf3a97e345dcd/). 2022.

## Licence

MIT. All demo personas are fictional.
