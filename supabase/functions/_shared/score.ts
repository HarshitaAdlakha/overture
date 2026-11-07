// Who should meet whom. Pure TypeScript, shared with the tests.
//
// Two numbers per pair, each 0..1:
//   reciprocity  does each person offer something the other needs? Geometric
//                mean of the two directions, so a one-sided intro scores low.
//   unexpected   how far apart their worlds are (different field, stack, role).
//
// score = reciprocity * (0.55 + 0.45 * bridge(unexpected))
//
// bridge() is an inverted U that peaks at 0.65, not at 1. Rajkumar et al. (Science,
// 2022), randomising LinkedIn's People You May Know for 20M people, found that
// moderately weak ties created the most job mobility, with diminishing returns
// beyond that. Serendipity in recommender research is relevance AND
// unexpectedness (Ge et al. 2010), so unexpectedness only multiplies relevance:
// it never rescues a pair with nothing to offer each other.

import { contentWords, type Item } from './gate.ts';

export function bridge(u: number): number {
  const x = Math.max(0, Math.min(1, u));
  return Math.max(0, 1 - ((x - 0.65) / 0.65) ** 2);
}

export function reciprocity(aToB: number, bToA: number): number {
  return Math.sqrt(Math.max(0.02, clamp(aToB)) * Math.max(0.02, clamp(bToA)));
}

export function combine(recip: number, unexpected: number): number {
  return round(clamp(recip) * (0.55 + 0.45 * bridge(unexpected)));
}

export const clamp = (x: number) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);
const round = (x: number) => Math.round(x * 1000) / 1000;

// --- Lexical fallback, used when no model is configured ----------------------

const SYN: Record<string, string> = {
  fundrais: 'fund', raise: 'fund', investor: 'fund', vc: 'fund', angel: 'fund', capital: 'fund',
  hire: 'hir', hiring: 'hir', recruit: 'hir', cofounder: 'hir', 'co-founder': 'hir', engineer: 'hir',
  eval: 'eval', evaluation: 'eval', benchmark: 'eval', test: 'eval',
  design: 'design', designer: 'design', ux: 'design', ui: 'design', figma: 'design',
  customer: 'gtm', sales: 'gtm', gtm: 'gtm', 'go-to-market': 'gtm', distribution: 'gtm', pilot: 'gtm',
  voice: 'voice', speech: 'voice', audio: 'voice',
  robot: 'robot', robotic: 'robot', hardware: 'robot',
  health: 'health', clinic: 'health', medical: 'health', patient: 'health',
  legal: 'legal', law: 'legal', contract: 'legal', compliance: 'legal',
};
const norm = (w: string) => SYN[w] ?? w;
const bag = (t: string) => new Set(contentWords(t).map(norm));

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let n = 0;
  for (const w of a) if (b.has(w)) n++;
  return n / Math.min(a.size, b.size);
}

export type Card = { id: string; name: string; headline: string; items: Item[] };

const textOf = (c: Card, kind: Item['kind'], allow: (i: Item) => boolean) =>
  c.items.filter((i) => i.kind === kind && allow(i)).map((i) => i.text).join(' ');

/** Fallback scoring from words alone. Uses only what the scorer is allowed to see. */
export function lexicalScore(a: Card, b: Card) {
  const vis = (i: Item) => i.policy !== 'never';
  const aNeeds = bag(textOf(a, 'need', vis)), bNeeds = bag(textOf(b, 'need', vis));
  const aOffers = bag(textOf(a, 'offer', vis) + ' ' + a.headline), bOffers = bag(textOf(b, 'offer', vis) + ' ' + b.headline);
  const aToB = Math.min(1, overlap(aNeeds, bOffers) * 1.6); // b helps a
  const bToA = Math.min(1, overlap(bNeeds, aOffers) * 1.6); // a helps b
  const aAll = new Set([...aOffers, ...bag(a.headline)]), bAll = new Set([...bOffers, ...bag(b.headline)]);
  const unexpected = 1 - Math.min(1, overlap(aAll, bAll) * 1.4);
  const recip = reciprocity(aToB, bToA);
  return { aToB, bToA, reciprocity: round(recip), unexpected: round(unexpected), score: combine(recip, unexpected) };
}
