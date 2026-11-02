// tests/measure-blue.js — 打开 measure-blue.html 并输出点亮显示区边界
'use strict';
const path = require('path');
const os = require('os');
const { chromium } = require(path.join(os.tmpdir(), 'pwtest', 'node_modules', 'playwright-core'));
const EXE = path.join(process.env.LOCALAPPDATA, 'ms-playwright',
  'chromium_headless_shell-1243', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');

(async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage();
  page.on('pageerror', function (e) { console.error('PAGEERROR:', e.message); });
  await page.goto('file:///' + path.resolve(__dirname, 'measure-blue.html').replace(/\\/g, '/'));
  await page.waitForTimeout(1200);
  console.log(await page.locator('#out').textContent());
  await browser.close();
})().catch(function (e) { console.error(e); process.exit(1); });
