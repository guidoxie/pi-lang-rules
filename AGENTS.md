# pi-lang-rules

pi 包：extension 在 `before_agent_start` 时探测项目语言，把对应规范注入 system prompt 的
`language_practices` section。规范内容精选自 [ECC](https://github.com/affaan-m/ECC)（MIT）。

## 规范内容规则（rules/\*.md）

内容向上兼容 ECC 上游。搬入或新写规范时，保留通用工程约定，剥离产品专属内容——
判据：一条指令引用了 pi 之外的产品机制即不合规格。已知踩过的坑：Claude Code 的
hooks/agents 机制、`~/.claude` 路径、Claude 模型名与快捷键都曾在 common.md 里残留过；
rules 里的 "See skill: ..." 引用只允许指向本包 `skills/` 随包分发的 skill（go.md 指向
golang-patterns / golang-testing，合法）；指向未随包 skill 的引用是死引用，python.md
曾残留 python-patterns / django-security / python-testing 死引用（已剥离）。合入前逐节检查。

上游来源统一记录在本节，不写入规则文件头部。上游均为 [ECC](https://github.com/affaan-m/ECC)（MIT）：

- `rules/common.md` ← `rules/common/`（coding-style、patterns、testing、security、performance 精选合并）
- `rules/go.md` ← `rules/golang/` 合并
- `rules/typescript.md` ← `rules/typescript/` 合并
- `rules/python.md` ← `rules/python/` 合并
- `rules/web.md` ← `rules/web/` 精选（coding-style、design-quality、performance、security；
  原独立的 html/css 两文件已合并，语言 id 为 web）

## Skills（skills/）

rules 层保持薄（常驻注入，占 `MAX_TOTAL_LINES` 预算），深度参考走 skills 层按需加载
（只有 name/description 进 system prompt，正文按需读）。上游来源（同属 ECC，MIT）：

- `skills/golang-patterns/` ← 上游 `skills/golang-patterns/` 原样搬入，frontmatter 补
  `license: MIT`（产品专属内容扫描零命中，无需清洗）
- `skills/golang-testing/` ← 上游 `skills/golang-testing/`（同上）
- `skills/e2e-testing/` ← 上游 `skills/e2e-testing/`（同上，纯 Playwright 规范，
  typescript.md 的 E2E Testing 节引用之）
- `skills/python-patterns/` ← 上游 `skills/python-patterns/` 原样搬入（同上）
- `skills/python-testing/` ← 上游 `skills/python-testing/`（同上）；上游 `django-security`
  为 Django 框架专属，**有意不引入**，python.md 的对应引用保持剥离

rules 与 skills 的关联：pi 启动时把所有 skill 的 name+description 广告进 system
prompt，路由由 skill 自己的 description 完成。rules 文件里可以写 "See skill: `<name>`"
指向随包分发的 skill 提高路由命中率（如 go.md → golang-patterns / golang-testing），
但不得引用未随包分发的 skill 或上游机制（死引用）。go / python / typescript / web
均曾残留此类引用（"See skill: ..."、Agent Support、"See hooks"、"Use ECC ... skills"），
均已剥离。搬入新 skill 前先扫描产品专属内容（同上判据）。

本地可按需新增上游没有的节（如 python.md 的 uv 项目管理节）：放在文件末尾与上游搬运
内容分开，正文保持英文、风格对齐既有小节。

## 代码约定（extensions/lang-rules.ts）

- 注入必须就地修改 `event.systemPromptOptions.sections[SECTION_NAME]`，返回
`systemPrompt` 字符串是整段替换，会丢失结构化 transcript delta——两者不混用。
- section 名必须匹配 `^[a-z][a-z0-9_-]*$` 且不能叫 `preamble`（pi 的硬约束）。
- 规范解析是三级同名覆盖：项目 `.pi/rules/`（trusted）&gt; 用户 `~/.pi/agent/rules/` &gt;
包内置 `rules/`。是覆盖不是拼接，改动 `resolveRule` 时保持该语义。
- `MAX_TOTAL_LINES` 超限走索引模式（只列路径让模型按需 read），是上下文预算的
保险丝，调大前先确认总注入行数的实际影响。

## 添加语言

1. `rules/` 下新建 `<lang>.md`（文件名即语言 id）
2. `LANG_SPECS` 加一行探测 marker：`files`（精确文件名）或 `globs`（浅层后缀，如 `"*.html"`）

完成标准：上文的验证流程对该语言 marker 命中、对无关项目不命中。

