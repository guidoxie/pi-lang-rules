# pi-lang-rules

根据项目检测到的语言，自动把对应的语言实践规范注入 pi 的 system prompt。

规范来源: [affaan-m/ECC](https://github.com/affaan-m/ECC)（MIT），经清洗合并。

## 安装

```bash
pi install git:github.com/guidoxie/pi-lang-rules
```

## 支持语言与探测方式

| 语言 | 探测 marker |
|---|---|
| common（跨语言基线，无条件注入） | — |
| typescript | `tsconfig.json`，或 `package.json` + 浅层 `.ts`/`.tsx` 文件 |
| python | `pyproject.toml` / `requirements.txt` / `setup.py` / `setup.cfg` / `Pipfile` / `.python-version` |
| go | `go.mod` |
| web | 浅层存在 `*.html` / `*.css` / `*.scss` / `*.less` |

monorepo 检测到多个语言时全部注入。注入内容超过 1200 行时自动退化为索引模式（只列文件路径，模型按需读取）。

## 规范文件覆盖层级（同名覆盖）

1. `<项目>/.pi/rules/<lang>.md` — 项目级（需项目信任）
2. `~/.pi/agent/rules/<lang>.md` — 用户级
3. 包内置 `rules/<lang>.md` — 出厂默认

想定制某语言的规范: 复制包内文件到 `~/.pi/agent/rules/` 后修改即可。

## Skills

包同时分发 5 个按需加载的 skill（只有 name/description 进 system prompt，正文由模型在任务相关时才读取）：

| skill | 内容 |
|---|---|
| golang-patterns | Go 惯用法与设计模式 |
| golang-testing | Go 测试模式（表驱动、基准、模糊测试、覆盖率） |
| python-patterns | Python 惯用法与设计模式 |
| python-testing | pytest 模式与 fixtures |
| e2e-testing | Playwright E2E 测试（Page Object Model、CI 集成、flaky 治理） |

rules 与 skills 分工：rules 短小、随语言常驻注入；skills 深度参考、按需加载。
`go.md` / `python.md` / `typescript.md` 里的 "See skill: ..." 均指向随包分发的 skill，不产生外部依赖。

## 添加语言

1. 在 `rules/` 下新建 `<lang>.md`
2. 在 `extensions/lang-rules.ts` 的 `LANG_SPECS` 加一行探测 marker

## 机制

extension 监听 `before_agent_start`，就地修改 `systemPromptOptions.sections`
（section 名 `language_practices`），保留结构化 transcript delta，不整段替换 system prompt。
