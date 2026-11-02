// tests/check-fitting2.js — 程序化贴合校验：
// 纯绿屏截图 → 扫描绿色包围盒 → 与照片点亮显示区（126,142,284×378）按设备比例换算的期望框比对。
'use strict';
const path = require('path');
const os = require('os');
const { chromium } = require(path.join(os.tmpdir(), 'pwtest', 'node_modules', 'playwright-core'));
const EXE = path.join(process.env.LOCALAPPDATA, 'ms-playwright',
  'chromium_headless_shell-1243', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');

// 照片点亮显示区（像素扫描测定，tests/measure-blue.js 可复现）
const LIT = { x: 126, y: 142, w: 284, h: 378 };
const PHOTO = { w: 605, h: 931 };

(async function main() {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--allow-file-access-from-files'] });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  page.on('dialog', function (d) { d.accept(); });
  await page.goto('file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/'));
  await page.waitForTimeout(400);

  // 纯绿屏设计（无圆角干扰不了包围盒：圆角在角部，bbox 不受影响）
  await page.evaluate(function () {
    const doc = window.PD.model.newDoc();
    doc.screens[0].bg = '#00FF00';
    doc.screens[0].elements = [];
    window.PD.app.state.doc = doc;
    window.PD.app.state.screenId = doc.screens[0].id;
    window.PD.app.refreshAll();
  });
  await page.waitForTimeout(300);

  // 期望框：照片点亮区按 device-wrap 显示比例换算
  const wrap = await page.locator('#deviceWrap').boundingBox();
  const exp = {
    x: wrap.x + LIT.x / PHOTO.w * wrap.width,
    y: wrap.y + LIT.y / PHOTO.h * wrap.height,
    w: LIT.w / PHOTO.w * wrap.width,
    h: LIT.h / PHOTO.h * wrap.height
  };

  // 在期望框邻域截图并扫描纯绿包围盒（2x 采样提高精度）
  const pad = 20;
  const clip = { x: exp.x - pad, y: exp.y - pad, width: exp.w + pad * 2, height: exp.h + pad * 2 };
  const shot = await page.screenshot({ clip: clip, scale: 'css' });
  const fs = require('fs');
  const tmp = path.join(__dirname, 'out', 'fit2-scan.png');
  fs.writeFileSync(tmp, shot);

  // 用浏览器解码 PNG 扫描绿色像素（避开 file:// 污染：直接在页面里画 blob）
  const bbox = await page.evaluate(async function (dataUrl) {
    const img = new Image();
    await new Promise(function (res, rej) { img.onload = res; img.onerror = rej; img.src = dataUrl; });
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(0, 0, c.width, c.height).data;
    let minX = 1e9, minY = 1e9, maxX = -1, maxY = -1;
    for (let y = 0; y < c.height; y++) {
      for (let x = 0; x < c.width; x++) {
        const i = (y * c.width + x) * 4;
        if (d[i] < 120 && d[i + 1] > 200 && d[i + 2] < 120) { // 纯绿（R<120, G>200, B<120）
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  }, 'data:image/png;base64,' + shot.toString('base64'));

  // 绿色 bbox 在截图坐标 → 页面坐标（+clip 原点）
  const got = { x: clip.x + bbox.x, y: clip.y + bbox.y, w: bbox.w, h: bbox.h };
  const dx = Math.abs(got.x - exp.x), dy = Math.abs(got.y - exp.y);
  const dw = Math.abs(got.w - exp.w), dh = Math.abs(got.h - exp.h);
  console.log('期望框(照片点亮区换算):', JSON.stringify(exp));
  console.log('实测框(纯绿屏画布)   :', JSON.stringify(got));
  console.log('偏差 px:', JSON.stringify({ dx: +dx.toFixed(2), dy: +dy.toFixed(2), dw: +dw.toFixed(2), dh: +dh.toFixed(2) }));
  const ok = dx <= 1.5 && dy <= 1.5 && dw <= 2 && dh <= 2;
  console.log(ok ? '✓ 画布与照片显示区贴合（≤2px）' : '✗ 贴合超差');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch(function (e) { console.error(e); process.exit(1); });
