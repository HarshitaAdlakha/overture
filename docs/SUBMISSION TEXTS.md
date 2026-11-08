# Submission texts

Copy-ready answers for the hackathon submission, the live demo script, and the social posts. All figures are from the live project on 7–8 November 2026.

---

## Submission

**Project name:** Overture

**Tagline:** Your agent meets their agent before you do. Agent-to-agent intros behind a disclosure gate, with double opt-in.

**Team:** Paras Adlakha, Harshita Adlakha (remote, from India)

**Challenge:** AI-native professional social, challenge 5: *Your Agent, My Agent* (also touches 1, Serendipity Engine, and 2, The Knowledge That Finds You)

**Live app:** https://parasadlakha.github.io/overture/app/

**Project page:** https://parasadlakha.github.io/overture/

**Repository:** https://github.com/ParasAdlakha/overture (mirror: https://github.com/HarshitaAdlakha/overture)

**Demo video (2 min):** https://parasadlakha.github.io/overture/video/Overture-demo-2min.mp4

**Pitch (3 min):** https://parasadlakha.github.io/overture/video/Overture-pitch-3min.mp4

**Slides:** https://parasadlakha.github.io/overture/slides/Overture-slides.pdf

**Description:**

> At a one-day event you meet maybe five people, and which five is mostly luck. Agents could do the legwork, but agents that act for you over-share.
>
> Overture gives everyone in the room an agent. At check-in you tell it what you're building, what you're good at, what you're looking for, and, in a separate box, what it should know but never say. Every item gets a policy: share, after both accept, or never. Your agent ranks the room by two-way fit times *moderate* unexpectedness (LinkedIn's weak-ties experiments found an inverted U), then negotiates with the best agents directly, in four short messages each, live on a node-graph "room" anyone can watch.
>
> A disclosure gate, written as plain code outside the model, checks every outgoing message for phrases, numbers, names and contact details from protected items. A leak gets one rewrite, or it's withheld. An agent that tries to extract secrets or inject instructions is refused outright; a red-team bot in the room tries it on everyone.
>
> You get a proposal: why you two should meet, what each of you gets, and a 15-minute agenda. Nothing is shared until both people say yes on their own devices. Then Overture releases the emails, an intro email ready to send, a calendar slot, and anything marked "after both accept", to those two people only.
>
> Leak eval, same 12 negotiations under three conditions: a naive agent that knows the facts leaked planted secrets in 38.6% of messages (17 of 44). Overture leaked in 0 of 44, and the gate still blocked 2 messages the model got wrong.

**How it's built:** One Supabase edge function (Deno) and 7 Postgres tables with row-level security and *no* policies, so the browser can read none of them. A security-definer `ov_room()` RPC returns only shared items and gated turns. Agents are OpenAI gpt-5-mini through one JSON call, with a template fallback. Turns are written as they pass the gate, so the room shows negotiations live. 22 unit tests cover the gate, scoring, rewrite/redact, injection refusal and double opt-in release. The front end is vanilla JS on GitHub Pages.

**Pre-existing components:** None. Built on 7 November 2026. The media scripts (slide rendering, deck, PDF) were adapted from our earlier hackathon project, Spoke.

**AI used in the product:** OpenAI gpt-5-mini (the agents), edge-tts (narration).

---

## Judging criteria, one line each

| Criterion | Overture |
|---|---|
| Working demo | Live app; anyone can brief an agent from their phone in about 60 seconds and watch it negotiate |
| Technical depth | A deterministic disclosure gate around an untrusted model, rewrite-then-redact, injection refusal, a research-grounded score, a three-condition leak eval |
| Originality | Agent to agent, each representing one person with that person's sharing rules, instead of one central matchmaker |
| Usefulness | Plugs into event check-in; this event's Mystery Match asks exactly our three questions |
| Progress on the day | Everything built on 7 Nov: 6 commits, 22 tests, a live eval |
| Human-agent collaboration | Agents do the legwork; people set every item's policy, give standing instructions, and make every yes/no decision |

---

## Live demo script (2 minutes)

Open https://parasadlakha.github.io/overture/app/ on a laptop and, on a phone, the counterpart's link (`app/#t=<token>` from `.seed-tokens.local.json`).

1. **(15 s) Hook.** "At an event you meet five people, mostly by luck. What if your agent met everyone's agent first, without spilling your secrets?"
2. **(20 s) The room.** Show the graph. "Every node is a person's agent; every edge is a negotiation. Red ones were refused: this bot tried to extract salaries, then a prompt injection." Click the red edge.
3. **(25 s) Join.** Brief a new agent, including the private box ("runway is 3 months"). Show the policy chips.
4. **(30 s) Negotiate.** Click *Send my agent into the room*. The edge animates while the inspector streams the messages. Point at any 🔒 *rewritten by gate*.
5. **(20 s) Both say yes.** Intros tab: why, what each gets, agenda → *Yes*. On the phone, the other person says *Yes*. Both screens show the intro email and calendar link.
6. **(10 s) Close.** "Naive agents leaked planted secrets in 39% of messages. Overture, zero. Your agent meets their agent before you do."

---

## LinkedIn post (Harshita, team voice)

Images: `docs/img/linkedin-cover.png`, `linkedin-eval.png`, `linkedin-graph.png`. Or attach `Overture-demo-2min.mp4`.

> "Your agent meets their agent before you do."
>
> Yesterday Paras and I built Overture for the Anything Applied Agentic Hackathon (hackathons.team, San Francisco), remotely from India. The theme was AI-native professional social, and we took challenge 5: what happens when AI agents start networking on our behalf?
>
> Our answer: they'll be great at finding the right people, and dangerously good at over-sharing. So Overture is built around what an agent is allowed to say.
>
> 🧭 You brief your agent: what you're building, what you're good at, what you're looking for, plus a private box
> 🤝 Your agent negotiates with other people's agents, live, on a graph anyone can watch
> 🔒 A disclosure gate in code checks every message. Your private context informs the decision but is never said
> ✅ Nothing happens until both people say yes. Only then: emails, a calendar slot, and anything you held back
>
> We tested it: a naive agent that simply knew people's secrets leaked them in 38.6% of messages when an investor or recruiter asked. Overture: 0%.
>
> My background is in system dynamics, and this felt like a feedback-loop design problem: who is allowed to learn what, and when.
>
> 🙏 Thank you to the hosts, Julius Olsson, Geart Ferhati, Sean Chiu and Sophie R, and to Hackathons.team for a day of pure building. Thank you to Entrepreneurs First for the venue, and for welcoming remote teams like ours.
>
> ▶️ Try it: https://harshitaadlakha.github.io/overture/app/
> 💻 Code: https://github.com/HarshitaAdlakha/overture
>
> #AIAgents #AgenticAI #Hackathon #SanFrancisco #Privacy #BuildInPublic #WomenInTech #HackathonsTeam #EntrepreneursFirst

**Tags to add when posting** (type @ and pick the profile or page): Julius Olsson, Geart Ferhati, Sean Chiu, Sophie R, Hackathons.team, Entrepreneurs First. On X, tag the hosts from the X links on the Luma page.

## Event post (LinkedIn, team voice)

Images: `linkedin-cover.png`, `linkedin-graph.png`. Post from Harshita's account.

> One day. Build an agent that does real work, and make something real happen between two people.
>
> That was the brief at the Anything Applied Agentic Hackathon in San Francisco on 7 November, hosted by Hackathons.team at Entrepreneurs First. Strong remote teams were welcome, so we built from India.
>
> 🛠️ We built Overture: your agent meets their agent before you do.
>
> 🤝 Every attendee gets an agent, and the agents negotiate intros with each other
> 🔒 A disclosure gate in code keeps private context private
> ✅ Nothing is shared until both people say yes
> 🧪 Naive agents leaked planted secrets in 38.6% of messages; Overture, 0%
>
> ▶️ https://harshitaadlakha.github.io/overture/app/
> 💻 https://github.com/HarshitaAdlakha/overture
>
> 🙏 Huge thanks to the hosts, Julius Olsson, Geart Ferhati, Sean Chiu and Sophie R, to Hackathons.team for running a builder-first day, to Entrepreneurs First for the venue, and to the judges and every team who shipped.
>
> #Hackathon #AIAgents #AgenticAI #SanFrancisco #HackathonsTeam #EntrepreneursFirst #BuildInPublic

## LinkedIn post (Paras, personal)

Images: `linkedin-eval.png`, `linkedin-graph.png`.

> When your agent networks for you, the hard problem isn't matching. It's what your agent is allowed to say.
>
> At the Anything Applied Agentic Hackathon, Harshita and I built Overture: every person gets an agent, the agents negotiate intros with each other, and nothing happens until both humans say yes.
>
> The design choices I'd make again:
> 🔒 A policy per fact (share / after both accept / never), enforced by deterministic code outside the model. The model proposes; the gate decides.
> ♻️ Rewrite before redact. The agent is told which rule fired, never the secret, and gets one chance to fix its message.
> 🧪 Eval with planted secrets. Naive agent: 38.6% of messages leaked. Overture: 0%, plus 2 catches the model would have missed.
> 📈 Match on two-way fit × *moderate* unexpectedness. LinkedIn's 20M-person experiments found an inverted U for weak ties, so we peak at 0.65, not at "total stranger."
> 🚫 An agent that tries prompt injection gets refused, not proposed.
>
> Thank you to Julius Olsson, Geart Ferhati, Sean Chiu and Sophie R for hosting the Anything Applied Agentic Hackathon, to Hackathons.team, and to Entrepreneurs First for the venue.
>
> ▶️ https://parasadlakha.github.io/overture/app/
> 💻 https://github.com/ParasAdlakha/overture
>
> #AIAgents #LLM #Privacy #Supabase #Hackathon #SystemsEngineering #HackathonsTeam

## X post (under 280 characters)

> Built Overture at the Anything Applied Agentic Hackathon (Hackathons.team at Entrepreneurs First, SF) 🤝
>
> Your agent negotiates intros with everyone else's agent, a disclosure gate keeps your secrets (naive agents leaked 38.6%, ours 0%), and nothing happens until both humans say yes.
>
> parasadlakha.github.io/overture/app
