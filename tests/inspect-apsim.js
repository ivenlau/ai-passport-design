// tests/inspect-apsim.js — 调研官方试玩页 https://apsimulator.folotoy.cn/?play=1076
// 截图 + 提取 DOM/网络/脚本信息，了解其结构与能力。
'use strict';
const path = require('path');
const os = require('os');
const fs = require('fs');
const { chromium } = require(path.join(os.tmpdir(), 'pwtest', 'node_modules', 'playwright-core'));

const EXE = path.join(process.env.LOCALAPPDATA, 'ms-playwright',
  'chromium_headless_shell-1243', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
const URL = process.argv[2] || 'https://apsimulator.folotoy.cn/?play=1076';
const OUT = path.join(__dirname, 'out');

(async function main() {
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });

  const requests = [];
  page.on('request', function (r) { requests.push(r.resourceType() + ' ' + r.url().slice(0, 160)); });
  const errors = [];
  page.on('pageerror', function (e) { errors.push(e.message); });

  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }).catch(function (e) { console.log('goto:', e.message); });
  await page.waitForTimeout(3000);
  await page.screenshot({ path: path.join(OUT, 'apsim-1-initial.png') });

  const title = await page.title();
  console.log('TITLE:', title);

  // DOM 概览
  const info = await page.evaluate(function () {
    function brief(el, depth) {
      if (!el || depth > 4) return null;
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 80) || undefined,
        text: (el.children.length === 0 ? (el.textContent || '').trim().slice(0, 60) : undefined),
        box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        kids: Array.prototype.slice.call(el.children, 0, 8).map(function (c) { return brief(c, depth + 1); }).filter(Boolean)
      };
    }
    return {
      url: location.href,
      body: brief(document.body, 0),
      canvases: document.querySelectorAll('canvas').length,
      iframes: Array.prototype.map.call(document.querySelectorAll('iframe'), function (f) { return f.src; }),
      scripts: Array.prototype.map.call(document.querySelectorAll('script[src]'), function (s) { return s.src; }),
      media: {
        audio: document.querySelectorAll('audio').length,
        video: document.querySelectorAll('video').length
      }
    };
  });
  console.log(JSON.stringify(info, null, 1).slice(0, 6000));

  console.log('\nREQUESTS:');
  requests.slice(0, 60).forEach(function (r) { console.log(' ', r); });
  if (errors.length) console.log('\nPAGEERRORS:', errors.join(' | '));

  // 交互尝试：点击页面上的按钮类元素再截一张
  const buttons = await page.locator('button, [role=button], .btn').all();
  console.log('\nBUTTON COUNT:', buttons.length);
  await browser.close();
})().catch(function (e) { console.error(e); process.exit(1); });
