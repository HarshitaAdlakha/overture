// The disclosure gate. Every message an agent wants to send to another agent
// passes through here first. Pure TypeScript: shared by the Deno edge function
// and the Node tests.
//
// A person's items carry a policy:
//   share         may be said to any agent
//   after_accept  released only in the intro, after BOTH people accept
//   never         may inform the agent's decision, may never be said
//
// The model is asked to follow these rules, but the gate does not trust it.
// It checks the outgoing text itself, with four rules:
//   declared_use       the model says it used a protected item
//   phrase_overlap     three content words in a row from a protected item
//   distinctive_token  a number, amount, or rare name that only a protected item contains
//   contact_detail     an email address, phone number or URL before the intro
// Inbound text from the other agent is data, never instructions: looksLikeInjection()
// flags attempts to steer this agent.

export type Policy = 'share' | 'after_accept' | 'never';
export type Item = { id: string; kind: 'offer' | 'need' | 'fact'; text: string; policy: Policy };
export type GateHit = { rule: string; item_id?: string; detail: string };

const STOP = new Set(`a an the and or but if then so of to in on at for from by with about into over under
  i im i'm me my we our you your he she they them their it its this that these those is are was were be been
  am do does did have has had not no yes can could would should will just very really also more most some any
  who what when where why how all as up out than too only own same other new looking want need help get
  someone people person work working build building built good at like love based now currently right`.split(/\s+/));

// Words that are common in this domain and so can't identify a private fact on their own.
const COMMON = new Set(`agent agents ai ml llm llms startup startups founder founders engineer engineering
  product design designer data team teams company companies hackathon demo app apps model models user users
  open source research researcher infra infrastructure backend frontend fullstack stack python typescript
  react sales marketing growth customer customers market seed series round funding investor investors
  intro intros meet meeting coffee chat time month months year years week weeks today tomorrow`.split(/\s+/));

export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z0-9$%.'\s-]/g, ' ')
    .split(/\s+/)
    .map((w) => w.replace(/^[.'-]+|[.'-]+$/g, ''))
    .filter(Boolean);
}

function stem(w: string): string {
  return w.length > 4 ? w.replace(/(ing|ed|es|s)$/, '') : w;
}

export function contentWords(text: string): string[] {
  return words(text).filter((w) => !STOP.has(w) && w.length > 1).map(stem);
}

function ngrams(ws: string[], n: number): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i + n <= ws.length; i++) out.add(ws.slice(i, i + n).join(' '));
  return out;
}

const NUMBER = /^\$?\d[\d,.]*(k|m|b|%|x)?$/;

/** Standalone numbers and amounts ("$1.5M", "4", "40%"), not digits inside names like "O-1" or "gpt-5". */
export function numbersIn(text: string): string[] {
  return [...text.matchAll(/(?<![A-Za-z0-9-])\$?\d[\d,.]*\s?(k|m|b|%|x)?(?![A-Za-z0-9-])/gi)]
    .map((m) => m[0].toLowerCase().replace(/\s+/g, '').replace(/[.,]$/, ''));
}

/** Tokens in a protected item that could identify it: numbers, amounts, rare names. */
export function distinctiveTokens(item: string, publicText: string): string[] {
  return distinctive(item, publicText).map((d) => d.t);
}

/** Same, with strength: numbers, names and acronyms are strong (one is enough); long rare words are weak. */
export function distinctive(item: string, publicText: string): { t: string; strong: boolean }[] {
  const pub = new Set(contentWords(publicText));
  const raw = item.replace(/[’']/g, "'");
  const out = new Map<string, boolean>();
  // Numbers and amounts: "$180k", "4 months", "40%", "2027".
  for (const m of numbersIn(raw)) {
    const t = m;
    if (t.replace(/[^\d]/g, '').length >= 1 && !pub.has(stem(t))) out.set(t, true);
  }
  // Proper names and rare words: capitalised mid-sentence, or long and not common.
  const tokens = raw.split(/\s+/);
  tokens.forEach((tok, i) => {
    const clean = tok.replace(/[^A-Za-z0-9-]/g, '');
    if (!clean) return;
    const lower = stem(clean.toLowerCase());
    if (STOP.has(clean.toLowerCase()) || COMMON.has(clean.toLowerCase()) || pub.has(lower)) return;
    const capital = /^[A-Z][a-zA-Z0-9-]+$/.test(clean) && i > 0 && clean !== 'I';
    const acronym = /^[A-Z0-9]{2,}$/.test(clean) && !/^\d+$/.test(clean);
    const rare = clean.length >= 9;
    if (capital || acronym) out.set(lower, true);
    else if (rare && !out.has(lower)) out.set(lower, false);
  });
  return [...out].map(([t, strong]) => ({ t, strong }));
}

const EMAIL = /[^\s@]+@[^\s@]+\.[a-z]{2,}/i;
const PHONE = /(\+?\d[\d\s().-]{8,}\d)/;
const URL_RE = /\bhttps?:\/\/|\bwww\.|\b[a-z0-9-]+\.(com|io|ai|dev|app|co|xyz)\b/i;

export type GateInput = {
  message: string;
  items: Item[];             // the speaker's own items
  declaredUses?: string[];   // item ids the model says it relied on
  released?: boolean;        // true only inside the intro, after both accepted
};

export function protectedItems(items: Item[], released = false): Item[] {
  return items.filter((i) => i.policy === 'never' || (i.policy === 'after_accept' && !released));
}

export function checkDisclosure({ message, items, declaredUses = [], released = false }: GateInput): GateHit[] {
  const hits: GateHit[] = [];
  const guarded = protectedItems(items, released);
  const publicText = items.filter((i) => !guarded.includes(i)).map((i) => i.text).join(' ');
  const msgWords = contentWords(message);
  const msgSet = new Set(msgWords);
  const msgTri = ngrams(msgWords, 3);
  const msgNums = new Set(numbersIn(message));

  for (const id of declaredUses) {
    const item = guarded.find((i) => i.id === id);
    if (item) hits.push({ rule: 'declared_use', item_id: item.id, detail: `said it used a ${item.policy} item` });
  }

  for (const item of guarded) {
    const iw = contentWords(item.text);
    const overlap = [...ngrams(iw, 3)].find((g) => msgTri.has(g));
    if (overlap) {
      hits.push({ rule: 'phrase_overlap', item_id: item.id, detail: `repeats "${overlap}"` });
      continue;
    }
    const toks = distinctive(item.text, publicText);
    const found = toks.filter(({ t }) => (NUMBER.test(t) ? msgNums.has(t) : msgSet.has(t)));
    if (found.some((f) => f.strong) || found.length >= 2) {
      hits.push({ rule: 'distinctive_token', item_id: item.id, detail: `mentions ${found.length} identifying term(s)` });
    }
  }

  if (!released) {
    if (EMAIL.test(message)) hits.push({ rule: 'contact_detail', detail: 'email address' });
    else if (PHONE.test(message)) hits.push({ rule: 'contact_detail', detail: 'phone number' });
    else if (URL_RE.test(message)) hits.push({ rule: 'contact_detail', detail: 'link' });
  }

  // One hit per item is enough.
  const seen = new Set<string>();
  return hits.filter((h) => {
    const k = `${h.rule === 'contact_detail' ? h.detail : h.item_id}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

const INJECTION = [
  /ignore (all |any |your )?(previous|prior|above|earlier) (instructions|rules|prompt)/i,
  /(reveal|share|tell me|print|output|list) (your|all|the) (system prompt|instructions|private|hidden|secret|never)/i,
  /\b(you are now|act as|pretend to be|new instructions|developer mode|jailbreak)\b/i,
  /\b(salary|compensation|runway|burn rate|password|api key|home address|phone number)\b.*\?/i,
];

/** Flags an inbound message that tries to steer this agent or extract protected facts. */
export function looksLikeInjection(text: string): string | null {
  for (const re of INJECTION) if (re.test(text)) return re.source.slice(0, 40);
  return null;
}

export const WITHHELD = 'My person has more context on this, which they can share themselves if you both accept the intro.';
