// Draws the toolbar icons (no dependencies): a blue rounded tile with three thread rows,
// each a dot and a line, the middle one indented like a reply. Writes extension/icons/*.png.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(__dirname, '..', 'extension', 'icons');
const BLUE = [11, 87, 208];
const WHITE = [255, 255, 255];

// Shapes in a 0..1 square. Each returns true when the point is inside.
function roundRect(x, y, x0, y0, x1, y1, r) {
  const cx = Math.min(Math.max(x, x0 + r), x1 - r);
  const cy = Math.min(Math.max(y, y0 + r), y1 - r);
  return (x - cx) ** 2 + (y - cy) ** 2 <= r * r && x >= x0 && x <= x1 && y >= y0 && y <= y1;
}
const circle = (x, y, cx, cy, r) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r;

const ROWS = [
  { y: 0.31, indent: 0, len: 0.5 },
  { y: 0.5, indent: 0.1, len: 0.4 },
  { y: 0.69, indent: 0, len: 0.34 }
];

function pixel(x, y) {
  if (!roundRect(x, y, 0.02, 0.02, 0.98, 0.98, 0.22)) return null;
  for (const r of ROWS) {
    const dx = 0.24 + r.indent;
    if (circle(x, y, dx, r.y, 0.055)) return WHITE;
    if (roundRect(x, y, dx + 0.11, r.y - 0.04, dx + 0.11 + r.len, r.y + 0.04, 0.04)) return WHITE;
  }
  return BLUE;
}

function png(size) {
  const SS = 4; // supersampling for smooth edges
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let py = 0; py < size; py++) {
    raw[py * (size * 4 + 1)] = 0;
    for (let px = 0; px < size; px++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = pixel((px + (sx + 0.5) / SS) / size, (py + (sy + 0.5) / SS) / size);
          if (c) { r += c[0]; g += c[1]; b += c[2]; a += 1; }
        }
      }
      const o = py * (size * 4 + 1) + 1 + px * 4;
      raw[o] = a ? Math.round(r / a) : 0;
      raw[o + 1] = a ? Math.round(g / a) : 0;
      raw[o + 2] = a ? Math.round(b / a) : 0;
      raw[o + 3] = Math.round((a / (SS * SS)) * 255);
    }
  }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

fs.mkdirSync(OUT, { recursive: true });
[16, 32, 48, 128].forEach((s) => fs.writeFileSync(path.join(OUT, `${s}.png`), png(s)));
console.log('Icons written to extension/icons/');
