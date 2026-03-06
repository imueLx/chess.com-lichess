#!/usr/bin/env node
/**
 * generate-icons.js
 * Creates professional PNG icons for the Chess.com → Lichess extension.
 * Pure Node.js — no external dependencies required.
 *
 * Usage: node generate-icons.js
 */

"use strict";

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

/* ------------------------------------------------------------------ */
/*  Icon rendering                                                     */
/* ------------------------------------------------------------------ */

/**
 * Render a single icon at the given pixel size.
 * Design: a rounded-rect dark background with a stylised chess knight
 * silhouette and a small green right-arrow (→ Lichess).
 */
function createIcon(size) {
  const buf = Buffer.alloc(size * size * 4);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const u = (x + 0.5) / size;
      const v = (y + 0.5) / size;

      // --- Rounded-rectangle background ---
      const cornerR = 0.18;
      const bgAlpha = roundedRect(u, v, 0.04, 0.04, 0.92, 0.92, cornerR);

      // Background gradient: dark blue-grey
      const bgR = lerp(26, 36, v);
      const bgG = lerp(26, 42, v);
      const bgB = lerp(46, 64, v);

      // --- Knight silhouette (white) ---
      const knightAlpha = knightShape(u, v);

      // --- Small green arrow (bottom-right) ---
      const arrowAlpha = arrowShape(u, v);
      const arR = 98,
        arG = 200,
        arB = 60;

      // --- Composite layers: bg → knight → arrow ---
      let r = bgR,
        g = bgG,
        b = bgB,
        a = bgAlpha;

      const kA = knightAlpha * a;
      r = blend(r, 255, kA);
      g = blend(g, 255, kA);
      b = blend(b, 255, kA);

      const aA = arrowAlpha * a;
      r = blend(r, arR, aA);
      g = blend(g, arG, aA);
      b = blend(b, arB, aA);

      buf[idx] = clamp(r);
      buf[idx + 1] = clamp(g);
      buf[idx + 2] = clamp(b);
      buf[idx + 3] = clamp(a * 255);
    }
  }

  return encodePNG(buf, size, size);
}

/* ------------------------------------------------------------------ */
/*  Shape helpers                                                      */
/* ------------------------------------------------------------------ */

/** Smooth rounded rectangle SDF – returns 0..1 alpha. */
function roundedRect(u, v, x0, y0, x1, y1, r) {
  const cx = Math.max(x0 + r, Math.min(u, x1 - r));
  const cy = Math.max(y0 + r, Math.min(v, y1 - r));
  const d = Math.sqrt((u - cx) ** 2 + (v - cy) ** 2) - r;
  return smoothstep(0.015, -0.015, d);
}

/**
 * Knight chess piece silhouette – returns 0..1 alpha.
 * Built from overlapping ellipses / rects with smooth blending.
 */
function knightShape(u, v) {
  const kx = (u - 0.44) * 2.6;
  const ky = (v - 0.48) * 2.6;

  let a = 0;
  a = Math.max(a, ellipse(kx + 0.05, ky + 0.32, 0.24, 0.18)); // head
  a = Math.max(a, ellipse(kx + 0.28, ky + 0.22, 0.13, 0.1)); // snout
  a = Math.max(a, ellipse(kx - 0.05, ky + 0.48, 0.08, 0.12)); // ear
  a = Math.max(a, ellipse(kx + 0.05, ky + 0.05, 0.2, 0.3)); // neck
  a = Math.max(a, ellipse(kx + 0.0, ky - 0.22, 0.26, 0.18)); // body
  a = Math.max(a, pillShape(kx, ky - 0.42, 0.38, 0.08)); // base

  if (u < 0.12 || u > 0.78 || v < 0.08 || v > 0.88) a = 0;
  return clamp01(a);
}

/** Right-pointing arrow in the bottom-right corner – returns 0..1 alpha. */
function arrowShape(u, v) {
  const ax = (u - 0.78) / 0.14;
  const ay = (v - 0.82) / 0.14;

  let a = pillShape(ax + 0.15, ay, 0.55, 0.14); // shaft
  a = Math.max(
    a,
    pillShape(
      ax * Math.cos(0.55) - ay * Math.sin(0.55),
      ax * Math.sin(0.55) + ay * Math.cos(0.55) + 0.15,
      0.35,
      0.12,
    ),
  );
  a = Math.max(
    a,
    pillShape(
      ax * Math.cos(-0.55) - ay * Math.sin(-0.55),
      ax * Math.sin(-0.55) + ay * Math.cos(-0.55) - 0.15,
      0.35,
      0.12,
    ),
  );
  return clamp01(a);
}

/* ------------------------------------------------------------------ */
/*  Primitive SDF helpers                                              */
/* ------------------------------------------------------------------ */

function ellipse(x, y, rx, ry) {
  const d = (x / rx) ** 2 + (y / ry) ** 2;
  return smoothstep(1.08, 0.92, d);
}

function pillShape(x, y, w, h) {
  const dx = Math.max(0, Math.abs(x) - w);
  const dy = Math.max(0, Math.abs(y) - h);
  const d = Math.sqrt(dx * dx + dy * dy);
  return smoothstep(0.06, -0.02, d);
}

function smoothstep(edge0, edge1, x) {
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}
function blend(base, over, amt) {
  return base * (1 - amt) + over * amt;
}
function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}
function clamp(x) {
  return Math.max(0, Math.min(255, Math.round(x)));
}

/* ------------------------------------------------------------------ */
/*  PNG encoder (minimal, no dependencies)                             */
/* ------------------------------------------------------------------ */

function encodePNG(pixels, w, h) {
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    const off = y * (1 + w * 4);
    raw[off] = 0; // filter: None
    pixels.copy(raw, off + 1, y * w * 4, (y + 1) * w * 4);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  return Buffer.concat([
    sig,
    makeChunk("IHDR", writeIHDR(w, h)),
    makeChunk("IDAT", compressed),
    makeChunk("IEND", Buffer.alloc(0)),
  ]);
}

function writeIHDR(w, h) {
  const b = Buffer.alloc(13);
  b.writeUInt32BE(w, 0);
  b.writeUInt32BE(h, 4);
  b[8] = 8; // bit depth
  b[9] = 6; // RGBA
  b[10] = 0; // compression
  b[11] = 0; // filter
  b[12] = 0; // interlace
  return b;
}

function makeChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const tBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([tBuf, data])) >>> 0, 0);
  return Buffer.concat([len, tBuf, data, crcBuf]);
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let j = 0; j < 8; j++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

const SIZES = [16, 48, 128];
const outDir = path.join(__dirname, "icons");

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);

for (const size of SIZES) {
  const png = createIcon(size);
  const fp = path.join(outDir, `icon${size}.png`);
  fs.writeFileSync(fp, png);
  console.log(`  ok  icon${size}.png  (${png.length} bytes)`);
}

console.log("\nIcons generated successfully.");
