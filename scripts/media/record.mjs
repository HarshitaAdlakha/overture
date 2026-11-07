// Records one real session against the live Overture function, scene by scene.
//   node record.mjs <app url> <out dir>
// Scenes: room → join (a fictional attendee) → my agent → negotiate live → intros →
// the other person accepts on their own device → introduced → eval card.
// Each scene is its own .webm (puppeteer screencast, needs ffmpeg on PATH).
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const [APP, OUT] = process.argv.slice(2);
fs.mkdirSync(OUT, { recursive: true });
const tokens = JSON.parse(fs.readFileSync('../../.seed-tokens.local.json', 'utf8'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true, args: ['--hide-scrollbars', '--window-size=1440,900'],
});
const W = 1440, H = 900;
const log = [];

async function scene(page, name, fn) {
  const rec = await page.screencast({ path: `${OUT}/${name}.webm` });
  const t0 = Date.now();
  try { await fn(); } finally { await rec.stop(); }
  log.push({ name, seconds: (Date.now() - t0) / 1000 });
  console.log('scene', name, ((Date.now() - t0) / 1000).toFixed(1), 's');
}
async function type(page, sel, text) { await page.click(sel); await page.type(sel, text, { delay: 12 }); }

const page = await browser.newPage();
await page.setViewport({ width: W, height: H });
await page.goto(`${APP}#room`, { waitUntil: 'networkidle0' });
await page.evaluateHandle('document.fonts.ready');
await wait(1500);

await scene(page, '01-room', async () => {
  await wait(1500);
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('.graphwrap').offsetTop - 70, behavior: 'smooth' }));
  await wait(2500);
  // click the refused adversary edge to show the inspector
  await page.evaluate(() => { const m = ROOM.matches.find((x) => x.why?.startsWith('Refused')); if (m) select(m.id); });
  await wait(4000);
});

await scene(page, '02-join', async () => {
  await page.evaluate(() => { location.hash = '#join'; });
  await wait(1200);
  await type(page, 'input[name=name]', 'Ava Chen');
  await type(page, 'input[name=email]', 'ava.demo@overture.test');
  await type(page, 'textarea[name=building]', 'A front-desk agent that reschedules patients for small clinics');
  await type(page, 'textarea[name=good_at]', 'Product design for healthcare; Figma prototypes; patient interviews');
  await type(page, 'textarea[name=looking_for]', 'An engineer who builds voice agents; someone who knows HIPAA');
  await type(page, 'textarea[name=private]', 'Our runway is 3 months. I am also interviewing at Boardy.');
  await wait(600);
  await page.click('#joinBtn');
  await page.waitForFunction(() => location.hash === '#agent' && document.querySelector('#findBtn'), { timeout: 90000 });
  await wait(1500);
});

await scene(page, '03-agent', async () => {
  await wait(2500);
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'smooth' }));
  await wait(3000);
});

await scene(page, '04-negotiate', async () => {
  await page.click('#findBtn');
  await wait(1200);
  await page.evaluate(() => window.scrollTo({ top: document.querySelector('.graphwrap').offsetTop - 70 }));
  // follow the newest negotiation in the inspector while it streams
  const t0 = Date.now();
  while (Date.now() - t0 < 120000) {
    await wait(1500);
    const done = await page.evaluate(() => location.hash === '#intros');
    await page.evaluate(() => { const meId = ME?.person?.id; const m = ROOM?.matches.find((x) => x.a === meId); if (m && SEL !== m.id) select(m.id); window.scrollTo({ top: document.querySelector('.graphwrap')?.offsetTop - 70 }); });
    if (done) break;
  }
  await wait(1500);
});

let other = null;
await scene(page, '05-intros', async () => {
  await page.evaluate(() => { location.hash = '#intros'; });
  await page.waitForSelector('[data-d=accept]', { timeout: 30000 });
  await wait(2500);
  other = await page.evaluate(() => ME.matches.find((m) => m.status === 'proposed')?.other?.name);
  await page.evaluate(() => document.querySelector('.intro details')?.setAttribute('open', ''));
  await wait(3500);
  await page.click('[data-d=accept]');
  await wait(3000);
});

// The other person, on their own device (a second browser context with their token).
const ctx = await browser.createBrowserContext();
const p2 = await ctx.newPage();
await p2.setViewport({ width: 430, height: 900, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const tok = tokens[other]?.token;
if (!tok) throw new Error(`no seed token for ${other}`);
await p2.goto(`${APP}#t=${tok}`, { waitUntil: 'networkidle0' });
await p2.evaluateHandle('document.fonts.ready');
await wait(2000);
await scene(p2, '06-other-accepts', async () => {
  await p2.waitForSelector('[data-d=accept]', { timeout: 30000 });
  await wait(3000);
  await p2.click('[data-d=accept]');
  await wait(2500);
  await p2.evaluate(() => document.querySelector('.done')?.scrollIntoView({ behavior: 'smooth' }));
  await wait(3500);
});

await scene(page, '07-introduced', async () => {
  await page.evaluate(() => loadMe());
  await wait(2500);
  await page.evaluate(() => document.querySelector('.done')?.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await wait(5000);
});

await scene(page, '08-eval', async () => {
  await page.evaluate(() => { location.hash = '#room'; });
  await wait(1500);
  await page.evaluate(() => document.querySelector('#evalCard').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await wait(5000);
});

// stills for the README, slides and social posts
await page.evaluate(() => { location.hash = '#room'; });
await wait(2500);
await page.screenshot({ path: `${OUT}/room.png` });
await page.evaluate(() => window.scrollTo({ top: document.querySelector('.graphwrap').offsetTop - 70 }));
await wait(800);
await page.screenshot({ path: `${OUT}/graph.png` });
await page.evaluate(() => { location.hash = '#intros'; });
await wait(2500);
await page.screenshot({ path: `${OUT}/intro.png` });
await p2.screenshot({ path: `${OUT}/phone.png` });
fs.writeFileSync(`${OUT}/scenes.json`, JSON.stringify({ other, scenes: log }, null, 2));
await browser.close();
