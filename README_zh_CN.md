[English](https://github.com/siyuan-note/plugin-sample/blob/main/README.md)

# 思源记账插件 (SiYuan Ledger Plugin)

为思源笔记量身打造的纯文本复式记账插件，让您在知识库中即可轻松完成财务管理。

## 核心功能

- **复式记账体系:** 所有账目均作为标准的思源块存储，并通过自定义属性 (IAL) 记录金额、分类等元数据，安全且透明。
- **可视化仪表盘:** 内置数据大屏，纯手工绘制月度收支柱状图与分类消费饼图，无外部图表库依赖。
- **多模式快捷录入:** 
  - 支持支出、收入、转账三种标准弹窗表单。
  - 支持自然语言解析的**极简快记模式**（例如输入 `2024-03-15 午饭 58 微信` 即可一键记账）。
- **账户体系管理:** 提供完整的账户树系统，支持对资产、负债、权益、收入、支出五大类账户进行创建、编辑与关闭，支持自定义图标。
- **数据生态兼容:** 支持将本地账目一键导出为 Ledger、Beancount 或 CSV 格式文件，方便在专业财务软件中进行深度分析。
- **深度系统集成:** 
  - 全局斜杠命令：在任意位置键入 `/记账`、`/收入`、`/转账`、`/快记` 唤出面板。
  - 快捷键映射：支持自定义全局快捷键（如 `⇧⌘E` 记支出）。
  - 块级右键菜单：选中已有账目块，右键可快速删除或编辑。
- **常驻侧边栏 (Dock):** 随时监视当月核心开销进度与各主要资产的实时余额。
- **多币种与自动平账:** 设置默认币种后，录入单侧金额即可自动推算并补齐平衡账目。

## 开始使用

1. 在思源笔记的插件集市中搜索并安装本插件。
2. 进入插件设置面板，配置您的默认币种（如 `CNY`）以及常用的默认支付账户（如 `Assets:Alipay`）。
3. 点击顶栏的插件图标进入账户管理界面，初始化属于您的资产结构与收支分类。
4. 在日常笔记页面中键入 `/快记`，输入类似 `2024-03-15 午饭 15 现金` 的单行文本快速记录流水。
5. 呼出顶栏菜单或按下快捷键 `⇧⌘L` 开启数据仪表盘，查阅当月详细的收支报表与交易记录。
6. 定期通过菜单栏的导入导出功能备份数据。

## 开发

* i18n/*
* icon.png (160*160)
* index.css
* index.js
* plugin.json
* preview.png (1024*768)
* README*.md
* [前端 API](https://github.com/siyuan-note/petal)
* [后端 API](https://github.com/siyuan-note/siyuan/blob/master/API_zh_CN.md)

## 国际化

国际化方面我们主要考虑的是支持多语言，具体需要完成以下工作：

* 插件自身的元信息，比如插件描述和自述文件
  * plugin.json 中的 `displayName`、`description` 和 `readme` 字段，以及对应的 README*.md 文件
* 插件中使用的文本，比如按钮文字和提示信息
  * src/i18n/*.json 语言配置文件
  * 代码中使用 `this.i18.key` 获取文本

建议插件至少支持英文和简体中文，这样可以方便更多人使用。不支持的语种不需要在 plugin.json 中的 `displayName`、`description` 和 `readme` 字段中声明。

## plugin.json

一个典型的示例如下：

```json
{
  "name": "plugin-sample",
  "author": "Vanessa",
  "url": "https://github.com/siyuan-note/plugin-sample",
  "version": "0.4.2",
  "minAppVersion": "3.3.0",
  "backends": ["all"],
  "frontends": ["all"],
  "disabledInPublish": false,
  "displayName": {
    "default": "Plugin Sample",
    "zh_CN": "插件示例"
  },
  "description": {
    "default": "This is a plugin development sample",
    "zh_CN": "这是一个插件开发示例"
  },
  "readme": {
    "default": "README.md",
    "zh_CN": "README_zh_CN.md"
  },
  "funding": {
    "custom": ["https://ld246.com/sponsor"]
  },
  "keywords": [
    "开发者参考",
    "developer reference",
    "示例插件"
  ]
}
```

* `name`：插件包名，必须和 GitHub 仓库名一致，且不能与集市中的其他插件重复
* `author`：插件作者名
* `url`：插件仓库地址
* `version`：插件版本号，需要遵循 [semver](https://semver.org/lang/zh-CN/) 规范
* `minAppVersion`：插件支持的最低思源笔记版本号
* `disabledInPublish`：使用发布服务时是否禁用该插件，默认为 false，即不禁用
* `backends`：插件需要的后端环境，可选值为 `windows`, `linux`, `darwin`, `docker`, `android`, `ios`, `harmony` 和 `all`
  * `windows`：Windows 桌面端
  * `linux`：Linux 桌面端
  * `darwin`：macOS 桌面端
  * `docker`：Docker 端
  * `android`：Android 端
  * `ios`：iOS 端
  * `harmony`：鸿蒙端
  * `all`：所有环境
* `frontends`：插件需要的前端环境，可选值为 `desktop`, `desktop-window`, `mobile`, `browser-desktop`, `browser-mobile` 和 `all`
  * `desktop`：桌面端
  * `desktop-window`：桌面端页签转换的独立窗口
  * `mobile`：移动端
  * `browser-desktop`：桌面端浏览器
  * `browser-mobile`：移动端浏览器
  * `all`：所有环境
* `displayName`：插件名称（纯文本），在插件集市列表中显示
  * `default`：默认语言，必须存在。如果插件支持英文，此处应使用英文
  * `zh_CN`、`en_US` 等其他语言：可选
* `description`：插件描述（纯文本），在插件集市列表中显示
  * `default`：默认语言，必须存在。如果插件支持英文，此处应使用英文
  * `zh_CN`、`en_US` 等其他语言：可选
* `readme`：自述文件名，在插件集市详情页中显示
  * `default`：默认语言，必须存在。如果插件支持英文，此处应使用英文
  * `zh_CN`、`en_US` 等其他语言：可选
* `funding`：插件赞助信息，集市仅显示其中一种
  * `openCollective`：Open Collective 名称
  * `patreon`：Patreon 名称
  * `github`：GitHub 登录名
  * `custom`：自定义赞助链接列表
* `keywords`：搜索关键字列表，用于集市搜索功能，补充 `name`、`author`、`displayName`、`description` 字段值以外的搜索关键词

## 打包

无论使用何种方式编译打包，我们最终需要生成一个 package.zip，它至少包含如下文件：

* i18n/* (如果插件支持多语言，则需要将语言文件打包到该目录下，否则不需要该目录)
* icon.png (建议尺寸为 160*160、文件大小不超过 20KB)
* index.css
* index.js
* plugin.json
* preview.png (建议尺寸为 1024*768、文件大小不超过 200KB)
* README*.md

## 上架集市

* 执行 `pnpm run build` 生成 package.zip
* 在 GitHub 上创建一个新的发布，使用插件版本号作为 “Tag version”，示例 https://github.com/siyuan-note/plugin-sample/releases
* 上传 package.zip 作为二进制附件
* 提交发布

如果是第一次发布版本，还需要创建一个 PR 到 [Community Bazaar](https://github.com/siyuan-note/bazaar) 社区集市仓库，修改该库的 plugins.json。该文件是所有社区插件库的索引，格式为：

```json
{
  "repos": [
    "username/reponame"
  ]
}
```

PR 被合并以后集市会通过 GitHub Actions 自动更新索引并部署。后续发布新版本插件时只需要按照上述步骤创建新的发布即可，不需要再 PR 社区集市仓库。

正常情况下，社区集市仓库每隔 1 小时会自动更新索引并部署，可在 https://github.com/siyuan-note/bazaar/actions 查看部署状态。

## 开发者须知

开发者需注意以下规范。

### 1. 读写文件规范

插件或者外部扩展如果有直接读取或者写入 data 下文件的需求，请通过调用内核 API 来实现，**不要自行调用 `fs` 或者其他 electron、nodejs API**，否则可能会导致数据同步时分块丢失，造成云端数据损坏。

相关 API 见 `/api/file/*`（例如 `/api/file/getFile` 等）。

### 2. Daily Note 属性规范

思源在创建日记的时候会自动为文档添加 custom-dailynote-yyyymmdd 属性，以方便将日记文档同普通文档区分。

> 详情请见 [Github Issue #9807](https://github.com/siyuan-note/siyuan/issues/9807)。

开发者在开发手动创建 Daily Note 的功能时请注意：

* 如果调用了 `/api/filetree/createDailyNote` 创建日记，那么文档会自动添加这个属性，无需开发者特别处理
* 如果是开发者代码手动创建文档（例如使用 `createDocWithMd` API 创建日记），请手动为文档添加该属性

xK9qL2mP5zR8tY3wV
