// Ember News 24 November — a one-page front page summing up Tuesday 24 November 2026.
// Node 22, standard library only. Draws every pixel itself into a 1024x1024 PNG:
// a hand-built 5x7 bitmap font, vector icons, and a deterministic PNG encoder
// (stored DEFLATE blocks, fixed CRC/adler). No network, no external images.
// Run: mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 1024;
const H = 1024;
const PAPER: RGB = [247, 243, 232];
const INK: RGB = [22, 21, 19];
const WHITE: RGB = [255, 253, 246];
const RED: RGB = [166, 28, 28];
const BLUE: RGB = [29, 78, 137];
const TEAL: RGB = [15, 118, 110];
const GOLD: RGB = [154, 107, 0];
const GREY: RGB = [91, 86, 74];
const NAVY: RGB = [20, 33, 61];
const LIGHT: RGB = [220, 224, 232];

type RGB = [number, number, number];

const px = new Uint8Array(W * H * 3);

function fill(c: RGB): void {
  for (let i = 0; i < W * H; i++) {
    px[i * 3] = c[0];
    px[i * 3 + 1] = c[1];
    px[i * 3 + 2] = c[2];
  }
}

function setPx(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function fillRect(x: number, y: number, w: number, h: number, c: RGB): void {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(W, Math.round(x + w));
  const y1 = Math.min(H, Math.round(y + h));
  for (let yy = y0; yy < y1; yy++) {
    for (let xx = x0; xx < x1; xx++) setPx(xx, yy, c);
  }
}

function rect(x: number, y: number, w: number, h: number, c: RGB, t: number): void {
  fillRect(x, y, w, t, c);
  fillRect(x, y + h - t, w, t, c);
  fillRect(x, y, t, h, c);
  fillRect(x + w - t, y, t, h, c);
}

function hline(x: number, y: number, w: number, c: RGB): void {
  fillRect(x, y, w, 1, c);
}

function vline(x: number, y: number, h: number, c: RGB): void {
  fillRect(x, y, 1, h, c);
}

// Integer Bresenham with rounded endpoints (never fractional: a fractional
// endpoint once made a line loop hang). Width via small filled squares.
function line(x0: number, y0: number, x1: number, y1: number, c: RGB, w = 1): void {
  let ax = Math.round(x0);
  let ay = Math.round(y0);
  const bx = Math.round(x1);
  const by = Math.round(y1);
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const sx = ax < bx ? 1 : -1;
  const sy = ay < by ? 1 : -1;
  let err = dx - dy;
  const r = Math.floor(w / 2);
  for (;;) {
    fillRect(ax - r, ay - r, 2 * r + 1, 2 * r + 1, c);
    if (ax === bx && ay === by) break;
    const e2 = 2 * err;
    if (e2 > -dy) {
      err -= dy;
      ax += sx;
    }
    if (e2 < dx) {
      err += dx;
      ay += sy;
    }
  }
}

function fillCircle(cx: number, cy: number, r: number, c: RGB): void {
  const rr = Math.round(r);
  for (let dy = -rr; dy <= rr; dy++) {
    const dx = Math.floor(Math.sqrt(rr * rr - dy * dy));
    hline(Math.round(cx) - dx, Math.round(cy) + dy, dx * 2 + 1, c);
  }
}

function ring(cx: number, cy: number, r: number, c: RGB, t = 3): void {
  for (let k = 0; k < t; k++) {
    const rr = Math.round(r) - k;
    for (let a = 0; a < 360; a += 1) {
      const rad = (a * Math.PI) / 180;
      setPx(Math.round(cx + rr * Math.cos(rad)), Math.round(cy + rr * Math.sin(rad)), c);
    }
  }
}

// Even-odd scanline polygon fill (triangles, hulls, arrowheads).
function fillPoly(pts: Array<[number, number]>, c: RGB): void {
  let minY = H;
  let maxY = 0;
  for (const [, y] of pts) {
    minY = Math.min(minY, Math.round(y));
    maxY = Math.max(maxY, Math.round(y));
  }
  for (let y = minY; y <= maxY; y++) {
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % pts.length];
      if ((y1 <= y && y2 > y) || (y2 <= y && y1 > y)) {
        xs.push(Math.round(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1)));
      }
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      hline(xs[k], y, xs[k + 1] - xs[k], c);
    }
  }
}

// ---- 5x7 bitmap font (rows as 5-bit values) ----
const FONT: Record<string, number[]> = {
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
  W: [0x11, 0x11, 0x11, 0x15, 0x15, 0x1b, 0x11],
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
  ':': [0, 0x0c, 0x0c, 0, 0x0c, 0x0c, 0],
  ';': [0, 0x0c, 0x0c, 0, 0x0c, 0x04, 0x08],
  "'": [0x04, 0x04, 0x08, 0, 0, 0, 0],
  '-': [0, 0, 0, 0x0e, 0, 0, 0],
  '/': [0x01, 0x02, 0x02, 0x04, 0x08, 0x08, 0x10],
  '(': [0x02, 0x04, 0x08, 0x08, 0x08, 0x04, 0x02],
  ')': [0x08, 0x04, 0x02, 0x02, 0x02, 0x04, 0x08],
  '&': [0x0c, 0x12, 0x14, 0x08, 0x15, 0x12, 0x0d],
  '%': [0x19, 0x1a, 0x02, 0x04, 0x08, 0x0b, 0x13],
  '+': [0, 0x04, 0x04, 0x1f, 0x04, 0x04, 0],
  $: [0x04, 0x0f, 0x14, 0x0e, 0x05, 0x1e, 0x04],
  '!': [0x04, 0x04, 0x04, 0x04, 0x04, 0, 0x04],
  '?': [0x0e, 0x11, 0x01, 0x06, 0x04, 0, 0x04],
  '"': [0x0a, 0x0a, 0x0a, 0, 0, 0, 0],
  '=': [0, 0, 0x1f, 0, 0x1f, 0, 0],
  '•': [0, 0, 0x0c, 0x0c, 0x0c, 0, 0],
};

function glyph(ch: string): number[] {
  if (ch === '—' || ch === '–') return FONT['-'];
  return FONT[ch] ?? FONT[' '];
}

function textWidth(s: string, scale: number): number {
  return s.length * 6 * scale;
}

function drawText(s: string, x: number, y: number, scale: number, c: RGB): void {
  let cx = Math.round(x);
  const cy = Math.round(y);
  for (const ch of s) {
    const g = glyph(ch.toUpperCase());
    for (let row = 0; row < 7; row++) {
      const bits = g[row];
      for (let col = 0; col < 5; col++) {
        if ((bits >> (4 - col)) & 1) {
          fillRect(cx + col * scale, cy + row * scale, scale, scale, c);
        }
      }
    }
    cx += 6 * scale;
  }
}

function drawCentered(s: string, cx: number, y: number, scale: number, c: RGB): void {
  drawText(s, cx - textWidth(s, scale) / 2, y, scale, c);
}

function wrapLines(text: string, maxW: number, scale: number): string[] {
  const words = text.split(' ');
  const lines: string[] = [];
  let cur = '';
  for (const w of words) {
    const trial = cur ? cur + ' ' + w : w;
    if (textWidth(trial, scale) <= maxW || !cur) {
      cur = trial;
    } else {
      lines.push(cur);
      cur = w;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function drawWrapped(text: string, x: number, y: number, maxW: number, scale: number, c: RGB, lh: number): number {
  const lines = wrapLines(text, maxW, scale);
  lines.forEach((ln, i) => drawText(ln, x, y + i * lh, scale, c));
  return y + lines.length * lh;
}

// ---- icons (simple vector shapes) ----
function iconChip(x: number, y: number, s: number, c: RGB): void {
  // square chip with pins, s = side of the chip body
  rect(x, y, s, s, c, 4);
  rect(x + s * 0.28, y + s * 0.28, s * 0.44, s * 0.44, c, 3);
  for (let i = 0; i < 3; i++) {
    const o = s * (0.22 + i * 0.28);
    line(x + o, y - 12, x + o, y, c, 4);
    line(x + o, y + s, x + o, y + s + 12, c, 4);
    line(x - 12, y + o, x, y + o, c, 4);
    line(x + s, y + o, x + s + 12, y + o, c, 4);
  }
}

function iconJet(x: number, y: number, s: number, c: RGB): void {
  // delta jet pointing up-right, plus a small warning triangle
  fillPoly(
    [
      [x + s * 0.5, y],
      [x + s * 0.95, y + s * 0.85],
      [x + s * 0.5, y + s * 0.6],
      [x + s * 0.05, y + s * 0.85],
    ],
    c,
  );
  line(x + s * 0.5, y + s * 0.6, x + s * 0.5, y + s, c, 4);
  fillPoly(
    [
      [x + s * 0.78, y + s * 0.1],
      [x + s * 0.98, y + s * 0.1],
      [x + s * 0.88, y + s * 0.32],
    ],
    RED,
  );
}

function iconShip(x: number, y: number, s: number, c: RGB): void {
  // hull, mast, flag, waves
  fillPoly(
    [
      [x, y + s * 0.45],
      [x + s, y + s * 0.45],
      [x + s * 0.85, y + s * 0.75],
      [x + s * 0.15, y + s * 0.75],
    ],
    c,
  );
  line(x + s * 0.5, y + s * 0.05, x + s * 0.5, y + s * 0.45, c, 4);
  fillPoly(
    [
      [x + s * 0.5, y + s * 0.05],
      [x + s * 0.78, y + s * 0.14],
      [x + s * 0.5, y + s * 0.23],
    ],
    RED,
  );
  line(x, y + s * 0.88, x + s, y + s * 0.88, BLUE, 4);
  line(x + s * 0.15, y + s, x + s * 0.4, y + s, BLUE, 4);
  line(x + s * 0.6, y + s, x + s * 0.85, y + s, BLUE, 4);
}

function iconGlobe(x: number, y: number, s: number, c: RGB): void {
  const cx = x + s / 2;
  const cy = y + s / 2;
  const r = s / 2 - 4;
  ring(cx, cy, r, c, 4);
  line(cx - r, cy, cx + r, cy, c, 3);
  line(cx, cy - r, cx, cy + r, c, 3);
  // a leaf sprig over the globe
  fillPoly(
    [
      [cx + r * 0.1, cy - r * 0.5],
      [cx + r * 0.55, cy - r * 0.85],
      [cx + r * 0.5, cy - r * 0.3],
    ],
    TEAL,
  );
}

function iconPlane(x: number, y: number, s: number, c: RGB): void {
  // side view: fuselage, tail, wings
  line(x, y + s * 0.5, x + s * 0.9, y + s * 0.42, c, 6);
  line(x + s * 0.82, y + s * 0.42, x + s, y + s * 0.28, c, 5);
  line(x + s * 0.08, y + s * 0.5, x + s * 0.02, y + s * 0.22, c, 5);
  line(x + s * 0.45, y + s * 0.46, x + s * 0.3, y + s * 0.78, c, 5);
  line(x + s * 0.55, y + s * 0.45, x + s * 0.7, y + s * 0.72, c, 5);
}

function iconBat(x: number, y: number, s: number, c: RGB): void {
  // cricket bat leaning + ball
  fillPoly(
    [
      [x + s * 0.3, y + s * 0.05],
      [x + s * 0.55, y + s * 0.05],
      [x + s * 0.42, y + s * 0.62],
      [x + s * 0.17, y + s * 0.62],
    ],
    c,
  );
  line(x + s * 0.3, y + s * 0.62, x + s * 0.18, y + s * 0.95, c, 6);
  fillCircle(x + s * 0.78, y + s * 0.8, s * 0.13, RED);
}

// ---- story boxes ----
interface Story {
  kicker: string;
  accent: RGB;
  headline: string;
  deck: string;
  source: string;
  icon: (x: number, y: number, s: number, c: RGB) => void;
  iconColor: RGB;
}

function storyBox(x: number, y: number, w: number, h: number, st: Story, iconSize: number): void {
  fillRect(x, y, w, h, WHITE);
  rect(x, y, w, h, INK, 2);
  fillRect(x, y, w, 6, st.accent);
  const pad = 16;
  const tx = x + pad;
  const tw = w - pad * 2 - (iconSize + 12);
  drawText(st.kicker, tx, y + 16, 2, st.accent);
  const hy = drawWrapped(st.headline, tx, y + 42, tw, 3, INK, 27);
  drawWrapped(st.deck, tx, hy + 8, w - pad * 2, 2, INK, 20);
  drawText(st.source, tx, y + h - 26, 2, GREY);
  st.icon(x + w - pad - iconSize, y + 14, iconSize, st.iconColor);
}

// ---- PNG encoder (deterministic, stored DEFLATE) ----
const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(buf: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < buf.length; i++) {
    a = (a + buf[i]) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  const crc = crc32(out.subarray(4, 8 + data.length));
  dv.setUint32(8 + data.length, crc);
  return out;
}

// ---- DEFLATE with fixed Huffman codes + greedy LZ77 ----
const LEN_BASE = [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258];
const LEN_EXTRA = [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0];
const DIST_BASE = [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577];
const DIST_EXTRA = [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13];

function litCode(sym: number): [number, number] {
  if (sym < 144) return [0x30 + sym, 8];
  if (sym < 256) return [0x190 + (sym - 144), 9];
  if (sym < 280) return [sym - 256, 7];
  return [0xc0 + (sym - 280), 8];
}

function lenCode(len: number): [number, number, number] {
  for (let i = 28; i >= 0; i--) {
    if (len >= LEN_BASE[i]) return [257 + i, len - LEN_BASE[i], LEN_EXTRA[i]];
  }
  return [257, 0, 0];
}

function distCode(dist: number): [number, number, number] {
  for (let i = 29; i >= 0; i--) {
    if (dist >= DIST_BASE[i]) return [i, dist - DIST_BASE[i], DIST_EXTRA[i]];
  }
  return [0, 0, 0];
}

function deflateFixed(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  let bitBuf = 0;
  let bitCnt = 0;
  const putBits = (val: number, n: number): void => {
    bitBuf |= (val & ((1 << n) - 1)) << bitCnt;
    bitCnt += n;
    while (bitCnt >= 8) {
      out.push(bitBuf & 0xff);
      bitBuf >>>= 8;
      bitCnt -= 8;
    }
  };
  // Huffman codes go out most-significant bit first, so reverse them
  // before feeding the LSB-first bit writer. Extra bits stay as-is.
  const putCode = (code: number, n: number): void => {
    let rev = 0;
    for (let i = 0; i < n; i++) rev = (rev << 1) | ((code >> i) & 1);
    putBits(rev, n);
  };
  const n = data.length;
  const head = new Int32Array(1 << 15).fill(-1);
  const hashAt = (p: number): number =>
    ((data[p] * 31 + data[p + 1]) * 31 + data[p + 2]) & 0x7fff;
  putBits(1, 1); // BFINAL
  putBits(1, 2); // BTYPE = fixed Huffman
  let p = 0;
  while (p < n) {
    let bestLen = 0;
    let bestDist = 0;
    if (p + 3 <= n) {
      const h = hashAt(p);
      const cand = head[h];
      if (cand >= 0 && p - cand <= 32768) {
        let len = 0;
        while (len < 258 && p + len < n && data[cand + len] === data[p + len]) len++;
        if (len >= 3) {
          bestLen = len;
          bestDist = p - cand;
        }
      }
      head[h] = p;
    }
    if (bestLen >= 3) {
      const [sym, extra, eb] = lenCode(bestLen);
      const [code, cb] = litCode(sym);
      putCode(code, cb);
      if (eb) putBits(extra, eb);
      const [dsym, dextra, deb] = distCode(bestDist);
      putCode(dsym, 5);
      if (deb) putBits(dextra, deb);
      for (let k = 1; k < bestLen; k++) {
        if (p + k + 3 <= n) head[hashAt(p + k)] = p + k;
      }
      p += bestLen;
    } else {
      const [code, cb] = litCode(data[p]);
      putCode(code, cb);
      p++;
    }
  }
  const [ecode, ecb] = litCode(256); // end of block
  putCode(ecode, ecb);
  if (bitCnt > 0) out.push(bitBuf & 0xff);
  return new Uint8Array(out);
}

function encodePNG(): Uint8Array {
  const raw = new Uint8Array(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0;
    // copy one scanline: Uint8Array has no .copy(), use .set()
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  // zlib stream: header 0x78 0x01, one fixed-Huffman DEFLATE block, adler32
  const deflated = deflateFixed(raw);
  const z = new Uint8Array(2 + deflated.length + 4);
  z[0] = 0x78;
  z[1] = 0x01;
  z.set(deflated, 2);
  let p = 2 + deflated.length;
  const ad = adler32(raw);
  z[p++] = (ad >>> 24) & 0xff;
  z[p++] = (ad >>> 16) & 0xff;
  z[p++] = (ad >>> 8) & 0xff;
  z[p++] = ad & 0xff;

  const ihdr = new Uint8Array(13);
  const dv = new DataView(ihdr.buffer);
  dv.setUint32(0, W);
  dv.setUint32(4, H);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const sig = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', z.subarray(0, p)), chunk('IEND', new Uint8Array(0))];
  const total = parts.reduce((a, b) => a + b.length, 0);
  const out = new Uint8Array(total);
  let o = 0;
  for (const part of parts) {
    out.set(part, o);
    o += part.length;
  }
  return out;
}

// ---- the page ----
function build(): void {
  fill(PAPER);
  rect(12, 12, W - 24, H - 24, INK, 3);

  // Masthead
  drawText('EMBER NEWS', 28, 30, 9, INK);
  vline(672, 34, 62, GREY);
  drawText('TUESDAY', 696, 32, 3, RED);
  drawText('24 NOV 2026', 696, 66, 3, INK);
  fillRect(28, 112, 968, 4, RED);
  drawCentered('TUESDAY, 24 NOVEMBER 2026', 512, 126, 3, INK);
  drawCentered('SIX STORIES THAT DEFINED THE DAY', 512, 156, 2, GREY);

  // Lead story: Nvidia
  const lx = 28;
  const ly = 184;
  const lw = 968;
  const lh = 204;
  fillRect(lx, ly, lw, lh, WHITE);
  rect(lx, ly, lw, lh, INK, 3);
  fillRect(lx, ly, 10, lh, RED);
  drawText('MARKETS • LEAD STORY', lx + 26, ly + 16, 2, RED);
  drawText('HUANG IS BACK: NVIDIA SOARS 33%', lx + 26, ly + 46, 4, INK);
  drawWrapped(
    'Shares jump and Asian markets rally on Tuesday after the chipmaker reinstates its chief executive, cleared of any security risk. The dollar hits a 20-month high.',
    lx + 26,
    ly + 92,
    760,
    2,
    INK,
    20,
  );
  drawText('REUTERS • 24 NOV 2026', lx + 26, ly + lh - 26, 2, GREY);
  iconChip(lx + lw - 150, ly + 62, 96, BLUE);

  // Row 2: Korea + Ukraine
  const row2y = 400;
  const boxW = 476;
  const boxH = 230;
  storyBox(
    28,
    row2y,
    boxW,
    boxH,
    {
      kicker: 'ASIA • SECURITY',
      accent: TEAL,
      headline: 'RUSSIAN JETS SPARK AIR-RAID ALERT IN SOUTH KOREA',
      deck: 'Jets scramble as Russian planes enter the defence zone near Ulleung Island; alert lifted in five minutes.',
      source: 'REUTERS • YONHAP • 24 NOV 2026',
      icon: iconJet,
      iconColor: TEAL,
    },
    56,
  );
  storyBox(
    520,
    row2y,
    boxW,
    boxH,
    {
      kicker: 'WAR • UKRAINE',
      accent: RED,
      headline: 'UKRAINE SINKS RUSSIAN WARSHIP OFF LIBYA',
      deck: 'Seven sea drones sink the corvette Merkury at Benghazi. Libya protests; Moscow vows payback.',
      source: 'CNN • BBC • CONFIRMED 23 NOV 2026',
      icon: iconShip,
      iconColor: BLUE,
    },
    56,
  );

  // Row 3: COP31 + ICE
  const row3y = 642;
  storyBox(
    28,
    row3y,
    boxW,
    boxH,
    {
      kicker: 'CLIMATE • COP31',
      accent: GOLD,
      headline: 'CLIMATE TALKS END WITH NO DEAL',
      deck: 'After two weeks in Antalya, nations fail to agree a pact - the first COP collapse since 2009.',
      source: 'CNN • 22 NOV 2026',
      icon: iconGlobe,
      iconColor: TEAL,
    },
    56,
  );
  storyBox(
    520,
    row3y,
    boxW,
    boxH,
    {
      kicker: 'USA • IMMIGRATION',
      accent: BLUE,
      headline: 'OUTRAGE AFTER ICE ARREST ON SEATTLE JET BRIDGE',
      deck: 'A father and daughter heading to a baptism are detained by masked officers on the jet bridge.',
      source: 'AP • CNN • 22 NOV 2026',
      icon: iconPlane,
      iconColor: BLUE,
    },
    56,
  );

  // Sport strip
  const sy = 884;
  const sh = 100;
  fillRect(28, sy, 968, sh, NAVY);
  rect(28, sy, 968, sh, INK, 2);
  drawText('SPORT • CRICKET', 44, sy + 10, 2, GOLD);
  drawText('INDIA 720/9: RECORD TOTAL, DRAWN TEST', 44, sy + 34, 3, WHITE);
  drawWrapped(
    "Pant 128 and Rahul 136 power a record total - but Mitchell and Phillips bat out the final day.",
    44,
    sy + 62,
    820,
    2,
    LIGHT,
    18,
  );
  drawText('BCCI • 23 NOV 2026', 764, sy + 10, 2, LIGHT);
  iconBat(920, sy + 38, 52, WHITE);

  // Footer
  drawCentered('SOURCES: REUTERS • AP • CNN • BBC • YONHAP • BCCI', 512, 992, 2, GREY);
}

build();
const png = encodePNG();
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'entry.png'), png);
console.log(`wrote ${join(outDir, 'entry.png')} (${png.length} bytes, ${W}x${H})`);
