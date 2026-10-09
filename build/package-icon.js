const fs = require('node:fs');
const path = require('node:path');

const pngPath = path.join(__dirname, 'icon.png');
const icoPath = path.join(__dirname, 'icon.ico');
const png = fs.readFileSync(pngPath);
const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

if (!png.subarray(0, 8).equals(pngSignature)) {
  throw new Error('The app icon source is not a PNG file.');
}

const width = png.readUInt32BE(16);
const height = png.readUInt32BE(20);
if (!width || !height || width > 256 || height > 256) {
  throw new Error('The app icon PNG must be between 1 and 256 pixels in each dimension.');
}

const header = Buffer.alloc(6);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);

const entry = Buffer.alloc(16);
entry.writeUInt8(width === 256 ? 0 : width, 0);
entry.writeUInt8(height === 256 ? 0 : height, 1);
entry.writeUInt16LE(1, 4);
entry.writeUInt16LE(32, 6);
entry.writeUInt32LE(png.length, 8);
entry.writeUInt32LE(header.length + entry.length, 12);

fs.writeFileSync(icoPath, Buffer.concat([header, entry, png]));