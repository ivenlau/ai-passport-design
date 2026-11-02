# passport-design 设计数据规范 v1

> 本文档是 FoloToy AI Passport UI/UX 设计数据（`design.json`）的**唯一格式规范**。
> 面向两类读者：（1）生成设计的 AI 设计代理；（2）消费设计的开发代理。
> 工具入口：`passport_design/index.html`（浏览器直接打开）。

## 0. 设备事实（任何设计都不得违反）

来源：`ai-passport` 仓库 `components/bsp/include/bsp_pins.h`、`docs/hardware-design/specifications.md`。

| 项 | 事实 |
| --- | --- |
| 屏幕 | ST7789P3，**240×320 竖屏**，RGB565（16 位色深，颜色必然量化） |
| 圆角 | 全局 **30px 圆角遮罩**，遮罩外**纯黑**（flush 层统一实现，页面不得自画四角） |
| 输入 | **无触摸屏**。三键 UP / DOWN / OK（GPIO0 ADC 阶梯键）+ 独立电源键 |
| 按键时序 | 短按窗口 180ms；长按 500ms |
| 按键事件 | PRESS / CLICK / DOUBLE / LONG / RELEASE；**仅 CLICK/LONG 是用户意图**（PRESS 仅游戏即时响应），**RELEASE 永不作为命令** |
| MCU | ESP32-C3，8MB Flash，**无 PSRAM** |
| LVGL | 池 24KB（`CONFIG_LV_MEM_SIZE_KILOBYTES=24`），LCD DMA 单缓冲 240×20 RGB565 ≈ 9.6KB |
| 电量 | CW2017 → `bsp_battery_soc()` 0..100，读失败 **-1 → UI 降级不画数字**；默认右上角显示 |
| 音频 | ES8311 codec，16kHz/16bit/mono PCM |
| 字体基线 | sdkconfig 仅启用 **Montserrat 14 / 20**（无中文字模！） |

## 1. 文档结构（design.json v1）

```json
{
  "format": "passport-design",
  "version": 1,
  "meta":   { "name", "appId", "author", "description", "createdAt", "updatedAt" },
  "device": { "w", "h", "radius", "colorDepth", "panel", "lvglPoolKB", "lvglDmaKb",
              "buttons", "shortPressMs", "longPressMs", "mcu" },
  "palette": [ { "name", "hex" } ],
  "fonts":   [ { "id", "label", "family", "size", "lvSymbol", "coverage", "baseline", "charset" } ],
  "assets":  [ { "id", "name", "kind", "flashBytes", "license", "note" } ],
  "screens": [ {
    "id", "name", "desc", "bg",
    "elements": [ { "id", "type", "name", "x", "y", "w", "h", "z", "note", "props" } ],
    "focusOrder": [ "elementId" ],
    "keys": { "<EVENT>": { "action", "target", "label" } }
  } ],
  "ui": { "zoom", "grid", "rgb565", "backlight", "showFrame" }
}
```

- `format` 必须是 `"passport-design"`，`version` 当前为 `1`。
- `device` 是设备事实的镜像，导入时允许缺省（工具补默认值），但不得填入与真实硬件冲突的值。
- `ui` 为编辑器视图状态，可省略；对开发交付无影响。
- **数组顺序即绘制顺序**：`screens[].elements` 后面的元素画在上面（z 列 = 数组下标）。

## 2. 坐标系与布局

- 原点左上，单位=设备像素（整数）。屏幕有效区 240×320。
- 元素 x,y,w,h 必须是整数；主内容避开四角圆角区（半径 30px 的角）。
- 文本盒内默认左右留 4px 内边距；垂直居中。
- 建议边距取 8px 的倍数（8/12/16/20/24），列表行高 32~40px。

## 3. 元素类型与 props

所有元素共有：`id`（唯一字符串）、`type`、`name`、`x`、`y`、`w`、`h`、`z`、`note`（行为注记，进交接文档）、`props`。

### rect — 色块/面板
```json
{ "fill":"#RRGGBB", "borderW":0, "borderColor":"#RRGGBB", "radius":0,
  "shadow":false, "shadowColor":"#RRGGBB", "opacity":100 }
```
`shadow:true` = 像素风投影：同尺寸兄弟色块偏移 **+5,+6**（固件实现为两个兄弟对象，显隐必须成对）。

### label — 文本
```json
{ "text":"...", "fontId":"f20", "color":"#RRGGBB", "align":"left|center|right", "lineHeight":0 }
```
`text` 支持 `\n` 多行。`lineHeight:0` = 自动（约字号×1.25）。

### button — 按钮（面板+文本，三态）
```json
{ "text", "fontId", "textColor", "align",
  "fill", "borderW", "borderColor", "radius",
  "selectedFill":"#FFD928", "selectedBorder":"#FFFFFF", "disabledFill":"#78909C",
  "selected":false, "disabled":false }
```
三态样式契约（与 `ui_pixel_set_selected` 风格一致）：普通=fill+borderColor；选中=selectedFill+selectedBorder；禁用=disabledFill。

### listItem — 列表项（按钮 + 可选图标）
button 全部字段，外加：
```json
{ "icon": "LV_SYMBOL_* 或空字符串" }
```

### progress — 进度条
```json
{ "value":0-100, "trackColor":"#RRGGBB", "fillColor":"#RRGGBB", "radius":0, "borderW":0, "borderColor":"#RRGGBB" }
```
轨道建议浅色（如 #E2E2D6），避免低填充时像异物色块。

### arc — 圆弧仪表
```json
{ "value", "min", "max", "startDeg", "sweepDeg", "thickness",
  "trackColor", "fillColor", "rounded":true }
```

### image — 图片
```json
{ "assetId", "fit":"contain|cover|stretch", "placeholderColor":"#RRGGBB", "borderW":0, "borderColor":"#RRGGBB" }
```
`assetId` 引用 `assets[]`。无 PSRAM：位图放 Flash/资源分区，尺寸受预算约束。

### icon — LVGL 符号
```json
{ "symbol":"LV_SYMBOL_*", "color":"#RRGGBB", "size":16 }
```

### battery — 电量显示
```json
{ "color":"#RRGGBB", "soc":0-100, "showPercent":true, "unavailable":false }
```
固件读 `bsp_battery_soc()`；**-1 时降级**（不画数字）。默认放右上角（约 x=178, y=10）。

## 4. 字体模型

```json
{ "id":"fapp20", "label":"自定义子集 20", "family":"custom", "size":20,
  "lvSymbol":"app_font_20", "coverage":"custom", "baseline":false,
  "charset":"该字体用到的每个字符" }
```

| coverage | 含义 | 约束 |
| --- | --- | --- |
| `ascii` | Montserrat（基线 14/20 已启用，其余需 sdkconfig 启用） | **文本禁止中文/全角字符**（缺字方框） |
| `cjk-subset` | LVGL 内建思源黑体 SC 16 子集 | 需 `CONFIG_LV_FONT_SOURCE_HAN_SANS_SC_16_CJK=y`；子集覆盖，逐字核对 |
| `custom` | `lv_font_conv` 生成的子集 | 文本中**每个非 ASCII 可打印字符**必须出现在 `charset`（ASCII 0x20-0x7E 由生成命令恒定包含）；交付时附生成命令 |

`baseline:true` 表示基线 sdkconfig 已启用；`false` 的字体在交付文档中必须标注启用项或生成命令。

## 5. 交互模型（keys / focusOrder）

事件键名（12 个）：`UP_CLICK` `UP_LONG` `UP_DOUBLE` `UP_PRESS`（DOWN/OK 同构）。

```json
"keys": { "OK_CLICK": { "action":"goto", "target":"s_learn", "label":"说明文字" } }
```

| action | 语义 | 必填 |
| --- | --- | --- |
| `none` | 未绑定 | — |
| `goto` | 跳转到 `target` 屏 | `target` 必须是存在的屏幕 id |
| `back` | 返回上一屏（导航栈） | — |
| `action` | 应用内自定义动作 | `label` 必填（描述行为，开发据此实现） |
| `toggle` | 切换选中项/开关 | 建议填 `label` |

`focusOrder`：参与 UP/DOWN 焦点循环的元素 id 有序数组（通常为 button/listItem）。
选中项渲染其 `selected` 三态样式。列表屏必须定义 `focusOrder`。

**禁止**把 `UP_RELEASE`/`OK_RELEASE` 等 RELEASE 事件作为命令绑定（规范里根本不出现该事件）。

## 6. 校验规则（工具自动执行）

| 级别 | 代码 | 规则 |
| --- | --- | --- |
| error | E-BOUNDS | 元素完全在屏幕外 |
| error | F-CJK | ascii 字体含中文 |
| error | F-CHARSET | 非 ASCII 字符不在 custom 字体 charset 内 |
| error | F-MISSING | 引用不存在的字体 |
| error | N-TARGET | goto 目标屏不存在 |
| error | V-RANGE | arc 的 min==max |
| warn | E-BOUNDS | 元素部分超出屏幕（圆角遮罩会裁切） |
| warn | T-OVERFLOW | 文本估算宽度超出元素宽 |
| warn | C-CONTRAST | 文本/背景对比度 < 3 |
| warn | N-UNREACH | 屏幕从起始屏不可达 |
| warn | N-SELF / K-LABEL / F-FOCUS / A-MISSING | 自跳转 / 动作无说明 / 焦点引用失效 / 资源缺失 |
| info | F-ENABLED / F-SUBSET | 非基线字体需启用或生成 / 思源子集逐字核对 |
| info | K-PRESS | PRESS 绑定（仅游戏） |
| info | B-BATTERY | 无电量元素（产品默认右上角显示） |
| info | M-POOL | LVGL 对象预算（约 90 对象/35KB 会白屏） |

## 7. 颜色

- 一律 `#RRGGBB` 十六进制大写。
- 工具同时给出 **RGB565 量化值**（如 `0x1689`）；渲染与验收以量化值为准。
- 内置像素风调色板：sky `#1689E8` / sky-dark `#0872C9` / ink `#17202A` / paper `#F4F4EA` / grass `#82BE2D` / yellow `#FFD928` / orange `#FFB23E` / red `#E43B2F` / muted `#D9E7EC`（来自 `main/ui_pixel.h`，可自由扩展）。

## 8. 完整示例

见 `examples/hello-passport.json`（3 屏单词卡应用，覆盖全部元素类型与交互）。

## 9. 版本与兼容

- 本规范版本 = `version: 1`。新增字段必须可缺省；破坏性变更递增 version。
- 导入端（工具）对缺省字段自动补默认值；未知字段保留透传。
