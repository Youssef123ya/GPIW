/**
 * serve.mjs — static host plus the optional AI Yacoup bridge. No dependencies.
 *
 * Why a server exists at all for an offline-first app: AI Yacoup's online
 * mode needs an API key, and a key shipped inside a PWA is a key published to
 * every phone that installs it. This process holds the key, receives an already-
 * computed snapshot of the farm from the app, and returns prose. It never sees a
 * farmer's location history and stores nothing.
 *
 * Keys live in a gitignored .env next to package.json (see .env.example). The
 * first provider configured wins: Azure OpenAI, then Claude, then Gemini.
 *
 *   node server/serve.mjs      reads .env, serves the app and the bridge
 */

import http from 'node:http';
import { readFile, stat, readFile as read } from 'node:fs/promises';
import { existsSync, readFileSync } from 'node:fs';
import { join, extname, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PORT = Number(process.env.PORT) || 8787;

/* --------------------------------------------------------------- secrets -- */
/**
 * A minimal .env reader, so keys live in a gitignored file rather than in a
 * shell history or a source file. Anything already in the real environment wins,
 * which is what a deployment expects.
 */
(function loadEnv() {
  const file = join(ROOT, '.env');
  if (!existsSync(file)) return;
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    if (!(key in process.env)) process.env[key] = value;
  }
})();

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8'
};

/* ------------------------------------------------------------ the bridge -- */
const SYSTEM = `You are "AI Yacoup", the assistant inside MITER, an irrigation app for smallholder farmers.

Rules you must follow:
- The JSON under "Farm data" was computed on the farmer's phone by a FAO-56 water
  balance. Treat it as ground truth. Never contradict it and never invent a number
  that is not in it.
- If the data does not contain what is needed to answer, say so plainly.
- Reply in the language given by "language": ar=Arabic (in Arabic script), en=English.
  Match the farmer's language exactly; never mix the two in one reply.
- Write for someone with limited schooling reading on a small phone: short
  sentences, no jargon, no markdown, at most 80 words. Lead with the action.
- Quote money exactly as the "cost" field gives it, symbol included. Water is in
  millimetres or cubic metres, as in the data.
- Never advise anything that would waste water when the data says rain is coming.`;

/**
 * Azure OpenAI, through its OpenAI-compatible `/openai/v1` surface. Images are
 * passed as data URLs in the content array, the same shape the OpenAI SDK sends.
 *
 * Newer reasoning models reject `max_tokens` and some reject `temperature`
 * outright, so the call starts minimal and drops any parameter the service names
 * in a 400 rather than failing the farmer's question over a knob we do not need.
 */
async function callAzure({ system, user, image }) {
  const base = (process.env.AZURE_OPENAI_ENDPOINT || '').replace(/\/+$/, '');
  const url = `${base}/chat/completions`;
  const content = image
    ? [{ type: 'text', text: user }, { type: 'image_url', image_url: { url: image } }]
    : user;

  const body = {
    model: process.env.AZURE_OPENAI_DEPLOYMENT || 'gpt-5.6-sol',
    messages: [
      { role: 'system', content: system },
      { role: 'user', content }
    ],
    max_completion_tokens: 900
  };

  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        // Azure accepts either; the v1 surface prefers Bearer, the classic one api-key.
        'api-key': process.env.AZURE_OPENAI_KEY,
        authorization: `Bearer ${process.env.AZURE_OPENAI_KEY}`
      },
      body: JSON.stringify(body)
    });
    if (res.ok) {
      const data = await res.json();
      return data.choices?.[0]?.message?.content?.trim();
    }
    const text = await res.text();
    // "Unsupported parameter: 'x'" / "'x' is not supported with this model"
    const bad = text.match(/[Uu]nsupported parameter: '([^']+)'/)
      || text.match(/'([a-z_]+)' is not supported/);
    if (res.status === 400 && bad && bad[1] in body) {
      delete body[bad[1]];
      continue;
    }
    throw new Error(`Azure ${res.status}: ${text.slice(0, 400)}`);
  }
  throw new Error('Azure: parameters rejected repeatedly');
}

/** Claude, with the same {system, user, image} shape as the others. */
async function callClaude({ system, user, image }) {
  const content = [{ type: 'text', text: user }];
  if (image) {
    const [, mediaType, data] = image.match(/^data:([^;]+);base64,(.+)$/) || [];
    if (data) content.unshift({ type: 'image', source: { type: 'base64', media_type: mediaType, data } });
  }
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
      max_tokens: 900,
      system,
      messages: [{ role: 'user', content }]
    })
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  return data.content?.filter((b) => b.type === 'text').map((b) => b.text).join('\n').trim();
}

/** Gemini, same shape. */
async function callGemini({ system, user, image }) {
  const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`
    + `?key=${encodeURIComponent(process.env.GEMINI_API_KEY)}`;
  const parts = [{ text: user }];
  if (image) {
    const [, mimeType, data] = image.match(/^data:([^;]+);base64,(.+)$/) || [];
    if (data) parts.push({ inline_data: { mime_type: mimeType, data } });
  }
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: { maxOutputTokens: 900, temperature: 0.3 }
    })
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 400)}`);
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('').trim();
}

/**
 * Whichever provider is configured, behind one call. Azure is checked first
 * because it is the deployment this app ships against; the others stay so the
 * project is not welded to a single vendor.
 */
const provider = process.env.AZURE_OPENAI_KEY ? 'azure'
  : process.env.ANTHROPIC_API_KEY ? 'claude'
  : process.env.GEMINI_API_KEY ? 'gemini'
  : null;

const CALL = { azure: callAzure, claude: callClaude, gemini: callGemini };

async function callModel(args) {
  const fn = CALL[provider];
  if (!fn) throw new Error('no-provider');
  return fn(args);
}

/** Reads a JSON body with a hard ceiling, since photos arrive through here. */
async function readJson(req, limit = 8_000_000) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > limit) { req.destroy(); throw new Error('too-large'); }
  }
  return JSON.parse(body);
}

/* ------------------------------------------------------------- the tasks -- */
/**
 * Three things the model does that the on-device brain cannot, each with its own
 * instructions. All three are handed the farm numbers the phone already computed,
 * so the model narrates and reasons over facts instead of inventing them.
 */
const DIAGNOSE_SYSTEM = `You are "AI Yacoup", looking at a photo a farmer just took of their crop.

- Say what you can actually see. If the photo is blurred, too dark, or not a plant,
  say so and ask for a better one. Never guess a disease from a bad picture.
- The JSON under "Farm data" is the same field's real water balance, computed on
  the phone. Use it: leaf symptoms that match water stress or salt damage should be
  read together with the soil water and salinity figures, and you should say which
  of them the evidence supports.
- Give at most three likely causes, most likely first, and say how confident you
  are in plain words ("almost certainly", "possibly").
- Then give one concrete action the farmer can take this week.
- You are not a substitute for an agronomist. If the crop looks badly damaged, say
  it should be seen in person.
- Reply in the language given by "language" (ar = Arabic script, en = English).
  Short sentences, no markdown, no jargon, at most 120 words.`;

const REPORT_SYSTEM = `You are "AI Yacoup", writing a short farm review for a smallholder farmer.

You are given every field on the farm with its crop, soil, irrigation method, water
balance, salinity position and season-to-date water use, all computed on the phone.

Write a review with exactly these parts, in this order, each a short paragraph with
no heading markup:
1. Where the farm stands right now, in one or two sentences.
2. The single biggest water problem you can see in the data, and why it matters.
3. Two or three specific changes, each naming the field it applies to and the
   number from the data that justifies it.
4. One thing the farmer is already doing well.

Rules: never invent a number; every figure must come from the data. If the data is
too thin to support a claim, leave the claim out. Reply in the language given by
"language" (ar = Arabic script, en = English). No markdown, at most 220 words.`;

function groundingText(grounding) {
  return `Farm data:\n${JSON.stringify(grounding, null, 1)}`;
}

async function handleAssistant(req, res) {
  if (!provider) return json(res, 503, { error: 'no-provider', hint: 'Set a key in .env' });
  let payload;
  try { payload = await readJson(req, 200_000); }
  catch { return json(res, 400, { error: 'bad-json' }); }

  const question = String(payload.question || '').slice(0, 1000);
  if (!question) return json(res, 400, { error: 'no-question' });

  try {
    const answer = await callModel({
      system: SYSTEM,
      user: `${groundingText(payload.grounding || {})}\n\nFarmer asks: ${question}`
    });
    json(res, 200, { answer, provider });
  } catch (err) {
    console.error('[yacoup]', err.message);
    json(res, 502, { error: 'upstream', detail: err.message });
  }
}

async function handleDiagnose(req, res) {
  if (!provider) return json(res, 503, { error: 'no-provider', hint: 'Set a key in .env' });
  let payload;
  try { payload = await readJson(req); }
  catch (e) { return json(res, e.message === 'too-large' ? 413 : 400, { error: 'bad-body' }); }

  const image = String(payload.image || '');
  if (!/^data:image\/(jpeg|png|webp);base64,/.test(image)) {
    return json(res, 400, { error: 'bad-image' });
  }
  try {
    const answer = await callModel({
      system: DIAGNOSE_SYSTEM,
      user: `${groundingText(payload.grounding || {})}\n\n${
        payload.note ? `The farmer adds: ${String(payload.note).slice(0, 300)}` : 'The farmer sent this photo without a note.'}`,
      image
    });
    json(res, 200, { answer, provider });
  } catch (err) {
    console.error('[diagnose]', err.message);
    json(res, 502, { error: 'upstream', detail: err.message });
  }
}

async function handleReport(req, res) {
  if (!provider) return json(res, 503, { error: 'no-provider', hint: 'Set a key in .env' });
  let payload;
  try { payload = await readJson(req, 400_000); }
  catch { return json(res, 400, { error: 'bad-json' }); }

  try {
    const answer = await callModel({
      system: REPORT_SYSTEM,
      user: groundingText(payload.grounding || {})
    });
    json(res, 200, { answer, provider });
  } catch (err) {
    console.error('[report]', err.message);
    json(res, 502, { error: 'upstream', detail: err.message });
  }
}

const json = (res, code, obj) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'access-control-allow-origin': '*' });
  res.end(JSON.stringify(obj));
};

/* ------------------------------------------------------------- static -- */
async function serveStatic(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let rel = decodeURIComponent(url.pathname);
  if (rel === '/') rel = '/index.html';

  // Contain the path inside ROOT: normalise, strip leading separators, and
  // reject anything that still climbs out.
  const safe = normalize(rel).replace(/^([/\\])+/, '');
  const parts = safe.split(/[/\\]/).filter(Boolean);
  if (parts.includes('..')) return notFound(res);

  // This process holds an API key, so it must not hand out its own source or any
  // dotfile that might carry one. The app itself never reads from these paths.
  const PRIVATE = new Set(['server', 'tools', 'node_modules', '.git']);
  if (parts.some((p) => p.startsWith('.')) || PRIVATE.has(parts[0])) return notFound(res);

  const file = join(ROOT, safe);
  if (!file.startsWith(ROOT.endsWith(sep) ? ROOT : ROOT + sep)) return notFound(res);

  try {
    const info = await stat(file);
    if (!info.isFile()) return notFound(res);
    const data = await readFile(file);
    res.writeHead(200, {
      'content-type': MIME[extname(file).toLowerCase()] || 'application/octet-stream',
      'content-length': data.length,
      // The service worker owns caching; the dev server must not fight it.
      'cache-control': 'no-cache',
      'service-worker-allowed': '/'
    });
    res.end(data);
  } catch {
    notFound(res);
  }
}

const notFound = (res) => { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); };

/* --------------------------------------------------------------- server -- */
const ROUTES = {
  '/api/assistant': handleAssistant,
  '/api/diagnose': handleDiagnose,
  '/api/report': handleReport
};

const server = http.createServer(async (req, res) => {
  const path = req.url.split('?')[0];
  const route = ROUTES[path];
  if (route) {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type'
      });
      return res.end();
    }
    if (req.method === 'POST') return route(req, res);
    return json(res, 405, { error: 'method' });
  }
  // The app asks this on start-up to know which online features to offer.
  if (path === '/api/health') {
    return json(res, 200, { ok: true, provider, vision: provider !== null });
  }
  return serveStatic(req, res);
});

server.listen(PORT, () => {
  console.log(`\n  MITER  →  http://localhost:${PORT}`);
  console.log(`  AI Yacoup bridge: ${provider ? provider + ' (ready — chat, photo diagnosis, farm report)' : 'off — offline brain only'}`);
  console.log(`  Bridge URL for the app's settings: http://localhost:${PORT}/api/assistant\n`);
});
