# 输入 ``` 回车后 ``` ``` 显示在同一行 —— 根因分析与修复方案

- 状态：已修复
- 日期：2026-09-01
- 涉及文件：`src/style.css`（删除 2 条"fence 同行"规则），提交 `449f47a`
- 现象环境：新建空代码块（输入 ``` 回车）时，开启标记、闭合标记、语言输入提示、复制按钮全部挤在代码块顶部**同一行**

## 1. 问题描述

在空代码块场景输入三个反引号后按回车，muya 创建 fenced code block。用户看到本应分布在**不同位置**的四个元素全部出现在顶部同一水平行：

| 元素 | 期望位置（muya 原版） | 实际表现 |
|---|---|---|
| 开启 ```（`pre::before`） | 代码块左上角外侧 | 左上角外侧（正常） |
| 闭合 ```（`pre::after`） | 代码块**左下角**外侧 | **被挪到顶部右侧** |
| 语言输入提示（`Input Language Identifier...`） | 代码块上方 | 代码块上方（正常） |
| 复制按钮 | 代码块内右上角 | **被上移到顶部外侧** |

用户原话："为什么输入 ``` 回车之后显示在同一行？？"——即开启 ``` 和闭合 ``` 出现在同一水平线上，视觉上"``` ``` 同行"。

## 2. 排查过程（证据链）

### 2.1 用户截图分析

用户提供截图（1524×311，浅色背景）后，用纯 Python PNG 解码器 + 二值化渲染 + macOS Vision OCR 分析：

- 截图中 y≈53-82 有一整条横向内容带（x 152-1321），右侧另有一个独立图形簇；
- OCR 识别出高置信度文本 **`'• Input Language Identifier`**（语言输入提示）和一个低置信度图形 `{•*}`（即 ``` 标记）；
- 两者出现在**同一条水平带**上——证实"``` 与语言输入提示同行"的视觉现象。

### 2.2 真实应用几何测量

探针在真实 Electron 应用中：加载空文档 → 在段落输入三个反引号 → 按 Enter → dump `pre` 及其伪元素、语言输入行、复制按钮的几何位置与计算样式：

```
AFTER-ENTER-GEO（修复前）:
  pre: top 78, bottom 101, height 23（单行空代码块）
  pre::before: content "```",  top -20px        ← 开启标记，左上角外侧
  pre::after:  content "```",  bottom 20px      ← 闭合标记被移到顶部（bottom auto）
  .ag-language-input: top 55-80, left 232       ← 语言输入提示，pre 上方
  a.ag-code-copy: top -20px                     ← 复制按钮被上移，与标记同行
```

几何结论：**开启 ```（top:-20px）、闭合 ```（被改为 top:-20px）、语言输入行（top:-23px）、复制按钮（top:-20px）四个元素的顶部定位全部落在同一水平带**——正是截图所见"同一行"。

### 2.3 git 历史定位引入者

`git log --oneline` 显示一段专门布局曾被提交过：

```
ac01d24 fix: 空代码块激活态紧凑布局（fence 同行、复制按钮上移对齐）
```

该提交在 `src/style.css` 引入了两条规则：

```css
/* Empty code block in editing mode: keep the opening/closing fences on the
   same row as the language input, and align the copy button with that row,
   instead of the button floating between the two fence rows. */
#ag-editor-id pre.ag-fence-code.ag-active:has(span.ag-code-content:empty)::after {
  top: -20px;
  bottom: auto;
  left: 21em;
}

#ag-editor-id pre.ag-fence-code.ag-active:has(span.ag-code-content:empty) a.ag-code-copy {
  top: -20px;
}
```

`ac01d24` 的意图是"空代码块只有一行高时，让闭合 ``` 和复制按钮与开启 ```、语言输入行对齐"，但实际效果是把**闭合 ``` 从默认左下角（`bottom:-23px`）移到了顶部（`top:-20px`）**，与开启 ``` 同排——这是对 muya 原版布局的越权修改，也是本次回归的直接原因。

### 2.4 与后续 fence 标记修改的交互

后续提交 `74986c3`、`9d48979`、`aa39a0a` 处理了"右下角 'fence' 文字与复制按钮重叠"问题：删除 `code::before` 的 "fence" 文字（保留 ``` 角标）。这些修改与 `ac01d24` 的"fence 同行"规则独立存在，但叠加后让空代码块顶部更拥挤——用户集中反馈，最终定位到 `ac01d24`。

## 3. 根因

**`ac01d24` 引入的"空代码块紧凑布局"规则把闭合 ``` 标记（`pre::after`）从默认左下角外（`bottom:-23px; left:0`）重定位到顶部（`top:-20px; left:21em`），同时把复制按钮从 `pre` 内默认位置（`top:0.5em; right:0.5em`）上移到顶部外侧（`top:-20px`）。**

效果链：

```
输入 ``` 回车 → 创建 fenced code block（单行高度）
  ├── pre::before 开启 ```   top:-20px, left:0      （muya 默认）
  ├── pre::after  闭合 ```   top:-20px, left:21em   （ac01d24 修改 ← 根因）
  ├── .ag-language-input     top:-23px, left:20px   （muya 默认）
  └── a.ag-code-copy         top:-20px              （ac01d24 修改 ← 根因）
          ↓
  四个元素顶部定位全部落在同一水平带 → "``` ``` 显示在同一行"
```

其中语言输入行与开启 ``` 同行是 muya 原版设计（语言输入行本就显示在 pre 上方），真正偏离原版的是**闭合 ``` 和复制按钮被挪到顶部**。

## 4. 修复方案

### 4.1 核心修复（已实施，`src/style.css` 删除 13 行）

删除 `ac01d24` 引入的两条规则，恢复 muya 原版布局：

```css
/* 删除以下两条（原 ac01d24 引入）： */
#ag-editor-id pre.ag-fence-code.ag-active:has(span.ag-code-content:empty)::after {
  top: -20px;
  bottom: auto;
  left: 21em;
}

#ag-editor-id pre.ag-fence-code.ag-active:has(span.ag-code-content:empty) a.ag-code-copy {
  top: -20px;
}
```

恢复后的布局（全部回到 muya 默认）：

| 元素 | 恢复后位置 | 对应默认规则 |
|---|---|---|
| 开启 ```（`pre::before`） | 左上角外侧 | `pre.ag-active.ag-fence-code::before { top:-20px; left:0 }` |
| 闭合 ```（`pre::after`） | **左下角外侧** | `pre.ag-active.ag-fence-code::after { bottom:-23px; left:0 }` |
| 语言输入提示 | pre 上方 | `.ag-language-input { top:-23px; left:20px }` |
| 复制按钮 | **pre 内右上角** | `.ag-code-copy { top:0.5em; right:0.5em }` |

之前修复的"右下角 'fence' 文字删除"规则（`pre.ag-active.ag-fence-code > code::before { content:none !important; }`）保持不变——它解决的是复制按钮与 "fence" 文字重叠，与本次同行问题无关，两者互不冲突。

### 4.2 不做替代方案的说明

`ac01d24` 当初的动机是"空代码块只有一行高，闭合 ``` 在底部、复制按钮在中间，布局松散"。该动机实际上已被后续提交改善（右下角 "fence" 文字删除后底部不再拥挤），因此直接还原原版布局最稳妥，不需要再引入任何新的定位规则。

## 5. 验证结果（真实应用，修复后）

探针在真实 Electron 应用中输入 ``` 回车后读取计算样式与几何：

| 验证项 | 修复前 | 修复后 |
|---|---|---|
| `pre::before` 开启 ``` | `top:-20px`（左上）✅ | `top:-20px`（左上）✅（不变） |
| `pre::after` 闭合 ``` | `top:-20px; left:21em`（顶部右侧，与开启同行）❌ | `bottom:-23px`（左下角）✅ |
| `a.ag-code-copy` 复制按钮 | `top:-20px`（被上移到顶部）❌ | `top:0.5em`（pre 内，bottom 105）✅ |
| 语言输入提示 | pre 上方（正常） | pre 上方（不变）✅ |
| dist 构建产物 | 含 `left:21em` 规则 | 规则消失；`ag-fence-code:after{bottom:-23px}` 保留 ✅ |
| "fence" 文字删除规则 | `content:none!important` | `content:none!important`（保留）✅ |

`npm run build` 后检查 `dist/assets/index-*.css`：

- 不存在 `left: 21em` 相关规则（fence 同行规则已移除）；
- 存在 `ag-fence-code:after{bottom:-23px}`（闭合标记回左下角）；
- 存在 `ag-fence-code>code:before{content:none!important}`（右下角 fence 文字删除保留）。

工作区已干净，无残留文件。

## 6. 经验教训

1. **"紧凑布局"类 UI 优化要警惕对语义位置的越权**：把闭合标记从底部挪到顶部、把按钮从元素内部挪到外部，属于改变元素语义归属的修改。空代码块编辑态的特殊布局应尽量用"显示/隐藏"或最小位移实现，避免重排原版位置。
2. **回归排查先查 git 历史的"调优型"提交**：问题"这两天又出现/一直存在"时，优先用 `git log --oneline` 扫描最近与该区域相关的提交。本次根因 `ac01d24` 是一条独立的布局调优提交，与后续 fence 标记修复（`74986c3`/`9d48979`/`aa39a0a`）叠加后症状才明显。
3. **几何测量（getBoundingClientRect + 计算样式）比截图推断快**：截图 OCR 只用于确认"用户看到了什么"（同行），真正定位"为什么同行"靠的是探针 dump 每个元素的 top/bottom/left 与伪元素 content——四个元素的 top 值全部相同这一事实直接指向 CSS 重定位。