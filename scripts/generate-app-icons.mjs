import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = fileURLToPath(new URL('../', import.meta.url));
const master = path.join(root, 'store-assets/app-icon-master.png');
const branding = path.join(root, 'assets/branding');
const res = path.join(root, 'android/app/src/main/res');

function artwork(size) {
  return sharp(master).resize(size, size, { kernel: 'lanczos3' }).toColourspace('srgb');
}

function maskedIcon(size, radius) {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${radius}"/></svg>`);
  return artwork(size).ensureAlpha().composite([{ input: mask, blend: 'dest-in' }]).png();
}

export async function generateIosIcon() {
  await artwork(1024).removeAlpha().withIccProfile('srgb').png({ compressionLevel: 9 })
    .toFile(path.join(root, 'ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png'));
}

export async function generateAppIcons() {
  await generateIosIcon();
  await artwork(512).withIccProfile('srgb').ensureAlpha().png({ compressionLevel: 9 })
    .toFile(path.join(root, 'store-assets/google-play/app-icon-512x512.png'));
  for (const [filename, size] of [['temple-favicon.png', 48], ['temple-icon-192.png', 192], ['tu-tap-logo.png', 512]]) {
    await maskedIcon(size, size * 0.23).toFile(path.join(branding, filename));
  }
  // The home screen applies its own mask to the opaque square.
  await artwork(512).removeAlpha().png({ compressionLevel: 9 }).toFile(path.join(branding, 'temple-maskable-512.png'));
  for (const [density, scale] of Object.entries({ mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 })) {
    const directory = path.join(res, `mipmap-${density}`);
    const legacySize = 48 * scale;
    await maskedIcon(legacySize, legacySize * 0.23).toFile(path.join(directory, 'ic_launcher.png'));
    await maskedIcon(legacySize, legacySize / 2).toFile(path.join(directory, 'ic_launcher_round.png'));

    // Android displays the middle 72dp of a 108dp layer. Continue the foliage into the motion inset.
    const inset = 18 * scale;
    await artwork(72 * scale).extend({ top: inset, right: inset, bottom: inset, left: inset, extendWith: 'mirror' })
      .png().toFile(path.join(directory, 'ic_launcher_foreground.png'));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await generateAppIcons();
