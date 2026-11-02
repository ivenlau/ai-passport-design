// passport_design — interaction.js
// 交互页：三键事件绑定矩阵（UP/DOWN/OK × CLICK/LONG/DOUBLE/PRESS）与导航图。
// 规范：仅 CLICK/LONG（游戏可用 PRESS）代表用户意图；RELEASE 不作为命令。
'use strict';
window.PD = window.PD || {};

PD.interaction = (function () {
  const u = PD.util;
  let dom = {};

  function init() {
    dom = {
      screenSel: u.$('#flowScreenSel'),
      matrix: u.$('#keyMatrix'),
      graph: u.$('#navGraph'),
      legend: u.$('#flowLegend')
    };
    u.on(dom.screenSel, 'change', function () {
      PD.app.state.screenId = dom.screenSel.value;
      PD.app.refreshAll();
    });
  }

  function render() {
    const st = PD.app.state;
    const doc = st.doc;

    // 屏幕选择
    dom.screenSel.innerHTML = '';
    doc.screens.forEach(function (s) {
      dom.screenSel.appendChild(u.el('option', {
        value: s.id, text: s.name, selected: s.id === st.screenId ? 'selected' : null
      }));
    });

    // 绑定矩阵
    const scr = doc.screens.find(function (s) { return s.id === st.screenId; }) || doc.screens[0];
    dom.matrix.innerHTML = '';
    dom.matrix.appendChild(u.el('div', { class: 'matrix-head' }, [
      u.el('div', { text: '按键事件' }), u.el('div', { text: '动作' }), u.el('div', { text: '目标屏幕' }), u.el('div', { text: '动作说明（进交接文档）' })
    ]));

    const groups = [
      { label: 'UP（上）', prefix: 'UP' },
      { label: 'DOWN（下）', prefix: 'DOWN' },
      { label: 'OK（确定）', prefix: 'OK' }
    ];
    groups.forEach(function (g) {
      dom.matrix.appendChild(u.el('div', { class: 'matrix-group', text: g.label }));
      ['CLICK', 'LONG', 'DOUBLE', 'PRESS'].forEach(function (evName) {
        const ev = g.prefix + '_' + evName;
        const b = scr.keys[ev];
        const row = u.el('div', { class: 'matrix-row' + (evName === 'PRESS' ? ' dim' : '') });

        row.appendChild(u.el('div', { class: 'ev-name' }, [
          u.el('span', { text: ev.replace('_', ' ') }),
          evName === 'PRESS' ? u.el('span', { class: 'tag', text: '仅游戏' }) : null
        ]));

        const actSel = u.el('select', {});
        PD.model.KEY_ACTIONS.forEach(function (a) {
          actSel.appendChild(u.el('option', { value: a.id, text: a.label, selected: a.id === b.action ? 'selected' : null }));
        });
        u.on(actSel, 'change', function () {
          b.action = actSel.value;
          if (b.action !== 'goto') b.target = '';
          PD.app.commit();
        });
        row.appendChild(actSel);

        const targetSel = u.el('select', {});
        targetSel.appendChild(u.el('option', { value: '', text: b.action === 'goto' ? '（选择目标）' : '—' }));
        doc.screens.forEach(function (s) {
          targetSel.appendChild(u.el('option', { value: s.id, text: s.name, selected: s.id === b.target ? 'selected' : null }));
        });
        targetSel.disabled = b.action !== 'goto';
        u.on(targetSel, 'change', function () {
          b.target = targetSel.value;
          PD.app.commit();
        });
        row.appendChild(targetSel);

        const labelInput = u.el('input', { type: 'text', value: b.label || '', placeholder: b.action === 'action' ? '必填：描述该动作' : '可选' });
        u.on(labelInput, 'input', function () { b.label = labelInput.value; });
        u.on(labelInput, 'change', function () { PD.app.commit(); });
        row.appendChild(labelInput);

        dom.matrix.appendChild(row);
      });
    });

    // 导航图
    renderGraph(doc, scr);
    dom.legend.textContent = '三键语义：仅 CLICK / LONG 是用户意图（PRESS 仅即时游戏）；RELEASE 永远不是命令。' +
      '长按 = ' + PD.model.DEVICE.longPressMs + 'ms，短按窗口 = ' + PD.model.DEVICE.shortPressMs + 'ms。';
  }

  function renderGraph(doc, current) {
    const svg = dom.graph;
    svg.innerHTML = '';
    const W = svg.clientWidth || 720, H = 320;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    const n = doc.screens.length;
    // 圆形布局
    const cx = W / 2, cy = H / 2, radius = Math.min(W, H) / 2 - 70;
    const pos = {};
    doc.screens.forEach(function (s, i) {
      const ang = -Math.PI / 2 + i * 2 * Math.PI / Math.max(1, n);
      pos[s.id] = { x: cx + radius * Math.cos(ang), y: cy + radius * Math.sin(ang) };
    });

    const ns = 'http://www.w3.org/2000/svg';
    function mk(tag, attrs, text) {
      const e = document.createElementNS(ns, tag);
      for (const k in attrs) e.setAttribute(k, attrs[k]);
      if (text !== undefined) e.textContent = text;
      return e;
    }

    // 边
    doc.screens.forEach(function (s) {
      PD.model.KEY_EVENTS.forEach(function (ev) {
        const b = s.keys[ev];
        if (!b || b.action !== 'goto' || !b.target || !pos[b.target]) return;
        const a = pos[s.id], c = pos[b.target];
        const self = s.id === b.target;
        const stroke = b.action === 'goto' ? '#1689E8' : '#999';
        if (self) {
          svg.appendChild(mk('circle', { cx: a.x, cy: a.y - 34, r: 12, fill: 'none', stroke: stroke, 'stroke-width': 1.5 }));
        } else {
          const mx = (a.x + c.x) / 2, my = (a.y + c.y) / 2;
          svg.appendChild(mk('path', {
            d: 'M' + a.x + ',' + a.y + ' Q' + mx + ',' + (my - 24) + ' ' + c.x + ',' + c.y,
            fill: 'none', stroke: stroke, 'stroke-width': 1.5, 'marker-end': 'url(#arrow)'
          }));
          const evShort = ev.replace('_', ' ');
          svg.appendChild(mk('text', { x: mx, y: my - 14, 'text-anchor': 'middle', 'font-size': '10', fill: '#0872C9' }, evShort));
        }
      });
    });

    const defs = mk('defs', {});
    const marker = mk('marker', { id: 'arrow', viewBox: '0 0 10 10', refX: '9', refY: '5', markerWidth: '6', markerHeight: '6', orient: 'auto-start-reverse' });
    marker.appendChild(mk('path', { d: 'M0,0 L10,5 L0,10 z', fill: '#1689E8' }));
    defs.appendChild(marker);
    svg.appendChild(defs);

    // 节点
    doc.screens.forEach(function (s, i) {
      const p = pos[s.id];
      const isCur = current && s.id === current.id;
      const g = mk('g', { class: 'graph-node', style: 'cursor:pointer' });
      g.appendChild(mk('rect', {
        x: p.x - 52, y: p.y - 18, width: 104, height: 36, rx: 8,
        fill: isCur ? '#FFD928' : '#FFFFFF', stroke: isCur ? '#17202A' : '#B7C6CC', 'stroke-width': isCur ? 2.5 : 1.5
      }));
      g.appendChild(mk('text', { x: p.x, y: p.y + 4, 'text-anchor': 'middle', 'font-size': '12', fill: '#17202A' }, s.name));
      g.addEventListener('click', function () {
        PD.app.state.screenId = s.id;
        PD.app.refreshAll();
      });
      svg.appendChild(g);
    });
  }

  return { init: init, render: render };
})();
