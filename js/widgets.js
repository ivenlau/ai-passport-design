// passport_design — widgets.js
// 组件目录：与固件 LVGL/BSP 能力对应的 9 类可设计元素。每类含默认属性与 1:1 绘制函数。
// 绘制目标是 240×320 离屏画布（设备真实分辨率），字体近似 Montserrat/系统字体。
'use strict';
window.PD = window.PD || {};

PD.widgets = (function () {
  const u = PD.util;

  const FONT_STACK = '"Montserrat", "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  const CJK_STACK = '"Source Han Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif';

  function fontOf(doc, fontId) {
    const f = (doc.fonts || []).find(function (x) { return x.id === fontId; });
    return f || { size: 14, family: 'montserrat', lvSymbol: 'lv_font_montserrat_14', coverage: 'ascii' };
  }
  function canvasFont(f) {
    const stack = (f.family === 'custom' || f.coverage !== 'ascii') ? CJK_STACK : FONT_STACK;
    return f.size + 'px ' + stack;
  }
  function hasCjk(text) {
    for (let i = 0; i < String(text || '').length; i++) if (u.isCjk(String(text)[i])) return true;
    return false;
  }

  function roundRectPath(ctx, x, y, w, h, r) {
    r = Math.min(r || 0, w / 2, h / 2);
    ctx.beginPath();
    if (ctx.roundRect) { ctx.roundRect(x, y, w, h, r); return; }
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function fillRectBox(ctx, el, p) {
    if (p.shadow) {
      ctx.fillStyle = p.shadowColor || '#17202A';
      roundRectPath(ctx, el.x + 5, el.y + 6, el.w, el.h, p.radius || 0);
      ctx.fill();
    }
    ctx.globalAlpha = (p.opacity === undefined ? 100 : p.opacity) / 100;
    ctx.fillStyle = p.fill || '#F4F4EA';
    roundRectPath(ctx, el.x, el.y, el.w, el.h, p.radius || 0);
    ctx.fill();
    if (p.borderW > 0) {
      ctx.lineWidth = p.borderW;
      ctx.strokeStyle = p.borderColor || '#17202A';
      // LVGL 边框画在盒内：内缩半个线宽近似
      roundRectPath(ctx, el.x + p.borderW / 2, el.y + p.borderW / 2, el.w - p.borderW, el.h - p.borderW, p.radius || 0);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  function drawTextInBox(ctx, text, box, font, color, align, lineHeight) {
    const lines = String(text || '').split('\n');
    const lh = lineHeight && lineHeight > 0 ? lineHeight : Math.round(font.size * 1.25);
    const total = lh * lines.length;
    let y = box.y + (box.h - total) / 2 + lh * 0.72;
    ctx.font = canvasFont(font);
    ctx.fillStyle = color;
    ctx.textBaseline = 'alphabetic';
    lines.forEach(function (line) {
      const w = ctx.measureText(line).width;
      let x = box.x + 4;
      if (align === 'center') x = box.x + (box.w - w) / 2;
      else if (align === 'right') x = box.x + box.w - w - 4;
      ctx.fillText(line, Math.round(x), Math.round(y));
      y += lh;
    });
    return total;
  }

  function drawBatteryIcon(ctx, x, y, w, h, color, fillRatio) {
    ctx.fillStyle = color;
    ctx.lineWidth = 1;
    ctx.strokeStyle = color;
    roundRectPath(ctx, x, y, w - 3, h, 2);
    ctx.stroke();
    ctx.fillRect(x + w - 3, y + h * 0.28, 3, h * 0.44); // 正极
    const pad = 2;
    const innerW = (w - 3) - pad * 2;
    const innerH = h - pad * 2;
    if (fillRatio > 0) {
      ctx.fillRect(x + pad, y + pad, Math.round(innerW * u.clamp(fillRatio, 0, 1)), innerH);
    }
  }

  const DEFS = {
    rect: {
      label: '色块 / 面板', icon: '▢', group: '容器',
      hint: '纯色面板。固件对应 lv_obj + bg/border/radius 样式；可开启像素风投影（偏移 +5,+6）。',
      draw: function (ctx, el, doc) {
        fillRectBox(ctx, el, el.props);
      }
    },
    label: {
      label: '文本', icon: 'T', group: '内容',
      hint: 'lv_label。字体必须保证字模覆盖（中文需自定义子集或思源子集）。',
      draw: function (ctx, el, doc) {
        const p = el.props;
        const font = fontOf(doc, p.fontId);
        drawTextInBox(ctx, p.text, el, font, p.color, p.align, p.lineHeight);
      }
    },
    button: {
      label: '按钮', icon: '▭', group: '交互',
      hint: '面板+文本组合。选中态沿用 ui_pixel_set_selected 风格：选中=黄底白边，禁用=灰色，普通=纸色墨边。',
      draw: function (ctx, el, doc) {
        const p = el.props;
        const state = p.disabled ? 'disabled' : (p.selected ? 'selected' : 'normal');
        const box = {
          fill: state === 'disabled' ? p.disabledFill : (state === 'selected' ? p.selectedFill : p.fill),
          borderW: p.borderW,
          borderColor: state === 'selected' ? p.selectedBorder : p.borderColor,
          radius: p.radius
        };
        fillRectBox(ctx, el, box);
        const font = fontOf(doc, p.fontId);
        drawTextInBox(ctx, p.text, { x: el.x + 4, y: el.y, w: el.w - 8, h: el.h }, font, p.textColor, p.align, 0);
      }
    },
    listItem: {
      label: '列表项', icon: '☰', group: '交互',
      hint: '菜单/列表行：面板+文本+可选 LVGL 图标。UP/DOWN 移动选中（focusOrder），OK 确认。',
      draw: function (ctx, el, doc) {
        const p = el.props;
        const state = p.disabled ? 'disabled' : (p.selected ? 'selected' : 'normal');
        const box = {
          fill: state === 'disabled' ? p.disabledFill : (state === 'selected' ? p.selectedFill : p.fill),
          borderW: p.borderW,
          borderColor: state === 'selected' ? p.selectedBorder : p.borderColor,
          radius: p.radius
        };
        fillRectBox(ctx, el, box);
        const font = fontOf(doc, p.fontId);
        let tx = el.x + 8, tw = el.w - 16;
        if (p.icon) {
          const sym = PD.model.SYMBOLS.find(function (s) { return s.lv === p.icon; });
          ctx.font = (font.size) + 'px ' + FONT_STACK;
          ctx.fillStyle = p.textColor;
          ctx.textBaseline = 'alphabetic';
          const iconCh = sym ? sym.preview : '?';
          ctx.fillText(iconCh, el.x + 8, el.y + el.h / 2 + font.size * 0.36);
          tx += font.size + 8;
          tw -= font.size + 8;
        }
        drawTextInBox(ctx, p.text, { x: tx, y: el.y, w: tw, h: el.h }, font, p.textColor, p.align, 0);
      }
    },
    progress: {
      label: '进度条', icon: '▮', group: '数据',
      hint: 'lv_bar。轨道建议浅色（#E2E2D6），避免深色轨道在低填充时像异物（Sound Sentry 教训）。',
      draw: function (ctx, el, doc) {
        const p = el.props;
        ctx.fillStyle = p.trackColor;
        roundRectPath(ctx, el.x, el.y, el.w, el.h, p.radius || 0);
        ctx.fill();
        const v = u.clamp(p.value, 0, 100) / 100;
        if (v > 0) {
          ctx.fillStyle = p.fillColor;
          roundRectPath(ctx, el.x, el.y, Math.max(el.h, el.w * v), el.h, p.radius || 0);
          ctx.fill();
        }
        if (p.borderW > 0) {
          ctx.lineWidth = p.borderW;
          ctx.strokeStyle = p.borderColor;
          roundRectPath(ctx, el.x + p.borderW / 2, el.y + p.borderW / 2, el.w - p.borderW, el.h - p.borderW, p.radius || 0);
          ctx.stroke();
        }
      }
    },
    arc: {
      label: '圆弧仪表', icon: '◠', group: '数据',
      hint: 'lv_arc。大数字读数请配定宽框（右对齐），防止位数变化推挤相邻元素。',
      draw: function (ctx, el, doc) {
        const p = el.props;
        const cx = el.x + el.w / 2, cy = el.y + el.h / 2;
        const r = Math.min(el.w, el.h) / 2 - p.thickness / 2;
        const start = (p.startDeg || 0) * Math.PI / 180;
        const sweep = (p.sweepDeg === undefined ? 270 : p.sweepDeg) * Math.PI / 180;
        ctx.lineWidth = p.thickness;
        ctx.lineCap = p.rounded ? 'round' : 'butt';
        ctx.strokeStyle = p.trackColor;
        ctx.beginPath();
        ctx.arc(cx, cy, r, start, start + sweep);
        ctx.stroke();
        const range = (p.max - p.min) || 100;
        const v = u.clamp((p.value - p.min) / range, 0, 1);
        if (v > 0) {
          ctx.strokeStyle = p.fillColor;
          ctx.beginPath();
          ctx.arc(cx, cy, r, start, start + sweep * v);
          ctx.stroke();
        }
        ctx.lineCap = 'butt';
      }
    },
    image: {
      label: '图片', icon: '▣', group: '内容',
      hint: 'RGB565 位图资源。无 PSRAM：图片必须放 Flash 资源分区/内嵌，尺寸受预算约束。',
      draw: function (ctx, el, doc) {
        const p = el.props;
        ctx.fillStyle = p.placeholderColor;
        ctx.fillRect(el.x, el.y, el.w, el.h);
        const asset = (doc.assets || []).find(function (a) { return a.id === p.assetId; });
        if (asset && asset.previewData) {
          if (!asset._img) {
            asset._img = new Image();
            asset._img.src = asset.previewData;
          }
          if (asset._img.complete && asset._img.naturalWidth) {
            const img = asset._img;
            let dw = el.w, dh = el.h, dx = el.x, dy = el.y;
            if (p.fit === 'contain') {
              const s = Math.min(el.w / img.naturalWidth, el.h / img.naturalHeight);
              dw = img.naturalWidth * s; dh = img.naturalHeight * s;
              dx = el.x + (el.w - dw) / 2; dy = el.y + (el.h - dh) / 2;
              ctx.drawImage(img, dx, dy, dw, dh);
            } else if (p.fit === 'cover') {
              ctx.save();
              ctx.beginPath(); ctx.rect(el.x, el.y, el.w, el.h); ctx.clip();
              const s = Math.max(el.w / img.naturalWidth, el.h / img.naturalHeight);
              dw = img.naturalWidth * s; dh = img.naturalHeight * s;
              dx = el.x + (el.w - dw) / 2; dy = el.y + (el.h - dh) / 2;
              ctx.drawImage(img, dx, dy, dw, dh);
              ctx.restore();
            } else {
              ctx.drawImage(img, el.x, el.y, el.w, el.h);
            }
            return;
          }
        }
        // 占位符：对角线 + 名称
        ctx.strokeStyle = '#B7C6CC';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(el.x, el.y); ctx.lineTo(el.x + el.w, el.y + el.h);
        ctx.moveTo(el.x + el.w, el.y); ctx.lineTo(el.x, el.y + el.h);
        ctx.stroke();
        ctx.fillStyle = '#8AA0AA';
        ctx.font = '10px ' + FONT_STACK;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(asset ? asset.name : 'image', el.x + el.w / 2, el.y + el.h / 2);
        ctx.textAlign = 'left';
        if (p.borderW > 0) {
          ctx.lineWidth = p.borderW;
          ctx.strokeStyle = p.borderColor;
          ctx.strokeRect(el.x + p.borderW / 2, el.y + p.borderW / 2, el.w - p.borderW, el.h - p.borderW);
        }
      }
    },
    icon: {
      label: 'LVGL 图标', icon: '✦', group: '内容',
      hint: 'LV_SYMBOL_* 字模符号（来自 Montserrat 符号位）。预览为近似字形。',
      draw: function (ctx, el, doc) {
        const p = el.props;
        const sym = PD.model.SYMBOLS.find(function (s) { return s.lv === p.symbol; });
        ctx.font = p.size + 'px ' + FONT_STACK;
        ctx.fillStyle = p.color;
        ctx.textBaseline = 'middle';
        ctx.textAlign = 'center';
        ctx.fillText(sym ? sym.preview : '?', el.x + el.w / 2, el.y + el.h / 2);
        ctx.textAlign = 'left';
      }
    },
    battery: {
      label: '电量显示', icon: '🔋', group: '数据',
      hint: 'bsp_battery_soc()（-1 时优雅降级，不画数字）。默认放右上角，避免与应用内容重叠。',
      draw: function (ctx, el, doc) {
        const p = el.props;
        const h = Math.min(el.h - 2, 12);
        const w = Math.min(el.w * 0.45, 24);
        const bx = el.x + el.w - w - 1, by = el.y + (el.h - h) / 2;
        if (p.unavailable) {
          // 降级：只画空壳，不画数字（约定：读数 -1）
          drawBatteryIcon(ctx, bx, by, w, h, p.color, 0);
          return;
        }
        const ratio = u.clamp(p.soc, 0, 100) / 100;
        drawBatteryIcon(ctx, bx, by, w, h, p.color, ratio);
        if (p.showPercent) {
          const font = { size: 14, family: 'montserrat' };
          ctx.font = canvasFont(font);
          ctx.fillStyle = p.color;
          ctx.textBaseline = 'middle';
          const t = p.soc + '%';
          const tw = ctx.measureText(t).width;
          ctx.fillText(t, bx - 4 - tw, el.y + el.h / 2 + 1);
        }
      }
    }
  };

  return {
    DEFS: DEFS,
    fontOf: fontOf,
    canvasFont: canvasFont,
    hasCjk: hasCjk,
    roundRectPath: roundRectPath
  };
})();
