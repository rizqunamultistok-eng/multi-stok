import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const publicDir = path.resolve('public');
if (!fs.existsSync(publicDir)) fs.mkdirSync(publicDir, { recursive: true });

const sourceImage = path.join(publicDir, 'icon.jpg');
const background = '#fbf9fb';

async function renderSquare(size) {
  return sharp(sourceImage)
    .rotate()
    .resize(size, size, { fit: 'contain', background })
    .flatten({ background })
    .png()
    .toBuffer();
}

async function generate() {
  await sharp(await renderSquare(192)).toFile(path.join(publicDir, 'pwa-192x192.png'));
  await sharp(await renderSquare(512)).toFile(path.join(publicDir, 'pwa-512x512.png'));
  await sharp(await renderSquare(180)).toFile(path.join(publicDir, 'apple-touch-icon.png'));
  await sharp(await renderSquare(32)).toFile(path.join(publicDir, 'favicon.ico'));

  const maskableForeground = await sharp(sourceImage)
    .rotate()
    .resize(410, 410, { fit: 'contain', background })
    .flatten({ background })
    .png()
    .toBuffer();
  await sharp({
    create: { width: 512, height: 512, channels: 3, background },
  })
    .composite([{ input: maskableForeground, left: 51, top: 51 }])
    .png()
    .toFile(path.join(publicDir, 'pwa-maskable-512x512.png'));

  console.log('All app icons generated from public/icon.jpg.');
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
