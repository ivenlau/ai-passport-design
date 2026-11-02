// tests/smoke.js — Node 冒烟测试：模型 / 校验 / 导出 / 字体清单（无 DOM 逻辑）。
// 运行: node tests/smoke.js
'use strict';
const fs = require('fs');
const path = require('path');

global.window = global; // 浏览器语义：window.PD 即全局 PD
const jsDir = path.join(__dirname, '..', 'js');
['util.js', 'model.js', 'example-data.js', 'widgets.js', 'validate.js', 'export.js', 'docs.js'].forEach(function (f) {
  const src = fs.readFileSync(path.join(jsDir, f), 'utf8');
  new Function(src)();
});
const PD = global.PD;

let failed = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failed++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

// 1) 新文档 + 规范化
console.log('模型:');
const doc = PD.model.newDoc();
check('newDoc 结构', doc.format === 'passport-design' && doc.screens.length === 1 && doc.screens[0].elements.length === 0);
check('normalizeDoc 接受', PD.model.normalizeDoc(doc) === true);
check('normalizeDoc 拒绝非本格式', PD.model.normalizeDoc({ format: 'x' }) === null);

// 2) 示例导入
console.log('示例导入:');
const exampleFile = fs.readFileSync(path.join(__dirname, '..', 'examples', 'hello-passport.json'), 'utf8');
check('内嵌示例与 examples/hello-passport.json 一致（防漂移）',
  JSON.stringify(JSON.parse(PD.EXAMPLE_JSON)) === JSON.stringify(JSON.parse(exampleFile)));
const examplePath = path.join(__dirname, '..', 'examples', 'hello-passport.json');
const res = PD.export.importJson(fs.readFileSync(examplePath, 'utf8'));
check('导入示例成功', res.ok, res.ok ? '' : res.error);
const ex = res.doc;
check('3 屏', ex.screens.length === 3);
check('中文用 custom 字体', ex.screens[0].elements.find(e => e.id === 'el_title').props.fontId === 'fapp20');

// 3) 校验器
console.log('校验器:');
const findings = PD.validate.run(ex);
const errors = findings.filter(f => f.level === 'error');
check('示例无 error', errors.length === 0, JSON.stringify(errors.map(e => e.code + ':' + e.message)));

// 人为注入错误
const bad = JSON.parse(JSON.stringify(ex));
bad.screens[0].elements.push({
  id: 'el_bad', type: 'label', name: '坏文本', x: 0, y: 0, w: 100, h: 24, z: 0, note: '',
  props: { text: '中文坏', fontId: 'f14', color: '#FFFFFF', align: 'left', lineHeight: 0 }
});
bad.screens[0].keys.OK_CLICK = { action: 'goto', target: 'nope', label: '' };
bad.screens[1].elements[0].x = 500;
const f2 = PD.validate.run(bad);
const codes = f2.map(f => f.code + ':' + f.level);
check('F-CJK error 检出', f2.some(f => f.code === 'F-CJK' && f.level === 'error'), codes.join(','));
check('N-TARGET error 检出', f2.some(f => f.code === 'N-TARGET' && f.level === 'error'));
check('E-BOUNDS 检出', f2.some(f => f.code === 'E-BOUNDS'));

// charset 覆盖
const bad2 = JSON.parse(JSON.stringify(ex));
bad2.screens[0].elements.find(e => e.id === 'el_title').props.text = '单词卡龘';
const f3 = PD.validate.run(bad2);
check('F-CHARSET error 检出（charset 外字符）', f3.some(f => f.code === 'F-CHARSET' && f.level === 'error'));

// 4) 导出
console.log('导出:');
const json = PD.export.exportJson(ex);
const parsed = JSON.parse(json);
check('design.json 可序列化/可解析', parsed.format === 'passport-design');
check('导出剔除 ui', parsed.ui === undefined);
const md = PD.export.buildHandoff(ex);
check('handoff 含标题', md.indexOf('# 《单词记忆卡》') === 0, md.slice(0, 40));
check('handoff 含硬件约束', md.indexOf('ST7789P3') > 0);
check('handoff 含 RGB565', md.indexOf('RGB565') > 0);
check('handoff 含字体命令', md.indexOf('lv_font_conv') > 0);
check('handoff 含验收清单', md.indexOf('验收清单') > 0);
check('handoff 含三键语义', md.indexOf('RELEASE') > 0);
check('handoff 含元素表', md.indexOf('el_title') > 0);

// 5) 字体字符清单
const used = PD.export.charsetForFonts(ex);
const custom = used.find(u => u.font.id === 'fapp20');
check('charset 汇总含全部中文字符', custom && '单词卡开始学习错题本设置认识不苹果今日进度每日目标音量%的'.split('').every(c => custom.chars.indexOf(c) >= 0),
  custom ? custom.chars.join('') : 'missing');

// 6) lv_font_conv 命令
const cmd = PD.export.lvFontConvCommand(ex.fonts.find(f => f.id === 'fapp20'), custom.chars);
check('lv_font_conv 命令生成', cmd.indexOf('--lv-font-name app_font_20') > 0 && cmd.indexOf('--range 0x20-0x7E,') > 0);

// 7) 提示词
const prompt = PD.docs.buildAIPrompt('做一个测试应用');
check('AI 提示词含需求', prompt.indexOf('做一个测试应用') > 0);
check('AI 提示词含 schema', prompt.indexOf('passport-design') > 0);

// 8) RGB565 量化（自洽：565 码往返一致、幂等）
const q1 = PD.util.quantize565Hex('#1689E8');
const q2 = PD.util.quantize565Hex(q1);
check('RGB565 码往返一致', PD.util.rgb565Value(q1) === PD.util.rgb565Value('#1689E8'), q1);
check('RGB565 量化幂等', q1 === q2, q1 + ' vs ' + q2);
check('RGB565 值 0x145D', PD.util.rgb565Value('#1689E8').toString(16) === '145d', PD.util.rgb565Value('#1689E8').toString(16));

console.log('');
if (failed) { console.error(failed + ' 项失败'); process.exit(1); }
console.log('全部通过');
