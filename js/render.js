// passport_design — render.js
// 渲染管线：240×320 离屏渲染（真实分辨率）→ RGB565 量化 → 最近邻缩放合成到视图。
// 圆角 30px 遮罩（屏外纯黑）、背光亮度、像素网格、选中/悬停覆盖层。
'use strict';
window.PD = window.PD || {};

PD.render = (function () {
  const u = PD.util;
  const W = 240, H = 320, RADIUS = 30;

  function createOffscreen() {
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    return c;
  }

  function drawElement(ctx, el, doc, env) {
    const def = PD.widgets.DEFS[el.type];
    if (!def) return;
    // 预览焦点：列表选中项按 selected 样式渲染（模拟 UP/DOWN 移动焦点）
    let drawEl = el;
    if (env.focusElId && env.focusElId === el.id &&
        (el.type === 'button' || el.type === 'listItem') && el.props.selected !== undefined) {
      drawEl = Object.assign({}, el, { props: Object.assign({}, el.props, { selected: true }) });
    }
    def.draw(ctx, drawEl, doc);
  }

  // 渲染屏幕内容到 240×320 离屏画布
  function renderToOffscreen(off, doc, screen, env) {
    env = env || {};
    const ctx = off.getContext('2d');
    ctx.clearRect(0, 0, W, H);
    // 屏幕背景
    ctx.fillStyle = screen.bg || '#000000';
    ctx.fillRect(0, 0, W, H);
    // 数组顺序即绘制顺序（后画覆盖先画），与交付表格 z 列一致
    (screen.elements || []).forEach(function (el) { drawElement(ctx, el, doc, env); });
    // RGB565 量化（ST7789 真实色深模拟；5/6/5 按位复制回扩，与面板一致）
    if (env.rgb565) {
      const img = ctx.getImageData(0, 0, W, H);
      const d = img.data;
      for (let i = 0; i < d.length; i += 4) {
        const r5 = d[i] >> 3, g6 = d[i + 1] >> 2, b5 = d[i + 2] >> 3;
        d[i] = (r5 << 3) | (r5 >> 2);           // R5
        d[i + 1] = (g6 << 2) | (g6 >> 4);       // G6
        d[i + 2] = (b5 << 3) | (b5 >> 2);       // B5
      }
      ctx.putImageData(img, 0, 0);
    }
  }

  function roundedClip(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  // 合成到视图画布（含圆角遮罩、背光、网格）；返回几何信息供编辑器映射坐标
  function composite(off, view, env) {
    env = env || {};
    const zoom = env.zoom || 1;
    const vw = Math.round(W * zoom), vh = Math.round(H * zoom);
    if (view.width !== vw || view.height !== vh) { view.width = vw; view.height = vh; }
    const ctx = view.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    // 屏幕外区域：纯黑（对应固件 flush 圆角遮罩）
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, vw, vh);
    ctx.save();
    roundedClip(ctx, 0, 0, vw, vh, RADIUS * zoom);
    ctx.clip();
    ctx.drawImage(off, 0, 0, W, H, 0, 0, vw, vh);
    // 背光模拟：0..100%
    const bl = env.backlight === undefined ? 100 : env.backlight;
    if (bl < 100) {
      ctx.fillStyle = 'rgba(0,0,0,' + (0.88 * (1 - bl / 100)).toFixed(3) + ')';
      ctx.fillRect(0, 0, vw, vh);
    }
    // 像素网格（缩放 ≥ 4 时）
    if (env.grid && zoom >= 4) {
      ctx.strokeStyle = 'rgba(120,160,190,0.35)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 1; x < W; x++) { ctx.moveTo(x * zoom, 0); ctx.lineTo(x * zoom, vh); }
      for (let y = 1; y < H; y++) { ctx.moveTo(0, y * zoom); ctx.lineTo(vw, y * zoom); }
      ctx.stroke();
    }
    ctx.restore();
    return { zoom: zoom, w: vw, h: vh };
  }

  // 选中/悬停覆盖层（在覆盖画布坐标系绘制，线条/文字保持清晰）
  function drawOverlay(view, env, screen) {
    const ctx = view.getContext('2d');
    const zoom = env.zoom || 1;
    // 布局网格：10px 逻辑格（50px 加重）
    if (env.grid) {
      const w = W * zoom, h = H * zoom;
      ctx.save();
      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      for (let x = 10; x < W; x += 10) { ctx.moveTo(Math.round(x * zoom) + 0.5, 0); ctx.lineTo(Math.round(x * zoom) + 0.5, h); }
      for (let y = 10; y < H; y += 10) { ctx.moveTo(0, Math.round(y * zoom) + 0.5); ctx.lineTo(w, Math.round(y * zoom) + 0.5); }
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.beginPath();
      for (let x = 50; x < W; x += 50) { ctx.moveTo(Math.round(x * zoom) + 0.5, 0); ctx.lineTo(Math.round(x * zoom) + 0.5, h); }
      for (let y = 50; y < H; y += 50) { ctx.moveTo(0, Math.round(y * zoom) + 0.5); ctx.lineTo(w, Math.round(y * zoom) + 0.5); }
      ctx.stroke();
      ctx.restore();
    }
    (env.hoverIds || []).forEach(function (id) {
      const el = (screen.elements || []).find(function (e) { return e.id === id; });
      if (!el) return;
      ctx.save();
      ctx.setLineDash([4, 3]);
      ctx.strokeStyle = 'rgba(255,217,40,0.85)';
      ctx.lineWidth = 1;
      ctx.strokeRect(el.x * zoom + 0.5, el.y * zoom + 0.5, el.w * zoom - 1, el.h * zoom - 1);
      ctx.restore();
    });
    (env.selection || []).forEach(function (id) {
      const el = (screen.elements || []).find(function (e) { return e.id === id; });
      if (!el) return;
      ctx.save();
      ctx.strokeStyle = '#FFD928';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(el.x * zoom, el.y * zoom, el.w * zoom, el.h * zoom);
      // 8 个缩放手柄
      const hs = 7;
      const pts = handlePoints(el, zoom);
      pts.forEach(function (p) {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
        ctx.strokeStyle = '#17202A';
        ctx.lineWidth = 1;
        ctx.strokeRect(p.x - hs / 2, p.y - hs / 2, hs, hs);
      });
      // 名称标签
      ctx.font = '11px sans-serif';
      const tag = el.name + ' (' + el.x + ',' + el.y + ' ' + el.w + '×' + el.h + ')';
      const tw = ctx.measureText(tag).width;
      const ty = Math.max(0, el.y * zoom - 18);
      ctx.fillStyle = 'rgba(23,32,42,0.92)';
      ctx.fillRect(el.x * zoom, ty, tw + 10, 16);
      ctx.fillStyle = '#FFD928';
      ctx.fillText(tag, el.x * zoom + 5, ty + 12);
      ctx.restore();
    });
  }

  function handlePoints(el, zoom) {
    const x = el.x * zoom, y = el.y * zoom, w = el.w * zoom, h = el.h * zoom;
    return [
      { x: x, y: y, dir: 'nw' }, { x: x + w / 2, y: y, dir: 'n' }, { x: x + w, y: y, dir: 'ne' },
      { x: x, y: y + h / 2, dir: 'w' }, { x: x + w, y: y + h / 2, dir: 'e' },
      { x: x, y: y + h, dir: 'sw' }, { x: x + w / 2, y: y + h, dir: 's' }, { x: x + w, y: y + h, dir: 'se' }
    ];
  }

  // 一站式：doc+screen → 视图画布（编辑器/导出共用）
  function renderView(view, doc, screen, env, offscreen) {
    const off = offscreen || createOffscreen();
    renderToOffscreen(off, doc, screen, env);
    const geo = composite(off, view, env);
    if (env.selection || env.hoverIds) drawOverlay(view, env, screen);
    return geo;
  }

  return {
    W: W, H: H, RADIUS: RADIUS,
    createOffscreen: createOffscreen,
    renderToOffscreen: renderToOffscreen,
    composite: composite,
    drawOverlay: drawOverlay,
    renderView: renderView,
    handlePoints: handlePoints
  };
})();
