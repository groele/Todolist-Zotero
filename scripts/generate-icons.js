// Dependency-free generator for Todolist Academic icons (Minimalist, spacious, native aesthetic)
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
  // 1. Academic Ribbon (Amber Gold #f59e0b) at top right: x in [0.625, 0.792], y in [0.104, 0.342]
  if (x >= 0.625 && x <= 0.792 && y >= 0.104 && y <= 0.342) {
    const isInsideNotch = y > 0.29 && Math.abs(x - 0.708) < (0.342 - y);
    if (!isInsideNotch) {
      return [245, 158, 11, 255]; // #f59e0b
    }
  }

  // 2. Card Body (Spacious rounded sheet)
  const cardDist = roundedRectDist(x, y, 0.104, 0.104, 0.792, 0.792, 0.175);
  if (cardDist <= 0) {
    // Card border
    if (cardDist > -0.075) {
      return [5, 150, 105, 255]; // #059669
    }

    // Row 1: Hero Checkmark ✓ (Bold & Crisp)
    const check1 = distToSegment(x, y, 0.25, 0.417, 0.354, 0.521);
    const check2 = distToSegment(x, y, 0.354, 0.521, 0.55, 0.3);
    if (Math.min(check1, check2) < 0.05) {
      return [5, 150, 105, 255]; // #059669
    }

    // Row 1: Task completed line
    if (distToSegment(x, y, 0.604, 0.417, 0.758, 0.417) < 0.042) {
      return [148, 163, 184, 255]; // #94a3b8
    }

    // Row 2: Checkbox (square rx=0.04)
    const boxDist = roundedRectDist(x, y, 0.258, 0.604, 0.15, 0.15, 0.042);
    if (boxDist <= 0 && boxDist > -0.067) {
      return [5, 150, 105, 255]; // #059669
    }

    // Row 2: Active task title line
    if (distToSegment(x, y, 0.5, 0.679, 0.758, 0.679) < 0.042) {
      return [30, 41, 59, 255]; // #1e293b
    }

    // Clean white interior
    return [255, 255, 255, 255];
  }

  // Transparent outside
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
    const name1 = `icon${size}.png`;
    const name2 = `icon-${size}.png`;
    fs.writeFileSync(path.join(outDir, name1), pngBuffer);
    fs.writeFileSync(path.join(outDir, name2), pngBuffer);
    console.log(`✅ Generated ${path.relative(ROOT, outDir)}/${name1} (${size}x${size})`);
  }
}
