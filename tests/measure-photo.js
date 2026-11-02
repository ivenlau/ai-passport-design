// tests/measure-photo.js — 打开 measure-photo.html 并截图（设备照 + 50px 网格）
'use strict';
const path = require('path');
const os = require('os');
const { chromium } = require(path.join(os.tmpdir(), 'pwtest', 'node_modules', 'playwright-core'));
const EXE = path.join(process.env.LOCALAPPDATA, 'ms-playwright',
  'chromium_headless_shell-1243', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');

(async function main() {
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 640, height: 960 } });
  await page.goto('file:///' + path.resolve(__dirname, 'measure-photo.html').replace(/\\/g, '/'));
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(__dirname, 'out', 'photo-grid.png') });
  await browser.close();
  console.log('done');
})().catch(function (e) { console.error(e); process.exit(1); });
