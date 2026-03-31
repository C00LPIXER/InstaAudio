// Creates PNG icons from SVG using Node.js built-in features
// PNG generation without external deps - creates a simple gradient icon

const fs = require("fs");
const { execSync } = require("child_process");

// Minimal PNG encoder (uncompressed, no dependencies)
function createPNG(size, pixels) {
  const zlib = require("zlib");

  // Add filter byte (0 = None) to each row
  const rawData = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    rawData[y * (size * 4 + 1)] = 0; // filter: None
    for (let x = 0; x < size; x++) {
      const srcIdx = (y * size + x) * 4;
      const dstIdx = y * (size * 4 + 1) + 1 + x * 4;
      rawData[dstIdx] = pixels[srcIdx];     // R
      rawData[dstIdx + 1] = pixels[srcIdx + 1]; // G
      rawData[dstIdx + 2] = pixels[srcIdx + 2]; // B
      rawData[dstIdx + 3] = pixels[srcIdx + 3]; // A
    }
  }

  const compressed = zlib.deflateSync(rawData);

  // Build PNG file
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeB = Buffer.from(type);
    const crcData = Buffer.concat([typeB, data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(crcData) >>> 0);
    return Buffer.concat([len, typeB, data, crc]);
  }

  // CRC32
  function crc32(buf) {
    let c = 0xFFFFFFFF;
    const table = [];
    for (let n = 0; n < 256; n++) {
      let k = n;
      for (let i = 0; i < 8; i++) k = k & 1 ? 0xEDB88320 ^ (k >>> 1) : k >>> 1;
      table[n] = k;
    }
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return c ^ 0xFFFFFFFF;
  }

  // IHDR
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);  // width
  ihdr.writeUInt32BE(size, 4);  // height
  ihdr[8] = 8;  // bit depth
  ihdr[9] = 6;  // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  const iend = Buffer.alloc(0);

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", compressed),
    chunk("IEND", iend),
  ]);
}

function renderIcon(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const r = size * 0.22; // corner radius

  function isInRoundedRect(x, y, s, radius) {
    if (x >= radius && x <= s - radius) return true;
    if (y >= radius && y <= s - radius) return true;
    // Check corners
    const corners = [
      [radius, radius],
      [s - radius, radius],
      [radius, s - radius],
      [s - radius, s - radius],
    ];
    for (const [cx, cy] of corners) {
      const dx = x - cx, dy = y - cy;
      if (dx * dx + dy * dy <= radius * radius) return true;
    }
    return false;
  }

  function lerp(a, b, t) { return a + (b - a) * t; }

  // Gradient colors
  const c1 = [0, 149, 246]; // #0095f6
  const c2 = [131, 58, 180]; // #833ab4

  // Mic parameters (centered)
  const cx = size / 2, cy = size / 2;
  const micW = size * 0.18, micH = size * 0.30;
  const micR = micW / 2;
  const micTop = cy - size * 0.2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      if (!isInRoundedRect(x, y, size, r)) {
        pixels[idx] = 0;
        pixels[idx + 1] = 0;
        pixels[idx + 2] = 0;
        pixels[idx + 3] = 0;
        continue;
      }

      // Background gradient (top-left to bottom-right)
      const t = (x + y) / (2 * size);
      let pr = lerp(c1[0], c2[0], t);
      let pg = lerp(c1[1], c2[1], t);
      let pb = lerp(c1[2], c2[2], t);

      // Draw mic body (rounded rectangle / capsule)
      const mx = x - cx, my = y - micTop - micH / 2;
      const inMicBody =
        Math.abs(mx) <= micW / 2 &&
        my >= -micH / 2 && my <= micH / 2 &&
        (Math.abs(my) <= micH / 2 - micR || mx * mx + Math.pow(Math.abs(my) - (micH / 2 - micR), 2) <= micR * micR);

      // Arc around mic
      const arcCy = micTop + micH * 0.65;
      const arcR = size * 0.17;
      const arcDist = Math.sqrt((x - cx) * (x - cx) + (y - arcCy) * (y - arcCy));
      const arcThick = Math.max(1, size * 0.03);
      const inArc = Math.abs(arcDist - arcR) < arcThick && y > arcCy;

      // Stem
      const stemTop = arcCy + arcR;
      const stemBot = stemTop + size * 0.1;
      const stemThick = Math.max(1, size * 0.025);
      const inStem = Math.abs(x - cx) < stemThick && y >= stemTop && y <= stemBot;

      // Base
      const baseW = size * 0.1;
      const inBase = Math.abs(x - cx) <= baseW && Math.abs(y - stemBot) < stemThick;

      // Download arrow (bottom-right)
      const ax = cx + size * 0.22, ay = cy + size * 0.18;
      const arrowThick = Math.max(1, size * 0.025);
      const inArrowStem = Math.abs(x - ax) < arrowThick && y >= ay - size * 0.08 && y <= ay + size * 0.02;
      const inArrowHead = y >= ay - size * 0.01 && y <= ay + size * 0.05 &&
        Math.abs(x - ax) < (size * 0.05) * (1 - (y - ay) / (size * 0.05));

      if (inMicBody || inArc || inStem || inBase || inArrowStem || inArrowHead) {
        pr = 255;
        pg = 255;
        pb = 255;
      }

      pixels[idx] = Math.round(pr);
      pixels[idx + 1] = Math.round(pg);
      pixels[idx + 2] = Math.round(pb);
      pixels[idx + 3] = 255;
    }
  }

  return pixels;
}

// Generate all sizes
[16, 48, 128].forEach((size) => {
  const pixels = renderIcon(size);
  const png = createPNG(size, pixels);
  const path = "c:/Users/HP/Downloads/InstaAudio/icons/icon-" + size + ".png";
  fs.writeFileSync(path, png);
  console.log("Created " + path + " (" + png.length + " bytes)");
});

console.log("Done! All PNG icons generated.");
