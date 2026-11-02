# 开发还原指南（消费 passport-design 交付物）

> 读者：在 `ai-passport` 仓库实现应用的**开发代理**（AI 或人）。
> 输入：`handoff.md`（唯一规格来源）+ `design.json`（机器可读）+ `screenshots/*.png`（视觉基准）。

## 1. 交付物与优先级

| 文件 | 用途 |
| --- | --- |
| `handoff.md` | 逐元素像素级规格、字体字符清单、交互表、行为注记、验收清单。**不一致时以它为准** |
| `design.json` | 同一数据的机器可读形式（结构见 `DESIGN_SPEC.md`） |
| `screenshots/N-<screenId>.png` | 每屏 2× 快照（RGB565 量化、30px 圆角），逐像素对照基准 |

## 2. 实施流程（在 ai-passport 仓库）

1. 读 `AGENTS.md` → `docs/development/ai-guide.md` → 本 handoff；按 `passport-develop` skill 展开任务。
2. **强制 UI 重设计规则**：必须自主实现应用屏幕/布局/导航/按键交互；
   禁止沿用基线 demo 测试菜单、`demo_*.c` 屏幕或 `ui_pixel` 演示壳（改名/改色不算重设计）。
   可复用 BSP 驱动、LVGL 通用控件、生命周期与并发模式。
3. 结构建议：页面/状态机/动画放 `main/`，板级能力用 `components/bsp` 公开 API；
   可测试的布局计算/状态机抽离纯逻辑并写 host test。
4. 字体：按 handoff §4 的字符清单生成 `lv_font_conv` 子集（或启用 sdkconfig 字体），
   编译进 `main`（`target_sources` 追加，勿重复编译），`LV_FONT_DECLARE` + 显式绑定到每个 label 的活动状态。
5. 交互：只响应 `BSP_BTN_CLICK`/`BSP_BTN_LONG`（游戏可用 `BSP_BTN_PRESS`）；
   回调只入队，UI 更新持 `bsp_lvgl_lock()`；删页前停掉所有任务/定时器/回调。
6. 电量：右上角 `bsp_battery_soc()`，-1 降级不画数字。
7. 颜色：用 handoff 的 RGB565 量化值（`lv_color_hex()` 传 HEX 即可，但对照时以量化值为准）。

## 3. 还原度要求（逐项对照）

1. **坐标**：handoff §5 表格的 x,y,w,h 是设备像素，直接使用，不做"目测居中"。
2. **层级**：表格 z 列即创建/绘制顺序（大的在上）。
3. **颜色**：填充/边框/文字色按表格；投影（如有）= 固定偏移 +5,+6 的兄弟色块（像素风）。
4. **字体**：`lv_symbol` 名 + 表格字号；行高按 0=自动（约字号×1.25）。
5. **文本**：`\n` 换行、对齐方式逐字还原。
6. **三态**：button/listItem 普通/选中/禁用三色板严格按表格。
7. **PNG 对照**：烧录后逐屏截图与 `screenshots/` 并排比对（含圆角外纯黑）。

## 4. 验收（handoff §10 清单）

- 逐屏：布局/颜色/字体/文本一致；三键交互逐条实测（CLICK 与 LONG 都测；长按后松开无额外动作）。
- 中文无缺字方框；长文本裁切/换行符合预期。
- 电量降级路径（可临时 mock `bsp_battery_soc()` 返回 -1）。
- 休眠唤醒后界面恢复；退出页面无残留任务/定时器。
- 交付报告按仓库规范分开声明：`Build / Host tests / Device tests / Unverified`。

## 5. 变更回流

实现中若发现设计不可行（字模缺失、内存超预算、交互冲突）：
**不要擅自改设计**——回到 passport-design 修改设计并重新导出，保持"设计 → 实现"单向规格流；
确需偏离时在 PR/交接里显式记录偏离项与原因。
