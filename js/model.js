// passport_design — model.js
// 设计文档数据模型（design.json v1 的内存形态）、默认值、持久化与撤销栈。
'use strict';
window.PD = window.PD || {};

PD.model = (function () {
  const u = PD.util;

  // ---- 设备固定事实（来自 ai-passport：bsp_pins.h / 规格文档，勿随意更改）----
  const DEVICE = {
    w: 240, h: 320, radius: 30,
    colorDepth: 16,
    panel: 'ST7789P3',
    lvglPoolKB: 24,
    lvglDmaKb: 9.6,
    buttons: ['UP', 'DOWN', 'OK'],
    shortPressMs: 180,
    longPressMs: 500,
    mcu: 'ESP32-C3 / 8MB Flash / 无 PSRAM'
  };

  // ---- 字体基线（sdkconfig.defaults 仅启用 Montserrat 14/20）----
  const FONT_DEFS = [
    { id: 'f12', label: 'Montserrat 12', family: 'montserrat', size: 12, lvSymbol: 'lv_font_montserrat_12', coverage: 'ascii', baseline: false },
    { id: 'f14', label: 'Montserrat 14', family: 'montserrat', size: 14, lvSymbol: 'lv_font_montserrat_14', coverage: 'ascii', baseline: true },
    { id: 'f16', label: 'Montserrat 16', family: 'montserrat', size: 16, lvSymbol: 'lv_font_montserrat_16', coverage: 'ascii', baseline: false },
    { id: 'f18', label: 'Montserrat 18', family: 'montserrat', size: 18, lvSymbol: 'lv_font_montserrat_18', coverage: 'ascii', baseline: false },
    { id: 'f20', label: 'Montserrat 20', family: 'montserrat', size: 20, lvSymbol: 'lv_font_montserrat_20', coverage: 'ascii', baseline: true },
    { id: 'f24', label: 'Montserrat 24', family: 'montserrat', size: 24, lvSymbol: 'lv_font_montserrat_24', coverage: 'ascii', baseline: false },
    { id: 'f28', label: 'Montserrat 28', family: 'montserrat', size: 28, lvSymbol: 'lv_font_montserrat_28', coverage: 'ascii', baseline: false },
    { id: 'fcjk16', label: '思源黑体 SC 16（内建 CJK 子集）', family: 'source_han_sans_sc', size: 16, lvSymbol: 'lv_font_source_han_sans_sc_16_cjk', coverage: 'cjk-subset', baseline: false },
    { id: 'fapp16', label: '自定义子集 16（lv_font_conv 生成）', family: 'custom', size: 16, lvSymbol: 'app_font_16', coverage: 'custom', charset: '', baseline: false },
    { id: 'fapp20', label: '自定义子集 20（lv_font_conv 生成）', family: 'custom', size: 20, lvSymbol: 'app_font_20', coverage: 'custom', charset: '', baseline: false }
  ];

  // ---- LVGL 符号（预览用近似字形，交付以 LV_SYMBOL_* 宏为准）----
  const SYMBOLS = [
    { lv: 'LV_SYMBOL_OK', preview: '✓', name: '确定' },
    { lv: 'LV_SYMBOL_CLOSE', preview: '✕', name: '关闭' },
    { lv: 'LV_SYMBOL_POWER', preview: '⏻', name: '电源' },
    { lv: 'LV_SYMBOL_SETTINGS', preview: '⚙', name: '设置' },
    { lv: 'LV_SYMBOL_HOME', preview: '⌂', name: '主页' },
    { lv: 'LV_SYMBOL_REFRESH', preview: '↻', name: '刷新' },
    { lv: 'LV_SYMBOL_PLAY', preview: '▶', name: '播放' },
    { lv: 'LV_SYMBOL_PAUSE', preview: '⏸', name: '暂停' },
    { lv: 'LV_SYMBOL_STOP', preview: '■', name: '停止' },
    { lv: 'LV_SYMBOL_PREV', preview: '⏮', name: '上一个' },
    { lv: 'LV_SYMBOL_NEXT', preview: '⏭', name: '下一个' },
    { lv: 'LV_SYMBOL_VOLUME_MAX', preview: '♪', name: '音量' },
    { lv: 'LV_SYMBOL_MUTE', preview: '×♪', name: '静音' },
    { lv: 'LV_SYMBOL_WIFI', preview: '≋', name: 'Wi-Fi' },
    { lv: 'LV_SYMBOL_BLUETOOTH', preview: 'ᛒ', name: '蓝牙' },
    { lv: 'LV_SYMBOL_BATTERY_EMPTY', preview: '▁', name: '电池空' },
    { lv: 'LV_SYMBOL_BATTERY_1', preview: '▂', name: '电池 1/3' },
    { lv: 'LV_SYMBOL_BATTERY_2', preview: '▅', name: '电池 2/3' },
    { lv: 'LV_SYMBOL_BATTERY_3', preview: '▇', name: '电池满' },
    { lv: 'LV_SYMBOL_BATTERY_FULL', preview: '█', name: '电池 100%' },
    { lv: 'LV_SYMBOL_CHARGE', preview: '⚡', name: '充电' },
    { lv: 'LV_SYMBOL_UP', preview: '▲', name: '上' },
    { lv: 'LV_SYMBOL_DOWN', preview: '▼', name: '下' },
    { lv: 'LV_SYMBOL_LEFT', preview: '◀', name: '左' },
    { lv: 'LV_SYMBOL_RIGHT', preview: '▶', name: '右' },
    { lv: 'LV_SYMBOL_WARNING', preview: '⚠', name: '警告' },
    { lv: 'LV_SYMBOL_IMAGE', preview: '▣', name: '图片' },
    { lv: 'LV_SYMBOL_EDIT', preview: '✎', name: '编辑' },
    { lv: 'LV_SYMBOL_TRASH', preview: '⌫', name: '删除' },
    { lv: 'LV_SYMBOL_DOWNLOAD', preview: '↓', name: '下载' },
    { lv: 'LV_SYMBOL_UPLOAD', preview: '↑', name: '上传' },
    { lv: 'LV_SYMBOL_EYE_OPEN', preview: '◉', name: '显示' },
    { lv: 'LV_SYMBOL_EYE_CLOSE', preview: '◎', name: '隐藏' },
    { lv: 'LV_SYMBOL_LIST', preview: '☰', name: '列表' },
    { lv: 'LV_SYMBOL_GPS', preview: '⌖', name: '定位' },
    { lv: 'LV_SYMBOL_BELL', preview: '♪', name: '铃声' },
    { lv: 'LV_SYMBOL_KEYBOARD', preview: '⌨', name: '键盘' },
    { lv: 'LV_SYMBOL_SD_CARD', preview: '▤', name: '存储卡' },
    { lv: 'LV_SYMBOL_SAVE', preview: '▣', name: '保存' },
    { lv: 'LV_SYMBOL_SHUFFLE', preview: '交叉', name: '随机' },
    { lv: 'LV_SYMBOL_LOOP', preview: '∞', name: '循环' }
  ];

  // ---- 内置调色板（main/ui_pixel.h 像素风 + 常用中性色）----
  const PALETTE = [
    { name: 'sky', hex: '#1689E8' }, { name: 'sky-dark', hex: '#0872C9' },
    { name: 'ink', hex: '#17202A' }, { name: 'paper', hex: '#F4F4EA' },
    { name: 'grass', hex: '#82BE2D' }, { name: 'grass-dark', hex: '#55951D' },
    { name: 'yellow', hex: '#FFD928' }, { name: 'orange', hex: '#FFB23E' },
    { name: 'red', hex: '#E43B2F' }, { name: 'muted', hex: '#D9E7EC' },
    { name: 'white', hex: '#FFFFFF' }, { name: 'black', hex: '#000000' },
    { name: 'slate', hex: '#78909C' }, { name: 'track', hex: '#E2E2D6' }
  ];

  // ---- 交互事件（仅 CLICK / LONG / PRESS / DOUBLE 代表用户意图；RELEASE 禁止作为命令）----
  const KEY_EVENTS = [
    'UP_CLICK', 'UP_LONG', 'UP_DOUBLE', 'UP_PRESS',
    'DOWN_CLICK', 'DOWN_LONG', 'DOWN_DOUBLE', 'DOWN_PRESS',
    'OK_CLICK', 'OK_LONG', 'OK_DOUBLE', 'OK_PRESS'
  ];
  const KEY_ACTIONS = [
    { id: 'none', label: '无' },
    { id: 'goto', label: '跳转屏幕' },
    { id: 'back', label: '返回上一屏' },
    { id: 'action', label: '应用内动作' },
    { id: 'toggle', label: '切换选中/开关' }
  ];

  function defaultProps(type) {
    switch (type) {
      case 'rect':
        return { fill: '#F4F4EA', borderW: 0, borderColor: '#17202A', radius: 0, shadow: false, shadowColor: '#17202A', opacity: 100 };
      case 'label':
        return { text: '文本', fontId: 'f20', color: '#17202A', align: 'left', lineHeight: 0 };
      case 'button':
        return {
          fill: '#F4F4EA', borderW: 3, borderColor: '#17202A', radius: 0,
          text: '按钮', fontId: 'f14', textColor: '#17202A', align: 'center',
          selected: false, disabled: false,
          selectedFill: '#FFD928', selectedBorder: '#FFFFFF', disabledFill: '#78909C'
        };
      case 'listItem':
        return {
          fill: '#F4F4EA', borderW: 3, borderColor: '#17202A', radius: 0,
          text: '列表项', fontId: 'f14', textColor: '#17202A', align: 'left',
          icon: '', selected: false, disabled: false,
          selectedFill: '#FFD928', selectedBorder: '#FFFFFF', disabledFill: '#78909C'
        };
      case 'progress':
        return { value: 60, trackColor: '#E2E2D6', fillColor: '#82BE2D', radius: 0, borderW: 0, borderColor: '#17202A' };
      case 'arc':
        return { value: 50, min: 0, max: 100, startDeg: 135, sweepDeg: 270, thickness: 10, trackColor: '#E2E2D6', fillColor: '#1689E8', rounded: true };
      case 'image':
        return { assetId: '', fit: 'contain', placeholderColor: '#D9E7EC', borderW: 0, borderColor: '#17202A' };
      case 'icon':
        return { symbol: 'LV_SYMBOL_OK', color: '#17202A', size: 16 };
      case 'battery':
        return { color: '#17202A', soc: 85, showPercent: true, unavailable: false };
      default:
        return {};
    }
  }

  function newElement(type, x, y) {
    const d = defaultProps(type);
    const sizes = {
      rect: [80, 40], label: [120, 24], button: [96, 36], listItem: [200, 32],
      progress: [160, 12], arc: [80, 80], image: [64, 64], icon: [20, 20], battery: [52, 16]
    };
    const s = sizes[type] || [40, 40];
    return {
      id: u.uid('el'),
      type: type,
      name: defaultName(type),
      x: Math.round(x === undefined ? (DEVICE.w - s[0]) / 2 : x),
      y: Math.round(y === undefined ? (DEVICE.h - s[1]) / 2 : y),
      w: s[0], h: s[1],
      z: 0,
      note: '',
      props: d
    };
  }
  function defaultName(type) {
    return ({ rect: '色块', label: '文本', button: '按钮', listItem: '列表项', progress: '进度条', arc: '圆弧仪表', image: '图片', icon: '图标', battery: '电量' })[type] || '元素';
  }

  function emptyBinding() { return { action: 'none', target: '', label: '' }; }

  function newScreen(name) {
    return {
      id: u.uid('s'),
      name: name || '新屏幕',
      desc: '',
      bg: '#1689E8',
      elements: [],
      focusOrder: [],
      keys: (function () {
        const k = {};
        KEY_EVENTS.forEach(function (e) { k[e] = emptyBinding(); });
        return k;
      })()
    };
  }

  function newDoc() {
    const s1 = newScreen('屏幕 1');
    s1.bg = '#1689E8';
    return {
      format: 'passport-design',
      version: 1,
      meta: {
        name: '未命名应用',
        appId: 'my_app',
        author: '',
        description: '',
        createdAt: u.fmtDate(),
        updatedAt: u.fmtDate()
      },
      device: u.deepClone(DEVICE),
      palette: u.deepClone(PALETTE),
      fonts: u.deepClone(FONT_DEFS),
      assets: [],
      screens: [s1],
      ui: { zoom: 2, grid: false, rgb565: true, backlight: 100, showFrame: true }
    };
  }

  // ---- 持久化 ----
  const STORE_KEY = 'passport_design_doc_v1';
  function persist(doc) {
    try {
      doc.meta.updatedAt = u.fmtDate();
      localStorage.setItem(STORE_KEY, JSON.stringify(doc));
      return true;
    } catch (e) { return false; }
  }
  function loadPersisted() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return null;
      const doc = JSON.parse(raw);
      return normalizeDoc(doc) ? doc : null;
    } catch (e) { return null; }
  }
  function clearPersisted() {
    try { localStorage.removeItem(STORE_KEY); } catch (e) { /* ignore */ }
  }

  // ---- 规范化 / 兼容性（导入时补全缺省字段）----
  function normalizeDoc(doc) {
    if (!doc || typeof doc !== 'object') return null;
    if (doc.format !== 'passport-design') return null;
    if (!Array.isArray(doc.screens) || doc.screens.length === 0) return null;
    doc.version = doc.version || 1;
    doc.meta = doc.meta || {};
    doc.meta.name = doc.meta.name || '未命名应用';
    doc.device = doc.device || u.deepClone(DEVICE);
    doc.palette = Array.isArray(doc.palette) ? doc.palette : u.deepClone(PALETTE);
    doc.fonts = Array.isArray(doc.fonts) && doc.fonts.length ? doc.fonts : u.deepClone(FONT_DEFS);
    doc.assets = Array.isArray(doc.assets) ? doc.assets : [];
    if (!doc.ui) doc.ui = { zoom: 1, grid: false, rgb565: true, backlight: 100, showFrame: true };
    let ok = true;
    doc.screens.forEach(function (s) {
      s.id = s.id || u.uid('s');
      s.name = s.name || '屏幕';
      s.bg = s.bg || '#1689E8';
      s.elements = Array.isArray(s.elements) ? s.elements : [];
      s.focusOrder = Array.isArray(s.focusOrder) ? s.focusOrder : [];
      if (!s.keys || typeof s.keys !== 'object') s.keys = {};
      KEY_EVENTS.forEach(function (e) {
        if (!s.keys[e] || typeof s.keys[e] !== 'object') s.keys[e] = emptyBinding();
        s.keys[e].action = s.keys[e].action || 'none';
        s.keys[e].target = s.keys[e].target || '';
        s.keys[e].label = s.keys[e].label || '';
      });
      s.elements.forEach(function (e) {
        if (!e || !e.type || typeof e.x !== 'number') { ok = false; return; }
        e.id = e.id || u.uid('el');
        e.name = e.name || defaultName(e.type);
        e.z = e.z || 0;
        e.note = e.note || '';
        const def = defaultProps(e.type);
        e.props = e.props || {};
        for (const k in def) if (!(k in e.props)) e.props[k] = def[k];
      });
    });
    return ok;
  }

  // ---- 撤销 / 重做 ----
  const history = {
    stack: [], idx: -1, limit: 60,
    commit: function (doc) {
      const snap = JSON.stringify(doc);
      if (this.idx >= 0 && this.stack[this.idx] === snap) return;
      this.stack = this.stack.slice(0, this.idx + 1);
      this.stack.push(snap);
      if (this.stack.length > this.limit) this.stack.shift();
      this.idx = this.stack.length - 1;
    },
    undo: function () {
      if (this.idx <= 0) return null;
      this.idx--;
      return JSON.parse(this.stack[this.idx]);
    },
    redo: function () {
      if (this.idx >= this.stack.length - 1) return null;
      this.idx++;
      return JSON.parse(this.stack[this.idx]);
    },
    reset: function (doc) {
      this.stack = [];
      this.idx = -1;
      if (doc) this.commit(doc);
    }
  };

  return {
    DEVICE: DEVICE, FONT_DEFS: FONT_DEFS, SYMBOLS: SYMBOLS, PALETTE: PALETTE,
    KEY_EVENTS: KEY_EVENTS, KEY_ACTIONS: KEY_ACTIONS,
    defaultProps: defaultProps, newElement: newElement, newScreen: newScreen, newDoc: newDoc,
    emptyBinding: emptyBinding,
    persist: persist, loadPersisted: loadPersisted, clearPersisted: clearPersisted,
    normalizeDoc: normalizeDoc,
    history: history
  };
})();
