// passport_design — export.js
// 交付物生成：design.json（UI/UX 数据）、handoff.md（开发交接文档）、屏幕 PNG 快照、字体子集命令。
// handoff.md 必须包含逐元素像素级规格，保证开发侧可 1:1 还原。
'use strict';
window.PD = window.PD || {};

PD.export = (function () {
  const u = PD.util;

  function cleanDoc(doc) {
    // 导出副本：剔除编辑器内部状态（ui）与运行时缓存（_img）
    const d = u.deepClone(doc);
    delete d.ui;
    d.assets = (d.assets || []).map(function (a) {
      const c = Object.assign({}, a);
      delete c._img;
      delete c.previewData; // 预览数据不进交付 JSON（避免体积膨胀），资源另行交付
      return c;
    });
    d.meta.exportedAt = u.fmtDate();
    d.meta.generator = 'passport-design v1';
    return d;
  }

  function exportJson(doc) {
    return JSON.stringify(cleanDoc(doc), null, 2);
  }

  // ---- 字体字符清单（按全局使用汇总）----
  function charsetForFonts(doc) {
    const map = {}; // fontId -> Set
    doc.screens.forEach(function (s) {
      (s.elements || []).forEach(function (el) {
        if (el.type !== 'label' && el.type !== 'button' && el.type !== 'listItem') return;
        const fid = el.props.fontId;
        if (!map[fid]) map[fid] = {};
        String(el.props.text || '').split('').forEach(function (ch) {
          if (ch !== '\n') map[fid][ch] = true;
        });
      });
    });
    const out = [];
    for (const fid in map) {
      const font = (doc.fonts || []).find(function (f) { return f.id === fid; });
      out.push({ font: font || { id: fid }, chars: Object.keys(map[fid]).sort() });
    }
    return out;
  }

  function rangesFromChars(chars) {
    // 生成 lv_font_conv --range 片段（连续码位合并）
    const codes = chars.map(function (c) { return c.charCodeAt(0); }).sort(function (a, b) { return a - b; });
    const parts = [];
    let i = 0;
    while (i < codes.length) {
      let j = i;
      while (j + 1 < codes.length && codes[j + 1] === codes[j] + 1) j++;
      if (j === i) parts.push('0x' + codes[i].toString(16).toUpperCase());
      else if (j === i + 1) { parts.push('0x' + codes[i].toString(16).toUpperCase()); parts.push('0x' + codes[j].toString(16).toUpperCase()); }
      else parts.push('0x' + codes[i].toString(16).toUpperCase() + '-0x' + codes[j].toString(16).toUpperCase());
      i = j + 1;
    }
    return parts.join(',');
  }

  function lvFontConvCommand(font, chars) {
    const range = rangesFromChars(chars);
    return 'lv_font_conv \\\n' +
      '  --font /path/to/licensed-cjk-font.otf \\\n' +
      '  --range 0x20-0x7E,' + range + ' \\\n' +
      '  --size ' + (font.size || 20) + ' --bpp 4 --format lvgl --no-compress \\\n' +
      '  --lv-font-name ' + (font.lvSymbol || 'app_font_20') + ' --lv-include lvgl.h \\\n' +
      '  --output assets/fonts/' + (font.lvSymbol || 'app_font_20') + '.c';
  }

  // ---- 交互表 ----
  function keyTable(doc, screen) {
    const rows = [];
    PD.model.KEY_EVENTS.forEach(function (ev) {
      const b = screen.keys[ev];
      if (!b || b.action === 'none') return;
      const act = (PD.model.KEY_ACTIONS.find(function (a) { return a.id === b.action; }) || { label: b.action }).label;
      let detail = act;
      if (b.action === 'goto') detail = '跳转 → ' + bindingTargetName(doc, b.target);
      rows.push('| ' + ev.replace('_', ' ') + ' | ' + detail + ' | ' + mdEscape(b.label || '') + ' |');
    });
    return rows;
  }

  function bindingTargetName(doc, id) {
    const s = (doc.screens || []).find(function (x) { return x.id === id; });
    return s ? s.name : (id || '（未设置）');
  }

  // ---- 元素规格表 ----
  function elementTable(doc, screen) {
    const head = '| z | id | 类型 | 名称 | x,y,w,h | 关键属性 | 行为注记 |';
    const sep = '| --- | --- | --- | --- | --- | --- | --- |';
    const rows = (screen.elements || []).map(function (el, idx) {
      return '| ' + idx + ' | `' + el.id + '` | ' + el.type + ' | ' + mdEscape(el.name) + ' | ' +
        el.x + ',' + el.y + ' ' + el.w + '×' + el.h + ' | ' + mdEscape(propsSummary(doc, el)) + ' | ' + mdEscape(el.note || '') + ' |';
    });
    return [head, sep].concat(rows).join('\n');
  }

  function mdEscape(s) {
    return String(s === undefined || s === null ? '' : s).replace(/\|/g, '\\|').replace(/\n/g, '<br>');
  }

  function propsSummary(doc, el) {
    const p = el.props || {};
    const parts = [];
    const colorFields = { fill: '填充', borderColor: '边框', color: '颜色', textColor: '文字色', trackColor: '轨道', fillColor: '填充', placeholderColor: '占位', selectedFill: '选中填充', selectedBorder: '选中边框', disabledFill: '禁用填充', shadowColor: '投影' };
    for (const k in colorFields) {
      if (p[k] !== undefined) parts.push(colorFields[k] + ' ' + colorHex(doc, p[k]));
    }
    if (el.type === 'label' || el.type === 'button' || el.type === 'listItem') {
      const font = (doc.fonts || []).find(function (f) { return f.id === p.fontId; });
      parts.push('文本 "' + String(p.text || '').replace(/\n/g, '\\n') + '"');
      parts.push('字体 ' + (font ? font.lvSymbol : p.fontId));
      if (p.align && p.align !== 'left') parts.push('对齐 ' + p.align);
      if (el.type === 'listItem' && p.icon) parts.push('图标 ' + p.icon);
    }
    if (p.borderW) parts.push('边宽 ' + p.borderW);
    if (p.radius) parts.push('圆角 ' + p.radius);
    if (p.shadow) parts.push('投影 +' + 5 + ',+' + 6);
    if (el.type === 'progress') parts.push('值 ' + p.value + '%');
    if (el.type === 'arc') parts.push('值 ' + p.value + '/' + p.min + '~' + p.max + '，弧 ' + p.startDeg + '°+' + p.sweepDeg + '°，线宽 ' + p.thickness);
    if (el.type === 'battery') parts.push('SOC 预览 ' + p.soc + '%' + (p.unavailable ? '（降级 -1 态）' : ''));
    if (el.type === 'image') {
      const a = (doc.assets || []).find(function (x) { return x.id === p.assetId; });
      parts.push('资源 ' + (a ? a.name : '无') + '，fit ' + p.fit);
    }
    return parts.join('；');
  }

  function colorHex(doc, hex) {
    const h = u.normHex(hex);
    return h.toUpperCase() + ' (RGB565 0x' + u.rgb565Value(h).toString(16).toUpperCase().padStart(4, '0') + ')';
  }

  // ---- handoff.md ----
  function buildHandoff(doc) {
    const D = doc.device || PD.model.DEVICE;
    const L = [];
    const findings = PD.validate.run(doc);
    const errors = findings.filter(function (f) { return f.level === 'error'; });
    const warns = findings.filter(function (f) { return f.level === 'warn'; });

    L.push('# 《' + doc.meta.name + '》 UI/UX 开发交接文档');
    L.push('');
    L.push('> 由 **passport-design v1** 于 ' + u.fmtDate() + ' 生成。');
    L.push('> 本文档是 UI/UX 的**唯一规格来源**：开发实现必须逐项还原本文档与随附 PNG 快照（`screenshots/`）和 `design.json`。');
    L.push('> 实施流程：按 `ai-passport` 仓库的 `AGENTS.md` → `passport-develop` skill 执行；UI 必须自主设计实现（禁止沿用基线 demo 测试壳）。');
    L.push('');
    if (errors.length) {
      L.push('> ⚠️ 交付前校验仍有 **' + errors.length + ' 个错误**，请先在 passport-design 中修复：');
      errors.forEach(function (f) { L.push('> - [' + f.code + '] ' + f.message); });
      L.push('');
    }

    L.push('## 1. 硬件与能力约束（不可违反）');
    L.push('');
    L.push('| 项 | 约束 |');
    L.push('| --- | --- |');
    L.push('| 屏幕 | ' + D.panel + '，' + D.w + '×' + D.h + ' 竖屏，RGB565（16 位色深，颜色量化是硬件事实） |');
    L.push('| 圆角遮罩 | 全局 ' + D.radius + 'px 圆角，遮罩外**纯黑**（flush 层实现，页面不得自行画四角装饰） |');
    L.push('| 输入 | 无触摸屏。三键 UP / DOWN / OK（ADC 阶梯键）+ 电源键。短按窗口 ' + D.shortPressMs + 'ms，长按 ' + D.longPressMs + 'ms |');
    L.push('| 按键语义 | 仅 **CLICK / LONG**（及游戏用 PRESS）代表用户意图；**RELEASE 不得作为命令** |');
    L.push('| MCU/内存 | ' + D.mcu + '。LVGL 内置池 ' + D.lvglPoolKB + 'KB，LCD DMA ' + D.lvglDmaKb + 'KB，注意最大连续堆块 |');
    L.push('| 电量 | `bsp_battery_soc()` 0..100，读失败 **-1 时优雅降级**（不画数字）。默认显示于右上角 |');
    L.push('| 字体 | 基线仅 Montserrat 14/20（**无中文字模**）。中文必须用 lv_font_conv 生成子集或思源子集（见 §4） |');
    L.push('| 并发 | LVGL 非线程安全；按键回调只入队；删页前停任务/定时器；慢操作放 worker |');
    L.push('');

    L.push('## 2. 设计总览');
    L.push('');
    L.push('- 应用：**' + doc.meta.name + '**（appId: `' + (doc.meta.appId || '') + '`）');
    if (doc.meta.description) L.push('- 描述：' + doc.meta.description);
    L.push('- 屏幕数：' + doc.screens.length + '；元素总数：' + doc.screens.reduce(function (n, s) { return n + s.elements.length; }, 0));
    L.push('');
    L.push('| # | 屏幕 | id | 元素数 | 背景色 | 说明 |');
    L.push('| --- | --- | --- | --- | --- | --- |');
    doc.screens.forEach(function (s, i) {
      L.push('| ' + (i + 1) + ' | ' + mdEscape(s.name) + ' | `' + s.id + '` | ' + s.elements.length + ' | ' + colorHex(doc, s.bg) + ' | ' + mdEscape(s.desc || '') + ' |');
    });
    L.push('');
    L.push('**导航流（goto 绑定）**');
    L.push('');
    const navRows = [];
    doc.screens.forEach(function (s) {
      PD.model.KEY_EVENTS.forEach(function (ev) {
        const b = s.keys[ev];
        if (b && b.action === 'goto' && b.target) navRows.push('| ' + s.name + ' | ' + ev.replace('_', ' ') + ' | ' + bindingTargetName(doc, b.target) + ' |');
      });
    });
    if (navRows.length) {
      L.push('| 源屏幕 | 按键 | 目标 |');
      L.push('| --- | --- | --- |');
      navRows.forEach(function (r) { L.push(r); });
    } else {
      L.push('（无跨屏跳转）');
    }
    L.push('');

    L.push('## 3. 设计令牌');
    L.push('');
    L.push('**颜色**（括号内为 RGB565 量化值，实现与验收以此为准）');
    L.push('');
    L.push('| 名称 | HEX | RGB565 |');
    L.push('| --- | --- | --- |');
    (doc.palette || []).forEach(function (c) {
      L.push('| ' + c.name + ' | ' + colorHex(doc, c.hex).split(' ')[0] + ' | 0x' + u.rgb565Value(c.hex).toString(16).toUpperCase().padStart(4, '0') + ' |');
    });
    L.push('');

    L.push('## 4. 字体与字模清单');
    L.push('');
    L.push('仅使用下列字体（`lv_symbol` 为固件符号名）。非基线字体需先在 `sdkconfig.defaults` 启用或生成后编译。');
    L.push('');
    const usedFonts = charsetForFonts(doc);
    L.push('| 字体 | lv_symbol | 覆盖 | 基线 sdkconfig | 本设计用到的字符 |');
    L.push('| --- | --- | --- | --- | --- |');
    usedFonts.forEach(function (item) {
      const f = item.font;
      const cov = { ascii: '仅 ASCII', 'cjk-subset': 'CJK 子集', custom: '自定义子集' }[f.coverage] || f.coverage;
      L.push('| ' + (f.label || f.id) + ' | `' + (f.lvSymbol || '?') + '` | ' + cov + ' | ' + (f.baseline ? '已启用' : '**需启用/生成**') + ' | `' + item.chars.join('') + '` |');
    });
    L.push('');
    usedFonts.forEach(function (item) {
      const f = item.font;
      if (f.coverage === 'custom') {
        L.push('**生成 `' + (f.lvSymbol || 'app_font') + '` 的 lv_font_conv 命令（按本设计字符清单）**');
        L.push('');
        L.push('```bash');
        L.push(lvFontConvCommand(f, item.chars));
        L.push('```');
        L.push('');
        L.push('字符清单（可直接用于 `--symbols`）：`' + item.chars.join('') + '`');
        L.push('');
      }
    });
    L.push('验收要求：逐字符核对字模覆盖（含标点），缺字方框不得作为修复；混合行预留行高。');
    L.push('');

    L.push('## 5. 屏幕逐项规格');
    L.push('');
    L.push('所有坐标/尺寸均为**设备像素**（240×320 坐标系，原点左上）。z 为绘制顺序（大者在上）。颜色均标注 RGB565 量化值。');
    doc.screens.forEach(function (s, i) {
      L.push('');
      L.push('### 5.' + (i + 1) + ' ' + s.name + '（`' + s.id + '`）');
      L.push('');
      if (s.desc) L.push('说明：' + s.desc);
      L.push('');
      L.push('- 背景：' + colorHex(doc, s.bg));
      if (s.focusOrder && s.focusOrder.length) {
        L.push('- 焦点顺序（UP/DOWN 循环移动）：' + s.focusOrder.map(function (id) {
          const e = s.elements.find(function (x) { return x.id === id; });
          return (e ? e.name : id) + ' (`' + id + '`)';
        }).join(' → '));
      }
      L.push('');
      L.push(elementTable(doc, s));
      L.push('');
      L.push('**交互**');
      L.push('');
      const rows = keyTable(doc, s);
      if (rows.length) {
        L.push('| 按键事件 | 动作 | 说明 |');
        L.push('| --- | --- | --- |');
        rows.forEach(function (r) { L.push(r); });
      } else {
        L.push('（此屏未绑定按键动作）');
      }
      L.push('');
      L.push('快照：`screenshots/' + (i + 1) + '-' + s.id + '.png`');
    });

    L.push('');
    L.push('## 6. 交互实现规范（三键 UX）');
    L.push('');
    L.push('- 事件只响应 `BSP_BTN_CLICK` 与 `BSP_BTN_LONG`（游戏场景可用 `BSP_BTN_PRESS`）；**忽略 `RELEASE` 作为命令**（防止长按后自触发）。');
    L.push('- 按键回调运行于 esp_timer 任务：只入队事件，UI 更新在持 `bsp_lvgl_lock()` 的短临界区完成。');
    L.push('- 有 focusOrder 的屏幕：UP/DOWN 循环移动选中项，选中项渲染选中样式（选中=黄底白边 / 禁用=灰底，参照像素风规范）；OK_CLICK 执行该屏 OK 动作。');
    L.push('- 长按（' + D.longPressMs + 'ms）触发的模式开关必须忽略随后的 RELEASE。');
    L.push('- 默认在右上角显示电量（`bsp_battery_soc()`），-1 时降级不画数字。');
    L.push('');

    L.push('## 7. 行为注记汇总（开发须逐条实现）');
    L.push('');
    let hasNote = false;
    doc.screens.forEach(function (s) {
      (s.elements || []).forEach(function (el) {
        if (el.note && el.note.trim()) {
          hasNote = true;
          L.push('- **' + s.name + ' / ' + el.name + '**：' + el.note);
        }
      });
      PD.model.KEY_EVENTS.forEach(function (ev) {
        const b = s.keys[ev];
        if (b && b.action === 'action' && b.label) {
          hasNote = true;
          L.push('- **' + s.name + ' / ' + ev.replace('_', ' ') + '**：' + b.label);
        }
      });
    });
    if (!hasNote) L.push('（无）');
    L.push('');

    L.push('## 8. 资源清单');
    L.push('');
    if ((doc.assets || []).length) {
      L.push('| id | 名称 | 类型 | 预估 Flash | 来源/许可 | 备注 |');
      L.push('| --- | --- | --- | --- | --- | --- |');
      doc.assets.forEach(function (a) {
        L.push('| `' + a.id + '` | ' + mdEscape(a.name) + ' | ' + (a.kind || 'image') + ' | ' + (a.flashBytes || '待测') + ' | ' + mdEscape(a.license || '待补') + ' | ' + mdEscape(a.note || '') + ' |');
      });
    } else {
      L.push('（无外部资源；全部由矩形/文本/图标构成）');
    }
    L.push('');

    L.push('## 9. 实现提示与内存预算');
    L.push('');
    L.push('- 元素总数估算 LVGL 对象约 ' + doc.screens.reduce(function (n, s) {
      return n + s.elements.reduce(function (m, e) { return m + ((e.type === 'button' || e.type === 'listItem') ? 2 : 1); }, 0);
    }, 0) + ' 个；接近/超过 60 个时评审 ' + D.lvglPoolKB + 'KB LVGL 池（参考社区经验：约 90 对象/35KB 即白屏，需 `CONFIG_LV_USE_CLIB_MALLOC` 与 8192 任务栈）。');
    L.push('- 大数字读数使用定宽容器右对齐，防止位数变化推挤相邻元素。');
    L.push('- 动画锚点在创建时固定（不要以当前位置为基准反复重建）。');
    L.push('- 出现异常色块时排查：投影兄弟对象、深色轨道槽、装饰、遮挡，而不是先怀疑驱动。');
    L.push('- 构建门禁：`./tools/validate.sh`（static + firmware）；页面/布局计算抽离纯逻辑并做 host test。');
    L.push('');

    L.push('## 10. 验收清单（设备实测）');
    L.push('');
    L.push('- [ ] 开机进入起始屏「' + (doc.screens[0] ? doc.screens[0].name : '') + '」，与 `screenshots/1-' + (doc.screens[0] ? doc.screens[0].id : '') + '.png` 逐像素对照（含圆角外纯黑）。');
    doc.screens.forEach(function (s) {
      L.push('- [ ] 屏幕「' + s.name + '」：布局、颜色（RGB565 量化）、字体、文本逐项与 §5 表格一致。');
    });
    L.push('- [ ] 三键交互：逐条验证 §5 各屏交互表（CLICK 与 LONG 都要测；长按后松开不触发额外动作）。');
    L.push('- [ ] 中文/特殊字符无缺字方框；长文本裁切/换行符合预期。');
    L.push('- [ ] 电量显示正确；模拟读数 -1 时降级不画数字。');
    L.push('- [ ] 背光、休眠唤醒后界面恢复正确；删除页面无残留任务/定时器。');
    L.push('');
    L.push('## 11. 还原度校对要点');
    L.push('');
    L.push('1. 坐标是设备像素，不允许“大概居中”——用本文档表格的数值。');
    L.push('2. 颜色按 RGB565 量化值实现；若与 PNG 有可见差异，先确认颜色值而非调样式。');
    L.push('3. 字体使用 §4 的 `lv_symbol`，字号为字体定义的点阵尺寸。');
    L.push('4. z 序按表格从上到下创建（或显式层级）。');
    L.push('5. 投影（如启用）为固定偏移 +5,+6 的兄弟色块（像素风），不是模糊阴影。');
    L.push('');
    L.push('---');
    L.push('');
    L.push('校验状态：error ' + errors.length + ' / warn ' + warns.length + '（生成时刻）。`design.json` 与本文档同批导出，二者不一致时以本文档为准并重新导出。');
    return L.join('\n');
  }

  // ---- PNG 快照 ----
  function exportScreensPng(doc, cb) {
    const off = PD.render.createOffscreen();
    const view = document.createElement('canvas');
    doc.screens.forEach(function (s, i) {
      PD.render.renderToOffscreen(off, doc, s, { rgb565: true, focusElId: null });
      PD.render.composite(off, view, { zoom: 2, rgb565: true, backlight: 100 });
      view.toBlob(function (blob) {
        u.downloadFile((i + 1) + '-' + s.id + '.png', 'image/png', blob);
        if (cb) cb(i);
      });
    });
  }

  // ---- 导入 ----
  function importJson(text) {
    let doc;
    try { doc = JSON.parse(text); } catch (e) {
      return { ok: false, error: 'JSON 解析失败：' + e.message };
    }
    if (!doc || doc.format !== 'passport-design') {
      return { ok: false, error: '不是 passport-design 格式（缺少 format:"passport-design"）' };
    }
    const ok = PD.model.normalizeDoc(doc);
    if (!ok) return { ok: false, error: '文档结构不完整（screens/elements 缺少必需字段）' };
    return { ok: true, doc: doc };
  }

  return {
    cleanDoc: cleanDoc,
    exportJson: exportJson,
    buildHandoff: buildHandoff,
    exportScreensPng: exportScreensPng,
    importJson: importJson,
    charsetForFonts: charsetForFonts,
    lvFontConvCommand: lvFontConvCommand
  };
})();
