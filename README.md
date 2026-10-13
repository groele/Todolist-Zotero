# Todolist for Zotero

<p align="center">
  <img src="chrome/content/icons/icon128.png" width="96" height="96" alt="Todolist 图标" />
</p>

<p align="center"><strong>把待办、文献研读和 Zotero 阅读位置放在同一条工作流里</strong></p>

<p align="center">
  <a href="https://github.com/groele/Todolist-Zotero/releases/latest"><img src="https://img.shields.io/github/v/release/groele/Todolist-Zotero?style=flat-square&color=6366f1" alt="最新版本" /></a>
  <img src="https://img.shields.io/badge/Zotero-10%2B-059669?style=flat-square" alt="Zotero 10+ (manifest support through 15.x)" />
  <img src="https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-blue?style=flat-square" alt="跨平台" />
  <a href="LICENSE"><img src="https://img.shields.io/badge/License-MIT-yellow?style=flat-square" alt="MIT License" /></a>
</p>

<p align="center"><strong>简体中文</strong> | <a href="README_en.md">English</a></p>

---

## 简介

**Todolist for Zotero** 是运行在 Zotero 桌面端中的任务与研读管理插件。它将任务关联到 Zotero 文献条目，并把 PDF 页码、摘录、子任务和研读进度带回日常任务流程。你可以用列表、看板、日历或统计视图规划工作，也可以在文献详情侧栏中直接查看和更新关联任务。

适合用来管理论文阅读、论文写作、实验与代码复现、投稿截稿、同行评审，以及一般的学习和生活待办。插件不依赖单独的在线账户或第三方待办服务。

## 功能一览

### 任务管理

- 创建、编辑、完成、删除和恢复任务；任务可包含标题、描述、截止日期与时间、优先级、分类、标签和子任务。
- 设置每日、每周、双周、每月、每季度或每年的重复周期。完成重复任务后，插件按下一周期生成后续任务。
- 使用内置的论文研读、写作、实验复现、投稿和审稿类型；自定义分类、标签和任务模板。
- 按关键词、状态、日期、优先级、分类等查找和筛选任务，并按截止日期、优先级、创建时间或名称排序。
- 在列表中查看逾期、今天、即将到期和已完成任务；可批量完成或删除任务。

### 四种任务视图

- **列表**：按任务日期和状态浏览，可展开分组、查看子任务和处理任务。
- **看板**：按待办、进行中、已完成等状态组织任务，支持拖放调整状态与顺序。
- **日历**：以月视图查看截止日期和计划分布。
- **统计**：查看任务总量、完成率、逾期与今日待办、近 7 天完成趋势，以及优先级和分类分布。

### Zotero 文献与 PDF 联动

- 从当前选中的 Zotero 文献创建单条或批量研读任务，并保存文献条目关联与可用的书目信息。
- 从 PDF 阅读器选中文本后按快捷键创建任务；任务可记录摘录、PDF 页码和定位链接。
- 从关联任务打开对应文献或 PDF；有页码或批注锚点时，可跳回相应阅读位置。
- 在 Zotero 文献详情侧栏（ItemPane）中查看关联任务与研读进度；侧栏支持快速添加任务以及勾选子任务。
- 按设置将研读任务、子任务和摘录同步到 Zotero 文献的子笔记。子笔记可通过 Zotero 自身的同步功能同步；**插件的任务数据库本身保存在本机 Zotero 数据目录，不会由本插件自动跨设备同步**。
- 可选择从文献继承标签，并在研读任务创建或全部完成时维护相应的 Zotero 条目标签。
- 关联文献任务提供简洁的作者、年份和标题引用文本复制；它不是 APA、IEEE 或 GB/T 7714 的完整格式化引文工具。

### 研读清单与时间管理

- 为一般论文、理论论文、实验论文、综述论文、算法与复现提供五类研读步骤模板，可按子任务逐项核对。
- 通过任务计时器记录专注时段，并查看单项任务的累计时长和统计数据。
- 为任务设置截止提醒；可启用每日任务摘要。在 Zotero 运行时由插件检查并发送提醒。
- 提供 Zotero 内部标签页、紧凑伴读子窗口和独立窗口三种打开方式，便于边读 PDF 边查看任务。
- 支持跟随 Zotero 外观、浅色、深色或系统主题。

## 常用工作流

1. 在 Zotero 文献列表中选择一篇或多篇文献，将其加入 Todolist。
2. 选择研读类型和清单模板，补充截止日期、优先级或个人备注。
3. 阅读 PDF 时用 `Ctrl+Shift+T`（macOS：`Cmd+Shift+T`）把选中文本和当前页码转成待办。
4. 在 ItemPane、列表或看板中推进任务并勾选子任务；需要时从任务跳回文献或 PDF 位置。
5. 如启用子笔记同步，将研读进度写入 Zotero 文献子笔记；也可从设置页导出备份或报告。

## 安装

### 从 XPI 安装（推荐）

1. 前往 [GitHub Releases](https://github.com/groele/Todolist-Zotero/releases/latest) 下载最新的 `.xpi` 文件。
2. 在 Zotero 中打开 **工具 → 插件**。
3. 点击插件管理器中的齿轮菜单，选择 **从文件安装插件**。
4. 选择下载的 XPI 并按提示确认安装；必要时重启 Zotero。

### 开发调试安装

1. 找到 Zotero 配置目录中的 `extensions/` 文件夹。
   - Windows：`%APPDATA%\Zotero\Zotero\Profiles\<profile>\extensions\`
   - macOS：`~/Library/Application Support/Zotero/Profiles/<profile>/extensions/`
   - Linux：`~/.zotero/zotero/<profile>/extensions/`
2. 新建一个名为 `todolist@groele.org`、没有扩展名的文本文件。
3. 将本项目目录的绝对路径写入文件并保存，然后启动 Zotero。

## 数据、同步与导出

- 在 Zotero 中，插件任务数据保存在 Zotero 数据目录下的 `todolist-data.json`。建议在升级或迁移配置目录前先从插件设置页导出 JSON 备份。
- JSON 可用于完整备份和恢复；导入时可选择合并或替换。CSV、Markdown 和 TXT 用于查看、整理或分享导出内容，不用于导入恢复。
- 与文献关联的 Zotero 子笔记和标签属于 Zotero 条目数据；它们是否跨设备同步取决于 Zotero 账户的同步设置。任务数据库文件不会因为创建了子笔记而自动同步。
- 清空任务数据会移除插件本地待办数据，操作不可撤销；请先导出备份。

## 当前范围与限制

- 兼容范围以插件清单为准：Zotero **10.0 及以上，最高到 15.x**。在更新 Zotero 大版本后，请以最新发行版说明为准。
- 番茄钟倒计时、自动归档和声音提醒尚未接入；设置页中未接入运行逻辑的选项会禁用或标明不可用。
- 任务提醒和每日摘要依赖 Zotero 正在运行，不能替代操作系统日历或云端提醒服务。
- PDF 跳页和批注定位取决于任务是否有关联的可用 PDF、页码或批注锚点。
- 工具栏与 Zotero 原生菜单使用 SVG 图标；16、32、48、128 像素 PNG 是不同尺寸的栅格资源，不决定原生工具栏控件的显示大小。

## 快捷键

| 快捷键 | 功能 | 位置 |
| --- | --- | --- |
| `Ctrl+Alt+T` / macOS `Cmd+Alt+T` | 打开或切换 Todolist 工作区 | Zotero |
| `Ctrl+Shift+T` / macOS `Cmd+Shift+T` | 将 PDF 阅读器选中文本和当前页转成研读待办 | Zotero PDF 阅读器 |

设置页可选择 PDF 快捷键直接创建任务，或先打开编辑窗口。

## 项目信息

- 最新发布版本：见 [GitHub Releases](https://github.com/groele/Todolist-Zotero/releases/latest)。
- 问题反馈与功能建议：[GitHub Issues](https://github.com/groele/Todolist-Zotero/issues)。
- 开源协议：[MIT License](LICENSE)。
- 项目源代码主要位于 `chrome/content/`；`scripts/build-package.py` 用于构建 ZIP 格式的 Zotero XPI 安装包。
