// passport_design — util.js
// 通用工具：DOM、颜色、RGB565、文件下载等。全局命名空间 PD。
'use strict';
window.PD = window.PD || {};

PD.util = (function () {
  // ---------- DOM ----------
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function el(tag, attrs, children) {
    const node = document.createElement(tag);
    if (attrs) {
      for (const k in attrs) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on' && typeof attrs[k] === 'function') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      }
    }
    (children || []).forEach(function (c) {
      if (c === null || c === undefined) return;
      node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    });
    return node;
  }
  function on(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); return function () { target.removeEventListener(ev, fn, opts); }; }

  // ---------- 数值 ----------
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }
  function uid(prefix) {
    uid._n = (uid._n || 0) + 1;
    return (prefix || 'id') + '_' + Date.now().toString(36).slice(-4) + '_' + uid._n;
  }
  function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }
  function fmtDate(d) {
    d = d || new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  // ---------- 颜色 ----------
  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '').trim();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const n = parseInt(h, 16);
    if (isNaN(n)) return { r: 0, g: 0, b: 0 };
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }
  function rgbToHex(r, g, b) {
    function p(v) { v = clamp(Math.round(v), 0, 255).toString(16); return v.length < 2 ? '0' + v : v; }
    return '#' + p(r) + p(g) + p(b);
  }
  function isHexColor(s) { return /^#?[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$/.test(String(s || '').trim()); }
  function normHex(s) {
    if (!isHexColor(s)) return '#000000';
    let h = s.replace('#', '').toLowerCase();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    return '#' + h;
  }
  // RGB888 → RGB565 量化后按位复制回扩为 888（与 ST7789 面板 5/6/5→8/8/8 扩展一致）
  function quantize565Hex(hex) {
    const c = hexToRgb(hex);
    const r5 = (c.r >> 3) & 31, g6 = (c.g >> 2) & 63, b5 = (c.b >> 3) & 31;
    return rgbToHex((r5 << 3) | (r5 >> 2), (g6 << 2) | (g6 >> 4), (b5 << 3) | (b5 >> 2));
  }
  function rgb565Value(hex) {
    const c = hexToRgb(hex);
    return (((c.r >> 3) & 31) << 11) | (((c.g >> 2) & 63) << 5) | ((c.b >> 3) & 31);
  }
  // WCAG 相对亮度（sRGB 线性化）
  function luminance(hex) {
    const c = hexToRgb(hex);
    function ch(v) {
      v = v / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    }
    return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b);
  }
  // WCAG 对比度
  function contrastRatio(hexA, hexB) {
    const la = luminance(hexA), lb = luminance(hexB);
    const hi = Math.max(la, lb), lo = Math.min(la, lb);
    return (hi + 0.05) / (lo + 0.05);
  }

  // ---------- 文件 ----------
  function downloadFile(filename, mime, content) {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 200);
  }
  function pickFile(accept, cb) {
    const input = el('input', { type: 'file', accept: accept || '.json,application/json' });
    input.addEventListener('change', function () {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = function () { cb(f, String(reader.result)); };
      reader.readAsText(f);
    });
    input.click();
  }

  // ---------- 文本宽度估算（用于溢出告警，非精确）----------
  function textWidthEstimate(text, fontSize) {
    // 中日韩全角按 fontSize，西文按 0.55*size 估算
    let w = 0;
    const s = String(text || '');
    for (let i = 0; i < s.length; i++) {
      const code = s.charCodeAt(i);
      if (s[i] === '\n') continue;
      if (code > 0x2E80) w += fontSize;          // CJK / 全角
      else if (code >= 0x2000 && code <= 0x206F) w += fontSize * 0.5;
      else w += fontSize * 0.55;
    }
    return w;
  }
  function isCjk(ch) { const c = ch.charCodeAt(0); return c > 0x2E7F && c < 0xFA00 || (c >= 0xFF00 && c <= 0xFFEF); }

  // ---------- 模态确认（替代系统 confirm/alert）----------
  // confirmModal({ title, message, okText, cancelText, danger }) -> Promise<boolean>
  function confirmModal(opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      const mask = el('div', { class: 'cm-mask' });
      const panel = el('div', { class: 'cm-panel', tabindex: '-1' });
      panel.appendChild(el('h3', { text: opts.title || '确认' }));
      if (opts.message) {
        String(opts.message).split('\n').forEach(function (line) {
          panel.appendChild(el('div', { class: 'cm-msg', text: line }));
        });
      }
      const cancel = el('button', { class: 'btn cm-cancel', text: opts.cancelText || '取消' });
      const ok = el('button', { class: 'btn cm-ok ' + (opts.danger ? 'danger' : 'primary'), text: opts.okText || '确定' });

      let done = false;
      const keyShield = function (ev) {
        // 模态期间屏蔽背景快捷键（方向键微调 / Delete / 预览三键等）
        ev.preventDefault();
        ev.stopPropagation();
        if (ev.key === 'Escape') close(false);
        else if (ev.key === 'Enter') close(true);
      };
      function close(v) {
        if (done) return;
        done = true;
        document.removeEventListener('keydown', keyShield, true);
        if (mask.parentNode) mask.parentNode.removeChild(mask);
        resolve(v);
      }
      on(cancel, 'click', function () { close(false); });
      on(ok, 'click', function () { close(true); });
      on(mask, 'click', function (ev) { if (ev.target === mask) close(false); });
      document.addEventListener('keydown', keyShield, true);

      panel.appendChild(el('div', { class: 'cm-foot' }, [cancel, ok]));
      mask.appendChild(panel);
      document.body.appendChild(mask);
      ok.focus();
    });
  }

  return {
    $: $, $$: $$, el: el, on: on, confirmModal: confirmModal,
    clamp: clamp, uid: uid, deepClone: deepClone, fmtDate: fmtDate,
    hexToRgb: hexToRgb, rgbToHex: rgbToHex, isHexColor: isHexColor, normHex: normHex,
    quantize565Hex: quantize565Hex, rgb565Value: rgb565Value,
    luminance: luminance, contrastRatio: contrastRatio,
    downloadFile: downloadFile, pickFile: pickFile,
    textWidthEstimate: textWidthEstimate, isCjk: isCjk
  };
})();
