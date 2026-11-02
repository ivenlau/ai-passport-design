// tests/browser-smoke.js — 浏览器级冒烟：页面加载、示例导入、预览三键导航、校验、导出。
// 运行: node tests/browser-smoke.js   （依赖 playwright-core 与已缓存的 chromium headless shell）
'use strict';
const path = require('path');
const os = require('os');
const { chromium } = require(path.join(os.tmpdir(), 'pwtest', 'node_modules', 'playwright-core'));

const EXE = path.join(process.env.LOCALAPPDATA, 'ms-playwright',
  'chromium_headless_shell-1243', 'chrome-headless-shell-win64', 'chrome-headless-shell.exe');
const URL = 'file:///' + path.resolve(__dirname, '..', 'index.html').replace(/\\/g, '/');
const OUT = path.join(__dirname, 'out');

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failed++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

(async function main() {
  const fs = require('fs');
  if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath: EXE });
  const page = await browser.newPage({ viewport: { width: 1500, height: 950 } });
  const errors = [];
  page.on('pageerror', function (e) { errors.push('pageerror: ' + e.message); });
  page.on('console', function (m) { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('dialog', function (d) {
    errors.push('unexpected system dialog: ' + d.message());
    d.dismiss();
  }); // 项目已改用自定义模态，系统弹窗视为回归

  console.log('加载:');
  await page.goto(URL);
  await page.waitForTimeout(400);
  check('无 JS 错误', errors.length === 0, errors.join(' | '));
  check('应用初始化（屏幕列表 1 行）', await page.locator('#screensList .list-row').count() === 1);
  const canvasBox = await page.locator('#viewCanvas').boundingBox();
  const aspect = canvasBox ? canvasBox.width / canvasBox.height : 0;
  check('画布为 3:4 真机屏（含产品照对位）', canvasBox && canvasBox.width > 150 && Math.abs(aspect - 0.75) < 0.02,
    JSON.stringify(canvasBox));
  check('真机键位贴片存在', await page.locator('.key-chip').count() === 4);
  await page.screenshot({ path: path.join(OUT, '1-init.png') });

  console.log('示例导入:');
  // 真实路径：点击「示例」按钮（内嵌数据，file:// 可用）→ 自定义模态确认
  await page.locator('#btnLoadExample').click();
  await page.waitForTimeout(250);
  check('自定义模态出现', await page.locator('.cm-mask').count() === 1);
  await page.locator('.cm-ok').click();
  await page.waitForTimeout(400);
  check('屏幕列表 3 行', await page.locator('#screensList .list-row').count() === 3);
  check('项目名同步', (await page.locator('#projName').inputValue()) === '单词记忆卡');
  await page.screenshot({ path: path.join(OUT, '2-example-menu.png') });

  console.log('预览三键:');
  await page.locator('#btnPreview').click();
  await page.waitForTimeout(200);
  // 主页 OK_CLICK → 学习屏
  await page.keyboard.press('Enter');
  await page.waitForTimeout(250);
  let status = await page.locator('#statusbar').textContent();
  check('OK 进入学习屏', status.indexOf('学习屏') >= 0, status);
  await page.screenshot({ path: path.join(OUT, '3-preview-learn.png') });
  // 长按 OK → 返回主页
  await page.keyboard.down('Enter');
  await page.waitForTimeout(650);
  await page.keyboard.up('Enter');
  await page.waitForTimeout(250);
  status = await page.locator('#statusbar').textContent();
  check('长按 OK 返回主页', status.indexOf('主页') >= 0, status);
  // 长按前的 500ms 内 UP 移动焦点不影响导航（菜单 focusOrder）
  await page.locator('#btnPreview').click(); // 退出预览
  await page.waitForTimeout(150);

  console.log('校验页:');
  await page.locator('[data-tab="check"]').click();
  await page.waitForTimeout(250);
  const summary = await page.locator('#checkSummary').textContent();
  check('校验无 error', summary.indexOf('错误 0') >= 0, summary);
  await page.screenshot({ path: path.join(OUT, '4-check.png') });

  console.log('导出页:');
  await page.locator('[data-tab="export"]').click();
  await page.waitForTimeout(250);
  const md = await page.locator('#handoffPreview').inputValue();
  check('handoff 预览生成', md.indexOf('UI/UX 开发交接文档') > 0 && md.indexOf('el_title') > 0);
  const cmds = await page.locator('#fontCmds').inputValue();
  check('字体命令生成', cmds.indexOf('lv_font_conv') > 0);
  await page.screenshot({ path: path.join(OUT, '5-export.png') });

  console.log('交互页:');
  await page.locator('[data-tab="flow"]').click();
  await page.waitForTimeout(300);
  check('绑定矩阵渲染', await page.locator('#keyMatrix .matrix-row').count() === 12);
  await page.screenshot({ path: path.join(OUT, '6-flow.png') });

  console.log('规范页:');
  await page.locator('[data-tab="spec"]').click();
  await page.waitForTimeout(250);
  check('规范内容渲染', (await page.locator('#specBody').textContent()).indexOf('passport-design') > 0);
  await page.screenshot({ path: path.join(OUT, '7-spec.png') });

  console.log('编辑操作:');
  await page.locator('[data-tab="design"]').click();
  await page.waitForTimeout(250);
  // 点击画布中央选中元素（学习屏 title 附近）——回到主页先
  const rows = page.locator('#screensList .list-row');
  await rows.first().click();
  await page.waitForTimeout(200);
  // 选中标题元素：按比例点击 el_title 中心（逻辑 120,59 → 屏幕比例 0.5, 59/320）
  const box = await page.locator('#viewCanvas').boundingBox();
  await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * (59 / 320));
  await page.waitForTimeout(250);
  const propTitle = await page.locator('#propsPanel h3').first().textContent();
  check('画布点选中元素', propTitle.indexOf('文本') >= 0, propTitle);
  await page.screenshot({ path: path.join(OUT, '8-selected.png') });

  console.log('删除屏幕 + 关联交互清理:');
  // 删除「学习屏」（示例中主页 OK_CLICK / OK_LONG… 有 goto 指向它）
  const learnRow = page.locator('#screensList .list-row').nth(1);
  await learnRow.hover();
  await learnRow.locator('.mini.danger').click();
  await page.waitForTimeout(250);
  check('删除确认为自定义模态', await page.locator('.cm-mask').count() === 1);
  await page.screenshot({ path: path.join(OUT, '10-delete-modal.png') });
  await page.locator('.cm-ok').click();
  await page.waitForTimeout(350);
  check('删除后剩 2 屏', await page.locator('#screensList .list-row').count() === 2);
  const cleaned = await page.evaluate(function () {
    const doc = window.PD.app.state.doc;
    let dangling = 0;
    doc.screens.forEach(function (s) {
      window.PD.model.KEY_EVENTS.forEach(function (ev) {
        const b = s.keys[ev];
        if (b && b.action === 'goto' && !doc.screens.some(function (x) { return x.id === b.target; })) dangling++;
      });
    });
    return dangling;
  });
  check('无悬空 goto 绑定（关联交互已清理）', cleaned === 0, String(cleaned));
  await page.locator('[data-tab="check"]').click();
  await page.waitForTimeout(250);
  const summary2 = (await page.locator('#checkSummary').textContent()) || '';
  check('删屏后校验无 error', summary2.indexOf('错误 0') >= 0, summary2);

  console.log('复制屏幕:');
  await page.locator('[data-tab="design"]').click();
  await page.locator('#screensList .list-row').first().click(); // 无选中元素 → 屏幕属性
  await page.waitForTimeout(200);
  await page.locator('#propsPanel button:has-text("复制")').click();
  await page.waitForTimeout(300);
  check('复制后 3 屏', await page.locator('#screensList .list-row').count() === 3);
  const dupOk = await page.evaluate(function () {
    const doc = window.PD.app.state.doc;
    const copy = doc.screens.find(function (s) { return /副本$/.test(s.name); });
    if (!copy) return 'no-copy';
    const ids = {};
    copy.elements.forEach(function (e) { ids[e.id] = true; });
    if ((copy.focusOrder || []).some(function (id) { return !ids[id]; })) return 'focus-dangling';
    const oldIds = {};
    (doc.screens[0].elements || []).forEach(function (e) { oldIds[e.id] = true; });
    if (copy.elements.some(function (e) { return oldIds[e.id]; })) return 'id-collision';
    return 'ok';
  });
  check('副本 id 全新 / 焦点顺序已重映射', dupOk === 'ok', dupOk);

  console.log('字模管理（F-CHARSET 修复流）:');
  // 制造缺字：副本屏标题改用未登记字符「亮」
  await page.evaluate(function () {
    const doc = window.PD.app.state.doc;
    const s = doc.screens.find(function (x) { return /副本$/.test(x.name); });
    const el = s.elements.find(function (e) { return e.type === 'label' && e.props.text; });
    el.props.text = '亮度';
    window.PD.app.refreshAll();
  });
  const hasErr = await page.evaluate(function () {
    return window.PD.validate.run(window.PD.app.state.doc).some(function (f) { return f.code === 'F-CHARSET' && f.level === 'error'; });
  });
  check('缺字被校验出 F-CHARSET', hasErr);
  await page.locator('#btnFonts').click();
  await page.waitForTimeout(250);
  await page.screenshot({ path: path.join(OUT, '9-font-manager.png') });
  await page.locator('.fm-panel button:has-text("补齐用到的字符")').first().click();
  await page.waitForTimeout(250);
  const fixed = await page.evaluate(function () {
    return !window.PD.validate.run(window.PD.app.state.doc).some(function (f) { return f.code === 'F-CHARSET' && f.level === 'error'; });
  });
  check('一键补齐后 F-CHARSET 清零', fixed);
  await page.locator('.fm-panel button:has-text("关闭")').click();
  await page.waitForTimeout(150);

  check('全程无 JS 错误', errors.length === 0, errors.join(' | '));
  await browser.close();
  console.log('');
  if (failed) { console.error(failed + ' 项失败'); process.exit(1); }
  console.log('浏览器冒烟全部通过');
})().catch(function (e) { console.error(e); process.exit(1); });
