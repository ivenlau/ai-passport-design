// passport_design — editor.js
// 设计页：屏幕列表、图层、设备画布（拖拽/缩放手柄/预览模式）、属性面板。
'use strict';
window.PD = window.PD || {};

PD.editor = (function () {
  const u = PD.util;
  const R = PD.render;

  let dom = {};
  let drag = null;          // { mode:'move'|'resize', dir, startX, startY, orig }
  let pressState = {};      // 预览模式按键状态机 { KEY: {downAt, timer, longFired, lastClickAt} }
  const backStack = [];

  // ---------- 初始化 ----------
  function init() {
    dom = {
      screensList: u.$('#screensList'),
      btnAddScreen: u.$('#btnAddScreen'),
      layersList: u.$('#layersList'),
      stage: u.$('#canvasStage'),
      view: u.$('#viewCanvas'),
      overlay: u.$('#overlayCanvas'),
      deviceWrap: u.$('#deviceWrap'),
      props: u.$('#propsPanel'),
      status: u.$('#statusbar'),
      devSizeSel: u.$('#devSizeSel'),
      chkGrid: u.$('#chkGrid'),
      chkRgb565: u.$('#chkRgb565'),
      rangeBacklight: u.$('#rangeBacklight'),
      lblBacklight: u.$('#lblBacklight'),
      btnPreview: u.$('#btnPreview'),
      btnFonts: u.$('#btnFonts'),
      btnAddEl: u.$('#btnAddEl'),
      elTypeSel: u.$('#elTypeSel')
    };

    // 画布事件
    u.on(dom.view, 'mousedown', onCanvasDown);
    u.on(window, 'mousemove', onCanvasMove);
    u.on(window, 'mouseup', onCanvasUp);
    u.on(dom.view, 'dblclick', onCanvasDblClick);

    // 工具条
    u.on(dom.devSizeSel, 'change', function () {
      PD.app.state.doc.ui.devW = parseInt(dom.devSizeSel.value, 10);
      dom.deviceWrap.style.width = PD.app.state.doc.ui.devW + 'px';
      PD.app.commit(false);
      renderCanvas();
    });
    u.on(dom.chkGrid, 'change', function () {
      PD.app.state.doc.ui.grid = dom.chkGrid.checked;
      PD.app.commit(false);
      renderCanvas();
    });
    u.on(dom.chkRgb565, 'change', function () {
      PD.app.state.doc.ui.rgb565 = dom.chkRgb565.checked;
      PD.app.commit(false);
      renderCanvas();
    });
    u.on(dom.rangeBacklight, 'input', function () {
      PD.app.state.doc.ui.backlight = parseInt(dom.rangeBacklight.value, 10);
      if (PD.app.state.doc.ui.backlight > 0) {
        dom.deviceWrap.classList.remove('off');
        PD.app.state.doc.ui.lastBacklight = PD.app.state.doc.ui.backlight;
      }
      dom.lblBacklight.textContent = PD.app.state.doc.ui.backlight + '%';
      renderCanvas();
    });
    u.on(dom.rangeBacklight, 'change', function () { PD.app.commit(false); });
    u.on(dom.btnPreview, 'click', togglePreview);
    u.on(dom.btnFonts, 'click', openFontManager);

    // 添加元素
    u.on(dom.btnAddEl, 'click', function () {
      const type = dom.elTypeSel.value;
      const el = PD.model.newElement(type);
      PD.app.currentScreen().elements.push(el);
      PD.app.state.selection = [el.id];
      PD.app.commit();
    });

    // 屏幕
    u.on(dom.btnAddScreen, 'click', function () {
      const s = PD.model.newScreen('屏幕 ' + (PD.app.state.doc.screens.length + 1));
      PD.app.state.doc.screens.push(s);
      PD.app.state.screenId = s.id;
      PD.app.state.selection = [];
      PD.app.commit();
    });

    // 真机键位贴片（POWER 熄屏/唤醒；UP/DOWN/OK 进预览三键）
    u.$$('.key-chip').forEach(function (chip) {
      bindDeviceKey(chip, chip.getAttribute('data-key'));
    });

    // 设备大小
    const devW = PD.app.state.doc.ui.devW || 460;
    dom.deviceWrap.style.width = devW + 'px';
    dom.devSizeSel.value = String(devW);
    if (PD.app.state.doc.ui.devW === undefined) PD.app.state.doc.ui.devW = devW;
    if (!PD.app.state.doc.ui.backlight) dom.deviceWrap.classList.add('off');
  }

  // ---------- 画布坐标映射 ----------
  function cssScale() {
    const rect = dom.view.getBoundingClientRect();
    return rect.width ? rect.width / R.W : 1;
  }
  function canvasPoint(ev) {
    const rect = dom.view.getBoundingClientRect();
    return {
      x: (ev.clientX - rect.left) / rect.width * R.W,
      y: (ev.clientY - rect.top) / rect.height * R.H,
      zoom: cssScale()
    };
  }
  function hitTest(x, y) {
    const els = PD.app.currentScreen().elements;
    for (let i = els.length - 1; i >= 0; i--) {
      const e = els[i];
      if (x >= e.x && x <= e.x + e.w && y >= e.y && y <= e.y + e.h) return e;
    }
    return null;
  }
  function handleAt(x, y) {
    const sel = PD.app.state.selection;
    if (sel.length !== 1) return null;
    const el = PD.app.currentScreen().elements.find(function (e) { return e.id === sel[0]; });
    if (!el) return null;
    const scale = cssScale();
    const pts = R.handlePoints(el, scale);
    const tol = 8 / scale; // 覆盖层手柄 8px（CSS 分辨率）→ 折算到逻辑坐标
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (Math.abs(x * scale - p.x) <= tol * scale && Math.abs(y * scale - p.y) <= tol * scale) return p.dir;
    }
    return null;
  }

  function onCanvasDown(ev) {
    if (PD.app.state.preview) return;
    ev.preventDefault();
    const p = canvasPoint(ev);
    const dir = handleAt(p.x, p.y);
    if (dir) {
      const el = PD.app.currentScreen().elements.find(function (e) { return e.id === PD.app.state.selection[0]; });
      drag = { mode: 'resize', dir: dir, startX: p.x, startY: p.y, orig: u.deepClone(el), moved: false };
      return;
    }
    const hit = hitTest(p.x, p.y);
    if (hit) {
      if (ev.shiftKey) {
        const sel = PD.app.state.selection.slice();
        const idx = sel.indexOf(hit.id);
        if (idx >= 0) sel.splice(idx, 1); else sel.push(hit.id);
        PD.app.state.selection = sel;
      } else if (PD.app.state.selection.indexOf(hit.id) < 0) {
        PD.app.state.selection = [hit.id];
      }
      drag = { mode: 'move', startX: p.x, startY: p.y, origs: PD.app.state.selection.map(function (id) {
        const e = PD.app.currentScreen().elements.find(function (x) { return x.id === id; });
        return u.deepClone(e);
      }), moved: false };
    } else {
      PD.app.state.selection = [];
    }
    refresh();
  }

  function onCanvasMove(ev) {
    const p = canvasPoint(ev);
    if (PD.app.state.preview) return;
    if (!drag) {
      // 悬停高亮
      const hit = hitTest(p.x, p.y);
      const hid = hit ? [hit.id] : [];
      if (JSON.stringify(hid) !== JSON.stringify(PD.app.state.hoverIds)) {
        PD.app.state.hoverIds = hid;
        renderCanvas();
      }
      dom.status.textContent = '位置 ' + Math.round(p.x) + ',' + Math.round(p.y) +
        (hit ? '  |  ' + hit.name + ' (' + hit.id + ')' : '');
      dom.view.style.cursor = handleAt(p.x, p.y) ? 'nwse-resize' : (hit ? 'move' : 'default');
      return;
    }
    const dx = Math.round(p.x - drag.startX), dy = Math.round(p.y - drag.startY);
    if (dx || dy) drag.moved = true;
    const scr = PD.app.currentScreen();
    if (drag.mode === 'move') {
      drag.origs.forEach(function (o) {
        const e = scr.elements.find(function (x) { return x.id === o.id; });
        e.x = o.x + dx; e.y = o.y + dy;
      });
    } else {
      const e = scr.elements.find(function (x) { return x.id === PD.app.state.selection[0]; });
      const o = drag.orig;
      let x = o.x, y = o.y, w = o.w, h = o.h;
      if (drag.dir.indexOf('e') >= 0) w = o.w + dx;
      if (drag.dir.indexOf('s') >= 0) h = o.h + dy;
      if (drag.dir.indexOf('w') >= 0) { x = o.x + dx; w = o.w - dx; }
      if (drag.dir.indexOf('n') >= 0) { y = o.y + dy; h = o.h - dy; }
      e.x = x; e.y = y; e.w = Math.max(4, w); e.h = Math.max(4, h);
    }
    renderCanvas();
    renderPropsValuesOnly();
  }

  function onCanvasUp() {
    if (drag) {
      const moved = drag.moved;
      drag = null;
      if (moved) PD.app.commit();
      else refresh();
    }
  }

  function onCanvasDblClick(ev) {
    if (PD.app.state.preview) return;
    const p = canvasPoint(ev);
    const hit = hitTest(p.x, p.y);
    if (hit && (hit.type === 'label' || hit.type === 'button' || hit.type === 'listItem')) {
      refresh();
      const input = dom.props.querySelector('[data-field="text"]');
      if (input) { input.focus(); input.select(); }
    }
  }

  // ---------- 预览模式 ----------
  function togglePreview() {
    PD.app.state.preview = !PD.app.state.preview;
    dom.btnPreview.blur(); // 避免 Enter/Space 再次激活按钮
    backStack.length = 0;
    PD.app.state.previewFocus = null;
    dom.btnPreview.classList.toggle('active', PD.app.state.preview);
    dom.stage.classList.toggle('previewing', PD.app.state.preview);
    if (PD.app.state.preview) {
      const s = PD.app.currentScreen();
      if (s.focusOrder && s.focusOrder.length) PD.app.state.previewFocus = s.focusOrder[0];
      PD.app.toast('预览模式：点击设备侧键或用 ↑/↓/Enter 模拟三键（长按 500ms = LONG）', 'info');
    }
    refresh();
  }

  function fireInput(key, evName) {
    if (!PD.app.state.preview) return;
    // 熄屏中：任意键唤醒，不触发动作（真机唤醒语义）
    if (!PD.app.state.doc.ui.backlight) {
      wakeScreen();
      PD.app.toast('屏幕已唤醒', 'info');
      return;
    }
    const s = PD.app.currentScreen();
    const ev = key + '_' + evName;
    // 焦点列表：UP/DOWN CLICK 优先移动焦点（未绑定 goto 时）
    if ((key === 'UP' || key === 'DOWN') && evName === 'CLICK' && s.focusOrder && s.focusOrder.length >= 2) {
      const b = s.keys[ev];
      if (!b || b.action === 'none' || b.action === 'toggle') {
        let idx = s.focusOrder.indexOf(PD.app.state.previewFocus);
        if (idx < 0) idx = 0;
        else idx = (idx + (key === 'UP' ? -1 : 1) + s.focusOrder.length) % s.focusOrder.length;
        PD.app.state.previewFocus = s.focusOrder[idx];
        renderCanvas();
        return;
      }
    }
    const binding = s.keys[ev];
    if (!binding || binding.action === 'none') {
      PD.app.toast(key + ' ' + evName + '：未绑定', 'info');
      renderCanvas();
      return;
    }
    switch (binding.action) {
      case 'goto': {
        const target = PD.app.state.doc.screens.find(function (x) { return x.id === binding.target; });
        if (target) {
          backStack.push(PD.app.state.screenId);
          PD.app.state.screenId = target.id;
          PD.app.state.previewFocus = (target.focusOrder && target.focusOrder.length) ? target.focusOrder[0] : null;
          PD.app.toast('→ ' + target.name, 'info');
        }
        break;
      }
      case 'back': {
        const prev = backStack.pop();
        if (prev) {
          PD.app.state.screenId = prev;
          const t = PD.app.currentScreen();
          PD.app.state.previewFocus = (t.focusOrder && t.focusOrder.length) ? t.focusOrder[0] : null;
          PD.app.toast('← 返回', 'info');
        } else PD.app.toast('已在起始屏', 'info');
        break;
      }
      case 'action':
        PD.app.toast('（应用内动作）' + (binding.label || '未定义'), 'info');
        break;
      case 'toggle':
        PD.app.toast('（切换动作）' + (binding.label || ''), 'info');
        break;
    }
    refresh();
  }

  function wakeScreen() {
    const doc = PD.app.state.doc;
    doc.ui.backlight = doc.ui.lastBacklight || 100;
    dom.deviceWrap.classList.remove('off');
    dom.rangeBacklight.value = doc.ui.backlight;
    dom.lblBacklight.textContent = doc.ui.backlight + '%';
    renderCanvas();
  }

  function togglePower() {
    const doc = PD.app.state.doc;
    if (doc.ui.backlight > 0) {
      doc.ui.lastBacklight = doc.ui.backlight;
      doc.ui.backlight = 0;
      dom.deviceWrap.classList.add('off');
    } else {
      wakeScreen();
      return;
    }
    dom.rangeBacklight.value = doc.ui.backlight;
    dom.lblBacklight.textContent = '0%';
    renderCanvas();
  }

  function bindDeviceKey(btn, key) {
    function down(ev) {
      ev.preventDefault();
      if (!PD.app.state.preview) {
        PD.app.toast('先开启预览模式再模拟按键', 'info');
        return;
      }
      btn.classList.add('pressed');
      if (key === 'POWER') return;
      const st = pressState[key] || (pressState[key] = {});
      if (st.downAt) return;
      st.downAt = Date.now();
      st.longFired = false;
      st.timer = setTimeout(function () {
        st.longFired = true;
        fireInput(key, 'LONG');
      }, PD.model.DEVICE.longPressMs);
    }
    function up(ev) {
      if (ev) ev.preventDefault();
      btn.classList.remove('pressed');
      if (!PD.app.state.preview) return;
      if (key === 'POWER') { togglePower(); return; }
      const st = pressState[key];
      if (!st || !st.downAt) return;
      clearTimeout(st.timer);
      const dur = Date.now() - st.downAt;
      st.downAt = 0;
      if (st.longFired) { st.longFired = false; return; } // 长按后松开不再触发 CLICK
      const now = Date.now();
      if (st.lastClickAt && now - st.lastClickAt < 300) {
        st.lastClickAt = 0;
        fireInput(key, 'DOUBLE');
      } else {
        st.lastClickAt = now;
        fireInput(key, 'CLICK');
      }
    }
    u.on(btn, 'mousedown', down);
    u.on(btn, 'mouseup', up);
    u.on(btn, 'mouseleave', function () {
      if (btn.classList.contains('pressed')) {
        btn.classList.remove('pressed');
        if (PD.app.state.preview && key !== 'POWER') up();
      }
    });
  }

  // 全局键盘（由 app.js 路由到这里）
  function handleKey(ev) {
    // 预览模式：三键模拟
    if (PD.app.state.preview) {
      const map = { ArrowUp: 'UP', ArrowDown: 'DOWN', Enter: 'OK', ' ': 'OK' };
      const key = map[ev.key];
      if (!key) return false;
      ev.preventDefault();
      // 熄屏中：按键只唤醒（真机语义）
      if (!PD.app.state.doc.ui.backlight) {
        if (ev.type === 'keydown' && !ev.repeat) { wakeScreen(); PD.app.toast('屏幕已唤醒', 'info'); }
        return true;
      }
      const st = pressState[key] || (pressState[key] = {});
      if (ev.type === 'keydown') {
        if (st.downAt) return true;
        st.downAt = Date.now();
        st.longFired = false;
        st.timer = setTimeout(function () { st.longFired = true; fireInput(key, 'LONG'); }, PD.model.DEVICE.longPressMs);
      } else {
        if (!st.downAt) return true;
        clearTimeout(st.timer);
        st.downAt = 0;
        if (st.longFired) { st.longFired = false; return true; }
        const now = Date.now();
        if (st.lastClickAt && now - st.lastClickAt < 300) { st.lastClickAt = 0; fireInput(key, 'DOUBLE'); }
        else { st.lastClickAt = now; fireInput(key, 'CLICK'); }
      }
      return true;
    }
    // 编辑模式：方向键微调
    if (ev.type === 'keydown' && PD.app.state.selection.length && ev.key.indexOf('Arrow') === 0) {
      ev.preventDefault();
      const step = ev.shiftKey ? 10 : 1;
      const scr = PD.app.currentScreen();
      PD.app.state.selection.forEach(function (id) {
        const e = scr.elements.find(function (x) { return x.id === id; });
        if (!e) return;
        if (ev.key === 'ArrowLeft') e.x -= step;
        if (ev.key === 'ArrowRight') e.x += step;
        if (ev.key === 'ArrowUp') e.y -= step;
        if (ev.key === 'ArrowDown') e.y += step;
      });
      PD.app.commit(false);
      renderCanvas();
      renderPropsValuesOnly();
      return true;
    }
    return false;
  }

  // ---------- 屏幕列表 ----------
  function renderScreenList() {
    const st = PD.app.state;
    dom.screensList.innerHTML = '';
    st.doc.screens.forEach(function (s, i) {
      const row = u.el('div', { class: 'list-row' + (s.id === st.screenId ? ' active' : ''), 'data-sid': s.id }, [
        u.el('span', { class: 'row-idx', text: String(i + 1) }),
        u.el('span', { class: 'row-name', text: s.name }),
        u.el('span', { class: 'row-sub', text: s.elements.length + ' 元素' })
      ]);
      const del = u.el('button', { class: 'mini danger', title: '删除此屏幕（并清理关联交互）', text: '✕' });
      u.on(del, 'click', function (ev) {
        ev.stopPropagation();
        deleteScreen(s.id);
      });
      row.appendChild(u.el('span', { class: 'row-actions' }, [del]));
      u.on(row, 'click', function () {
        st.screenId = s.id;
        st.selection = [];
        st.previewFocus = null;
        refresh();
      });
      dom.screensList.appendChild(row);
    });
  }

  // 复制屏幕：元素与焦点顺序全部换新 id，自跳转绑定指向副本自身
  function duplicateScreen(sid) {
    const doc = PD.app.state.doc;
    const scr = doc.screens.find(function (s) { return s.id === sid; });
    if (!scr) return;
    const copy = u.deepClone(scr);
    copy.id = u.uid('s');
    copy.name = scr.name + ' 副本';
    const idMap = {};
    copy.elements.forEach(function (e) {
      const old = e.id;
      e.id = u.uid('el');
      idMap[old] = e.id;
    });
    copy.focusOrder = (copy.focusOrder || []).map(function (id) { return idMap[id]; }).filter(Boolean);
    PD.model.KEY_EVENTS.forEach(function (ev) {
      const b = copy.keys[ev];
      if (b && b.action === 'goto' && b.target === sid) b.target = copy.id; // 自跳转 → 副本自身
    });
    const idx = doc.screens.indexOf(scr);
    doc.screens.splice(idx + 1, 0, copy);
    PD.app.state.screenId = copy.id;
    PD.app.state.selection = [];
    PD.app.state.previewFocus = null;
    PD.app.commit();
    PD.app.toast('已复制屏幕「' + scr.name + '」→「' + copy.name + '」', 'ok');
  }

  // 删除屏幕，并联动清理所有关联交互（goto 指向它的按键绑定、预览返回栈、当前屏指针）
  function deleteScreen(sid) {
    const doc = PD.app.state.doc;
    if (doc.screens.length <= 1) {
      PD.app.toast('至少保留一个屏幕', 'err');
      return;
    }
    const scr = doc.screens.find(function (s) { return s.id === sid; });
    if (!scr) return;
    u.confirmModal({
      title: '删除屏幕？',
      message: '将删除屏幕「' + scr.name + '」。\n其它屏幕跳转到它的按键绑定将一并清除。',
      okText: '删除',
      danger: true
    }).then(function (ok) {
      if (!ok) return;

      doc.screens = doc.screens.filter(function (s) { return s.id !== sid; });

      // 关联交互清理：其它屏幕 keys 中 goto → 该屏 的绑定复位为「无」
      let cleared = 0;
      doc.screens.forEach(function (s) {
        PD.model.KEY_EVENTS.forEach(function (ev) {
          const b = s.keys[ev];
          if (b && b.action === 'goto' && b.target === sid) {
            b.action = 'none';
            b.target = '';
            b.label = '';
            cleared++;
          }
        });
        // 焦点顺序只引用本屏元素，无需跨屏清理
      });

      // 预览返回栈中残留的已删屏
      for (let i = backStack.length - 1; i >= 0; i--) {
        if (backStack[i] === sid) backStack.splice(i, 1);
      }
      if (PD.app.state.screenId === sid) {
        PD.app.state.screenId = doc.screens[0].id;
        PD.app.state.selection = [];
        PD.app.state.previewFocus = null;
      }
      PD.app.commit();
      PD.app.toast('已删除屏幕「' + scr.name + '」' +
        (cleared ? '，并清理 ' + cleared + ' 处跳转到它的按键绑定' : '（无其它屏幕跳转到它）'), 'ok');
    });
  }

  // ---------- 图层 ----------
  function renderLayers() {
    const st = PD.app.state;
    const scr = PD.app.currentScreen();
    dom.layersList.innerHTML = '';
    // 后画在上：列表倒序显示（顶层在最上）
    const els = scr.elements.slice().reverse();
    els.forEach(function (el) {
      const def = PD.widgets.DEFS[el.type] || { icon: '?' };
      const row = u.el('div', { class: 'list-row layer-row' + (st.selection.indexOf(el.id) >= 0 ? ' active' : '') }, [
        u.el('span', { class: 'row-idx', text: def.icon }),
        u.el('span', { class: 'row-name', text: el.name }),
        u.el('span', { class: 'row-sub', text: el.type })
      ]);
      u.on(row, 'click', function (ev) {
        if (ev.shiftKey) {
          const idx = st.selection.indexOf(el.id);
          if (idx >= 0) st.selection.splice(idx, 1); else st.selection.push(el.id);
        } else st.selection = [el.id];
        refresh();
      });
      const up = u.el('button', { class: 'mini', title: '上移一层', text: '↑' });
      const down = u.el('button', { class: 'mini', title: '下移一层', text: '↓' });
      const del = u.el('button', { class: 'mini danger', title: '删除', text: '✕' });
      u.on(up, 'click', function (ev) {
        ev.stopPropagation();
        const arr = scr.elements;
        const i = arr.indexOf(el);
        if (i < arr.length - 1) { arr.splice(i, 1); arr.splice(i + 1, 0, el); PD.app.commit(); }
      });
      u.on(down, 'click', function (ev) {
        ev.stopPropagation();
        const arr = scr.elements;
        const i = arr.indexOf(el);
        if (i > 0) { arr.splice(i, 1); arr.splice(i - 1, 0, el); PD.app.commit(); }
      });
      u.on(del, 'click', function (ev) {
        ev.stopPropagation();
        deleteElements([el.id]);
      });
      row.appendChild(u.el('span', { class: 'row-actions' }, [up, down, del]));
      dom.layersList.appendChild(row);
    });
  }

  function deleteElements(ids) {
    const scr = PD.app.currentScreen();
    scr.elements = scr.elements.filter(function (e) { return ids.indexOf(e.id) < 0; });
    scr.focusOrder = (scr.focusOrder || []).filter(function (id) { return ids.indexOf(id) < 0; });
    PD.app.state.selection = [];
    PD.app.commit();
  }

  // ---------- 画布 ----------
  function renderCanvas() {
    const st = PD.app.state;
    const scr = PD.app.currentScreen();
    // 内容画布：2× 像素渲染（最近邻缩放显示于真机屏幕区）
    const env = {
      zoom: 2,
      grid: false,
      rgb565: st.doc.ui.rgb565,
      backlight: st.doc.ui.backlight,
      selection: [],
      hoverIds: [],
      focusElId: st.preview ? st.previewFocus : null
    };
    R.renderView(dom.view, st.doc, scr, env, PD.app.offscreen);

    // 覆盖层：选中手柄/悬停/布局网格（CSS 分辨率，清晰可点）
    const rect = dom.view.getBoundingClientRect();
    if (rect.width > 0) {
      const dpr = window.devicePixelRatio || 1;
      const ov = dom.overlay;
      const pw = Math.round(rect.width * dpr), ph = Math.round(rect.height * dpr);
      if (ov.width !== pw || ov.height !== ph) { ov.width = pw; ov.height = ph; }
      const octx = ov.getContext('2d');
      octx.setTransform(dpr, 0, 0, dpr, 0, 0);
      octx.clearRect(0, 0, rect.width, rect.height);
      R.drawOverlay(ov, {
        zoom: rect.width / R.W,
        grid: st.doc.ui.grid,
        selection: st.preview ? [] : st.selection,
        hoverIds: st.preview ? [] : st.hoverIds
      }, scr);
    }

    // 状态栏
    if (!st.preview) {
      const sel = st.selection.map(function (id) {
        const e = scr.elements.find(function (x) { return x.id === id; });
        return e ? (e.name + ' ' + e.x + ',' + e.y + ' ' + e.w + '×' + e.h) : id;
      });
      dom.status.textContent = '屏幕「' + scr.name + '」 ' + scr.elements.length + ' 元素' +
        (sel.length ? '  |  选中: ' + sel.join('; ') : '');
    } else {
      dom.status.textContent = '预览中 · 当前屏幕「' + scr.name + '」  |  点击真机键位或 ↑/↓/Enter  |  长按 500ms = LONG  双击 = DOUBLE  POWER = 熄屏';
    }
    // 同步工具条状态
    dom.chkGrid.checked = !!st.doc.ui.grid;
    dom.chkRgb565.checked = !!st.doc.ui.rgb565;
    dom.rangeBacklight.value = st.doc.ui.backlight;
    dom.lblBacklight.textContent = st.doc.ui.backlight + '%';
  }

  // ---------- 属性面板 ----------
  function fieldRow(label, input, hint) {
    return u.el('div', { class: 'field' }, [
      u.el('label', { text: label }),
      input,
      hint ? u.el('div', { class: 'hint', text: hint }) : null
    ]);
  }
  function numberField(label, value, onChange, min, max) {
    const input = u.el('input', { type: 'number', value: String(value), 'data-field': label });
    if (min !== undefined) input.min = String(min);
    if (max !== undefined) input.max = String(max);
    u.on(input, 'input', function () {
      const v = parseInt(input.value, 10);
      if (!isNaN(v)) onChange(v);
    });
    u.on(input, 'change', function () { PD.app.commit(); });
    return input;
  }
  function textField(label, value, onChange) {
    const input = u.el('input', { type: 'text', value: value || '', 'data-field': label });
    u.on(input, 'input', function () { onChange(input.value); });
    u.on(input, 'change', function () { PD.app.commit(); });
    return input;
  }
  function textareaField(label, value, onChange) {
    const input = u.el('textarea', { 'data-field': label, rows: '2' });
    input.value = value || '';
    u.on(input, 'input', function () { onChange(input.value); });
    u.on(input, 'change', function () { PD.app.commit(); });
    return input;
  }
  function selectField(label, value, options, onChange) {
    const sel = u.el('select', { 'data-field': label });
    options.forEach(function (o) {
      sel.appendChild(u.el('option', { value: o.value, text: o.label, selected: o.value === value ? 'selected' : null }));
    });
    u.on(sel, 'change', function () { onChange(sel.value); PD.app.commit(); });
    return sel;
  }
  function checkboxField(label, value, onChange) {
    const wrap = u.el('div', { class: 'check-wrap' });
    const input = u.el('input', { type: 'checkbox', 'data-field': label });
    input.checked = !!value;
    u.on(input, 'change', function () { onChange(input.checked); PD.app.commit(); });
    wrap.appendChild(input);
    wrap.appendChild(u.el('span', { text: label }));
    return wrap;
  }
  function colorField(label, value, onChange) {
    const wrap = u.el('div', { class: 'color-wrap' });
    const color = u.el('input', { type: 'color' });
    color.value = u.normHex(value).slice(0, 7);
    const hex = u.el('input', { type: 'text', class: 'hex', value: u.normHex(value).toUpperCase(), 'data-field': label });
    const badge = u.el('span', { class: 'rgb565-badge', text: '565:0x' + u.rgb565Value(value).toString(16).toUpperCase().padStart(4, '0') });
    function apply(v, fromPicker) {
      if (!u.isHexColor(v)) return;
      const h = u.normHex(v);
      if (!fromPicker) color.value = h.slice(0, 7);
      hex.value = h.toUpperCase();
      badge.textContent = '565:0x' + u.rgb565Value(h).toString(16).toUpperCase().padStart(4, '0');
      onChange(h);
    }
    u.on(color, 'input', function () { apply(color.value, true); });
    u.on(color, 'change', function () { PD.app.commit(); });
    u.on(hex, 'input', function () { apply(hex.value, false); });
    u.on(hex, 'change', function () { PD.app.commit(); });
    wrap.appendChild(color);
    wrap.appendChild(hex);
    wrap.appendChild(badge);
    return wrap;
  }

  function renderProps() {
    const st = PD.app.state;
    const scr = PD.app.currentScreen();
    const panel = dom.props;
    panel.innerHTML = '';

    if (st.selection.length === 0) {
      // 屏幕属性
      panel.appendChild(u.el('h3', { text: '屏幕属性' }));
      panel.appendChild(fieldRow('名称', textField('name', scr.name, function (v) { scr.name = v; renderScreenList(); renderCanvas(); })));
      panel.appendChild(fieldRow('说明', textareaField('desc', scr.desc, function (v) { scr.desc = v; })));
      panel.appendChild(fieldRow('背景色', colorField('bg', scr.bg, function (v) { scr.bg = v; renderCanvas(); })));

      // 焦点顺序
      panel.appendChild(u.el('h3', { text: '焦点顺序（UP/DOWN 循环）' }));
      const foBox = u.el('div', { class: 'focus-box' });
      const focusables = scr.elements.filter(function (e) { return e.type === 'button' || e.type === 'listItem'; });
      if (!focusables.length) {
        foBox.appendChild(u.el('div', { class: 'hint', text: '此屏没有按钮/列表项可参与焦点' }));
      }
      (scr.focusOrder || []).forEach(function (fid, i) {
        const e = scr.elements.find(function (x) { return x.id === fid; });
        const row = u.el('div', { class: 'focus-row' }, [
          u.el('span', { text: (i + 1) + '. ' + (e ? e.name : fid) }),
          u.el('button', { class: 'mini', text: '↑', onclick: function () {
            if (i > 0) { const t = scr.focusOrder[i - 1]; scr.focusOrder[i - 1] = fid; scr.focusOrder[i] = t; PD.app.commit(); }
          } }),
          u.el('button', { class: 'mini', text: '↓', onclick: function () {
            if (i < scr.focusOrder.length - 1) { const t = scr.focusOrder[i + 1]; scr.focusOrder[i + 1] = fid; scr.focusOrder[i] = t; PD.app.commit(); }
          } }),
          u.el('button', { class: 'mini danger', text: '✕', onclick: function () {
            scr.focusOrder.splice(i, 1); PD.app.commit();
          } })
        ]);
        foBox.appendChild(row);
      });
      const addSel = u.el('select', {});
      addSel.appendChild(u.el('option', { value: '', text: '＋ 添加到焦点顺序' }));
      focusables.forEach(function (e) {
        if ((scr.focusOrder || []).indexOf(e.id) < 0) addSel.appendChild(u.el('option', { value: e.id, text: e.name }));
      });
      u.on(addSel, 'change', function () {
        if (!addSel.value) return;
        scr.focusOrder.push(addSel.value);
        PD.app.commit();
      });
      foBox.appendChild(addSel);
      panel.appendChild(foBox);
      panel.appendChild(u.el('div', { class: 'hint', text: '提示：预览模式下 UP/DOWN 在此顺序内循环并渲染选中样式。' }));

      const btnDupScreen = u.el('button', { class: 'btn', text: '复制' });
      u.on(btnDupScreen, 'click', function () { duplicateScreen(scr.id); });
      const btnDelScreen = u.el('button', { class: 'btn danger', text: '删除' });
      u.on(btnDelScreen, 'click', function () { deleteScreen(scr.id); });
      panel.appendChild(u.el('div', { class: 'row-actions pad' }, [btnDupScreen, btnDelScreen]));
      return;
    }

    // 元素属性（单选详表；多选只显示共同操作）
    if (st.selection.length > 1) {
      panel.appendChild(u.el('h3', { text: '已选中 ' + st.selection.length + ' 个元素' }));
      const btnDel = u.el('button', { class: 'btn danger', text: '删除所选' });
      u.on(btnDel, 'click', function () { deleteElements(st.selection.slice()); });
      panel.appendChild(btnDel);
      const btnDup = u.el('button', { class: 'btn', text: '复制所选' });
      u.on(btnDup, 'click', function () { duplicateElements(st.selection.slice()); });
      panel.appendChild(btnDup);
      return;
    }

    const el = scr.elements.find(function (x) { return x.id === st.selection[0]; });
    if (!el) { st.selection = []; renderProps(); return; }
    const def = PD.widgets.DEFS[el.type] || { label: el.type, hint: '' };
    panel.appendChild(u.el('h3', {}, [
      u.el('span', { text: def.label + ' ' }),
      u.el('span', { class: 'badge', text: el.type })
    ]));
    if (def.hint) panel.appendChild(u.el('div', { class: 'hint', text: def.hint }));

    panel.appendChild(fieldRow('名称', textField('name', el.name, function (v) { el.name = v; renderLayers(); renderCanvas(); })));
    const geo = u.el('div', { class: 'geo-grid' }, [
      numberField('x', el.x, function (v) { el.x = v; renderCanvas(); }),
      numberField('y', el.y, function (v) { el.y = v; renderCanvas(); }),
      numberField('w', el.w, function (v) { el.w = Math.max(1, v); renderCanvas(); }, 1),
      numberField('h', el.h, function (v) { el.h = Math.max(1, v); renderCanvas(); }, 1)
    ]);
    panel.appendChild(fieldRow('x / y / w / h', geo));

    const p = el.props;
    function onProp(k, redraw) {
      return function (v) { p[k] = v; if (redraw !== false) renderCanvas(); };
    }

    if (el.type === 'rect' || el.type === 'button' || el.type === 'listItem' || el.type === 'progress') {
      panel.appendChild(u.el('h4', { text: '外观' }));
    }
    if (el.type === 'rect') {
      panel.appendChild(fieldRow('填充', colorField('fill', p.fill, onProp('fill'))));
      panel.appendChild(fieldRow('边框宽', numberField('borderW', p.borderW, onProp('borderW'), 0, 20)));
      panel.appendChild(fieldRow('边框色', colorField('borderColor', p.borderColor, onProp('borderColor'))));
      panel.appendChild(fieldRow('圆角', numberField('radius', p.radius, onProp('radius'), 0, 30)));
      panel.appendChild(fieldRow('透明度%', numberField('opacity', p.opacity, onProp('opacity'), 0, 100)));
      panel.appendChild(checkboxField('像素风投影（+5,+6）', p.shadow, onProp('shadow')));
    }
    if (el.type === 'label') {
      panel.appendChild(fieldRow('文本', textareaField('text', p.text, function (v) { p.text = v; renderCanvas(); renderLayers(); })));
      panel.appendChild(fieldRow('字体', selectField('fontId', p.fontId, fontOptions(), onProp('fontId'))));
      panel.appendChild(fieldRow('颜色', colorField('color', p.color, onProp('color'))));
      panel.appendChild(fieldRow('对齐', selectField('align', p.align, [
        { value: 'left', label: '左' }, { value: 'center', label: '居中' }, { value: 'right', label: '右' }
      ], onProp('align'))));
      panel.appendChild(fieldRow('行高(0=自动)', numberField('lineHeight', p.lineHeight, onProp('lineHeight'), 0, 80)));
    }
    if (el.type === 'button' || el.type === 'listItem') {
      panel.appendChild(fieldRow('文本', textareaField('text', p.text, function (v) { p.text = v; renderCanvas(); })));
      panel.appendChild(fieldRow('字体', selectField('fontId', p.fontId, fontOptions(), onProp('fontId'))));
      panel.appendChild(fieldRow('文字色', colorField('textColor', p.textColor, onProp('textColor'))));
      panel.appendChild(fieldRow('对齐', selectField('align', p.align, [
        { value: 'left', label: '左' }, { value: 'center', label: '居中' }, { value: 'right', label: '右' }
      ], onProp('align'))));
      if (el.type === 'listItem') {
        panel.appendChild(fieldRow('图标', selectField('icon', p.icon, [{ value: '', label: '（无）' }].concat(
          PD.model.SYMBOLS.map(function (s) { return { value: s.lv, label: s.name + ' ' + s.lv }; })
        ), onProp('icon'))));
      }
      panel.appendChild(u.el('h4', { text: '三态样式' }));
      panel.appendChild(fieldRow('普通填充', colorField('fill', p.fill, onProp('fill'))));
      panel.appendChild(fieldRow('边框宽', numberField('borderW', p.borderW, onProp('borderW'), 0, 10)));
      panel.appendChild(fieldRow('边框色', colorField('borderColor', p.borderColor, onProp('borderColor'))));
      panel.appendChild(fieldRow('圆角', numberField('radius', p.radius, onProp('radius'), 0, 30)));
      panel.appendChild(fieldRow('选中填充', colorField('selectedFill', p.selectedFill, onProp('selectedFill'))));
      panel.appendChild(fieldRow('选中边框', colorField('selectedBorder', p.selectedBorder, onProp('selectedBorder'))));
      panel.appendChild(fieldRow('禁用填充', colorField('disabledFill', p.disabledFill, onProp('disabledFill'))));
      panel.appendChild(checkboxField('预览选中态', p.selected, onProp('selected')));
      panel.appendChild(checkboxField('预览禁用态', p.disabled, onProp('disabled')));
    }
    if (el.type === 'progress') {
      panel.appendChild(fieldRow('值%', numberField('value', p.value, onProp('value'), 0, 100)));
      panel.appendChild(fieldRow('轨道色', colorField('trackColor', p.trackColor, onProp('trackColor'))));
      panel.appendChild(fieldRow('填充色', colorField('fillColor', p.fillColor, onProp('fillColor'))));
      panel.appendChild(fieldRow('圆角', numberField('radius', p.radius, onProp('radius'), 0, 30)));
    }
    if (el.type === 'arc') {
      panel.appendChild(fieldRow('值', numberField('value', p.value, onProp('value'))));
      panel.appendChild(fieldRow('最小/最大', u.el('div', { class: 'geo-grid' }, [
        numberField('min', p.min, onProp('min')),
        numberField('max', p.max, onProp('max'))
      ])));
      panel.appendChild(fieldRow('起始角°', numberField('startDeg', p.startDeg, onProp('startDeg'))));
      panel.appendChild(fieldRow('扫过角°', numberField('sweepDeg', p.sweepDeg, onProp('sweepDeg'))));
      panel.appendChild(fieldRow('线宽', numberField('thickness', p.thickness, onProp('thickness'), 1, 40)));
      panel.appendChild(fieldRow('轨道色', colorField('trackColor', p.trackColor, onProp('trackColor'))));
      panel.appendChild(fieldRow('填充色', colorField('fillColor', p.fillColor, onProp('fillColor'))));
      panel.appendChild(checkboxField('圆头线帽', p.rounded, onProp('rounded')));
    }
    if (el.type === 'image') {
      panel.appendChild(fieldRow('资源', selectField('assetId', p.assetId, [{ value: '', label: '（无/占位）' }].concat(
        (PD.app.state.doc.assets || []).map(function (a) { return { value: a.id, label: a.name }; })
      ), onProp('assetId'))));
      panel.appendChild(fieldRow('适配', selectField('fit', p.fit, [
        { value: 'contain', label: 'contain' }, { value: 'cover', label: 'cover' }, { value: 'stretch', label: 'stretch' }
      ], onProp('fit'))));
      panel.appendChild(fieldRow('占位色', colorField('placeholderColor', p.placeholderColor, onProp('placeholderColor'))));
    }
    if (el.type === 'icon') {
      panel.appendChild(fieldRow('符号', selectField('symbol', p.symbol, PD.model.SYMBOLS.map(function (s) {
        return { value: s.lv, label: s.name + ' ' + s.lv };
      }), onProp('symbol'))));
      panel.appendChild(fieldRow('颜色', colorField('color', p.color, onProp('color'))));
      panel.appendChild(fieldRow('字号', numberField('size', p.size, onProp('size'), 8, 48)));
    }
    if (el.type === 'battery') {
      panel.appendChild(fieldRow('颜色', colorField('color', p.color, onProp('color'))));
      panel.appendChild(fieldRow('SOC 预览%', numberField('soc', p.soc, onProp('soc'), 0, 100)));
      panel.appendChild(checkboxField('显示百分比', p.showPercent, onProp('showPercent')));
      panel.appendChild(checkboxField('模拟 -1 降级', p.unavailable, onProp('unavailable')));
    }

    panel.appendChild(u.el('h4', { text: '行为注记（进交接文档）' }));
    panel.appendChild(textareaField('note', el.note, function (v) { el.note = v; }));

    const actions = u.el('div', { class: 'row-actions pad' });
    const bDup = u.el('button', { class: 'btn', text: '复制 (Ctrl+D)' });
    u.on(bDup, 'click', function () { duplicateElements([el.id]); });
    const bDel = u.el('button', { class: 'btn danger', text: '删除' });
    u.on(bDel, 'click', function () { deleteElements([el.id]); });
    actions.appendChild(bDup);
    actions.appendChild(bDel);
    panel.appendChild(actions);
  }

  function renderPropsValuesOnly() {
    // 拖动中更新几何输入框而不重建 DOM
    const st = PD.app.state;
    if (st.selection.length !== 1) return;
    const el = PD.app.currentScreen().elements.find(function (x) { return x.id === st.selection[0]; });
    if (!el) return;
    const inputs = dom.props.querySelectorAll('.geo-grid input[type=number]');
    if (inputs.length >= 4) {
      inputs[0].value = el.x; inputs[1].value = el.y; inputs[2].value = el.w; inputs[3].value = el.h;
    }
  }

  function fontOptions() {
    return PD.app.state.doc.fonts.map(function (f) {
      return { value: f.id, label: f.label + (f.baseline ? '' : ' ⚠') };
    });
  }

  function duplicateElements(ids) {
    const scr = PD.app.currentScreen();
    const newIds = [];
    ids.forEach(function (id) {
      const el = scr.elements.find(function (x) { return x.id === id; });
      if (!el) return;
      const copy = u.deepClone(el);
      copy.id = u.uid('el');
      copy.name = el.name + ' 副本';
      copy.x += 8; copy.y += 8;
      scr.elements.push(copy);
      newIds.push(copy.id);
    });
    PD.app.state.selection = newIds;
    PD.app.commit();
  }

  // ---------- 字模管理（字符清单 = 字模覆盖契约）----------
  function openFontManager() {
    const doc = PD.app.state.doc;
    function usedChars(fontId) {
      const item = PD.export.charsetForFonts(doc).find(function (x) { return x.font.id === fontId; });
      return item ? item.chars : [];
    }
    function nonAscii(list) {
      return list.filter(function (c) {
        const code = c.charCodeAt(0);
        return !(code >= 0x20 && code <= 0x7E);
      });
    }

    const mask = u.el('div', { class: 'fm-mask' });
    const panel = u.el('div', { class: 'fm-panel' });
    panel.appendChild(u.el('h3', { text: '字体与字模管理' }));
    panel.appendChild(u.el('div', {
      class: 'hint',
      text: '自定义子集的「字符清单」是字模覆盖契约：文本中每个非 ASCII 字符必须在清单内（ASCII 0x20-0x7E 由生成命令恒含）。导出的 lv_font_conv 命令按实际用字生成，开发照单转换即可。'
    }));

    doc.fonts.forEach(function (f) {
      const used = usedChars(f.id);
      const usedNa = nonAscii(used);
      const missing = usedNa.filter(function (c) { return String(f.charset || '').indexOf(c) < 0; });
      const card = u.el('div', { class: 'fm-card' });

      // 头行：名称 / lv_symbol / 覆盖 / 基线
      const name = u.el('input', { type: 'text', class: 'fm-name', value: f.label, title: '字体名称' });
      u.on(name, 'change', function () { f.label = name.value; PD.app.commit(false); });
      const sym = u.el('input', { type: 'text', class: 'fm-sym', value: f.lvSymbol, title: '固件符号名（lv_font_* / app_font_*）' });
      u.on(sym, 'change', function () { f.lvSymbol = sym.value; PD.app.commit(false); });
      const cov = u.el('select', { title: '字模覆盖类型' });
      [['ascii', '仅 ASCII'], ['cjk-subset', 'CJK 子集'], ['custom', '自定义子集']].forEach(function (o) {
        cov.appendChild(u.el('option', { value: o[0], text: o[1], selected: f.coverage === o[0] ? 'selected' : null }));
      });
      u.on(cov, 'change', function () {
        f.coverage = cov.value;
        PD.app.commit(false);
        mask.remove();
        openFontManager();
      });
      const baseWrap = u.el('label', { class: 'fm-base' });
      const base = u.el('input', { type: 'checkbox' });
      base.checked = !!f.baseline;
      u.on(base, 'change', function () { f.baseline = base.checked; PD.app.commit(false); });
      baseWrap.appendChild(base);
      baseWrap.appendChild(u.el('span', { text: '基线已启用' }));
      card.appendChild(u.el('div', { class: 'fm-head' }, [name, sym, cov, baseWrap]));

      // 字符清单（仅 custom）
      if (f.coverage === 'custom') {
        const cs = u.el('textarea', { class: 'fm-charset', rows: '2', placeholder: '该字体计划覆盖的非 ASCII 字符（如：亮度设置音量）' });
        cs.value = f.charset || '';
        u.on(cs, 'change', function () {
          f.charset = cs.value;
          PD.app.commit(false);
          mask.remove();
          openFontManager();
        });
        card.appendChild(u.el('div', { class: 'hint', text: '字符清单（charset）' }));
        card.appendChild(cs);
      }

      // 用字统计与一键补齐
      const stat = u.el('div', { class: 'fm-stat' });
      stat.appendChild(u.el('span', { text: '本设计用到：「' + used.join('') + '」' }));
      if (f.coverage === 'custom') {
        if (missing.length) {
          stat.appendChild(u.el('span', { class: 'fm-missing', text: '缺 ' + missing.length + ' 字：「' + missing.join('') + '」' }));
          const fix = u.el('button', { class: 'btn primary sm', text: '补齐用到的字符' });
          u.on(fix, 'click', function () {
            const set = {};
            String(f.charset || '').split('').forEach(function (c) { if (c) set[c] = true; });
            missing.forEach(function (c) { set[c] = true; });
            f.charset = Object.keys(set).join('');
            PD.app.commit(false);
            PD.app.toast('已把「' + missing.join('') + '」补入 ' + f.lvSymbol + ' 的字符清单', 'ok');
            mask.remove();
            openFontManager();
          });
          stat.appendChild(fix);
        } else {
          stat.appendChild(u.el('span', { class: 'fm-ok', text: '✓ 覆盖完整' }));
        }
      }
      card.appendChild(stat);
      panel.appendChild(card);
    });

    const close = u.el('button', { class: 'btn primary', text: '关闭' });
    u.on(close, 'click', function () { mask.remove(); });
    panel.appendChild(u.el('div', { class: 'fm-foot' }, [close]));
    u.on(mask, 'click', function (ev) { if (ev.target === mask) mask.remove(); });
    mask.appendChild(panel);
    document.body.appendChild(mask);
  }

  // ---------- 刷新入口 ----------
  function refresh() {
    renderScreenList();
    renderLayers();
    renderCanvas();
    renderProps();
  }

  return {
    init: init,
    refresh: refresh,
    renderCanvas: renderCanvas,
    handleKey: handleKey,
    deleteElements: deleteElements,
    deleteScreen: deleteScreen,
    duplicateScreen: duplicateScreen,
    duplicateElements: duplicateElements
  };
})();
