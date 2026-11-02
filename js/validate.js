// passport_design — validate.js
// 设计规则校验：边界、字模覆盖、文本溢出、导航可达、电量约定、LVGL 池预算等。
// 结果级别：error（必须修）/ warn（应修）/ info（提示）。
'use strict';
window.PD = window.PD || {};

PD.validate = (function () {
  const u = PD.util;

  function collectTextElements(screen) {
    const out = [];
    (screen.elements || []).forEach(function (el) {
      if (el.type === 'label' || el.type === 'button' || el.type === 'listItem') out.push(el);
    });
    return out;
  }

  function fontById(doc, id) {
    return (doc.fonts || []).find(function (f) { return f.id === id; }) || null;
  }

  function run(doc) {
    const findings = [];
    function add(level, code, message, opts) {
      findings.push(Object.assign({ level: level, code: code, message: message }, opts || {}));
    }
    const D = doc.device || PD.model.DEVICE;
    const screenIds = {};
    doc.screens.forEach(function (s) { screenIds[s.id] = true; });

    let objectEstimate = 0;
    let hasBattery = false;

    doc.screens.forEach(function (screen) {
      const sName = screen.name;

      // 屏幕级：焦点顺序引用
      (screen.focusOrder || []).forEach(function (fid) {
        const exists = (screen.elements || []).some(function (e) { return e.id === fid; });
        if (!exists) add('warn', 'F-FOCUS', '屏幕「' + sName + '」focusOrder 引用了不存在的元素 ' + fid, { screenId: screen.id });
      });

      // 屏幕级：按键绑定
      PD.model.KEY_EVENTS.forEach(function (ev) {
        const b = screen.keys[ev];
        if (!b || b.action === 'none') return;
        if (ev.indexOf('_PRESS') > 0) {
          add('info', 'K-PRESS', '屏幕「' + sName + '」绑定了 ' + ev + '：PRESS 仅建议用于游戏类即时响应（三键语义规范）', { screenId: screen.id });
        }
        if (b.action === 'goto') {
          if (!b.target || !screenIds[b.target]) {
            add('error', 'N-TARGET', '屏幕「' + sName + '」的 ' + ev + ' 跳转目标无效（' + (b.target || '空') + '）', { screenId: screen.id });
          } else if (b.target === screen.id) {
            add('warn', 'N-SELF', '屏幕「' + sName + '」的 ' + ev + ' 跳转到自身', { screenId: screen.id });
          }
        }
        if (b.action === 'action' && !b.label) {
          add('warn', 'K-LABEL', '屏幕「' + sName + '」的 ' + ev + ' 是应用内动作但未填写动作说明（开发无法实现未定义的行为）', { screenId: screen.id });
        }
      });

      (screen.elements || []).forEach(function (el) {
        objectEstimate += (el.type === 'button' || el.type === 'listItem') ? 2 : 1;

        // 边界
        const fullyOut = el.x + el.w <= 0 || el.y + el.h <= 0 || el.x >= D.w || el.y >= D.h;
        const partiallyOut = el.x < 0 || el.y < 0 || el.x + el.w > D.w || el.y + el.h > D.h;
        if (fullyOut) add('error', 'E-BOUNDS', '「' + sName + '」元素「' + el.name + '」完全在屏幕外 (' + el.x + ',' + el.y + ' ' + el.w + '×' + el.h + ')', { screenId: screen.id, elId: el.id });
        else if (partiallyOut) add('warn', 'E-BOUNDS', '「' + sName + '」元素「' + el.name + '」超出屏幕边界 (' + el.x + ',' + el.y + ' ' + el.w + '×' + el.h + ')，圆角遮罩会裁切', { screenId: screen.id, elId: el.id });

        if (el.type === 'battery') hasBattery = true;

        // 文本与字体
        if (el.type === 'label' || el.type === 'button' || el.type === 'listItem') {
          const p = el.props;
          const text = String(p.text || '');
          const font = fontById(doc, p.fontId);
          if (!font) {
            add('error', 'F-MISSING', '「' + sName + '」元素「' + el.name + '」引用了不存在的字体 ' + p.fontId, { screenId: screen.id, elId: el.id });
            return;
          }
          if (!text.trim()) add('info', 'D-TEXT', '「' + sName + '」元素「' + el.name + '」文本为空', { screenId: screen.id, elId: el.id });

          const cjk = PD.widgets.hasCjk(text);
          if (cjk && font.coverage === 'ascii') {
            add('error', 'F-CJK', '「' + sName + '」元素「' + el.name + '」含中文，但字体 ' + font.label + ' 无中文字模（会出现缺字方框）。请选择 CJK 子集/自定义子集字体', { screenId: screen.id, elId: el.id });
          }
          if (font.coverage === 'custom') {
            const cs = String(font.charset || '');
            for (let i = 0; i < text.length; i++) {
              const ch = text[i];
              const code = ch.charCodeAt(0);
              if (ch === '\n') continue;
              if (code >= 0x20 && code <= 0x7E) continue; // ASCII 可打印：生成命令恒含 0x20-0x7E
              if (cs && cs.indexOf(ch) < 0) {
                add('error', 'F-CHARSET', '「' + sName + '」元素「' + el.name + '」的字符「' + ch + '」(U+' + code.toString(16).toUpperCase().padStart(4, '0') + ') 不在自定义子集 ' + font.lvSymbol + ' 的字符清单内。处理：工具栏「字模管理」一键补齐，或改用覆盖该字的字体', { screenId: screen.id, elId: el.id });
              }
            }
            if (!cs) add('warn', 'F-CHARSET', '自定义字体 ' + font.lvSymbol + ' 未定义字符清单（charset），无法校验字模覆盖', { screenId: screen.id, elId: el.id });
          }
          if (font.coverage === 'cjk-subset') {
            add('info', 'F-SUBSET', '「' + sName + '」元素「' + el.name + '」使用 LVGL 内建思源黑体子集：需在 sdkconfig 启用 CONFIG_LV_FONT_SOURCE_HAN_SANS_SC_16_CJK，且其字符覆盖为子集，须逐字核对', { screenId: screen.id, elId: el.id });
          }
          if (!font.baseline && font.family === 'montserrat') {
            add('info', 'F-ENABLED', '字体 ' + font.lvSymbol + ' 不在基线 sdkconfig（仅 14/20），需在 sdkconfig.defaults 启用后构建', { screenId: screen.id, elId: el.id });
          }

          // 文本溢出估算（逐行）
          const availW = el.w - 8;
          text.split('\n').forEach(function (line) {
            const lineW = u.textWidthEstimate(line, font.size);
            if (lineW > availW * 1.02) {
              add('warn', 'T-OVERFLOW', '「' + sName + '」元素「' + el.name + '」文本行 "' + line + '" 估算宽 ' + Math.round(lineW) + 'px > 可用宽 ' + availW + 'px（' + font.label + '），将被裁切或换行', { screenId: screen.id, elId: el.id });
            }
          });
          // 对比度
          const bgHex = el.type === 'label' ? screen.bg : (p.fill || screen.bg);
          const fgHex = el.type === 'label' ? p.color : (p.textColor || p.color);
          const cr = u.contrastRatio(u.normHex(fgHex), u.normHex(bgHex));
          if (cr < 3) {
            add('warn', 'C-CONTRAST', '「' + sName + '」元素「' + el.name + '」文本与背景对比度 ' + cr.toFixed(1) + '（建议 ≥ 4.5）', { screenId: screen.id, elId: el.id });
          }
        }

        // 进度/圆弧数值范围
        if (el.type === 'arc' && el.props.min === el.props.max) {
          add('error', 'V-RANGE', '「' + sName + '」圆弧「' + el.name + '」min == max', { screenId: screen.id, elId: el.id });
        }
        // 图片资源
        if (el.type === 'image' && el.props.assetId) {
          const a = (doc.assets || []).find(function (x) { return x.id === el.props.assetId; });
          if (!a) add('warn', 'A-MISSING', '「' + sName + '」图片「' + el.name + '」引用的资源 ' + el.props.assetId + ' 不存在', { screenId: screen.id, elId: el.id });
        }
      });
    });

    // 导航可达性（从第一个屏幕沿 goto 遍历）
    if (doc.screens.length > 1) {
      const seen = {};
      const queue = [doc.screens[0].id];
      seen[doc.screens[0].id] = true;
      while (queue.length) {
        const cur = queue.shift();
        const s = doc.screens.find(function (x) { return x.id === cur; });
        if (!s) continue;
        PD.model.KEY_EVENTS.forEach(function (ev) {
          const b = s.keys[ev];
          if (b && b.action === 'goto' && b.target && screenIds[b.target] && !seen[b.target]) {
            seen[b.target] = true;
            queue.push(b.target);
          }
        });
      }
      doc.screens.forEach(function (s) {
        if (!seen[s.id]) add('warn', 'N-UNREACH', '屏幕「' + s.name + '」从起始屏不可达（没有任何 goto 指向它）', { screenId: s.id });
      });
    }

    // 电量约定（默认右上角显示 SOC）
    if (!hasBattery) {
      add('info', 'B-BATTERY', '设计中没有任何电量元素：产品约定默认在右上角显示 bsp_battery_soc()（读数 -1 时降级）。如不需要请在交付说明中明确声明', {});
    }

    // LVGL 池预算
    if (objectEstimate > 60) {
      add('info', 'M-POOL', '估算 LVGL 对象约 ' + objectEstimate + ' 个：基线 24KB LVGL 池有耗尽风险（约 90 对象/35KB 曾白屏）。复杂界面请评估 CONFIG_LV_USE_CLIB_MALLOC 与任务栈（详见项目 docs）', {});
    }

    return findings;
  }

  return { run: run };
})();
