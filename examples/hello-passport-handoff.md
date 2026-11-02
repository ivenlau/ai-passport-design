# 《单词记忆卡》 UI/UX 开发交接文档

> 由 **passport-design v1** 于 2026-11-02 16:10 生成。
> 本文档是 UI/UX 的**唯一规格来源**：开发实现必须逐项还原本文档与随附 PNG 快照（`screenshots/`）和 `design.json`。
> 实施流程：按 `ai-passport` 仓库的 `AGENTS.md` → `passport-develop` skill 执行；UI 必须自主设计实现（禁止沿用基线 demo 测试壳）。

## 1. 硬件与能力约束（不可违反）

| 项 | 约束 |
| --- | --- |
| 屏幕 | ST7789P3，240×320 竖屏，RGB565（16 位色深，颜色量化是硬件事实） |
| 圆角遮罩 | 全局 30px 圆角，遮罩外**纯黑**（flush 层实现，页面不得自行画四角装饰） |
| 输入 | 无触摸屏。三键 UP / DOWN / OK（ADC 阶梯键）+ 电源键。短按窗口 180ms，长按 500ms |
| 按键语义 | 仅 **CLICK / LONG**（及游戏用 PRESS）代表用户意图；**RELEASE 不得作为命令** |
| MCU/内存 | ESP32-C3 / 8MB Flash / 无 PSRAM。LVGL 内置池 24KB，LCD DMA 9.6KB，注意最大连续堆块 |
| 电量 | `bsp_battery_soc()` 0..100，读失败 **-1 时优雅降级**（不画数字）。默认显示于右上角 |
| 字体 | 基线仅 Montserrat 14/20（**无中文字模**）。中文必须用 lv_font_conv 生成子集或思源子集（见 §4） |
| 并发 | LVGL 非线程安全；按键回调只入队；删页前停任务/定时器；慢操作放 worker |

## 2. 设计总览

- 应用：**单词记忆卡**（appId: `word_cards`）
- 描述：示例应用：单词卡学习流程，演示焦点列表、三键导航、进度与圆弧、电量约定与中文字模清单。
- 屏幕数：3；元素总数：22

| # | 屏幕 | id | 元素数 | 背景色 | 说明 |
| --- | --- | --- | --- | --- | --- |
| 1 | 主页 | `s_menu` | 7 | #0872C9 (RGB565 0x0B99) | 应用入口菜单：UP/DOWN 循环移动焦点，OK 进入选项；长按 OK 长驱直达设置。 |
| 2 | 学习屏 | `s_learn` | 8 | #F4F4EA (RGB565 0xF7BD) | 单词卡翻面学习：UP/DOWN 在“认识/不认识”两键间移动焦点，OK 翻面，长按 OK 返回。 |
| 3 | 设置 | `s_set` | 7 | #17202A (RGB565 0x1105) | 设置与统计屏：圆弧仪表显示今日完成度，UP/DOWN 移动焦点，OK 调整，长按返回。 |

**导航流（goto 绑定）**

| 源屏幕 | 按键 | 目标 |
| --- | --- | --- |
| 主页 | OK CLICK | 学习屏 |
| 主页 | OK LONG | 设置 |

## 3. 设计令牌

**颜色**（括号内为 RGB565 量化值，实现与验收以此为准）

| 名称 | HEX | RGB565 |
| --- | --- | --- |
| sky | #1689E8 | 0x145D |
| sky-dark | #0872C9 | 0x0B99 |
| ink | #17202A | 0x1105 |
| paper | #F4F4EA | 0xF7BD |
| yellow | #FFD928 | 0xFEC5 |
| red | #E43B2F | 0xE1C5 |
| muted | #D9E7EC | 0xDF3D |
| track | #E2E2D6 | 0xE71A |
| grass | #82BE2D | 0x85E5 |
| white | #FFFFFF | 0xFFFF |

## 4. 字体与字模清单

仅使用下列字体（`lv_symbol` 为固件符号名）。非基线字体需先在 `sdkconfig.defaults` 启用或生成后编译。

| 字体 | lv_symbol | 覆盖 | 基线 sdkconfig | 本设计用到的字符 |
| --- | --- | --- | --- | --- |
| 自定义子集 20（lv_font_conv 生成） | `app_font_20` | 自定义子集 | **需启用/生成** | `%08不习今单卡始学度开日本果标每的目置苹认设识词进量错音题` |
| Montserrat 14 | `lv_font_montserrat_14` | 仅 ASCII | 已启用 | ` /1236:ABCDFKLMNOPRSUWacdegiklnoprstv` |
| Montserrat 20 | `lv_font_montserrat_20` | 仅 ASCII | 已启用 | `aelp` |

**生成 `app_font_20` 的 lv_font_conv 命令（按本设计字符清单）**

```bash
lv_font_conv \
  --font /path/to/licensed-cjk-font.otf \
  --range 0x20-0x7E,0x25,0x30,0x38,0x4E0D,0x4E60,0x4ECA,0x5355,0x5361,0x59CB,0x5B66,0x5EA6,0x5F00,0x65E5,0x672C,0x679C,0x6807,0x6BCF,0x7684,0x76EE,0x7F6E,0x82F9,0x8BA4,0x8BBE,0x8BC6,0x8BCD,0x8FDB,0x91CF,0x9519,0x97F3,0x9898 \
  --size 20 --bpp 4 --format lvgl --no-compress \
  --lv-font-name app_font_20 --lv-include lvgl.h \
  --output assets/fonts/app_font_20.c
```

字符清单（可直接用于 `--symbols`）：`%08不习今单卡始学度开日本果标每的目置苹认设识词进量错音题`

验收要求：逐字符核对字模覆盖（含标点），缺字方框不得作为修复；混合行预留行高。

## 5. 屏幕逐项规格

所有坐标/尺寸均为**设备像素**（240×320 坐标系，原点左上）。z 为绘制顺序（大者在上）。颜色均标注 RGB565 量化值。

### 5.1 主页（`s_menu`）

说明：应用入口菜单：UP/DOWN 循环移动焦点，OK 进入选项；长按 OK 长驱直达设置。

- 背景：#0872C9 (RGB565 0x0B99)
- 焦点顺序（UP/DOWN 循环移动）：菜单-开始学习 (`el_mi1`) → 菜单-错题本 (`el_mi2`) → 菜单-设置 (`el_mi3`)

| z | id | 类型 | 名称 | x,y,w,h | 关键属性 | 行为注记 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `el_bat1` | battery | 电量 | 178,10 54×16 | 颜色 #FFFFFF (RGB565 0xFFFF)；SOC 预览 85% | bsp_battery_soc()，读数 -1 时降级不画数字 |
| 1 | `el_title` | label | 标题 | 12,44 216×30 | 颜色 #FFFFFF (RGB565 0xFFFF)；文本 "单词卡"；字体 app_font_20；对齐 center |  |
| 2 | `el_sub` | label | 副标题 | 12,78 216×20 | 颜色 #D9E7EC (RGB565 0xDF3D)；文本 "WORD CARDS"；字体 lv_font_montserrat_14；对齐 center |  |
| 3 | `el_mi1` | listItem | 菜单-开始学习 | 20,118 200×38 | 填充 #F4F4EA (RGB565 0xF7BD)；边框 #17202A (RGB565 0x1105)；文字色 #17202A (RGB565 0x1105)；选中填充 #FFD928 (RGB565 0xFEC5)；选中边框 #FFFFFF (RGB565 0xFFFF)；禁用填充 #78909C (RGB565 0x7C93)；文本 "开始学习"；字体 app_font_20；对齐 center；边宽 3；圆角 6 | OK_CLICK 开始今日学习 |
| 4 | `el_mi2` | listItem | 菜单-错题本 | 20,166 200×38 | 填充 #F4F4EA (RGB565 0xF7BD)；边框 #17202A (RGB565 0x1105)；文字色 #17202A (RGB565 0x1105)；选中填充 #FFD928 (RGB565 0xFEC5)；选中边框 #FFFFFF (RGB565 0xFFFF)；禁用填充 #78909C (RGB565 0x7C93)；文本 "错题本"；字体 app_font_20；对齐 center；边宽 3；圆角 6 | OK_CLICK 查看今日错词 |
| 5 | `el_mi3` | listItem | 菜单-设置 | 20,214 200×38 | 填充 #F4F4EA (RGB565 0xF7BD)；边框 #17202A (RGB565 0x1105)；文字色 #17202A (RGB565 0x1105)；选中填充 #FFD928 (RGB565 0xFEC5)；选中边框 #FFFFFF (RGB565 0xFFFF)；禁用填充 #78909C (RGB565 0x7C93)；文本 "设置"；字体 app_font_20；对齐 center；边宽 3；圆角 6 | OK_CLICK 进入设置 |
| 6 | `el_hint` | label | 操作提示 | 12,272 216×38 | 颜色 #D9E7EC (RGB565 0xDF3D)；文本 "UP/DOWN Move   OK Select\nOK Long: Settings"；字体 lv_font_montserrat_14；对齐 center |  |

**交互**

| 按键事件 | 动作 | 说明 |
| --- | --- | --- |
| OK CLICK | 跳转 → 学习屏 | 进入学习屏（焦点项为“开始学习”时） |
| OK LONG | 跳转 → 设置 | 长按直达设置 |

快照：`screenshots/1-s_menu.png`

### 5.2 学习屏（`s_learn`）

说明：单词卡翻面学习：UP/DOWN 在“认识/不认识”两键间移动焦点，OK 翻面，长按 OK 返回。

- 背景：#F4F4EA (RGB565 0xF7BD)
- 焦点顺序（UP/DOWN 循环移动）：认识 (`el_btn_ok`) → 不认识 (`el_btn_no`)

| z | id | 类型 | 名称 | x,y,w,h | 关键属性 | 行为注记 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `el_bat2` | battery | 电量 | 178,10 54×16 | 颜色 #17202A (RGB565 0x1105)；SOC 预览 85% |  |
| 1 | `el_word` | label | 单词 | 20,56 200×32 | 颜色 #17202A (RGB565 0x1105)；文本 "apple"；字体 lv_font_montserrat_20；对齐 center | 大号英文单词（定宽容器，位数变化不推挤） |
| 2 | `el_trans` | label | 释义 | 20,96 200×30 | 颜色 #E43B2F (RGB565 0xE1C5)；文本 "苹果"；字体 app_font_20；对齐 center | OK 翻面后由遮罩层替换为释义文本 |
| 3 | `el_prog` | progress | 学习进度 | 20,158 200×12 | 边框 #17202A (RGB565 0x1105)；轨道 #E2E2D6 (RGB565 0xE71A)；填充 #82BE2D (RGB565 0x85E5)；圆角 6；值 33% | 今日进度 12/36 |
| 4 | `el_cnt` | label | 计数 | 20,178 200×20 | 颜色 #17202A (RGB565 0x1105)；文本 "12 / 36"；字体 lv_font_montserrat_14；对齐 center |  |
| 5 | `el_btn_ok` | button | 认识 | 20,226 94×38 | 填充 #F4F4EA (RGB565 0xF7BD)；边框 #17202A (RGB565 0x1105)；文字色 #17202A (RGB565 0x1105)；选中填充 #FFD928 (RGB565 0xFEC5)；选中边框 #FFFFFF (RGB565 0xFFFF)；禁用填充 #78909C (RGB565 0x7C93)；文本 "认识"；字体 app_font_20；对齐 center；边宽 3；圆角 6 | 记录为已掌握并进入下一词 |
| 6 | `el_btn_no` | button | 不认识 | 126,226 94×38 | 填充 #F4F4EA (RGB565 0xF7BD)；边框 #17202A (RGB565 0x1105)；文字色 #17202A (RGB565 0x1105)；选中填充 #FFD928 (RGB565 0xFEC5)；选中边框 #FFFFFF (RGB565 0xFFFF)；禁用填充 #78909C (RGB565 0x7C93)；文本 "不认识"；字体 app_font_20；对齐 center；边宽 3；圆角 6 | 记录为错词并进入下一词 |
| 7 | `el_hint2` | label | 操作提示 | 12,276 216×36 | 颜色 #5C6B76 (RGB565 0x5B4E)；文本 "OK: Flip Card\nOK Long: Back"；字体 lv_font_montserrat_14；对齐 center |  |

**交互**

| 按键事件 | 动作 | 说明 |
| --- | --- | --- |
| OK CLICK | 应用内动作 | 卡片翻面：正面显示单词，背面显示释义（切换 el_word/el_trans 可见性） |
| OK LONG | 返回上一屏 | 返回主页 |

快照：`screenshots/2-s_learn.png`

### 5.3 设置（`s_set`）

说明：设置与统计屏：圆弧仪表显示今日完成度，UP/DOWN 移动焦点，OK 调整，长按返回。

- 背景：#17202A (RGB565 0x1105)
- 焦点顺序（UP/DOWN 循环移动）：每日目标 (`el_g1`) → 音量 (`el_g2`)

| z | id | 类型 | 名称 | x,y,w,h | 关键属性 | 行为注记 |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | `el_bat3` | battery | 电量 | 178,10 54×16 | 颜色 #F4F4EA (RGB565 0xF7BD)；SOC 预览 85% |  |
| 1 | `el_stitle` | label | 标题 | 12,40 216×28 | 颜色 #F4F4EA (RGB565 0xF7BD)；文本 "设置"；字体 app_font_20；对齐 center |  |
| 2 | `el_arc` | arc | 今日完成度 | 22,92 96×96 | 轨道 #2E3A44 (RGB565 0x29C8)；填充 #1689E8 (RGB565 0x145D)；值 80/0~100，弧 135°+270°，线宽 10 | 今日目标完成度 80% |
| 3 | `el_pct` | label | 完成度数值 | 38,126 64×26 | 颜色 #FFFFFF (RGB565 0xFFFF)；文本 "80%"；字体 app_font_20；对齐 center | 定宽容器居中，位数变化不移动相邻元素 |
| 4 | `el_today` | label | 今日统计 | 132,110 92×60 | 颜色 #D9E7EC (RGB565 0xDF3D)；文本 "今日的\n进度"；字体 app_font_20 |  |
| 5 | `el_g1` | listItem | 每日目标 | 20,214 200×34 | 填充 #22303C (RGB565 0x2187)；边框 #5C6B76 (RGB565 0x5B4E)；文字色 #F4F4EA (RGB565 0xF7BD)；选中填充 #FFD928 (RGB565 0xFEC5)；选中边框 #FFFFFF (RGB565 0xFFFF)；禁用填充 #78909C (RGB565 0x7C93)；文本 "每日目标"；字体 app_font_20；边宽 2；圆角 6 | OK_CLICK 循环切换 10/20/50 词 |
| 6 | `el_g2` | listItem | 音量 | 20,256 200×34 | 填充 #22303C (RGB565 0x2187)；边框 #5C6B76 (RGB565 0x5B4E)；文字色 #F4F4EA (RGB565 0xF7BD)；选中填充 #FFD928 (RGB565 0xFEC5)；选中边框 #FFFFFF (RGB565 0xFFFF)；禁用填充 #78909C (RGB565 0x7C93)；文本 "音量"；字体 app_font_20；边宽 2；圆角 6 | OK_CLICK 调整 ES8311 音量 |

**交互**

| 按键事件 | 动作 | 说明 |
| --- | --- | --- |
| OK CLICK | 切换选中/开关 | 调整当前焦点项的设置值 |
| OK LONG | 返回上一屏 | 返回上一屏 |

快照：`screenshots/3-s_set.png`

## 6. 交互实现规范（三键 UX）

- 事件只响应 `BSP_BTN_CLICK` 与 `BSP_BTN_LONG`（游戏场景可用 `BSP_BTN_PRESS`）；**忽略 `RELEASE` 作为命令**（防止长按后自触发）。
- 按键回调运行于 esp_timer 任务：只入队事件，UI 更新在持 `bsp_lvgl_lock()` 的短临界区完成。
- 有 focusOrder 的屏幕：UP/DOWN 循环移动选中项，选中项渲染选中样式（选中=黄底白边 / 禁用=灰底，参照像素风规范）；OK_CLICK 执行该屏 OK 动作。
- 长按（500ms）触发的模式开关必须忽略随后的 RELEASE。
- 默认在右上角显示电量（`bsp_battery_soc()`），-1 时降级不画数字。

## 7. 行为注记汇总（开发须逐条实现）

- **主页 / 电量**：bsp_battery_soc()，读数 -1 时降级不画数字
- **主页 / 菜单-开始学习**：OK_CLICK 开始今日学习
- **主页 / 菜单-错题本**：OK_CLICK 查看今日错词
- **主页 / 菜单-设置**：OK_CLICK 进入设置
- **学习屏 / 单词**：大号英文单词（定宽容器，位数变化不推挤）
- **学习屏 / 释义**：OK 翻面后由遮罩层替换为释义文本
- **学习屏 / 学习进度**：今日进度 12/36
- **学习屏 / 认识**：记录为已掌握并进入下一词
- **学习屏 / 不认识**：记录为错词并进入下一词
- **学习屏 / OK CLICK**：卡片翻面：正面显示单词，背面显示释义（切换 el_word/el_trans 可见性）
- **设置 / 今日完成度**：今日目标完成度 80%
- **设置 / 完成度数值**：定宽容器居中，位数变化不移动相邻元素
- **设置 / 每日目标**：OK_CLICK 循环切换 10/20/50 词
- **设置 / 音量**：OK_CLICK 调整 ES8311 音量

## 8. 资源清单

（无外部资源；全部由矩形/文本/图标构成）

## 9. 实现提示与内存预算

- 元素总数估算 LVGL 对象约 29 个；接近/超过 60 个时评审 24KB LVGL 池（参考社区经验：约 90 对象/35KB 即白屏，需 `CONFIG_LV_USE_CLIB_MALLOC` 与 8192 任务栈）。
- 大数字读数使用定宽容器右对齐，防止位数变化推挤相邻元素。
- 动画锚点在创建时固定（不要以当前位置为基准反复重建）。
- 出现异常色块时排查：投影兄弟对象、深色轨道槽、装饰、遮挡，而不是先怀疑驱动。
- 构建门禁：`./tools/validate.sh`（static + firmware）；页面/布局计算抽离纯逻辑并做 host test。

## 10. 验收清单（设备实测）

- [ ] 开机进入起始屏「主页」，与 `screenshots/1-s_menu.png` 逐像素对照（含圆角外纯黑）。
- [ ] 屏幕「主页」：布局、颜色（RGB565 量化）、字体、文本逐项与 §5 表格一致。
- [ ] 屏幕「学习屏」：布局、颜色（RGB565 量化）、字体、文本逐项与 §5 表格一致。
- [ ] 屏幕「设置」：布局、颜色（RGB565 量化）、字体、文本逐项与 §5 表格一致。
- [ ] 三键交互：逐条验证 §5 各屏交互表（CLICK 与 LONG 都要测；长按后松开不触发额外动作）。
- [ ] 中文/特殊字符无缺字方框；长文本裁切/换行符合预期。
- [ ] 电量显示正确；模拟读数 -1 时降级不画数字。
- [ ] 背光、休眠唤醒后界面恢复正确；删除页面无残留任务/定时器。

## 11. 还原度校对要点

1. 坐标是设备像素，不允许“大概居中”——用本文档表格的数值。
2. 颜色按 RGB565 量化值实现；若与 PNG 有可见差异，先确认颜色值而非调样式。
3. 字体使用 §4 的 `lv_symbol`，字号为字体定义的点阵尺寸。
4. z 序按表格从上到下创建（或显式层级）。
5. 投影（如启用）为固定偏移 +5,+6 的兄弟色块（像素风），不是模糊阴影。

---

校验状态：error 0 / warn 0（生成时刻）。`design.json` 与本文档同批导出，二者不一致时以本文档为准并重新导出。