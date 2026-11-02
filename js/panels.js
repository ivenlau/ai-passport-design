// passport_design — panels.js
// 校验页（规则报告）、导出页（design.json / handoff.md / PNG / 字体命令）、规范页（文档与 AI 提示词）。
'use strict';
window.PD = window.PD || {};

PD.panels = (function () {
  const u = PD.util;
  let dom = {};

  function init() {
    dom = {
      checkList: u.$('#checkList'),
      checkSummary: u.$('#checkSummary'),
      btnRunCheck: u.$('#btnRunCheck'),
      btnExportJson: u.$('#btnExportJson'),
      btnExportMd: u.$('#btnExportMd'),
      btnExportPng: u.$('#btnExportPng'),
      btnExportAll: u.$('#btnExportAll'),
      btnCopyMd: u.$('#btnCopyMd'),
      handoffPreview: u.$('#handoffPreview'),
      fontCmds: u.$('#fontCmds'),
      specTabs: u.$('#specTabs'),
      specBody: u.$('#specBody'),
      aiPrompt: u.$('#aiPrompt'),
      btnCopyPrompt: u.$('#btnCopyPrompt'),
      aiReq: u.$('#aiReq')
    };

    u.on(dom.btnRunCheck, 'click', function () { PD.app.commit(false); renderCheck(); });
    u.on(dom.btnExportJson, 'click', exportJson);
    u.on(dom.btnExportMd, 'click', exportMd);
    u.on(dom.btnExportPng, 'click', function () {
      PD.export.exportScreensPng(PD.app.state.doc);
      PD.app.toast('PNG 快照开始下载（每屏一张）', 'ok');
    });
    u.on(dom.btnExportAll, 'click', function () {
      exportJson();
      setTimeout(exportMd, 300);
      setTimeout(function () { PD.export.exportScreensPng(PD.app.state.doc); }, 600);
    });
    u.on(dom.btnCopyMd, 'click', function () {
      copyText(PD.export.buildHandoff(PD.app.state.doc), '交接文档已复制');
    });
    u.on(dom.btnCopyPrompt, 'click', function () {
      copyText(PD.docs.buildAIPrompt(dom.aiReq ? dom.aiReq.value : ''), 'AI 设计提示词已复制');
    });

    // 规范页内嵌标签
    if (dom.specTabs) {
      [['spec', '数据规范摘要'], ['guide', 'AI 设计流程'], ['prompt', 'AI 提示词模板']].forEach(function (t, i) {
        const b = u.el('button', { class: 'subtab' + (i === 0 ? ' active' : ''), text: t[1], 'data-spec': t[0] });
        u.on(b, 'click', function () {
          u.$$('#specTabs .subtab').forEach(function (x) { x.classList.remove('active'); });
          b.classList.add('active');
          renderSpec(t[0]);
        });
        dom.specTabs.appendChild(b);
      });
      renderSpec('spec');
    }
  }

  function copyText(text, okMsg) {
    function fallback() {
      const ta = u.el('textarea', {});
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); PD.app.toast(okMsg, 'ok'); }
      catch (e) { PD.app.toast('复制失败，请手动选择文本', 'err'); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { PD.app.toast(okMsg, 'ok'); }, fallback);
    } else fallback();
  }

  function exportJson() {
    const doc = PD.app.state.doc;
    u.downloadFile((doc.meta.appId || 'design') + '-design.json', 'application/json', PD.export.exportJson(doc));
    PD.app.toast('design.json 已导出', 'ok');
  }
  function exportMd() {
    const doc = PD.app.state.doc;
    u.downloadFile((doc.meta.appId || 'design') + '-handoff.md', 'text/markdown', PD.export.buildHandoff(doc));
    PD.app.toast('handoff.md 已导出', 'ok');
  }

  // ---------- 校验 ----------
  function renderCheck() {
    const doc = PD.app.state.doc;
    const findings = PD.validate.run(doc);
    const counts = { error: 0, warn: 0, info: 0 };
    findings.forEach(function (f) { counts[f.level]++; });
    dom.checkSummary.textContent = '错误 ' + counts.error + ' · 警告 ' + counts.warn + ' · 提示 ' + counts.info +
      (counts.error ? '  —— 存在错误时不建议交付' : '  —— 可以交付');
    dom.checkSummary.className = 'check-summary ' + (counts.error ? 'bad' : (counts.warn ? 'warn' : 'good'));

    dom.checkList.innerHTML = '';
    const order = { error: 0, warn: 1, info: 2 };
    findings.sort(function (a, b) { return order[a.level] - order[b.level]; });
    if (!findings.length) {
      dom.checkList.appendChild(u.el('div', { class: 'check-item ok', text: '✓ 未发现问题' }));
      return;
    }
    findings.forEach(function (f) {
      const item = u.el('div', { class: 'check-item ' + f.level }, [
        u.el('span', { class: 'lv', text: { error: '错误', warn: '警告', info: '提示' }[f.level] }),
        u.el('span', { class: 'code', text: f.code }),
        u.el('span', { text: f.message })
      ]);
      u.on(item, 'click', function () {
        if (f.screenId) {
          PD.app.state.screenId = f.screenId;
          PD.app.state.selection = f.elId ? [f.elId] : [];
          PD.app.switchTab('design');
          PD.app.refreshAll();
        }
      });
      dom.checkList.appendChild(item);
    });
  }

  // ---------- 导出 ----------
  function renderExport() {
    const doc = PD.app.state.doc;
    dom.handoffPreview.value = PD.export.buildHandoff(doc);
    // 字体生成命令汇总
    const used = PD.export.charsetForFonts(doc);
    const cmds = [];
    used.forEach(function (item) {
      if (item.font.coverage === 'custom') {
        cmds.push('# ' + (item.font.lvSymbol || 'app_font') + ' 用到的字符: ' + item.chars.join(''));
        cmds.push(PD.export.lvFontConvCommand(item.font, item.chars));
        cmds.push('');
      }
    });
    dom.fontCmds.value = cmds.length ? cmds.join('\n') : '# 当前设计未使用自定义子集字体（无需生成命令）';
  }

  // ---------- 规范 ----------
  function renderSpec(which) {
    const body = dom.specBody;
    if (!body) return;
    if (which === 'spec') {
      body.innerHTML = '';
      body.appendChild(u.el('pre', { class: 'doc-pre', text: PD.docs.SPEC_SUMMARY }));
    } else if (which === 'guide') {
      body.innerHTML = '';
      body.appendChild(u.el('pre', { class: 'doc-pre', text: PD.docs.AI_GUIDE }));
    } else {
      body.innerHTML = '';
      body.appendChild(u.el('div', { class: 'hint', text: '填入应用需求后复制提示词，交给任意 AI agent 生成 design.json，再回到本工具导入。' }));
      body.appendChild(u.el('textarea', { id: 'aiReq', rows: '4', placeholder: '例：做一个《单词记忆卡》应用，3 个屏幕：主页（开始/设置入口）、学习屏（卡片翻面、进度条）、统计屏（今日词数、正确率圆弧）；OK 开始，UP/DOWN 移动菜单…' }));
      const ta = u.el('pre', { class: 'doc-pre', text: PD.docs.buildAIPrompt('') });
      body.appendChild(ta);
      dom.aiReq = body.querySelector('#aiReq');
      dom.aiPrompt = ta;
      u.on(dom.aiReq, 'input', function () {
        ta.textContent = PD.docs.buildAIPrompt(dom.aiReq.value);
      });
    }
  }

  function refresh() {
    renderCheck();
    renderExport();
  }

  return { init: init, refresh: refresh, renderCheck: renderCheck, renderExport: renderExport };
})();
