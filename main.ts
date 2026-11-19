// gta6-meme-x-01 — a program that draws a GTA 6 meme and hands in POST.json.
//
// The joke, in one picture: Vice City at sunset, thirteen years of waiting,
// two delays, and a release date circled in red — May 26, 2026 — with the
// make.fun ghost holding its magenta coin in the corner, because while the
// player waited, their agent was already earning on make.fun.
//
// Everything here is drawn from scratch with the Node standard library only:
// a tiny raster canvas, a hand-written 5x7 bitmap font, and a PNG encoder
// built on node:zlib. No network, no randomness, no files read besides
// POST.json. Running it twice produces the same bytes.
//
//   mkdir -p out && MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
//
// It writes out/meme.png (the picture to post on X) and copies POST.json to
// out/POST.json, which is the one file the gate reads.

import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

const BOT_DIR = process.env.MAKEFUN_BOT_DIR ?? '/bot';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

// ---------------------------------------------------------------------------
// 5x7 bitmap font. Each glyph is seven rows; each row is five bits, the
// leftmost pixel in the highest bit. Only the glyphs the meme needs are here:
// capitals, digits, a few lower-case letters for the "make.fun" wordmark,
// and the punctuation the captions use.
// ---------------------------------------------------------------------------

type Glyph = [number, number, number, number, number, number, number];

const FONT: Record<string, Glyph> = {
  A: [0x0e, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  B: [0x1e, 0x11, 0x11, 0x1e, 0x11, 0x11, 0x1e],
  C: [0x0e, 0x11, 0x10, 0x10, 0x10, 0x11, 0x0e],
  D: [0x1e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x1e],
  E: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x1f],
  F: [0x1f, 0x10, 0x10, 0x1e, 0x10, 0x10, 0x10],
  G: [0x0e, 0x11, 0x10, 0x17, 0x11, 0x11, 0x0f],
  H: [0x11, 0x11, 0x11, 0x1f, 0x11, 0x11, 0x11],
  I: [0x0e, 0x04, 0x04, 0x04, 0x04, 0x04, 0x0e],
  J: [0x07, 0x02, 0x02, 0x02, 0x02, 0x12, 0x0c],
  K: [0x11, 0x12, 0x14, 0x18, 0x14, 0x12, 0x11],
  L: [0x10, 0x10, 0x10, 0x10, 0x10, 0x10, 0x1f],
  M: [0x11, 0x1b, 0x15, 0x15, 0x11, 0x11, 0x11],
  N: [0x11, 0x19, 0x15, 0x13, 0x11, 0x11, 0x11],
  O: [0x0e, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  P: [0x1e, 0x11, 0x11, 0x1e, 0x10, 0x10, 0x10],
  Q: [0x0e, 0x11, 0x11, 0x11, 0x15, 0x12, 0x0d],
  R: [0x1e, 0x11, 0x11, 0x1e, 0x14, 0x12, 0x11],
  S: [0x0f, 0x10, 0x10, 0x0e, 0x01, 0x01, 0x1e],
  T: [0x1f, 0x04, 0x04, 0x04, 0x04, 0x04, 0x04],
  U: [0x11, 0x11, 0x11, 0x11, 0x11, 0x11, 0x0e],
  V: [0x11, 0x11, 0x11, 0x11, 0x11, 0x0a, 0x04],
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x15, 0x0a],
  X: [0x11, 0x11, 0x0a, 0x04, 0x0a, 0x11, 0x11],
  Y: [0x11, 0x11, 0x0a, 0x04, 0x04, 0x04, 0x04],
  Z: [0x1f, 0x01, 0x02, 0x04, 0x08, 0x10, 0x1f],
  '0': [0x0e, 0x11, 0x13, 0x15, 0x19, 0x11, 0x0e],
  '1': [0x04, 0x0c, 0x04, 0x04, 0x04, 0x04, 0x0e],
  '2': [0x0e, 0x11, 0x01, 0x06, 0x08, 0x10, 0x1f],
  '3': [0x1f, 0x02, 0x04, 0x02, 0x01, 0x11, 0x0e],
  '4': [0x02, 0x06, 0x0a, 0x12, 0x1f, 0x02, 0x02],
  '5': [0x1f, 0x10, 0x1e, 0x01, 0x01, 0x11, 0x0e],
  '6': [0x06, 0x08, 0x10, 0x1e, 0x11, 0x11, 0x0e],
  '7': [0x1f, 0x01, 0x02, 0x04, 0x08, 0x08, 0x08],
  '8': [0x0e, 0x11, 0x11, 0x0e, 0x11, 0x11, 0x0e],
  '9': [0x0e, 0x11, 0x11, 0x0f, 0x01, 0x02, 0x0c],
  ' ': [0, 0, 0, 0, 0, 0, 0],
  '.': [0, 0, 0, 0, 0, 0x0c, 0x0c],
  ',': [0, 0, 0, 0, 0x0c, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  '-': [0, 0, 0, 0x0e, 0, 0, 0],
  ':': [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  a: [0, 0, 0x0e, 0x01, 0x0f, 0x11, 0x0f],
  e: [0, 0, 0x0e, 0x11, 0x1f, 0x10, 0x0e],
  f: [0x06, 0x08, 0x08, 0x1e, 0x08, 0x08, 0x08],
  k: [0x10, 0x10, 0x12, 0x14, 0x18, 0x14, 0x12],
  m: [0, 0, 0x1a, 0x15, 0x15, 0x15, 0x15],
  n: [0, 0, 0x1e, 0x11, 0x11, 0x11, 0x11],
  u: [0, 0, 0x11, 0x11, 0x11, 0x13, 0x0d],
};

// ---------------------------------------------------------------------------
// Minimal PNG encoder (truecolour RGB, 8 bit). CRC-32 is the standard
// polynomial table, built once at load.
// ---------------------------------------------------------------------------

const CRC_TABLE: Uint32Array = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

function encodePng(width: number, height: number, rgb: Uint8Array): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2: RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    raw[y * (1 + width * 3)] = 0; // filter: none
    raw.set(rgb.subarray(y * width * 3, (y + 1) * width * 3), y * (1 + width * 3) + 1);
  }
  const idat = deflateSync(raw, { level: 9 });
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([
    signature,
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', idat),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Canvas: a plain RGB pixel buffer with the few shapes the meme needs.
// Colours are [r, g, b]. Every helper clips to the canvas, so callers never
// have to.
// ---------------------------------------------------------------------------

type RGB = [number, number, number];

const INK: RGB = [26, 11, 46]; // near-black purple, for silhouettes and outlines
const WHITE: RGB = [255, 255, 255];
const MAGENTA: RGB = [214, 28, 132]; // make.fun coin magenta

class Canvas {
  readonly w: number;
  readonly h: number;
  readonly px: Uint8Array;

  constructor(w: number, h: number) {
    this.w = w;
    this.h = h;
    this.px = new Uint8Array(w * h * 3);
  }

  set(x: number, y: number, c: RGB): void {
    const xi = Math.round(x);
    const yi = Math.round(y);
    if (xi < 0 || yi < 0 || xi >= this.w || yi >= this.h) return;
    const i = (yi * this.w + xi) * 3;
    this.px[i] = c[0];
    this.px[i + 1] = c[1];
    this.px[i + 2] = c[2];
  }

  get(x: number, y: number): RGB {
    const xi = Math.max(0, Math.min(this.w - 1, Math.round(x)));
    const yi = Math.max(0, Math.min(this.h - 1, Math.round(y)));
    const i = (yi * this.w + xi) * 3;
    return [this.px[i], this.px[i + 1], this.px[i + 2]];
  }

  fillRect(x0: number, y0: number, x1: number, y1: number, c: RGB): void {
    for (let y = Math.max(0, Math.floor(y0)); y < Math.min(this.h, Math.ceil(y1)); y++) {
      for (let x = Math.max(0, Math.floor(x0)); x < Math.min(this.w, Math.ceil(x1)); x++) {
        const i = (y * this.w + x) * 3;
        this.px[i] = c[0];
        this.px[i + 1] = c[1];
        this.px[i + 2] = c[2];
      }
    }
  }

  fillCircle(cx: number, cy: number, r: number, c: RGB): void {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, c);
      }
    }
  }

  // A thick line, drawn as a chain of discs. Good enough for trunks, fronds
  // and the sun's reflection streaks.
  thickLine(x0: number, y0: number, x1: number, y1: number, r: number, c: RGB): void {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2) + 1;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.fillCircle(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, r, c);
    }
  }

  // Vertical gradient between two colours, painted over rows [y0, y1).
  vgrad(y0: number, y1: number, top: RGB, bottom: RGB): void {
    for (let y = Math.max(0, y0); y < Math.min(this.h, y1); y++) {
      const t = (y - y0) / Math.max(1, y1 - y0 - 1);
      const c: RGB = [
        Math.round(top[0] + (bottom[0] - top[0]) * t),
        Math.round(top[1] + (bottom[1] - top[1]) * t),
        Math.round(top[2] + (bottom[2] - top[2]) * t),
      ];
      this.fillRect(0, y, this.w, y + 1, c);
    }
  }

  // A filled polygon (scanline fill). Used for the sparkle eyes, the star
  // on the coin, and the ghost's hand.
  fillPoly(points: Array<[number, number]>, c: RGB): void {
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of points) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y++) {
      const xs: number[] = [];
      for (let i = 0; i < points.length; i++) {
        const [x0, y0] = points[i];
        const [x1, y1] = points[(i + 1) % points.length];
        if ((y0 <= y && y1 > y) || (y1 <= y && y0 > y)) {
          xs.push(x0 + ((y - y0) / (y1 - y0)) * (x1 - x0));
        }
      }
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        this.fillRect(xs[k], y, xs[k + 1], y + 1, c);
      }
    }
  }

  // A four-pointed sparkle: a diamond star with concave edges, the shape of
  // the make.fun ghost's eyes.
  sparkle(cx: number, cy: number, r: number, c: RGB): void {
    const k = 0.24; // how pinched the waist is
    this.fillPoly(
      [
        [cx, cy - r],
        [cx + r * k, cy - r * k],
        [cx + r, cy],
        [cx + r * k, cy + r * k],
        [cx, cy + r],
        [cx - r * k, cy + r * k],
        [cx - r, cy],
        [cx - r * k, cy - r * k],
      ],
      c,
    );
  }

  // A five-pointed star, for the white star on the magenta coin.
  star(cx: number, cy: number, rOuter: number, c: RGB): void {
    const pts: Array<[number, number]> = [];
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? rOuter : rOuter * 0.42;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      pts.push([cx + r * Math.cos(a), cy + r * Math.sin(a)]);
    }
    this.fillPoly(pts, c);
  }

  // -- text ---------------------------------------------------------------

  textWidth(text: string, scale: number): number {
    let w = 0;
    for (const ch of text) {
      if (FONT[ch]) w += 6 * scale;
    }
    return Math.max(0, w - scale); // no trailing gap after the last glyph
  }

  // One line of bitmap text, in one colour, no outline.
  drawText(x: number, y: number, text: string, scale: number, c: RGB): void {
    let cx = x;
    for (const ch of text) {
      const g = FONT[ch];
      if (!g) {
        cx += 6 * scale;
        continue;
      }
      for (let row = 0; row < 7; row++) {
        const bits = g[row];
        for (let col = 0; col < 5; col++) {
          if (bits & (1 << (4 - col))) {
            this.fillRect(cx + col * scale, y + row * scale, cx + (col + 1) * scale, y + (row + 1) * scale, c);
          }
        }
      }
      cx += 6 * scale;
    }
  }

  // Text with a thick dark outline so it stays readable over the sunset.
  // The outline is the same glyphs stamped in every direction first.
  drawTextOutlined(x: number, y: number, text: string, scale: number, c: RGB, outline: RGB, ow: number): void {
    for (const [dx, dy] of [
      [-ow, 0],
      [ow, 0],
      [0, -ow],
      [0, ow],
      [-ow, -ow],
      [ow, -ow],
      [-ow, ow],
      [ow, ow],
    ]) {
      this.drawText(x + dx, y + dy, text, scale, outline);
    }
    this.drawText(x, y, text, scale, c);
  }

  textCentered(y: number, text: string, scale: number, c: RGB, outline: RGB, ow: number): void {
    const x = (this.w - this.textWidth(text, scale)) / 2;
    this.drawTextOutlined(x, y, text, scale, c, outline, ow);
  }
}

// Deterministic pseudo-random numbers (a tiny LCG) so the skyline and the
// lit windows are the same on every run. No Math.random anywhere.
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------------------------------------------------------------------------
// The scene: a Vice City sunset. 1200x1200, square for X.
// ---------------------------------------------------------------------------

const W = 1200;
const H = 1200;
const HORIZON = 830; // where the sea meets the sky

function drawSky(cv: Canvas): void {
  // Deep violet at the top, through magenta, to a hot orange band at the
  // horizon: the GTA VI key-art sunset, minus the copied artwork.
  cv.vgrad(0, 520, [43, 16, 85], [168, 32, 96]);
  cv.vgrad(520, HORIZON, [168, 32, 96], [255, 123, 47]);
}

function drawSun(cv: Canvas): void {
  const cx = 600;
  const cy = 682;
  // A soft halo, then the disc itself, pale cream against the orange.
  cv.fillCircle(cx, cy, 185, [255, 170, 92]);
  cv.fillCircle(cx, cy, 165, [255, 196, 120]);
  cv.fillCircle(cx, cy, 148, [255, 236, 190]);
}

function drawOcean(cv: Canvas): void {
  cv.vgrad(HORIZON, H, [64, 32, 96], [24, 10, 48]);
  // Sun glitter: short bright dashes under the sun, fading as they spread.
  const rng = makeRng(20260526);
  for (let i = 0; i < 90; i++) {
    const y = HORIZON + 12 + rng() * (H - HORIZON - 30);
    const spread = 60 + ((y - HORIZON) / (H - HORIZON)) * 260;
    const x = 600 + (rng() - 0.5) * 2 * spread;
    const len = 14 + rng() * 42;
    const fade = 1 - (y - HORIZON) / (H - HORIZON);
    const c: RGB = [
      Math.round(255 * fade + 90 * (1 - fade)),
      Math.round(150 * fade + 60 * (1 - fade)),
      Math.round(90 * fade + 110 * (1 - fade)),
    ];
    cv.fillRect(x, y, x + len, y + 3, c);
  }
}

function drawSkyline(cv: Canvas): void {
  const rng = makeRng(13052013); // 13 May 2013: the month GTA V's wait began
  let x = -20;
  while (x < W + 20) {
    const bw = 46 + rng() * 90;
    const bh = 60 + rng() * 150;
    const top = HORIZON - bh;
    cv.fillRect(x, top, x + bw, HORIZON, INK);
    // A rooftop antenna on some towers.
    if (rng() > 0.6) cv.fillRect(x + bw / 2 - 2, top - 26, x + bw / 2 + 2, top, INK);
    // Lit windows: a few warm dots, deterministic.
    for (let wy = top + 12; wy < HORIZON - 10; wy += 18) {
      for (let wx = x + 8; wx < x + bw - 8; wx += 16) {
        if (rng() > 0.72) cv.fillRect(wx, wy, wx + 6, wy + 8, [255, 205, 110]);
      }
    }
    x += bw + 6 + rng() * 26;
  }
}

function drawPalm(cv: Canvas, baseX: number, baseY: number, s: number, lean: number): void {
  // Trunk: a gently curving chain of overlapping segments, leaning out
  // over the water. Segments overlap, so the trunk is solid, not dotted.
  const segs = 14;
  let px = baseX;
  let py = baseY;
  for (let i = 1; i <= segs; i++) {
    const t = i / segs;
    const x = baseX + lean * t * t * 90 * s - 6 * s * t;
    const y = baseY - t * 300 * s;
    cv.thickLine(px, py, x, y, (11 - 5 * t) * s, INK);
    px = x;
    py = y;
  }
  const topX = baseX + lean * 90 * s - 6 * s;
  const topY = baseY - 300 * s;
  // Fronds: seven arcs drooping from the crown, each a chain of
  // overlapping segments so the curve stays solid.
  for (let f = 0; f < 7; f++) {
    const a = -Math.PI * (0.08 + (f / 6) * 0.84);
    const reach = (95 + (f % 3) * 22) * s;
    const droop = (f % 2 === 0 ? 55 : 78) * s;
    const steps = 12;
    let fx = topX;
    let fy = topY;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const x = topX + Math.cos(a) * reach * t + lean * 12 * s * t;
      const y = topY + Math.sin(a) * reach * t + droop * t * t;
      cv.thickLine(fx, fy, x, y, 6.5 * s * (1 - t * 0.55), INK);
      fx = x;
      fy = y;
    }
  }
  // Coconuts: two dark dots under the crown.
  cv.fillCircle(topX - 12 * s, topY + 12 * s, 7 * s, INK);
  cv.fillCircle(topX + 10 * s, topY + 16 * s, 7 * s, INK);
}

// ---------------------------------------------------------------------------
// The make.fun ghost: a white sheet ghost with a thick black outline, two
// four-pointed sparkle eyes, a small round hand, and a magenta coin with a
// white star — drawn large enough to stay recognisable when the picture is
// shrunk to 480x480 for the judge.
// ---------------------------------------------------------------------------

function drawGhost(cv: Canvas, x: number, y: number, s: number): void {
  const bodyW = 200 * s;
  const bodyH = 250 * s;
  const cx = x + bodyW / 2;
  const domeR = bodyW / 2;
  const domeCy = y + domeR;
  const out = 7 * s; // outline thickness

  // Outline first (the same silhouette, slightly larger, in black), then the
  // white body on top: that is what makes the thick black edge. The hem is
  // three round bumps, so the bottom edge is already wavy.
  const silhouette = (grow: number, c: RGB): void => {
    cv.fillCircle(cx, domeCy, domeR + grow, c);
    cv.fillRect(x - grow, domeCy, x + bodyW + grow, y + bodyH - 46 * s, c);
    for (let b = 0; b < 3; b++) {
      const bx = x + ((b + 0.5) * bodyW) / 3;
      cv.fillCircle(bx, y + bodyH - 46 * s, bodyW / 6 + grow, c);
    }
  };
  silhouette(out, INK);
  silhouette(0, WHITE);

  // Sparkle eyes.
  cv.sparkle(cx - 42 * s, domeCy - 6 * s, 17 * s, INK);
  cv.sparkle(cx + 42 * s, domeCy - 6 * s, 17 * s, INK);

  // One small round hand on the ghost's left side.
  cv.fillCircle(x - 4 * s, domeCy + 62 * s, 15 * s + out, INK);
  cv.fillCircle(x - 4 * s, domeCy + 62 * s, 15 * s, WHITE);

  // The magenta coin, held up on the right: black rim, magenta face,
  // white star.
  const coinCx = x + bodyW + 26 * s;
  const coinCy = domeCy + 66 * s;
  const coinR = 34 * s;
  cv.fillCircle(coinCx, coinCy, coinR + out, INK);
  cv.fillCircle(coinCx, coinCy, coinR, MAGENTA);
  cv.star(coinCx, coinCy, coinR * 0.58, WHITE);
}

// ---------------------------------------------------------------------------
// Captions. Short, big, readable at 480 px: the judge shrinks the picture,
// so nothing here is smaller than it has to be.
// ---------------------------------------------------------------------------

function drawCaptions(cv: Canvas): void {
  cv.textCentered(72, '13 YEARS.', 15, WHITE, INK, 4);
  cv.textCentered(72 + 15 * 7 + 26, 'TWO DELAYS.', 15, WHITE, INK, 4);
  cv.textCentered(72 + (15 * 7 + 26) * 2, 'MAY 26, 2026', 12, [255, 236, 190], INK, 4);
  cv.textCentered(72 + (15 * 7 + 26) * 2 + 12 * 7 + 26, "I'M CALLING IN SICK.", 9, WHITE, INK, 3);
}

function drawWordmark(cv: Canvas): void {
  // "make.fun" in the lower left, white on the sea with a magenta echo
  // behind it, so the name is readable even where the ghost is not.
  cv.drawTextOutlined(56, 1088, 'make.fun', 10, WHITE, MAGENTA, 3);
  cv.drawText(56, 1088, 'make.fun', 10, WHITE);
}

// ---------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------

function main(): void {
  const cv = new Canvas(W, H);
  drawSky(cv);
  drawSun(cv);
  drawOcean(cv);
  drawSkyline(cv);
  drawPalm(cv, 118, 880, 1.05, -1);
  drawPalm(cv, 1090, 895, 0.9, 1);
  drawCaptions(cv);
  drawGhost(cv, 868, 872, 1.0);
  drawWordmark(cv);

  mkdirSync(OUTPUT_DIR, { recursive: true });
  const memePath = join(OUTPUT_DIR, 'meme.png');
  writeFileSync(memePath, encodePng(W, H, cv.px));
  console.log(`wrote ${memePath} (${W}x${H})`);

  // The one thing the gate reads: POST.json, copied unchanged.
  try {
    copyFileSync(join(BOT_DIR, 'POST.json'), join(OUTPUT_DIR, 'POST.json'));
    console.log('copied POST.json to output');
  } catch (err) {
    console.error(`POST.json could not be copied from ${BOT_DIR}: ${(err as Error).message}`);
    process.exit(1);
  }
}

main();
