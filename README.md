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
| typescript | `tsconfig.json`，或 `package.json` + 浅层 `.ts` 文件 |
| python | `pyproject.toml` / `requirements.txt` / `setup.py` / `setup.cfg` / `Pipfile` / `.python-version` |
| go | `go.mod` |
| html | 浅层存在 `*.html` |
| css | 浅层存在 `*.css` / `*.scss` / `*.less` |

monorepo 检测到多个语言时全部注入。注入内容超过 1200 行时自动退化为索引模式（只列文件路径，模型按需读取）。

## 规范文件覆盖层级（同名覆盖）

1. `<项目>/.pi/rules/<lang>.md` — 项目级（需项目信任）
2. `~/.pi/agent/rules/<lang>.md` — 用户级
3. 包内置 `rules/<lang>.md` — 出厂默认

想定制某语言的规范: 复制包内文件到 `~/.pi/agent/rules/` 后修改即可。

## 添加语言

1. 在 `rules/` 下新建 `<lang>.md`
2. 在 `extensions/lang-rules.ts` 的 `LANG_SPECS` 加一行探测 marker

## 机制

extension 监听 `before_agent_start`，就地修改 `systemPromptOptions.sections`
（section 名 `language_practices`），保留结构化 transcript delta，不整段替换 system prompt。
