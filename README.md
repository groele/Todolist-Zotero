# Todolist for Zotero 📚✨

<p align="center">
  <img src="chrome/content/icons/icon128.png" width="96" height="96" alt="Todolist Logo" />
</p>

<p align="center">
  <strong>专为学术科研、文献研读与论文写作打造的高颜值全功能任务看板与日程管理插件</strong>
</p>

<p align="center">
  <a href="https://github.com/groele/Todolist-Zotero/releases/latest"><img src="https://img.shields.io/github/v/release/groele/Todolist-Zotero?style=flat-square&color=6366f1" alt="Release" /></a>
  <img src="https://img.shields.io/badge/Zotero-10%2B-059669?style=flat-square" alt="Zotero 10+" />
  <img src="https://img.shields.io/badge/Platform-Win%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="Platform" />
  <img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="License" />
</p>

<p align="center">
  <a href="README_en.md"><strong>English</strong></a> | <strong>简体中文</strong>
</p>

---

## 🌟 为什么选择 Todolist for Zotero？

在学术科研与论文撰写过程中，传统待办管理软件往往脱离了文献研读的真实上下文：
- ❌ **阅读进度断层**：文献存在 Zotero 里，待办记在外部软件中，无法随时调取论文；
- ❌ **无法直达关键页**：记录了任务却不知道当时看到哪一页，寻找关键公式与图表耗时费力；
- ❌ **多端同步壁垒**：平板或移动端查看文献时，无法同步查看文献对应的精读核对清单；
- ❌ **科研流程无专属支撑**：缺乏对泛读、方法推导、对比实验、消融分析与审稿 DDL 的专属工作流抽象。

**Todolist for Zotero** 是首款深度融入 Zotero 原生生态的科研待办与看板系统。它不仅提供了四大多维看板、内置番茄钟与流体动画，更实现了与 Zotero 文献库、PDF 阅读器、云端条目笔记和检视栏（ItemPane）的**双向无缝联动**！

---

## 🎓 核心功能特性

### 1. Zotero 学术文献深度联动
- 🎯 **双向定位与条目关联**：待办直接绑定文献条目与元数据（标题、作者、年份、期刊），点击卡片一键在文献库中高亮定位；
- 📖 **PDF 原生伴读与精准页码跳转**：卡片智能提取页码锚点，点击 `[📖 伴读 P.xx]` 秒级切入 Zotero 原生阅读器并精确定位对应页码；
- 📝 **文献子笔记跨端云同步**：一键将研读任务及子清单同步为文献条目的富文本子笔记（`📝 [Todolist] 研读清单与进度`），支持 Zotero 官方云同步，可在 iPad/手机端随时复习；
- ⚡ **学术精读里程碑自动生成**：一键生成 5 大标准精读步骤（泛读摘要与结论、精读核心方法与公式推导、梳理对比与消融实验、复现代码或验证数据、总结创新点与学术笔记）；
- 📋 **条目检视栏专属侧栏部件 (ItemPane)**：在 Zotero 右侧详情栏直接展示文献的待办列表、进度条与子任务勾选框，支持回车极速创建；
- 🏷️ **自动化文献状态标签**：添加待办自动标注 `待研读`，全部步骤完成自动打上 `精读已完成` 标签；
- 📋 **一键学术引用生成**：卡片快捷复制文献的标准引用格式（APA / IEEE / GB-T 7714）。

### 2. 三大无缝窗口形态 (Window Modes)
通过顶部工具栏一键任意切换：
- 📑 **选项卡模式 (Tab)**：内嵌在 Zotero 主标签页中，沉浸式大屏科研工作台；
- 🗗 **伴读子窗口 (Subwindow 460×760)**：专为双屏或分屏伴读设计，置于 PDF 阅读器旁，小巧精悍；
- ⬚ **独立桌面大窗口 (Window 1120×760)**：独立操作系统桌面窗口，适合多显示器多任务全景协同。

### 3. 四大多维看板视图 (Views)
- 📋 **列表清单 (List View)**：支持按逾期、今天、近期、学术分类与优先级智能分组，折叠展开；
- 📊 **看板分栏 (Kanban View)**：三栏流动式设计（待处理 / 进行中 / 已完成），支持跨列与列内平滑拖拽排序；
- 📅 **月度日历 (Calendar View)**：直观查看整月科研计划与投稿截稿日期分布；
- 📈 **统计分析 (Stats View)**：完成率趋势环形图、研读时长分布与学术类别占比报表。

### 4. 精细化时间与专注管理
- ⏱️ **内置番茄钟与时长统计**：记录单篇论文的精读时间，统计分析科研时间投入；
- ⏰ **时间胶囊快捷选择**：支持全天候 24 小时选定与常用时段胶囊（`09:00` / `12:00` / `14:00` / `18:00` / `20:00`）；
- 🔔 **桌面与声音提醒**：到达截止期前自动发出柔和提示音与系统通知。

### 5. 数据安全与原生存储
- 💾 **本地原生 IOUtils 持久化**：数据安全存储在 Zotero 数据目录下的 `todolist-data.json`，无云端配额限制；
- 📤 **全量备份与多格式报表导出**：支持完整 JSON 备份恢复，以及 CSV、Markdown、TXT 格式导出。

---

## 📥 安装指南

### 方式一：直接安装 XPI 安装包 (推荐)
1. 从 [GitHub Releases](https://github.com/groele/Todolist-Zotero/releases/latest) 下载最新 XPI 安装包；
2. 打开 Zotero 10 或更新版本，点击菜单栏：**“工具 (Tools)” → “插件 (Plugins / Add-ons)”**；
3. 点击插件管理窗口右上角的齿轮 ⚙️ 图标，选择 **“Install Add-on From File... (从文件安装扩展)”**；
4. 选中下载的 `.xpi` 文件确认安装；
5. 重启 Zotero 后，即可在顶部工具栏或右下角看到 Todolist 图标。

### 更新与错误诊断

- 插件更新地址指向本仓库的 `zotero` 分支。启用 Zotero 插件自动更新后，可通过更新检查获取已发布的 XPI。
- v11.0.2 自动启用错误诊断。控制台和 Zotero 数据目录中的 `todolist-debug.json` 会记录操作名称、错误原因、堆栈、版本与时间；文件仅保留最近 50 条记录。
- 保存失败时，快捷添加和行内编辑会保留草稿，可在解决错误原因后重试。诊断日志与 `todolist-data.json` 分开存储。

### 方式二：开发者调试模式 (无需打包)
1. 进入 Zotero 个人配置文件目录下的 `extensions/` 文件夹：
   - **Windows**: `%APPDATA%\Zotero\Zotero\Profiles\<profile>\extensions\`
   - **macOS**: `~/Library/Application Support/Zotero/Profiles/<profile>/extensions/`
   - **Linux**: `~/.zotero/zotero/<profile>/extensions/`
2. 新建名为 `todolist@groele.org` 的纯文本文件（无后缀名）；
3. 文件内填入当前项目文件夹的**绝对路径**；
4. 重启 Zotero 即可实时调试最新代码。

---

## ⌨️ 全局快捷键

| 快捷键 | 功能说明 | 适用场景 |
| :--- | :--- | :--- |
| `Ctrl + Alt + T` / `Cmd + Alt + T` | 快速打开 / 唤起 Todolist 主工作台 | 全局任意界面 |
| `Ctrl + Shift + T` / `Cmd + Shift + T` | 选中文本快速提取并创建研读待办 | Zotero 内置 PDF 阅读器 |
| `Esc` | 关闭当前弹窗或退出全屏模式 | 弹窗 / 编辑态 |
| `Enter` | 快速保存子任务 / 添加快速待办 | 输入框内 |

---

## 📂 项目结构

```
Todolist-Zotero/
├── bootstrap.js                      # Gecko 插件生命周期与资源映射
├── chrome.manifest                   # 协议资源注册
├── manifest.json                     # 扩展清单与版本声明 (v11.0.2, Zotero 10+)
├── prefs.js                          # 插件默认偏好配置
├── update.json                       # 自动更新配置元数据
├── todolist-zotero-11.0.2.xpi        # 发布安装包产物
├── locale/                           # 多语言国际化 (zh-CN, en-US)
│   ├── en-US/todolist.ftl
│   └── zh-CN/todolist.ftl
└── chrome/
    └── content/
        ├── index.html                # 宽屏桌面端与选项卡主视图
        ├── preferences.xhtml         # 原生偏好设置面板
        ├── sidepanel.html            # 伴读紧凑子窗口视图
        ├── assets/                   # 设置面板样式
        ├── css/                      # 现代化设计系统与动效样式
        ├── icons/                    # 高清矢量图标与扩展图标
        ├── images/                   # 界面图像资源
        ├── js/                       # 前端业务逻辑与交互引擎
        └── scripts/                  # 宿主进程核心脚本与偏好设置
```

---

## 📜 开源协议

本项目基于 [MIT License](LICENSE) 开源发布。欢迎提交 Issue 与 Pull Request 共同完善学术科研生产力工具！
