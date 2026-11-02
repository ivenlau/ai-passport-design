// tests/inspect-apsim2.js — 深入调研：关掉声明弹窗后截图、抓主题变量、设备壳内部、inspector 面板
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
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 45000 }).catch(function (e) { console.log('goto:', e.message); });
  await page.waitForTimeout(2500);

  // 关闭声明弹窗
  const dismiss = page.locator('button:has-text("我知道了")');
  if (await dismiss.count()) { await dismiss.click(); }
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(OUT, 'apsim-2-running.png') });

  // 主题变量 + 关键样式
  const theme = await page.evaluate(function () {
    const cs = getComputedStyle(document.documentElement);
    const vars = {};
    for (let i = 0; i < cs.length; i++) {
      const n = cs[i];
      if (n.indexOf('--') === 0) vars[n] = cs.getPropertyValue(n).trim();
    }
    function styleOf(sel, props) {
      const e = document.querySelector(sel);
      if (!e) return null;
      const s = getComputedStyle(e);
      const out = {};
      props.forEach(function (p) { out[p] = s.getPropertyValue(p); });
      return out;
    }
    return {
      vars: vars,
      body: styleOf('body', ['background-color', 'color', 'font-family']),
      toolbar: styleOf('.toolbar', ['background-color', 'border-bottom-color']),
      shell: styleOf('.passport-shell', ['width', 'height', 'background-color', 'border-radius']),
      stage: styleOf('.stage', ['background-color']),
      tryPanel: styleOf('.try-panel', ['background-color', 'width'])
    };
  });
  console.log('THEME:', JSON.stringify(theme, null, 1).slice(0, 4000));

  // 设备壳内部结构
  const shell = await page.evaluate(function () {
    function walk(el, depth) {
      if (!el || depth > 5) return null;
      const r = el.getBoundingClientRect();
      return {
        tag: el.tagName.toLowerCase(),
        id: el.id || undefined,
        cls: (el.className && el.className.toString ? el.className.toString() : '').slice(0, 60) || undefined,
        text: el.children.length === 0 ? (el.textContent || '').trim().slice(0, 40) : undefined,
        box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
        kids: Array.prototype.slice.call(el.children, 0, 10).map(function (c) { return walk(c, depth + 1); }).filter(Boolean)
      };
    }
    return walk(document.querySelector('.passport-shell'), 0);
  });
  console.log('SHELL:', JSON.stringify(shell, null, 1).slice(0, 5000));

  // inspector 面板
  const insp = page.locator('#inspector-toggle');
  if (await insp.count()) {
    await insp.click();
    await page.waitForTimeout(800);
    await page.screenshot({ path: path.join(OUT, 'apsim-3-inspector.png') });
    const inspHtml = await page.evaluate(function () {
      const panels = document.querySelectorAll('aside, .inspector, [class*=inspector]');
      return Array.prototype.map.call(panels, function (p) {
        return p.className.toString().slice(0, 60) + ' :: ' + (p.textContent || '').trim().slice(0, 300);
      });
    });
    console.log('INSPECTOR PANELS:', JSON.stringify(inspHtml, null, 1).slice(0, 2500));
  }

  await browser.close();
})().catch(function (e) { console.error(e); process.exit(1); });
