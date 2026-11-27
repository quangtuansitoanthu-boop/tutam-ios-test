import sharp from 'sharp';
import fs from 'fs';
import path from 'path';
import { generateIosIcon } from './generate-app-icons.mjs';

const MARK = path.resolve('assets/branding/lotus-mark.png');
const IOS_SPLASH_DIR = path.resolve('ios/App/App/Assets.xcassets/Splash.imageset');

async function syncIosAssets() {
  console.log('--- Generating iOS AppIcon (1024x1024) ---');
  await generateIosIcon();
  console.log('✓ iOS AppIcon-512@2x.png updated');

  console.log('--- Generating iOS Universal Splash (2732x2732) ---');
  const size = 2732;
  const logoSize = Math.round(size * 0.35); // ~956px
  const logoBuffer = await sharp(MARK)
    .resize(logoSize, logoSize, { kernel: sharp.kernel.lanczos3 })
    .png()
    .toBuffer();

  // UIKit shows this image before the app can read its selected language.
  const logoTop = Math.round((size - logoSize) / 2);
  const logoLeft = Math.round((size - logoSize) / 2);

  const bgSvg = Buffer.from(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <radialGradient id="grad" cx="50%" cy="48%" r="70%">
          <stop offset="0%" stop-color="#FFFDF9" />
          <stop offset="50%" stop-color="#FAF1E3" />
          <stop offset="100%" stop-color="#EFE0CA" />
        </radialGradient>
      </defs>
      <rect width="${size}" height="${size}" fill="url(#grad)" />
    </svg>
  `);

  const splashBuffer = await sharp(bgSvg)
    .composite([{ input: logoBuffer, left: logoLeft, top: logoTop }])
    .png()
    .toBuffer();

  for (const name of ['splash-2732x2732.png', 'splash-2732x2732-1.png', 'splash-2732x2732-2.png']) {
    fs.writeFileSync(path.join(IOS_SPLASH_DIR, name), splashBuffer);
    console.log(`✓ Updated iOS splash: ${name}`);
  }
}

syncIosAssets().catch(err => {
  console.error(err);
  process.exit(1);
});
