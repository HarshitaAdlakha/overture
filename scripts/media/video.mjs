// Cuts the Overture videos from the real recorded scenes (record.mjs) and the slides.
//   node video.mjs <2min|3min|captioned> <rec dir> <slides dir> <out.mp4>
// Each step is a recorded scene or a slide. Scenes are sped up (and labelled) when
// they run longer than their narration, and hold their last frame when shorter.
// Narration: edge-tts (en-US-AvaNeural). Captions: ffmpeg drawtext.
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync, readFileSync } from 'node:fs';

const [cut, rec, slides, out] = process.argv.slice(2);
const work = `${rec}/edit-${cut}`;
rmSync(work, { recursive: true, force: true });
mkdirSync(work, { recursive: true });
const voiced = cut !== 'captioned';
// Screencast WebMs carry no duration; the recorder logs each scene's real length.
const SCENE_LEN = Object.fromEntries(JSON.parse(readFileSync(`${rec}/scenes.json`, 'utf8')).scenes.map((x) => [x.name, x.seconds]));
const dur = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString().trim());
const FONT = 'C\\:/Windows/Fonts/segoeuib.ttf';
const FONT_MONO = 'C\\:/Windows/Fonts/consola.ttf';
const dt = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, '\u2019').replace(/:/g, '\\:').replace(/%/g, '\\%').replace(/,/g, '\\,');

const demo = [
  { scene: '01-room', cap: ['01 · THE ROOM', 'Every attendee has an agent. Negotiations are edges.'],
    say: 'This is Overture, live. Every person in the room has an agent. Agents are nodes, and every negotiation between them is an edge. Red edges were refused: this one is a red-team bot that tried to extract salaries and then attempted a prompt injection.' },
  { scene: '02-join', cap: ['02 · BRIEF', 'Three check-in questions, plus a private box'],
    say: 'A new attendee, Ava, briefs her agent. What she is building, what she is good at, what she is looking for. And a private box: her runway is three months, and she is interviewing elsewhere. Her agent should know that, and never say it.' },
  { scene: '03-agent', cap: ['03 · POLICIES', 'Every item: share · after both accept · never'],
    say: 'Her agent turns that into offers, needs and private facts, each with a policy she can change: share, after both accept, or never.' },
  { scene: '04-negotiate', cap: ['04 · NEGOTIATE', 'Her agent talks to the best two-way fits, live'],
    say: 'She sends her agent into the room. It ranks everyone by two-way fit and moderate unexpectedness, and negotiates with the top two agents directly. Every message passes the disclosure gate before it is sent.' },
  { scene: '05-intros', cap: ['05 · PROPOSAL', 'Why, what each gets, a 15-minute agenda. She says yes.'],
    say: 'Back comes a proposal: why these two should meet, what each gets, and a fifteen minute agenda. She can read exactly what the agents said. She says yes. Nothing is shared yet.' },
  { scene: '06-other-accepts', cap: ['06 · THE OTHER SIDE', 'On their own phone, the other person says yes too'],
    say: 'On their own phone, the other person sees the same proposal, and also says yes.' },
  { scene: '07-introduced', cap: ['07 · INTRODUCED', 'Only now: emails, a calendar slot, held-back details'],
    say: 'Only now, with both yeses, Overture releases the emails, an intro email ready to send, and a calendar slot for the next half hour. The never items stay private, forever.' },
  { scene: '08-eval', cap: ['08 · EVAL', 'Naive agent leaks 38.6% · Overture 0%'],
    say: 'And does it work? A naive agent that simply knows the facts leaked planted secrets in thirty nine percent of messages. Overture leaked none, and the gate still caught what the model got wrong.' },
];
const S = (n) => `${slides}/s${n}.png`;
const steps = cut === '3min'
  ? [
      { slide: S(1), say: 'Hi, we are Paras and Harshita. This is Overture. Your agent meets their agent before you do.' },
      { slide: S(2), say: 'At a one day event you meet maybe five people, mostly by luck. Agents could do the legwork, but agents that act for you over-share: frontier agents violate contextual integrity in up to half of enterprise tasks, and the more helpful ones leak more.' },
      ...demo,
      { slide: S(4), say: 'The gate is plain code, outside the model. It checks every message for phrases, numbers, names and contact details from protected items. A leak gets one rewrite, or it is withheld.' },
      { slide: S(5), say: 'Matching follows the research: two way fit times moderate unexpectedness, because LinkedIn\'s experiments on twenty million people showed moderately weak ties matter most.' },
      { slide: S(8), say: 'Every professional will have an agent. The network that wins is the one whose agents can be trusted. Overture. Thank you.', min: 5 },
    ]
  : cut === '2min'
    ? [...demo, { slide: S(1), say: 'Overture. Your agent meets their agent before you do.', min: 4 }]
    : demo.map((d) => ({ ...d, say: undefined, min: Math.max(4.5, d.cap[1].length / 12) })).concat([{ slide: S(1), min: 4 }]);

const parts = [];
steps.forEach((s, i) => {
  const id = String(i).padStart(2, '0');
  let len = s.min ?? 4;
  if (voiced && s.say) {
    s.mp3 = `${work}/line-${id}.mp3`;
    execFileSync('python', ['-m', 'edge_tts', '--voice', 'en-US-AvaNeural', '--rate=+4%', '--text', s.say, '--write-media', s.mp3]);
    len = Math.max(len, dur(s.mp3) + 0.7);
  }
  const clip = `${work}/clip-${id}.mp4`;
  const vf = [];
  let input;
  if (s.scene) {
    const src = `${rec}/${s.scene}.webm`;
    const sd = SCENE_LEN[s.scene];
    const speed = sd > len ? sd / len : 1;
    input = ['-i', src];
    vf.push(`setpts=PTS/${speed.toFixed(4)}`, 'scale=1920:1080:force_original_aspect_ratio=decrease', 'pad=1920:1080:(ow-iw)/2:(oh-ih)/2:color=0x0d0d10', 'fps=30', `tpad=stop_mode=clone:stop_duration=${len}`);
    if (speed > 1.15) vf.push(`drawtext=fontfile='${FONT_MONO}':text='${dt(`sped up ${speed.toFixed(1)}×`)}':x=w-tw-40:y=40:expansion=none:fontsize=26:fontcolor=white@0.7:box=1:boxcolor=black@0.45:boxborderw=10`);
  } else {
    input = ['-loop', '1', '-i', s.slide];
    vf.push('scale=1920:1080', 'fps=30');
  }
  if (s.cap) {
    vf.push(`drawbox=x=0:y=ih-150:w=iw:h=150:color=0x0d0d10@0.82:t=fill`);
    vf.push(`drawtext=fontfile='${FONT_MONO}':text='${dt(s.cap[0])}':expansion=none:x=60:y=h-122:fontsize=26:fontcolor=0xff5a36`);
    vf.push(`drawtext=fontfile='${FONT}':text='${dt(s.cap[1])}':expansion=none:x=60:y=h-84:fontsize=44:fontcolor=white`);
  }
  const audio = s.mp3 ? ['-i', s.mp3] : ['-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo'];
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...input, ...audio, '-filter_complex', `[0:v]${vf.join(',')}[v];[1:a]apad,atrim=0:${len.toFixed(2)},aresample=44100[a]`,
    '-map', '[v]', '-map', '[a]', '-t', len.toFixed(2), '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '22', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-ar', '44100', '-ac', '2', clip]);
  parts.push(clip);
  console.log(cut, id, s.scene ?? 'slide', len.toFixed(1) + 's');
});
writeFileSync(`${work}/list.txt`, parts.map((p) => `file '${p.split('/').pop()}'`).join('\n'));
execFileSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', `${work}/list.txt`, '-c', 'copy', '-movflags', '+faststart', out]);
console.log('wrote', out, dur(out).toFixed(1), 's');
