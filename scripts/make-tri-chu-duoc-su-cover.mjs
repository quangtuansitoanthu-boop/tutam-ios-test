import { chromium } from '@playwright/test';
import sharp from 'sharp';
import fs from 'fs';
import path from 'path';

async function renderCover() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1024, height: 1536 } });

  const baseImage = fs.readFileSync('output/clean-base-duoc-su.png').toString('base64');

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700;800;900&display=swap" rel="stylesheet">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        width: 1024px;
        height: 1536px;
        position: relative;
        overflow: hidden;
        background: #01183d;
      }
      .bg {
        position: absolute;
        top: 0;
        left: 0;
        width: 1024px;
        height: 1536px;
        z-index: 1;
      }
      .title-container {
        position: absolute;
        top: 135px;
        left: 80px;
        width: 864px;
        height: 360px;
        z-index: 10;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        text-align: center;
      }
      .line-prefix {
        font-family: 'Playfair Display', serif;
        font-size: 68px;
        font-weight: 800;
        letter-spacing: 0.12em;
        text-transform: uppercase;
        background: linear-gradient(180deg, #fceda2 0%, #f6cb59 40%, #e0a32e 80%, #b87910 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 4px 6px rgba(0, 8, 20, 0.95)) drop-shadow(0 2px 3px rgba(0, 0, 0, 0.8));
        line-height: 1.18;
        margin-bottom: 6px;
      }
      .line-main {
        font-family: 'Playfair Display', serif;
        font-size: 136px;
        font-weight: 800;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        background: linear-gradient(180deg, #fceda2 0%, #f6cb59 40%, #e0a32e 80%, #b87910 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 6px 12px rgba(0, 8, 20, 0.95)) drop-shadow(0 2px 4px rgba(0, 0, 0, 0.8));
        line-height: 1.1;
      }
    </style>
  </head>
  <body>
    <img class="bg" src="data:image/png;base64,${baseImage}" />
    <div class="title-container">
      <div class="line-prefix">NGHI THỨC</div>
      <div class="line-prefix">TRÌ CHÚ</div>
      <div class="line-main">DƯỢC SƯ</div>
    </div>
  </body>
  </html>
  `;

  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const buffer = await page.screenshot({ type: 'png' });
  await browser.close();

  fs.writeFileSync('output/cover-nghi-thuc-tri-chu-duoc-su.png', buffer);

  const destinations = ['static', 'build', 'android/app/src/main/assets/public', 'ios/App/App/public'].filter(fs.existsSync);
  const filename = 'tu-tap-nghi-thuc-tri-chu-duoc-su-20261123.webp';

  const webpBuffer = await sharp(buffer)
    .resize(480, 720, { fit: 'fill' })
    .webp({ quality: 80, effort: 5 })
    .toBuffer();

  for (const dir of destinations) {
    fs.mkdirSync(path.join(dir, 'covers'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'covers', filename), webpBuffer);
  }

  console.log('Generated and written:', filename, 'to destinations:', destinations);
}

renderCover().catch(console.error);
