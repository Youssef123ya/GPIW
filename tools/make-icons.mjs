/**
 * make-icons.mjs — writes the PWA icons as real PNGs, with no image library.
 *
 * The artwork is a raindrop over a sprout, drawn from signed-distance functions
 * and supersampled 3x3 for clean edges. Generating rather than committing binaries
 * keeps the repo text-only and makes the icon editable by changing numbers here.
 */

import { deflateSync } from 'node:zlib';
import { writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const OUT = fileURLToPath(new URL('../assets/', import.meta.url));
mkdirSync(OUT, { recursive: true });

/* ---------------------------------------------------------------- png io -- */
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** rgba: Uint8Array of size*size*4 */
function encodePNG(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;     // bit depth
  ihdr[9] = 6;     // colour type: RGBA
  // rows are prefixed with filter byte 0 (None)
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy
      ? rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
      : Buffer.from(rgba.subarray(y * size * 4, (y + 1) * size * 4)).copy(raw, y * (size * 4 + 1) + 1);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

/* ---------------------------------------------------------------- drawing -- */
const mix = (a, b, x) => a + (b - a) * x;
const clamp01 = (v) => Math.min(1, Math.max(0, v));

/** Teardrop: a circle below, tapering to a point above. Returns coverage 0..1. */
function dropAlpha(x, y, cx, cy, r) {
  const H = r * 2.0;            // height of the taper above the circle centre
  const dy = y - cy;
  if (dy >= 0) return (x - cx) ** 2 + dy ** 2 <= r * r ? 1 : 0;
  const u = -dy / H;
  if (u > 1) return 0;
  const w = r * (1 - u) * (1 - 0.3 * u);
  return Math.abs(x - cx) <= w ? 1 : 0;
}

/** Leaf: the lens where two equal circles overlap, rotated into place. */
function leafAlpha(x, y, cx, cy, len, angle) {
  const dx = x - cx, dy = y - cy;
  const c = Math.cos(-angle), s = Math.sin(-angle);
  const px = dx * c - dy * s, py = dx * s + dy * c;
  const R = len * 0.78, off = len * 0.6;
  const in1 = (px) ** 2 + (py + off) ** 2 <= R * R;
  const in2 = (px) ** 2 + (py - off) ** 2 <= R * R;
  return in1 && in2 ? 1 : 0;
}

function render(size, pad) {
  const SS = 3;                                  // supersampling factor
  const px = new Uint8Array(size * size * 4);
  const inner = size - pad * 2;
  const cx = size / 2;
  const radius = inner * 0.5;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const fx = x + (sx + 0.5) / SS;
          const fy = y + (sy + 0.5) / SS;
          const c = sample(fx, fy, size, cx, radius, pad, inner);
          r += c[0]; g += c[1]; b += c[2]; a += c[3];
        }
      }
      const n = SS * SS;
      const i = (y * size + x) * 4;
      px[i] = r / n; px[i + 1] = g / n; px[i + 2] = b / n; px[i + 3] = a / n;
    }
  }
  return Buffer.from(px);
}

function sample(x, y, size, cx, radius, pad, inner) {
  // Rounded-square ground with the brand gradient.
  const rr = inner * 0.24;
  const l = pad, t = pad, rgt = size - pad, bot = size - pad;
  const qx = Math.max(l + rr - x, 0, x - (rgt - rr));
  const qy = Math.max(t + rr - y, 0, y - (bot - rr));
  const outside = Math.hypot(qx, qy) > rr || x < l || x > rgt || y < t || y > bot;
  if (outside) return [0, 0, 0, 0];

  const v = clamp01((y - t) / inner);
  let col = [
    mix(0x0E, 0x06, v),   // #0E7C7B -> #064C4C, the app's brand gradient
    mix(0x7C, 0x4C, v),
    mix(0x7B, 0x4C, v),
    255
  ];

  // Sprout, drawn under the drop so the drop reads as being in front.
  const sy = t + inner * 0.70;
  const leafL = inner * 0.20;
  if (leafAlpha(x, y, cx - inner * 0.11, sy, leafL, -0.62)
    || leafAlpha(x, y, cx + inner * 0.11, sy, leafL, 0.62)) {
    col = [0x7A, 0xD6, 0x7E, 255];
  }
  // Stem
  if (Math.abs(x - cx) <= inner * 0.022 && y > sy - inner * 0.04 && y < t + inner * 0.88) {
    col = [0x7A, 0xD6, 0x7E, 255];
  }

  // The raindrop.
  const dcx = cx, dcy = t + inner * 0.42, dr = inner * 0.185;
  if (dropAlpha(x, y, dcx, dcy, dr)) {
    col = [0xF2, 0xFA, 0xFF, 255];
    // A highlight so the drop reads as water rather than a white blob.
    if (Math.hypot(x - (dcx - dr * 0.32), y - (dcy - dr * 0.22)) < dr * 0.3) {
      col = [0xB6, 0xE3, 0xF5, 255];
    }
  }
  return col;
}

/* ------------------------------------------------------------------ write -- */
const jobs = [
  ['icon-192.png', 192, 6],
  ['icon-512.png', 512, 16],
  // Maskable icons are cropped to a safe circle, so the art needs a wide margin.
  ['icon-maskable-512.png', 512, 0, true]
];

for (const [name, size, pad, maskable] of jobs) {
  const px = maskable ? renderMaskable(size) : render(size, pad);
  writeFileSync(join(OUT, name), encodePNG(size, px));
  console.log('wrote', name, size + 'px');
}

/** Full-bleed brand background with the art shrunk into the safe zone. */
function renderMaskable(size) {
  const art = render(Math.round(size * 0.78), 0);
  const artSize = Math.round(size * 0.78);
  const off = Math.round((size - artSize) / 2);
  const px = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const v = clamp01(y / size);
      px[i] = mix(0x0E, 0x06, v); px[i + 1] = mix(0x7C, 0x4C, v); px[i + 2] = mix(0x7B, 0x4C, v); px[i + 3] = 255;
      const ax = x - off, ay = y - off;
      if (ax >= 0 && ay >= 0 && ax < artSize && ay < artSize) {
        const j = (ay * artSize + ax) * 4;
        const a = art[j + 3] / 255;
        if (a > 0) {
          px[i] = mix(px[i], art[j], a);
          px[i + 1] = mix(px[i + 1], art[j + 1], a);
          px[i + 2] = mix(px[i + 2], art[j + 2], a);
        }
      }
    }
  }
  return Buffer.from(px);
}
