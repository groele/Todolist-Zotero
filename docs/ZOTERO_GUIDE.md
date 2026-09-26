# Todolist for Zotero：学术日程与研读待办插件指南

**Todolist for Zotero** 是专为学术科研、文献研读与论文写作量身打造的高颜值、全功能任务看板与日程管理插件。

本项目参考 Chrome 浏览器扩展版的基础能力，深度吸收借鉴了现代 Zotero 7+ 插件架构（如 MindFlow 项目），针对学术研读与文献管理场景完成了**深度融合与学术强化**。

---

## 🌟 针对 Zotero 的核心特性融合与强化

### 1. 📄 文献双向绑定与跳转定位 (Literature-Linked Tasks)
- **文献研读任务**：可将任意待办事项直接绑定到 Zotero 文献条目（包含文献标题、作者、发表年份、出版物、Zotero URI 与 PDF 路径）。
- **一键文献库定位**：在任务卡片上点击文献徽章（Badge）或定位按钮，Zotero 自动切回文献库并高亮选中该篇论文。
- **📖 PDF 伴读与页码精准直达**：卡片上提供 `[📖 伴读]` 按钮，若任务关联了特定 PDF 页码，点击直接在 Zotero 原生阅读器中精确定位到该页。
- **📝 文献子笔记跨端云同步**：卡片上提供 `[📝]` 同步按钮，可将该文献下的全部待办与子任务进度生成为条目子笔记（`📝 [Todolist] 研读清单与进度`），借助 Zotero 官方同步服务实现跨电脑、跨设备无缝同步。

### 2. ⚡ 结构化精读里程碑自动生成 (Reading Milestones Generator)
在文献列表或右键菜单中点击 **“⚡ 为选中文献批量生成精读清单”**，插件会自动针对该文献生成 5 项标准精读子里程碑：
1. 快速通读 Abstract、Intro 与 Conclusion
2. 深入理解核心方法论与数学模型推导
3. 仔细评估 Baseline 对比与 Ablation 消融结果
4. 查阅开源代码并跑通最小测试 Demo
5. 提炼创新亮点与局限性，整理学术研读笔记

### 3. 📋 文献详情侧栏待办小部件 (Item Pane Section)
- 遵循 Zotero 7 原生 `ItemPaneManager` 标准，在右侧文献详情栏（条目检查器）中注册专属的 **“学术待办”** 面板。
- **研读总进度条与统计**：醒目展示当前文献的待办完成百分比与彩色进度条。
- **交互式子任务核对清单**：直接在侧边栏逐项勾选/解勾子任务，勾选后自动更新主任务进度并触发子笔记同步。
- **行内极速添加**：在底部行内输入框敲回车，极速为该文献追加新待办，无需打开弹窗。
- **侧栏集成操作按钮**：
  - `📋 待办看板`：快速呼出全景看板
  - `🗗 伴读子窗口`：以 460×760 伴读小窗打开此文献任务
  - `⚡ 生成精读清单`：一键自动拆解 5 大研读步骤
  - `📝 同步为文献笔记`：同步到云端子笔记
  - `📖 打开伴读 PDF`：直接切入文献阅读器

### 4. 🖥️ 三大无缝窗口工作模式 (Three Display Modes)
- **1. 标签页模式 (Tab)**：融入 Zotero 主界面顶部标签栏，与“我的文库”、“PDF阅读器”无缝并排切换，享受全屏看板、月度日历、番茄计时与统计图表。
- **2. 伴读紧凑子窗口 (Subwindow, 460×760)**：专为双屏、分屏或小窗口阅读 PDF 打造。置于 PDF 阅读器旁，边读边记、实时核对子任务，轻盈不遮挡。
- **3. 独立桌面大窗口 (Window, 1120×760)**：独立的宽屏大桌面工作台，多显示器用户可在副屏全景掌控全局学术规划与时间线。
- **自由互转**：在 Todolist 界面顶部工具栏点击 `🗗` 即可在伴读子窗口、独立大窗口与标签页之间自由切换。

### 5. ⚙️ 全功能原生首选项设置面板 (Full Zotero Preferences)
在 Zotero 的“设置 (Preferences) → Todolist”中提供 7 大设置板块，所有选项与 `Zotero.Prefs` 及数据存储实时双向同步：
1. **窗口与视图模式**：默认窗口模式（标签页 / 伴读子窗口 / 独立大窗口）、默认视图（看板 / 列表 / 日历）、主题（跟随系统 / 明亮 / 暗黑）、完成任务与排序方式。
2. **文献侧边栏 (ItemPane)**：侧栏开关、研读进度条开关、交互式子任务清单开关、自动提取文献标签。
3. **文献子笔记云端同步**：自动同步开关、笔记标题格式、是否包含子任务/摘录。
4. **文献状态自动打标**：创建待办时自动为文献添加标签（默认 `待研读`）、全部任务完成时自动打标（默认 `精读已完成`）。
5. **学术预设与快捷键**：默认任务类型（论文精读/写作/实验等）、默认优先级、PDF 阅读器选中文本提取待办动作。
6. **提醒与系统维护**：每日待办汇总通知、定期自动归档已完成任务天数。
7. **数据管理与备份**：一键导出 JSON / Markdown，一键重置默认配置。

### 6. 📑 五大学术研读专属预设模板 (Academic Presets)
内置针对高校师生与科研人员深度优化的预设任务模板：
- 📖 **论文精读与复现清单**（含速读、方法剖析、消融对比、代码测试）
- ✍️ **论文写作与修改规划**（Abstract、Intro、Method、Experiments、Conclusion 逐章推进）
- 🔬 **实验设计与消融分析**（数据预处理、Baseline 搭建、消融对比、超参调优、图表绘制）
- ⏰ **学术会议投稿 DDL 冲刺**（正文定稿、导师审阅、语法润色、BibTeX 格式、OpenReview 账号核对、PDF 无溢出检查）
- 📑 **审稿意见逐条回复 (Rebuttal)**（Reviewer 意见拆解、对比实验补充、Point-by-Point 回复信起草、高亮修订）

### 7. 💾 高性能安全数据持久化 (IOUtils Persistence)
- 放弃浏览器的配额限制，直接在 Zotero 数据存储目录持久化保存 `todolist-data.json`。
- 采用 Mozilla Gecko 原生的 `IOUtils.readUTF8` 和 `IOUtils.writeUTF8`（带临时文件写入与原子替换），支持数万条任务秒级加载，完全不受浏览器清理缓存影响。
- 支持全量 JSON 备份导入/导出。

### 8. ⌨️ 全局快捷键与深度菜单联动
- **`Ctrl + Alt + T`** (macOS: `Cmd + Alt + T`)：全局随时呼出 Todolist 学术任务看板（按首选项设定的窗口模式）。
- **`Ctrl + Shift + T`** (macOS: `Cmd + Shift + T`)：在 Zotero PDF 阅读器中直接将选中文本与当前页码一键生成文献研读待办。
- **主工具栏图标**：在 Zotero 主界面顶部工具栏直接常驻 Todolist 快捷按钮。
- **右键菜单集成**：
  - 文献列表右键：
    - `📋 为选中文献添加研读待办...`
    - `⚡ 为选中文献批量生成精读清单`
    - `🗗 在伴读子窗口中打开此文献待办`
    - `📝 同步研读清单至文献子笔记 (云端)`
  - 分类目录右键：
    - `⚡ 为此分类所有文献批量生成研读清单`
    - `📋 为此分类创建专题研读规划`

---

## 🚀 安装步骤

### 方式一：直接安装 XPI 安装包 (推荐)
1. 在项目根目录的 `dist-zip/` 文件夹中找到生成的 `todolist-zotero-2.0.0.xpi`。
2. 打开 Zotero 7+，点击顶部菜单栏 **“工具 (Tools)” → “插件 (Plugins / Add-ons)”**。
3. 点击插件管理窗口右上角的齿轮 ⚙️ 图标，选择 **“Install Add-on From File... (从文件安装扩展)”**。
4. 选择 `todolist-zotero-2.0.0.xpi` 并确认安装。
5. 安装成功后按提示重启 Zotero 即可。

### 方式二：开发者调试模式 (无需打包)
1. 运行 `npm run build:zotero` 生成 `dist-zotero/` 暂存目录。
2. 找到你的 Zotero 个人配置文件目录（Profile Directory）下的 `extensions` 文件夹：
   - Windows: `%APPDATA%\Zotero\Zotero\Profiles\<profile>\extensions\`
   - macOS: `~/Library/Application Support/Zotero/Profiles/<profile>/extensions/`
   - Linux: `~/.zotero/zotero/<profile>/extensions/`
3. 在 `extensions/` 目录下新建一个名为 `todolist@groele.org` 的纯文本文件（无后缀名）。
4. 在该文件中写入当前项目 `dist-zotero` 文件夹的绝对路径（例如：`D:\Dev Studio\Todolist\dist-zotero`）。
5. 重启 Zotero 即可实时加载修改后的代码进行调试。

---

## 🛠️ 构建与打包说明

本项目构建工具链依赖 Node.js (>= 18) 与 PowerShell 7 (pwsh)。

在项目根目录下运行：

```bash
# 执行完整构建流程（语法校验、资源组装与 XPI 压缩打包）
npm run build:zotero
```

构建流水线包含：
1. **清理与重构暂存区**：准备标准的 Gecko Add-on 目录结构 `dist-zotero/`
2. **复制与注入资源**：整合 `zotero/` 宿主脚本、`css/`、`js/`、`index.html` 以及多语言文件
3. **语法安全静态检查**：调用 `node --check` 对所有关键 JavaScript 进行语法合规验证
4. **生成 .xpi 压缩包**：压缩并计算 SHA-256 校验码，输出到 `dist-zip/todolist-zotero-2.0.0.xpi`

---

## 📂 项目结构映射

```
Todolist/
├── zotero/                           # Zotero 7+ 插件原生核心
│   ├── manifest.json                 # 扩展清单 (ID: todolist@groele.org, strict_min_version: 6.999)
│   ├── bootstrap.js                  # Gecko 启动生命周期与 chrome:// 资源映射
│   ├── chrome.manifest               # chrome://todolist/content/ 资源协议映射
│   ├── prefs.js                      # 默认首选项声明
│   ├── update.json                   # 自动更新说明
│   ├── locale/                       # Fluent 本地化资源
│   │   ├── zh-CN/todolist.ftl        # 中文语言包
│   │   └── en-US/todolist.ftl        # 英文语言包
│   └── chrome/content/
│       ├── preferences.xhtml         # 原生偏好设置面板 XHTML
│       ├── assets/preferences.css    # 设置面板样式
│       ├── icons/todolist.svg        # 官方高质量矢量图标
│       └── scripts/
│           ├── index.js              # Zotero 宿主进程核心脚本 (菜单注入/侧栏/IPC通信/IO持久化)
│           └── preferences.js        # 设置面板脚本
├── scripts/
│   ├── build-zotero.mjs              # Node.js 组装与构建流水线
│   └── build-zotero.ps1              # PowerShell XPI 归档与校验脚本
├── js/
│   ├── zoteroBridge.js               # 前端与 Zotero 宿主进程通信桥梁
│   ├── storage.js                    # 多端自适应存储层 (Zotero IOUtils / Chrome Storage / LocalStorage)
│   ├── taskManager.js                # 任务管理核心逻辑 (学术文献字段 / 过滤与排序)
│   ├── modal.js                      # 任务编辑弹窗 (关联文献卡片与快速解除)
│   ├── templates.js                  # 任务模板模块 (5大学术研读预设)
│   ├── ui.js                         # 界面渲染引擎 (文献徽章 / 伴读按钮 / 定位交互)
│   └── ...                           # 日历、拖拽、统计、番茄钟等模块
├── css/                              # 样式系统
├── index.html                        # 宽屏看板主界面 (选项卡与桌面视图)
├── sidepanel.html                    # 紧凑视图
└── dist-zip/                         # 打包产物 (todolist-zotero-2.0.0.xpi)
```

---

## 📜 许可说明

MIT License
