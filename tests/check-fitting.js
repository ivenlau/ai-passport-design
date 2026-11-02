// tests/check-fitting.js — 放大截取设计台真机画布的屏幕区，检查画布与照片显示区贴合（黑边/露底）。
'use strict';
const path = require('path');
const os = require('os');
const { chromium } = require(path.join(os.tmpdir(), 'pwtest', 'node_modules', 'playwright-core'));
const EXE = path.join(process.env.LOCALAPPDATA, 'ms-playwright',
  'chromium_headless_shell-1243', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');

(async function main() {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 }, deviceScaleFactor: 2 });

  // 设计台
  page.on('dialog', function (d) { d.dismiss(); }); // 项目已改用自定义模态
  await page.goto('file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/'));
  await page.locator('#btnLoadExample').click();
  await page.waitForTimeout(250);
  await page.locator('.cm-ok').click();
  await page.waitForTimeout(500);
  const holder = await page.locator('#tab-design .screen-holder').boundingBox();
  // 截取 holder 外扩 12px（看边缘与机壳衔接）
  await page.screenshot({
    path: path.join(__dirname, 'out', 'fit-design.png'),
    clip: { x: holder.x - 12, y: holder.y - 12, width: holder.width + 24, height: holder.height + 24 }
  });

  await browser.close();
  console.log('done');
})().catch(function (e) { console.error(e); process.exit(1); });
