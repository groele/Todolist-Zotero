// Dependency-free generator for Todolist Academic icons
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SUPERSAMPLE = 4;

const SIZES = [16, 32, 48, 128];
const OUTPUT_DIRS = [
  path.join(ROOT, 'zotero', 'chrome', 'content', 'icons'),
  path.join(ROOT, 'images')
];

function roundedRectDist(px, py, rx, ry, rw, rh, rad) {
  const cx = rx + rw / 2;
  const cy = ry + rh / 2;
  const dx = Math.abs(px - cx) - (rw / 2 - rad);
  const dy = Math.abs(py - cy) - (rh / 2 - rad);
  const outside = Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) - rad;
  const inside = Math.min(Math.max(dx, dy), 0) - rad;
  return dx > 0 || dy > 0 ? outside : inside;
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

function sampleMark(x, y) {
  // 1. Academic Ribbon (Amber Gold) at top right
  if (x >= 0.63 && x <= 0.81 && y >= 0.12 && y <= 0.38) {
    const isInsideNotch = y > 0.31 && Math.abs(x - 0.72) < (0.38 - y);
    if (!isInsideNotch) {
      return [245, 158, 11, 255]; // #f59e0b
    }
  }

  // 2. Binder Clamp at top
  const clampDist = roundedRectDist(x, y, 0.34, 0.05, 0.32, 0.13, 0.04);
  if (clampDist <= 0) {
    // Inner clamp hole
    if (Math.hypot(x - 0.5, y - 0.115) < 0.032) {
      return [255, 255, 255, 255];
    }
    return [4, 120, 87, 255]; // #047857
  }

  // 3. Main Board
  const boardDist = roundedRectDist(x, y, 0.14, 0.13, 0.72, 0.78, 0.11);
  if (boardDist <= 0) {
    // Board outline
    if (boardDist > -0.045) {
      return [5, 150, 105, 255]; // #059669
    }

    // Hero Checkmark ✓ (Task 1)
    const checkD1 = distToSegment(x, y, 0.25, 0.36, 0.36, 0.47);
    const checkD2 = distToSegment(x, y, 0.36, 0.47, 0.57, 0.24);
    if (Math.min(checkD1, checkD2) < 0.045) {
      return [16, 185, 129, 255]; // #10b981
    }

    // Task 1 completed line
    if (distToSegment(x, y, 0.62, 0.36, 0.77, 0.36) < 0.028) {
      return [148, 163, 184, 255]; // #94a3b8
    }

    // Task 2 Checkbox (In progress)
    const box2Dist = roundedRectDist(x, y, 0.26, 0.52, 0.13, 0.13, 0.03);
    if (box2Dist <= 0 && box2Dist > -0.035) {
      return [5, 150, 105, 255]; // #059669
    }

    // Task 2 title line
    if (distToSegment(x, y, 0.48, 0.585, 0.77, 0.585) < 0.032) {
      return [30, 41, 59, 255]; // #1e293b
    }

    // Task 3 Checkbox (Pending)
    const box3Dist = roundedRectDist(x, y, 0.26, 0.71, 0.13, 0.13, 0.03);
    if (box3Dist <= 0 && box3Dist > -0.03) {
      return [148, 163, 184, 255]; // #94a3b8
    }

    // Task 3 title line
    if (distToSegment(x, y, 0.48, 0.775, 0.68, 0.775) < 0.028) {
      return [148, 163, 184, 255]; // #94a3b8
    }

    // Board background (white)
    return [255, 255, 255, 255];
  }

  // Outside
  return [0, 0, 0, 0];
}

function makePNG(size) {
  const scale = SUPERSAMPLE;
  const highSize = size * scale;
  const high = Buffer.alloc(highSize * highSize * 4);

  for (let y = 0; y < highSize; y++) {
    for (let x = 0; x < highSize; x++) {
      const pixel = sampleMark((x + 0.5) / highSize, (y + 0.5) / highSize);
      const offset = (y * highSize + x) * 4;
      for (let channel = 0; channel < 4; channel++) high[offset + channel] = pixel[channel];
    }
  }

  const scanlineLength = 1 + size * 4;
  const raw = Buffer.alloc(scanlineLength * size);
  for (let y = 0; y < size; y++) {
    const rowOffset = y * scanlineLength;
    raw[rowOffset] = 0;
    for (let x = 0; x < size; x++) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < scale; sy++) {
        for (let sx = 0; sx < scale; sx++) {
          const source = (((y * scale + sy) * highSize) + x * scale + sx) * 4;
          for (let channel = 0; channel < 4; channel++) sum[channel] += high[source + channel];
        }
      }
      const samples = scale * scale;
      const alpha = Math.round(sum[3] / samples);
      const rgb = sum[3] > 0
        ? sum.slice(0, 3).map(value => Math.round(value / sum[3] * 255))
        : [0, 0, 0];
      const target = rowOffset + 1 + x * 4;
      raw[target] = rgb[0];
      raw[target + 1] = rgb[1];
      raw[target + 2] = rgb[2];
      raw[target + 3] = alpha;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', zlib.deflateSync(raw)),
    makeChunk('IEND', Buffer.alloc(0)),
  ]);
}

function makeChunk(type, data) {
  const buffer = Buffer.alloc(12 + data.length);
  buffer.writeUInt32BE(data.length, 0);
  buffer.write(type, 4);
  data.copy(buffer, 8);
  buffer.writeUInt32BE(crc32(buffer.subarray(4, 8 + data.length)), 8 + data.length);
  return buffer;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = (crc >>> 8) ^ CRC_TABLE[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

const CRC_TABLE = new Uint32Array(256);
for (let index = 0; index < 256; index++) {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  CRC_TABLE[index] = value >>> 0;
}

for (const outDir of OUTPUT_DIRS) {
  fs.mkdirSync(outDir, { recursive: true });
  for (const size of SIZES) {
    const pngBuffer = makePNG(size);
    // Write naming variations
    const name1 = `icon${size}.png`;
    const name2 = `icon-${size}.png`;
    fs.writeFileSync(path.join(outDir, name1), pngBuffer);
    fs.writeFileSync(path.join(outDir, name2), pngBuffer);
    console.log(`✅ Generated ${path.relative(ROOT, outDir)}/${name1} (${size}x${size})`);
  }
}
