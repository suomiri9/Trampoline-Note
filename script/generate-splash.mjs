/**
 * Regenerate the iOS launch/splash images as PLAIN SOLID PNGs in the app's
 * dark background color. They are intentionally featureless (see the comment
 * in client/index.html): iOS shows them for a blink before the pre-React
 * boot splash takes over, so all that matters is that the color matches the
 * boot background exactly. Sizes are derived from the existing filenames
 * (launch-<W>x<H>.png).
 *
 * Run after changing the dark background token: `node script/generate-splash.mjs`
 */
import { readdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";

// Intent dark background: hsl(0 0% 2%) = #050505 (keep in sync with
// client/index.html's pre-paint background + meta theme-color).
const COLOR = [0x05, 0x05, 0x05];

const dir = resolve(dirname(fileURLToPath(import.meta.url)), "../client/public/splash");

const CRC_TABLE = new Int32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
}
function solidPng(w, h, [r, g, b]) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor RGB
  const row = Buffer.alloc(1 + w * 3); // filter byte 0 + pixels
  for (let x = 0; x < w; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.alloc(row.length * h);
  for (let y = 0; y < h; y++) row.copy(raw, y * row.length);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

let count = 0;
for (const name of readdirSync(dir)) {
  const m = name.match(/^launch-(\d+)x(\d+)\.png$/);
  if (!m) continue;
  const [w, h] = [Number(m[1]), Number(m[2])];
  writeFileSync(resolve(dir, name), solidPng(w, h, COLOR));
  count++;
}
console.log(`Regenerated ${count} splash images at #${COLOR.map((c) => c.toString(16).padStart(2, "0")).join("")}`);
