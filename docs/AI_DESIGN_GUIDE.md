# AI 设计流程与方法（passport-design）

> 目标：**先设计、后开发**。UI/UX 在 `passport_design` 工具里定稿并验收后，
> 开发代理（ai-passport 的 `passport-develop` 流程）按交接文档 1:1 还原。
> 本文档定义 AI 设计代理的输入、输出、方法与自检流程。

## 1. 双轨设计（人工 & AI）

| 轨道 | 方法 | 适用 |
| --- | --- | --- |
| 人工设计 | 打开 `passport_design/index.html`，在「设计」页拖拽元素/调属性，「交互」页绑定三键导航 | 细节打磨、视觉微调 |
| AI 设计 | 把需求 + 本规范交给 AI 设计代理，产出 `design.json`，工具「导入 JSON」载入 | 快速出稿、批量方案 |

两条轨道共享同一数据格式与校验器，最终都走：**导入 → 校验 → 人工微调 → 导出交付**。

## 2. 标准工作流（6 步）

1. **需求输入**：应用名、屏幕清单、每屏内容、三键交互预期、风格偏好（可选参考 `ai-passport/docs/brand/`）。
2. **AI 读取规范**：`docs/DESIGN_SPEC.md`（数据规范）+ 设备事实（规范 §0）。
3. **AI 输出 design.json**：严格 schema，坐标整数像素，颜色 `#RRGGBB`，文本符合字模覆盖规则。
4. **导入校验**：工具「导入 JSON」→「校验」页 error 清零、warn 逐条处理。
5. **人工走查**：「设计」页开**预览模式**，用 ↑/↓/Enter（或设备侧键）逐屏走三键流程，验证导航与焦点；
   微调视觉并在属性面板补全「行为注记」。
6. **导出交付**：`design.json` + `handoff.md` + PNG 快照 → 交给开发代理（`DEV_HANDOFF_GUIDE.md`）。

## 3. AI 设计代理提示词

工具「规范 → AI 提示词模板」页可复制完整提示词（含设备事实、schema、质量要求与需求占位）。
也可以直接把下面两个文件交给任意 AI agent：

```text
docs/DESIGN_SPEC.md      ← 数据规范（必须）
docs/AI_DESIGN_GUIDE.md  ← 本文件（方法）
```

要求 AI 输出**纯 JSON**（`format:"passport-design"`），不要 JSON 之外的文字。

## 4. AI 设计质量规则（自检清单）

设计代理在输出前逐条自检：

- [ ] 每屏元素 ≤ 25；全部屏 LVGL 对象合计 ≤ 60 优先（button/listItem 记 2 个）
- [ ] 所有 x/y/w/h 为整数；主内容避开 30px 圆角角区；边距 8px 倍数
- [ ] 颜色全部取自 palette 或与之一致；文字对比度 ≥ 4.5
- [ ] 中文文本一律用 `coverage:"custom"` 字体，**所有非 ASCII 字符**写入 `charset`（含全角标点；ASCII 0x20-0x7E 自动生成无需列出）
- [ ] 纯 ascii 字体（Montserrat）文本不含中文
- [ ] 非基线字体（非 14/20）已在交付说明标注 sdkconfig 启用项/生成命令
- [ ] 列表/菜单屏定义了 `focusOrder`，且 button/listItem 均有三态样式
- [ ] 每屏至少一个可用按键绑定；所有 `goto.target` 存在；无不可达屏
- [ ] 默认右上角 battery 元素（如显式不要，写进 `meta.description`）
- [ ] 每屏有 `desc`；非常规元素有 `note`（行为注记是开发还原依据）
- [ ] RELEASE 事件不出现在 keys 里；PRESS 仅游戏屏

## 5. 三键 UX 设计模式（可复用模板）

**菜单屏**：2~4 个 listItem 纵向排列（x=20, w=200, h=36~40），`focusOrder` 顺序即视觉顺序；
UP/DOWN 循环焦点，OK_CLICK 进入，OK_LONG 可作快捷（直达设置等）。

**内容屏**：顶部 battery + 标题，中部内容，底部操作区两个 button（如 认识/不认识），
OK_CLICK 执行主操作，OK_LONG 返回。

**设置屏**：listItem 行 + OK_CLICK 循环改值（toggle），OK_LONG 返回。

**实时数据屏**（音量计/传感器）：大数字放**定宽容器右对齐**，进度/圆弧轨道用浅色，
数值变化不推挤相邻元素；动画锚点在创建时固定。

**游戏屏**：可用 PRESS 即时响应；结果弹层须同时显隐投影兄弟块。

## 6. 与开发代理的衔接

- 导出的 `handoff.md` 是 UI/UX 的**唯一规格来源**；开发不得"自由发挥"布局。
- 开发代理在 `ai-passport` 仓库按 `AGENTS.md` → `passport-develop` skill 实现；
  **必须自主设计实现 UI**（禁用基线 demo 测试壳，见 `docs/development/ai-guide.md` 的强制 UI 重设计规则）。
- 验收：handoff.md §10 清单 + PNG 逐像素对照 + 三键交互逐条实测。

## 7. 常见失败与规避

| 失败 | 规避 |
| --- | --- |
| 中文显示缺字方框 | custom 字体 + charset 全量核对；校验器 F-CJK/F-CHARSET 清零 |
| 长文本裁切 | 校验器 T-OVERFLOW；定宽容器 + 字号复核 |
| 屏幕白屏/绘制卡死 | 控制 LVGL 对象数（M-POOL 提示）；评估 CLIB malloc 与任务栈 |
| 长按后误触发动作 | 不绑定 RELEASE；长按模式开关忽略随后 RELEASE |
| 元素被圆角遮罩裁切 | 校验器 E-BOUNDS；角区 30px 内不放假内容 |
| 数字位数变化推挤布局 | 大数字定宽右对齐 |
