# AGENTS.md — pi-lang-rules

pi 包：extension 在 `before_agent_start` 时探测项目语言，把对应规范注入 system prompt 的
`language_practices` section。规范内容精选自 [ECC](https://github.com/affaan-m/ECC)（MIT）。

## 验证（改动后必须执行）

在临时项目里实测注入结果，以 session 记录为准，不以 agent 自述为准：

```bash
mkdir -p /tmp/lr-test && cd /tmp/lr-test
printf 'module x\ngo 1.22\n' > go.mod   # 按需换成其他 marker（tsconfig.json / index.html …）
pi -p "只回复: 收到"
```

然后从最新 session 读 system message 验证：

```bash
latest=$(ls -t ~/.pi/agent/sessions/*lr-test*/*.jsonl | head -1)
python3 -c "
import json, re
for line in open('$latest'):
    e = json.loads(line)
    m = e.get('message') or e
    if m.get('role') == 'system':
        lp = (m.get('sections') or {}).get('language_practices', '')
        print('注入语言:', re.findall(r'## (\S+) 规范', lp), '| 行数:', len(lp.splitlines()))
        break
"
```

完成标准：命中的语言列表与预期一致（含反向用例——放无关 marker 的项目不误注入）。
测完删除 /tmp/lr-test。

## 规范内容规则（rules/*.md）

内容向上兼容 ECC 上游。搬入或新写规范时，保留通用工程约定，剥离产品专属内容——
判据：一条指令引用了 pi 之外的产品机制即不合规格。已知踩过的坑：Claude Code 的
hooks/agents 机制、`~/.claude` 路径、Claude 模型名与快捷键都曾在 common.md 里残留过，
合入前逐节检查。

每个规范文件头部保留 `> 来源:` 标注，便于追溯上游。

## 代码约定（extensions/lang-rules.ts）

- 注入必须就地修改 `event.systemPromptOptions.sections[SECTION_NAME]`，返回
  `systemPrompt` 字符串是整段替换，会丢失结构化 transcript delta——两者不混用。
- section 名必须匹配 `^[a-z][a-z0-9_-]*$` 且不能叫 `preamble`（pi 的硬约束）。
- 规范解析是三级同名覆盖：项目 `.pi/rules/`（trusted）> 用户 `~/.pi/agent/rules/` >
  包内置 `rules/`。是覆盖不是拼接，改动 `resolveRule` 时保持该语义。
- `MAX_TOTAL_LINES` 超限走索引模式（只列路径让模型按需 read），是上下文预算的
  保险丝，调大前先确认总注入行数的实际影响。

## 添加语言

1. `rules/` 下新建 `<lang>.md`（文件名即语言 id）
2. `LANG_SPECS` 加一行探测 marker：`files`（精确文件名）或 `globs`（浅层后缀，如 `"*.html"`）

完成标准：上文的验证流程对该语言 marker 命中、对无关项目不命中。

## 发布语义

本机安装是 local source（`pi install ./pi-lang-rules`），改文件即时生效，无需 reinstall。
git/npm 用户 pin 在安装时的 commit——所以每次改动都要 commit + push（中文
`<type>: <说明>` 格式），否则下游拿不到更新。
