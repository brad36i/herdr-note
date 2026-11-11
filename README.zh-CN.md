# herdr-note

[English](README.md) | [한국어](README.ko.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md)

`note` 是 Herdr 的扩展模块，在应用右侧同时显示当前 Space 和所选标签页的笔记。
点击右上角 **Files 按钮左侧的 Note 按钮**，即可展开或收起整个面板。

- 上方 **Space**：长期保存一份项目共用笔记。
- 下方 **Tab**：显示所选标签页的工作笔记。关闭标签页本身时，该笔记会被删除。
- 支持纯文本、自动保存、分别折叠或展开两个区域，以及调整上下区域的高度和面板总宽度。
- 面板的展开状态在当前布局中统一生效；笔记内容随当前 Space 和所选标签页切换。
- 同一标签页中的 Agent 共用该标签页的笔记。切换 Agent 或隐藏面板不会删除笔记。

点击 Space、Tab 标题旁的 `−`、`+`，可分别调整两个区域的笔记字号。
默认 13px，每次调整 1px，范围为 10～28px；标题和按钮的大小不变。
字号按区域保存，切换 Space 或标签页时保持不变，重启应用后也会恢复。

本模块适用于 Herdr **桌面应用**。安装器支持默认 `main` 布局，以及保留相同结构的布局副本，
不保证兼容所有自定义布局和操作系统。安装适配以 Herdr 0.1.14、0.1.15 的默认结构为准。
详细验证范围见 [VALIDATION.md（韩语）](VALIDATION.md)。

## 安装

安装时需要 **Node 22 或更高版本**、正在运行的 Herdr 应用，以及能从 PATH 中执行的
`herdr-app` CLI。安装完成后，运行模块不需要 Node 或 npm，也不需要下载额外的软件包
或执行 `npm install`。

```sh
git clone https://github.com/brad36i/herdr-note.git
cd herdr-note
node scripts/install.mjs --dry-run
node scripts/install.mjs
```

`--dry-run` 仅显示变更计划，不修改文件或布局。正式安装时，安装器会将当前布局和标签栏
分别复制为 `herdr-note` 和 `note-tabs`，在副本的 Files 按钮左侧添加 Note 按钮，
接入右侧笔记面板，然后切换到新布局。原布局、原标签栏、快捷键设置和已有笔记数据均不会被覆盖。

安装后的 `mods/note/mod.json` 使用 `place: none`，避免笔记面板自动加入原布局。
如果已安装完全相同的 note 运行代码，安装器可以直接复用；如果现有文件不同，或目标布局、
标签栏名称已被占用，安装器会停止，不会覆盖。无法识别默认结构的自定义布局也不会被自动修改。

布局和模块名称仅支持英文字母、数字、`-` 和 `_`。复制出的标签栏和布局不会自动接收原版的
后续更新。在其他电脑上需要分别执行相同的安装步骤，笔记不会在电脑之间同步。

如需指定路径或副本名称，可使用以下选项。路径中含有空格时，请加上引号。

```sh
node scripts/install.mjs --home "/path/to/herdr-app" --app "/path/to/herdr-app"
node scripts/install.mjs --layout-name my-note-layout --toolbar-name my-note-tabs
```

`--home` 指定 Herdr 应用的数据目录，`--app` 指定 CLI 可执行文件的路径。
Windows 下可以使用 `--app "C:\path\to\herdr-app.exe"`。
在所有操作系统上，应用数据目录均按以下优先级确定：

1. `--home`
2. `HERDR_APP_HOME`
3. `XDG_CONFIG_HOME/herdr-app`
4. 用户主目录下的 `.config/herdr-app`

如果安装失败，安装器会尝试切回原布局。新建的副本会保留，供排查问题；
确认输出的路径后，可自行清理这些副本。

## 保存与删除

笔记以**明文**形式保存在应用数据目录的 `shared.json` 中，键名为 `note.state`。
模块使用 Herdr 的存储 API，不直接读写文件。笔记通过机器、Space 和标签页的 ID 关联，
因此重命名或调整顺序不会影响笔记。新建的同名标签页拥有独立的笔记。

每次输入变化都会更新存储状态，实际写入磁盘由 Herdr 负责。正常退出应用后，
再次打开同一标签页即可恢复笔记。退出操作系统账户或关闭电脑本身不会触发删除，
但重新启动后必须恢复相同的标签页 ID，才能继续使用该标签页的笔记。
强制结束进程或突然断电前的最后几次修改不保证能够保存。

只有在对应机器的布局状态为 `ready`，且标签页确实已消失时，才会清理标签页笔记。
加载中或离线不会触发删除。最后一个终端退出后，如果标签页也随之消失，其笔记同样会被删除。
**标签页笔记没有回收站。** 如果标签页在模块未运行期间消失，模块会在下次加载时检查列表并清理。

关闭 Space 不会自动删除 Space 笔记，但目前没有单独查找或恢复已关闭 Space 笔记的界面。
多个模块副本共用同一份笔记；同时编辑同一份笔记时，以最后一次输入为准。
本模块不提供跨电脑同步功能。

## 恢复原布局与卸载

在 Herdr 的布局切换菜单中，选择安装前使用的布局即可。例如，原先使用的是 `main`，
可以执行以下命令切回：

```sh
herdr-app do layout.switch '{"name":"main"}'
```

如果使用了自定义应用数据目录，请设置与安装时相同的 `HERDR_APP_HOME`。
在 PowerShell 等环境中，如果 JSON 参数的传递方式不同，也可以直接使用应用内的布局菜单。
确认不再引用安装器输出的新布局、标签栏副本和 `mods/note` 后，即可删除这些文件。
**卸载时不要删除整个 `shared.json`**，其中还包含其他模块的数据。

## 安全与验证

note 的运行代码不会发送网络请求、执行 Shell 命令、读取剪贴板或向 Agent 发送笔记。
Herdr 模块属于受信任代码（trusted code），并非能阻止其他模块或同一账户下的程序读取笔记的
安全存储。请勿用它保存密码或 API 密钥。

安装器会读取本地文件、创建副本，并执行 Herdr CLI。运行代码和安装器的具体影响范围见
[SECURITY.md（韩语）](SECURITY.md)，已完成的验证和仍未验证的项目见
[VALIDATION.md（韩语）](VALIDATION.md)。

GitHub Actions 已使用 Node 22，在 Linux、macOS 和 Windows 上分别通过 **36 项自动测试**。
TypeScript、ESLint 和 Herdr 原生检查也已通过；实际 Herdr 窗口的安装与重启验证仅在 Linux 上完成。
这不代表 macOS、Windows 的 Herdr 界面或实际输入法已经过验证。

```sh
npm test
npm run check
```

`npm run check` 需要 `herdr-app`。如需使用已安装的 TypeScript CLI，
请将 `NOTE_TSC` 环境变量设为 `typescript/bin/tsc` 的路径。
测试使用 Node 的实验性 VM module API，因此可能显示相关警告。

开发计划见 [PLAN.md（韩语）](PLAN.md)，实现说明见 [RECIPE.md（韩语）](RECIPE.md)。
