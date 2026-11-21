/** Generates the PWA icons (public/icons/*.png) from BRAND colours: a plate with an amber savings ring on a green tile. No deps. */
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { BRAND } from '../lib/brand';

const hex = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)) as [number, number, number];
const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc = (b: Buffer) => {
  let c = 0xffffffff;
  for (const x of b) c = crcTable[(c ^ x) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type: string, data: Buffer) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
};

function png(size: number, maskable: boolean): Buffer {
  const bg = hex(BRAND.colors.primary);
  const ring = hex(BRAND.colors.savings); // amber savings signature (THEME §6.2)
  const white = hex(BRAND.colors.surface);
  const raw = Buffer.alloc((size * 3 + 1) * size);
  const c = size / 2;
  const scale = maskable ? 0.62 : 0.8; // maskable icons keep the art inside the safe zone
  const rOuter = (size / 2) * scale;
  const rInner = rOuter * 0.72;
  const rDot = rOuter * 0.18;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
      const px = d <= rDot ? ring : d <= rInner ? white : d <= rOuter ? ring : bg;
      raw.set(px, y * (size * 3 + 1) + 1 + x * 3);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

for (const [name, size, mask] of [['icon-192.png', 192, false], ['icon-512.png', 512, false], ['maskable-512.png', 512, true], ['apple-touch-icon.png', 180, false]] as const) {
  writeFileSync(`public/icons/${name}`, png(size, mask));
}
console.log('icons written');
