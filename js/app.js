// passport_design — app.js
// 应用主控：状态、页签路由、自动保存、撤销/重做、导入、全局键盘、提示条。
'use strict';
window.PD = window.PD || {};

PD.app = (function () {
  const u = PD.util;

  const state = {
    doc: null,
    screenId: null,
    selection: [],
    hoverIds: [],
    preview: false,
    previewFocus: null,
    tab: 'design'
  };

  let offscreen = null;
  let saveTimer = null;

  function currentScreen() {
    return state.doc.screens.find(function (s) { return s.id === state.screenId; }) || state.doc.screens[0];
  }

  // ---------- 提示条 ----------
  function toast(msg, type) {
    const box = u.$('#toast');
    const t = u.el('div', { class: 'toast-msg ' + (type || 'info'), text: msg });
    box.appendChild(t);
    setTimeout(function () {
      t.classList.add('fade');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 400);
    }, 2600);
  }

  // ---------- 提交（历史 + 保存 + 刷新）----------
  function commit(withHistory) {
    if (withHistory !== false) PD.model.history.commit(state.doc);
    PD.model.persist(state.doc);
    const el = u.$('#saveState');
    if (el) {
      el.textContent = '已保存 ' + u.fmtDate().slice(11);
    }
    refreshAll();
  }

  function refreshAll() {
    if (state.tab === 'design') PD.editor.refresh();
    else if (state.tab === 'flow') PD.interaction.render();
    else if (state.tab === 'check') PD.panels.renderCheck();
    else if (state.tab === 'export') PD.panels.renderExport();
  }

  // ---------- 页签 ----------
  function switchTab(name) {
    state.tab = name;
    u.$$('#tabs .tab').forEach(function (b) {
      b.classList.toggle('active', b.getAttribute('data-tab') === name);
    });
    u.$$('.tab-pane').forEach(function (p) {
      p.classList.toggle('active', p.id === 'tab-' + name);
    });
    refreshAll();
    if (name === 'flow') PD.interaction.render();
    if (name === 'check') PD.panels.renderCheck();
    if (name === 'export') PD.panels.renderExport();
  }

  // ---------- 导入 ----------
  function importDoc() {
    u.pickFile('.json,application/json', function (file, text) {
      const res = PD.export.importJson(text);
      if (!res.ok) {
        toast('导入失败：' + res.error, 'err');
        return;
      }
      loadDoc(res.doc);
      toast('已导入「' + res.doc.meta.name + '」（' + res.doc.screens.length + ' 屏）', 'ok');
    });
  }

  function loadDoc(doc) {
    state.doc = doc;
    state.screenId = doc.screens[0].id;
    state.selection = [];
    state.preview = false;
    PD.model.history.reset(doc);
    PD.model.persist(doc);
    const nameInput = u.$('#projName');
    if (nameInput) nameInput.value = doc.meta.name || '';
    refreshAll();
    if (state.tab === 'flow') PD.interaction.render();
  }

  // ---------- 全局键盘 ----------
  function onKeyDown(ev) {
    // 输入框内不拦截
    const tag = (ev.target && ev.target.tagName) || '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

    if (ev.ctrlKey || ev.metaKey) {
      const k = ev.key.toLowerCase();
      if (k === 'z' && !ev.shiftKey) {
        ev.preventDefault();
        const prev = PD.model.history.undo();
        if (prev) { state.doc = prev; state.screenId = state.screenId || prev.screens[0].id; refreshAll(); toast('已撤销', 'info'); }
        return;
      }
      if (k === 'y' || (k === 'z' && ev.shiftKey)) {
        ev.preventDefault();
        const next = PD.model.history.redo();
        if (next) { state.doc = next; refreshAll(); toast('已重做', 'info'); }
        return;
      }
      if (k === 'd') {
        ev.preventDefault();
        if (state.selection.length) PD.editor.duplicateElements(state.selection.slice());
        return;
      }
      return;
    }

    if ((ev.key === 'Delete' || ev.key === 'Backspace') && state.tab === 'design' && state.selection.length) {
      ev.preventDefault();
      PD.editor.deleteElements(state.selection.slice());
      return;
    }

    if (state.tab === 'design') PD.editor.handleKey(ev);
  }

  // ---------- 初始化 ----------
  function init() {
    // 载入文档：本地存储 → 否则新文档
    let doc = PD.model.loadPersisted();
    if (!doc || !PD.model.normalizeDoc(doc)) doc = PD.model.newDoc();
    state.doc = doc;
    state.screenId = doc.screens[0].id;
    offscreen = PD.render.createOffscreen();

    PD.editor.init();
    PD.interaction.init();
    PD.panels.init();

    // 顶栏
    const nameInput = u.$('#projName');
    nameInput.value = doc.meta.name || '';
    u.on(nameInput, 'input', function () {
      doc.meta.name = nameInput.value;
      PD.model.persist(doc);
    });
    u.on(nameInput, 'change', function () { commit(); });

    u.$$('#tabs .tab').forEach(function (b) {
      u.on(b, 'click', function () { switchTab(b.getAttribute('data-tab')); });
    });

    u.on(u.$('#btnImport'), 'click', importDoc);
    u.on(u.$('#btnExportTop'), 'click', function () {
      switchTab('export');
      toast('在导出页选择交付物', 'info');
    });
    u.on(u.$('#btnUndo'), 'click', function () {
      const prev = PD.model.history.undo();
      if (prev) { state.doc = prev; refreshAll(); toast('已撤销', 'info'); }
    });
    u.on(u.$('#btnRedo'), 'click', function () {
      const next = PD.model.history.redo();
      if (next) { state.doc = next; refreshAll(); toast('已重做', 'info'); }
    });
    u.on(u.$('#btnNewDoc'), 'click', function () {
      u.confirmModal({
        title: '新建设计？',
        message: '将清空当前内容（建议先导出备份）。',
        okText: '新建',
        danger: true
      }).then(function (ok) {
        if (!ok) return;
        loadDoc(PD.model.newDoc());
        toast('已新建设计', 'ok');
      });
    });
    u.on(u.$('#btnLoadExample'), 'click', loadExample);

    u.on(window, 'keydown', onKeyDown);
    u.on(window, 'keyup', function (ev) {
      // 预览模式的 CLICK/LONG 在 keyup 收尾（与设备侧键一致）
      if (state.tab === 'design') PD.editor.handleKey(ev);
    });

    // 首次进入
    PD.model.history.reset(doc);
    switchTab('design');
    refreshAll();

    // 未保存离开提醒
    u.on(window, 'beforeunload', function () { PD.model.persist(state.doc); });
  }

  function loadExample() {
    u.confirmModal({
      title: '加载示例？',
      message: '将覆盖当前设计（建议先导出备份）。',
      okText: '加载',
      danger: true
    }).then(function (ok) {
      if (!ok) return;
      // 内嵌示例（file:// 下 fetch 受限）；规范副本在 examples/hello-passport.json
      const res = PD.export.importJson(PD.EXAMPLE_JSON);
      if (!res.ok) {
        toast('示例数据异常：' + res.error, 'err');
        return;
      }
      loadDoc(res.doc);
      toast('已加载示例设计「' + res.doc.meta.name + '」', 'ok');
    });
  }

  return {
    state: state,
    get offscreen() { return offscreen; },
    init: init,
    commit: commit,
    refreshAll: refreshAll,
    switchTab: switchTab,
    currentScreen: currentScreen,
    toast: toast
  };
})();

document.addEventListener('DOMContentLoaded', PD.app.init);
