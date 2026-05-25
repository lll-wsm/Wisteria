# Wisteria

Wisteria 是一款极致极简、高质感的桌面 Markdown 编辑器。它基于 **MarkText** 的核心引擎 **Muya** 进行二次开发，旨在提供比原版更轻快、更稳定且具有现代审美（Glassmorphism）的沉浸式写作体验。

## 🌟 核心理念

Wisteria 的名字取自“紫藤”，寓意优雅与生命力。在开发过程中，我们专注于解决 Markdown 编辑器在处理复杂公式、多行稳定操作以及附件管理上的痛点，同时保持界面的绝对纯净。

## ✨ 主要特性

- **基于 Muya 引擎二次开发**：继承了 MarkText 强大的实时预览（What You See Is What You Get）渲染能力。
- **现代感 UI (Glassmorphism)**：
  - 具有毛玻璃模糊效果的右键上下文菜单。
  - 精选的高级排版（Premium Typography），优化行高与字间距，适合长文创作。
  - **Zen Status Bar**：平时隐藏，仅在鼠标悬浮时显示的极简状态栏，实时统计字数与字符数。
- **公式编辑强化**：
  - **垂直堆叠布局**：彻底解决公式预览遮挡文字的问题。
  - **基准线锁定**：多公式同行时互不干扰，排版稳如磐石。
  - **超长公式支持**：支持大型矩阵的水平滚动，不再撑破编辑窗口。
- **自动化附件管理**：粘贴图片自动收纳至文档同级的 `assets` 文件夹，保持文档可移植性。
- **桌面级功能**：
  - 完善的文件 I/O（新建、打开、保存、另存为）。
  - 高质量 PDF 导出（支持自动页码、页眉页脚）。
  - 独立 HTML 导出（包含所有样式，一键分享）。
- **深色模式**：全局平滑过渡，自动适配并跟随系统主题。

## 🚀 快速开始

### 环境要求
- Node.js (建议 LTS 版本)
- npm 或 yarn

### 安装依赖
```bash
# 安装根目录依赖
npm install

# 确保 muya-core 链接正常（项目已配置本地 file 依赖）
```

### 开发模式
Wisteria 使用 Vite 驱动前端，Electron 驱动桌面壳。
```bash
# 终端 1：启动 Vite 渲染进程
npm run dev

# 终端 2：启动 Electron 主进程
npm start
```

### 构建打包
```bash
npm run build
```

## 📂 项目结构

- `muya-core/`: 编辑器底层引擎（Muya 深度定制版）。
- `src/`: Wisteria 应用外壳源码。
  - `renderer.js`: 渲染进程逻辑与 UI 交互。
  - `style.css`: 经过优化的全局样式。
- `main.js`: Electron 主进程逻辑。
- `preload.js`: IPC 通信桥梁。
- `vite.config.js`: 构建与兼容性配置。

## 🛠 技术栈

- **Core**: JavaScript (ES Modules)
- **Editor Engine**: [Muya](https://github.com/marktext/muya) (MarkText Core)
- **Framework**: Electron
- **Build Tool**: Vite
- **Styling**: Vanilla CSS (CSS Variables + Backdrop Filter)

## 🤝 致谢

本项目的核心引擎修改自优秀的开源编辑器 [MarkText](https://github.com/marktext/marktext)。感谢原作者及社区对 Muya 引擎的贡献。

---

Built with ❤️ by AI & Human Collaboration.
