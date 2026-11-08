// Builds the Overture deck: each rendered slide PNG full-bleed, with the spoken script in the notes.
//   node build-deck.cjs <slides png dir> <out.pptx>
const pptxgen = require("pptxgenjs");
const path = require("path");
const [dir, out] = process.argv.slice(2);

const NOTES = [
  "Hi, we're Paras and Harshita. This is Overture: your agent meets their agent before you do. Everyone in the room gets an agent, the agents negotiate introductions, a disclosure gate keeps your secrets, and nothing happens until both people say yes.",
  "A one-day event gives you maybe five real conversations, and which five is mostly luck. AI can help, but agents that act for you over-share: on the CI-Work benchmark, frontier agents violate contextual integrity in 16 to 51 percent of tasks, and the more helpful ones leak more. A networking agent is a helpfulness machine.",
  "Four steps. Brief your agent at check-in: what you're building, what you're good at, what you're looking for, and a private box. Your agent ranks the room and negotiates with other agents directly. Every message passes the gate. And you get a reason, what each of you gets and a 15-minute agenda. Only when both of you accept do emails, a calendar slot and anything you held back get released.",
  "Every item has a policy: share, after both accept, or never. The model is told the rules, but the gate doesn't trust it. Deterministic code checks every outgoing message for phrases, numbers, names and contact details from protected items. On a hit, the agent rewrites once; otherwise the message is withheld. Inbound extraction attempts are flagged, and an agent that tries injection is refused outright.",
  "Who should meet? Two-way fit times moderate unexpectedness. Reciprocity is a geometric mean, so one-sided intros score low. Unexpectedness peaks at 0.65, following LinkedIn's randomised experiments on 20 million people, where moderately weak ties created the most job mobility. Surprise multiplies fit; it never replaces it.",
  "Does it work? We planted secrets in fictional personas and ran the same 12 negotiations three ways. A naive agent that simply knows the facts leaked them in 38.6 percent of messages when an investor or recruiter asked. With Overture's per-item rules, zero. With the gate on as well, zero, and it still caught two messages the model got wrong.",
  "Under the hood: one Supabase edge function, seven tables with row-level security and no policies, so the browser can read none of them. A public room function shows only shared items and gated turns. Turns stream live. Twenty-three unit tests.",
  "Next: publish every agent as an A2A agent card, plug into event check-in, and move to cumulative leakage budgets. Every professional will have an agent; the network that wins is the one whose agents can be trusted. Thank you.",
];

const pres = new pptxgen();
pres.layout = "LAYOUT_16x9";
pres.title = "Overture";
pres.author = "Paras Adlakha and Harshita Adlakha";
pres.company = "Paras Adlakha and Harshita Adlakha";
pres.subject = "Anything Applied Agentic Hackathon, San Francisco, 7 November 2026";
NOTES.forEach((note, i) => {
  const slide = pres.addSlide();
  slide.addImage({ path: path.join(dir, `s${i + 1}.png`), x: 0, y: 0, w: 10, h: 5.625, altText: `Overture slide ${i + 1}` });
  slide.addNotes(note);
});
pres.writeFile({ fileName: out }).then((f) => console.log("wrote", f));
