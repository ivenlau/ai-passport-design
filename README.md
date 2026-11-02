# passport_design — FoloToy AI Passport UI/UX 设计工作台

**先设计、后开发**：在开发之前，用这个 Web 应用把设备 UI/UX 完整规划出来（1:1 设备效果模拟），
再生成开发代理可直接消费的 UI/UX 数据，保证固件实现能还原设计。

零依赖、零构建：**浏览器直接打开 `index.html`** 即可使用（推荐 Chrome/Edge）。
设计自动保存在浏览器 localStorage，随时导出 `design.json` 备份。

## 功能

| 页签 | 内容 |
| --- | --- |
| **设计** | **真机外形设计画布**：产品照设备内嵌 240×320 屏幕（RGB565 真实色深、30px 圆角遮罩、背光），设备大小可调；拖拽编辑 9 类组件 + 属性面板 + 图层/屏幕管理 + **字模管理**（字符清单一键补齐）+ 布局网格 + **预览模式**（点击真机键位 POWER/UP/DOWN/OK 或键盘：单击/长按 500ms/双击，POWER 熄屏/唤醒） |
| **交互** | 三键绑定矩阵（UP/DOWN/OK × CLICK/LONG/DOUBLE/PRESS）+ 导航图；焦点顺序（UP/DOWN 循环）设计 |
| **校验** | 设计规则自动校验：边界/字模覆盖/文本溢出/对比度/导航可达/电量约定/LVGL 池预算（依据 ai-passport 仓库规范与社区经验） |
| **导出** | `design.json`（UI/UX 数据）、`handoff.md`（开发交接文档：逐元素像素级规格 + RGB565 色值 + 字模字符清单 + lv_font_conv 命令 + 交互表 + 验收清单）、每屏 PNG 快照 |
| **规范** | 数据规范摘要、AI 设计流程、**一键复制 AI 设计提示词** |

## 快速开始

1. 双击打开 `index.html`。
2. 点「示例」加载 3 屏示例（单词记忆卡），或「新建」从零设计。
3. 「设计」页拖拽组件、调属性；点「▶ 预览」用三键走一遍流程。
4. 「交互」页绑定按键 → 「校验」清零错误 → 「导出」全部交付物。
5. 把 `handoff.md` + `design.json` + PNG 交给开发代理（`ai-passport` 仓库 `passport-develop` 流程）。

## 两种设计方式

**人工设计**：直接在页面上拖拽绘制、调属性、绑按键（见上）。

**AI 设计**：
1. 打开「规范 → AI 提示词模板」，填写应用需求，点「复制 AI 设计提示词」；
2. 把提示词（或 `docs/DESIGN_SPEC.md` + `docs/AI_DESIGN_GUIDE.md` + 需求）交给任意 AI agent；
3. AI 输出 `design.json` → 本工具「导入 JSON」→ 校验/微调 → 导出交付。

## 目录

```
passport_design/
  index.html            设计工作台入口（file:// 直接打开）
  css/app.css
  js/                   util / model / example-data / widgets / render / validate / export / docs / editor / interaction / panels / app
  assets/
    device-front.png    设备产品照（真机画布屏幕对位基准 126,142,284×378 / 605×931，像素扫描测定）
  docs/
    DESIGN_SPEC.md      设计数据规范 v1（AI 设计代理与开发代理共同契约）
    AI_DESIGN_GUIDE.md  AI 设计方法与流程（含质量自检清单、三键 UX 模式）
    DEV_HANDOFF_GUIDE.md 开发还原指南（如何消费交付物）
  examples/
    hello-passport.json          示例设计（3 屏，覆盖全部组件类型与交互）
    hello-passport-handoff.md    该示例导出的交接文档（交付物长相预览）
  tests/
    smoke.js            Node 逻辑冒烟（模型/校验/导出/字体清单/示例防漂移）
    browser-smoke.js    设计台浏览器冒烟（加载/示例/预览三键/校验/导出）
    measure-blue.js     测定产品照点亮显示区（换图后重跑）
    check-fitting.js / check-fitting2.js  真机画布贴合校验（目检 / 纯绿屏程序化比对 ≤2px）
```

## 严格对齐的硬件事实

设计工具内置并强制以下设备事实（来源 `ai-passport` 仓库 `bsp_pins.h` / 规格文档）：

- ST7789P3 **240×320** 竖屏、**RGB565** 色深（预览可开关量化模拟）
- 全局 **30px 圆角遮罩**，遮罩外纯黑
- **无触摸屏**：三键 UP/DOWN/OK（短按 180ms / 长按 500ms），RELEASE 永不作为命令
- ESP32-C3 / 8MB Flash / **无 PSRAM**，LVGL 池 24KB（校验器做对象预算提示）
- 默认右上角电量 `bsp_battery_soc()`，**-1 优雅降级**
- 字体基线仅 Montserrat 14/20（无中文字模）：中文必须 lv_font_conv 子集/思源子集，
  校验器逐字符核对 charset 并生成转换命令

## 交付契约

`handoff.md` 是 UI/UX 的**唯一规格来源**：开发代理按 ai-passport 的 `AGENTS.md` /
`passport-develop` 实现（强制自主 UI 设计，禁止沿用基线 demo 测试壳），
以 PNG 快照逐像素对照，按文档 §10 清单设备验收。
