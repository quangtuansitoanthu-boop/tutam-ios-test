import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const { chromium, expect } = require('@playwright/test');

const packageId = 'vn.quangtu.tutam';
const serial = process.env.ANDROID_SERIAL || 'emulator-5554';
const adbExecutable = 'C:\\Users\\Admin\\AppData\\Local\\Android\\Sdk\\platform-tools\\adb.exe';
const cdpPort = process.env.CDP_PORT || '9223';
const evidenceDir = path.resolve('build/android-device-evidence/manual-full-test');

await fs.mkdir(evidenceDir, { recursive: true });

const outcomes = [];
const pageErrors = [];
const consoleErrors = [];
let browser;
let page;

const adb = (...args) => {
  const result = spawnSync(adbExecutable, ['-s', serial, ...args], {
    timeout: 45_000,
    maxBuffer: 12 * 1024 * 1024,
    shell: true
  });
  if (result.status !== 0) {
    throw new Error('adb ' + args.slice(0, 3).join(' ') + ': ' + (result.stderr?.toString() || result.stdout?.toString()));
  }
  return result.stdout;
};

const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function captureEvidence(stepName) {
  await fs.mkdir(evidenceDir, { recursive: true });
  const nativeShot = adb('exec-out', 'screencap', '-p');
  await fs.writeFile(path.join(evidenceDir, `${stepName}-native.png`), nativeShot);
  if (page && !page.isClosed()) {
    try {
      await page.screenshot({ path: path.join(evidenceDir, `${stepName}-webview.png`) });
    } catch (e) {
      console.warn(`Webview screenshot skipped for ${stepName}: ${e.message}`);
    }
  }
}

async function connectToApp() {
  console.log(`Connecting to ${packageId} on port ${cdpPort}...`);
  let pid;
  for (let attempt = 0; attempt < 30; attempt++) {
    const res = spawnSync(adbExecutable, ['-s', serial, 'shell', 'pidof', '-s', packageId], { shell: true });
    pid = res.stdout?.toString().trim();
    if (/^\d+$/.test(pid || '')) {
      const sockets = adb('shell', 'cat', '/proc/net/unix').toString();
      if (sockets.includes('webview_devtools_remote_' + pid)) {
        break;
      }
    }
    await pause(500);
  }
  if (!/^\d+$/.test(pid || '')) {
    throw new Error(`Cannot find running PID for ${packageId}`);
  }
  console.log(`Found PID: ${pid}`);

  adb('forward', `tcp:${cdpPort}`, `localabstract:webview_devtools_remote_${pid}`);

  let lastError;
  for (let attempt = 0; attempt < 30; attempt++) {
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`, { timeout: 5000, noDefaults: true });
      break;
    } catch (err) {
      lastError = err;
      await pause(500);
    }
  }
  if (!browser) throw lastError || new Error('CDP connection failed');

  const contexts = browser.contexts();
  if (!contexts.length) throw new Error('No CDP context found');
  const context = contexts[0];

  for (let attempt = 0; attempt < 40; attempt++) {
    page = context.pages().find((p) => p.url().startsWith('https://localhost'));
    if (page) break;
    await pause(500);
  }
  if (!page) throw new Error('Page with url https://localhost not found');

  page.setDefaultTimeout(20_000);
  page.on('pageerror', (err) => {
    console.error(`[PAGE ERROR]: ${err.message}`);
    pageErrors.push({ time: new Date().toISOString(), message: err.message, stack: err.stack });
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.warn(`[CONSOLE ERROR]: ${msg.text()}`);
      consoleErrors.push({ time: new Date().toISOString(), text: msg.text() });
    }
  });

  console.log(`Connected to page: ${page.url()}`);
}

async function runStep(stepName, fn) {
  console.log(`\n========================================`);
  console.log(`RUNNING STEP: ${stepName}`);
  console.log(`========================================`);
  const start = Date.now();
  try {
    await fn();
    await captureEvidence(stepName);
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`>>> SUCCESS: ${stepName} (${duration}s)`);
    outcomes.push({ name: stepName, status: 'PASS', duration: `${duration}s` });
  } catch (error) {
    const duration = ((Date.now() - start) / 1000).toFixed(1);
    console.error(`>>> FAILED: ${stepName} (${duration}s)`, error);
    outcomes.push({ name: stepName, status: 'FAIL', duration: `${duration}s`, error: error.message });
    try {
      await captureEvidence(`${stepName}-FAILURE`);
    } catch (e) {}
    throw error;
  }
}

async function navigateViaFooter(tabName) {
  const footer = page.getByRole('navigation', { name: /Điều hướng nhanh|Quick navigation/u });
  await expect(footer).toBeVisible({ timeout: 10_000 });
  const link = footer.getByRole('link', { name: tabName, exact: true });
  await expect(link).toBeVisible({ timeout: 5000 });
  await link.click();
  await pause(1000);
}

function pressAndroidBack() {
  adb('shell', 'input', 'keyevent', '4');
}

let mainFailure = null;

try {
  await connectToApp();

  // Reset về trang chủ để bắt đầu kiểm thử sạch
  console.log('Navigating to root homepage https://localhost/ ...');
  await page.goto('https://localhost/');
  await pause(1500);

  // 1. TRANG CHỦ
  await runStep('01-trang-chu', async () => {
    const logoOrTitle = page.getByRole('link', { name: /Tu Tập Phật Pháp/u }).first();
    await expect(logoOrTitle).toBeVisible({ timeout: 15_000 });

    const laterBtn = page.getByRole('button', { name: 'Để sau', exact: true }).filter({ visible: true });
    if (await laterBtn.count()) {
      await laterBtn.first().click();
      await pause(500);
    }

    // Kiểm tra Lịch Phật giáo
    const calendar = page.getByRole('region', { name: 'Lịch Phật giáo', exact: true });
    await expect(calendar).toBeVisible();
    await expect(calendar.getByText('Lịch Phật giáo', { exact: true })).toBeVisible();

    // Thử tương tác chuyển ngày
    const nextDayBtn = calendar.getByRole('button', { name: /ngày tiếp theo|tiếp/i }).or(calendar.locator('button.nav-btn--next'));
    if (await nextDayBtn.count()) {
      await nextDayBtn.first().click();
      await pause(500);
    }

    // Kiểm tra Cổng tu tập
    const practicePortals = page.locator('.core-portals-grid, .practice-portals');
    if (await practicePortals.count()) {
      await expect(practicePortals.first()).toBeVisible();
    }
  });

  // 2. KINH SÁCH & READER VIEW
  await runStep('02-kinh-sach-search-and-reader', async () => {
    await navigateViaFooter('Kinh sách');
    await pause(1500);

    const searchBox = page.getByRole('searchbox', { name: 'Tìm kiếm bài viết', exact: true });
    await expect(searchBox).toBeVisible();
    await searchBox.fill('Kinh Dia Tang');
    await pause(800);

    const readBtn = page.getByRole('button', { name: /Đọc ngay Kinh Địa Tạng/u }).first();
    await expect(readBtn).toBeVisible();
    await readBtn.click();
    await pause(1000);

    // Mở chương đầu tiên
    const chapterBtn = page.getByRole('button', { name: /Duyên Khởi Của Pháp Hội Giảng Kinh/u }).filter({ visible: true }).first();
    await expect(chapterBtn).toBeVisible();
    await chapterBtn.click();
    await pause(1000);

    // Reader view xuất hiện
    const readerContent = page.locator('.reader-content');
    await expect(readerContent).toBeVisible();
    await expect(readerContent).toContainText('Tất cả mọi nơi đều là đạo tràng');

    // Chỉnh cỡ chữ
    const biggerFontBtn = page.getByRole('button', { name: 'Chữ lớn hơn', exact: true });
    await biggerFontBtn.click();
    await pause(500);
    const fontSize = page.locator('.reader-modal .reader-top-font-size');
    await expect(fontSize).toHaveText(/\d+px/);
    const sizeText = await fontSize.textContent();
    console.log(`Current font size in reader: ${sizeText}`);
  });

  // 3. ANDROID BACK BUTTON TRONG READER
  await runStep('03-reader-android-back-button', async () => {
    pressAndroidBack();
    await pause(1000);

    // Kiểm tra modal reader đóng, thấy kệ "LẦN TRƯỚC BẠN ĐANG ĐỌC"
    await expect(page.getByText('LẦN TRƯỚC BẠN ĐANG ĐỌC', { exact: true })).toBeVisible();

    pressAndroidBack();
    await pause(1000);
    await expect(page.getByRole('button', { name: /Đọc ngay Kinh Địa Tạng/u }).first()).toBeVisible();
  });

  // 4. PHÁP THOẠI
  await runStep('04-phap-thoai-catalog', async () => {
    await navigateViaFooter('Pháp thoại');
    await pause(2000);

    // Kiểm tra trang Pháp thoại đã nạp
    const pageHeading = page.getByRole('heading', { name: /Pháp thoại/i }).or(page.locator('.talks-header, .page-header'));
    await expect(pageHeading.first()).toBeVisible();

    // Thử tương tác tìm kiếm hoặc xem danh mục
    const talkSearch = page.getByPlaceholder(/Tìm bài giảng|Tìm kiếm/i);
    if (await talkSearch.count()) {
      await talkSearch.first().fill('Vô Thường');
      await pause(800);
      await talkSearch.first().fill('');
    }
  });

  // 5. TU TẬP - LẦN CHUỖI HẠT
  await runStep('05-tu-tap-chuoi-hat', async () => {
    await navigateViaFooter('Tu tập');
    await pause(1500);

    const chuoiCard = page.locator('button.tt-mode-card--chuoi');
    await expect(chuoiCard).toBeVisible();
    await chuoiCard.click();
    await pause(1000);

    const startBtn = page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true });
    await expect(startBtn).toBeVisible();
    await startBtn.click();
    await pause(800);

    // Xác nhận bộ đếm
    await expect(page.getByText(/(\d+)\/108/)).toBeVisible();

    // Bấm niệm 2 hạt
    const countBtn = page.getByRole('button', { name: 'Niệm một hạt', exact: true });
    await countBtn.click();
    await pause(300);
    await countBtn.click();
    await pause(300);

    // Bấm Back native xem quay lại danh mục tu tập
    pressAndroidBack();
    await pause(1000);
    await expect(page.getByText('Chế Độ Tu Tập', { exact: true })).toBeVisible();

    // Vào lại chuỗi hạt xem tiến độ còn lưu không
    await page.locator('button.tt-mode-card--chuoi').click();
    await pause(500);
    await page.getByRole('button', { name: 'Bắt đầu 🙏', exact: true }).click();
    await pause(500);
    await expect(page.getByText(/(\d+)\/108/)).toBeVisible();

    pressAndroidBack();
    await pause(500);
  });

  // 6. TU TẬP - CHÉP KINH
  await runStep('06-tu-tap-chep-kinh', async () => {
    await page.goto('https://localhost/tu-tap/chep-kinh');
    await page.waitForLoadState('domcontentloaded');
    await pause(1500);

    const book = page.locator('nav.books button').filter({ hasText: /Kinh Địa Tạng Bồ Tát Bổn Nguyện/u });
    await expect(book).toHaveCount(1);
    await book.click();
    await pause(1000);

    const guideConfirm = page.getByTestId('confirm-copying-guide');
    if (await guideConfirm.count() && await guideConfirm.isVisible()) {
      await guideConfirm.click();
      await pause(800);
    }

    const editor = page.getByRole('textbox', { name: 'Tự gõ bản chép của bạn', exact: true });
    await expect(editor).toBeVisible();
    await editor.click();
    await page.keyboard.press('Control+A');
    await page.keyboard.press('Backspace');
    await pause(400);
    await editor.click();
    await page.keyboard.type('NAM MO A DI DA PHAT', { delay: 60 });
    await pause(500);
    await expect(editor).toContainText('NAM MO A DI DA PHAT');
  });

  // 7. CÁ NHÂN & CÀI ĐẶT DARK MODE
  await runStep('07-ca-nhan-dark-mode-toggle', async () => {
    await page.goto('https://localhost/ca-nhan');
    await page.waitForLoadState('domcontentloaded');
    await pause(1500);

    const settingsBtn = page.getByRole('button', { name: /^Cài đặt ứng dụng /u });
    await expect(settingsBtn).toBeVisible();
    await settingsBtn.click();
    await pause(800);

    const displaySummary = page.locator('#settings-display > summary');
    await expect(displaySummary).toBeVisible();
    await displaySummary.click();
    await pause(500);

    // Chọn chế độ Tối
    const darkBtn = page.getByRole('button', { name: 'Tối', exact: true });
    await expect(darkBtn).toBeVisible();
    await darkBtn.click();
    await pause(500);

    // Xác nhận html đã đổi data-theme="dark"
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  // 8. COLD PROCESS REBOOT - KIỂM TRA LƯU TRỮ DARK MODE
  await runStep('08-cold-process-reboot-dark-preserved', async () => {
    if (browser) {
      await browser.close().catch(() => {});
      browser = undefined;
      page = undefined;
    }
    console.log('Force-stopping app to simulate cold reboot...');
    adb('shell', 'am', 'force-stop', packageId);
    await pause(1500);

    console.log('Starting app again...');
    adb('shell', 'am', 'start', '-n', `${packageId}/vn.quangtu.tutam.StartupActivity`);
    await pause(2500);

    await connectToApp();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    console.log('Dark mode successfully preserved across cold boot!');
  });

  // 9. HƯỚNG DẪN WIDGET
  await runStep('09-huong-dan-widget', async () => {
    await page.goto('https://localhost/huong-dan');
    await page.waitForLoadState('domcontentloaded');
    await pause(1500);

    const widgetGuide = page.getByText(/Hướng dẫn tiện ích màn hình|Widget/i).first();
    await expect(widgetGuide).toBeVisible({ timeout: 10_000 });
  });

  // 10. KIỂM TRA LOGCAT VÀ LỖI HỆ THỐNG
  await runStep('10-logcat-and-health-check', async () => {
    const crashLogs = adb('shell', 'logcat', '-d', '-b', 'crash').toString();
    await fs.writeFile(path.join(evidenceDir, 'crash-logcat.txt'), crashLogs);

    const appCrashLogs = crashLogs.split('--------- beginning of crash')
      .filter(entry => entry.includes(packageId))
      .join('\n');

    if (appCrashLogs.trim().length > 0) {
      console.warn('Warning: Crash logs detected for app in logcat:', appCrashLogs);
      throw new Error(`Crash detected for ${packageId}: ${appCrashLogs.slice(0, 300)}`);
    } else {
      console.log(`Logcat crash buffer for ${packageId} is completely clean (0 crashes)!`);
    }

    if (pageErrors.length > 0) {
      throw new Error(`Captured ${pageErrors.length} uncaught page errors: ` + JSON.stringify(pageErrors));
    }
  });

} catch (err) {
  mainFailure = err;
} finally {
  if (browser) {
    await browser.close().catch(() => {});
  }
  const summary = {
    packageId,
    timestamp: new Date().toISOString(),
    totalSteps: outcomes.length,
    passedSteps: outcomes.filter((o) => o.status === 'PASS').length,
    failedSteps: outcomes.filter((o) => o.status === 'FAIL').length,
    outcomes,
    pageErrors,
    consoleErrors,
    success: !mainFailure && outcomes.every((o) => o.status === 'PASS')
  };
  await fs.mkdir(evidenceDir, { recursive: true });
  await fs.writeFile(path.join(evidenceDir, 'test-summary.json'), JSON.stringify(summary, null, 2));
  console.log('\n========================================');
  console.log('FINAL TEST SUMMARY:');
  console.log(JSON.stringify(summary, null, 2));
  console.log('========================================');
}

if (mainFailure) {
  process.exit(1);
} else {
  process.exit(0);
}
