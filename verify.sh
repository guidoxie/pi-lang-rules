#!/usr/bin/env bash
# verify.sh — pi-lang-rules 验证脚本
#
# 验证已安装副本（pi settings 中的 git 安装）的规范注入与 skills 广告是否生效。
# 工作流：改动 → commit + push → pi install git:github.com/guidoxie/pi-lang-rules → ./verify.sh
#
# 注意：不要改用 `pi -e` 验证本仓库工作目录——实测 -e 链路会被已安装副本遮蔽，结果不可信。
#
# 用例（新增语言或调整断言特征时，同步更新 run_case 调用与 check_skills 的 required 列表）：
#   go     go.mod           期望 common+go     特征 "## Race Detection"
#   web    index.html       期望 common+web    特征 "## Core Web Vitals Targets"
#   python pyproject.toml   期望 common+python 特征 "# Python Project Management" 与 See skill: python-patterns
#   none   README.md        期望 仅 common
# 反向断言（全部用例）："来源: github"（来源行已迁移 AGENTS.md）、
#   "Agent Support"（Claude Code 专属残留）、"django-security"（框架专属，有意不引入）
set -uo pipefail

STAMP=$(date +%Y%m%d%H%M%S)
BASE="/tmp/lr-verify-$STAMP"
SESSIONS_DIR="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/sessions"
PASS=0
FAIL=0

command -v pi >/dev/null 2>&1 || { echo "❌ pi 不在 PATH"; exit 1; }
command -v python3 >/dev/null 2>&1 || { echo "❌ python3 不在 PATH"; exit 1; }

run_case() {
  # $1 用例名  $2 marker 文件  $3 期望语言(逗号分隔)  $4 特征片段(;;分隔,可为空)
  local name="$1" marker="$2" langs="$3" features="$4"
  local dir="$BASE/$name"
  mkdir -p "$dir"
  touch "$dir/$marker"
  echo "▶ [$name] marker=$marker 期望=[$langs]"
  (cd "$dir" && pi -p "只回复: 收到" >/dev/null 2>&1)

  local latest
  latest=$(ls -t "$SESSIONS_DIR"/*"lr-verify-$STAMP-$name"*/*.jsonl 2>/dev/null | head -1)
  if [[ -z "$latest" ]]; then
    echo "  ❌ 未找到 session 文件（pi 运行失败？）"
    FAIL=$((FAIL + 1))
    return
  fi

  local out
  out=$(CASE="$name" EXPECT_LANGS="$langs" EXPECT_FEATURE="$features" \
    SESSION_FILE="$latest" python3 <<'PYEOF'
import json, os, re, sys

session = os.environ["SESSION_FILE"]
expect_langs = sorted(os.environ["EXPECT_LANGS"].split(","))
features = [f for f in os.environ["EXPECT_FEATURE"].split(";;") if f]

system = None
for line in open(session):
    e = json.loads(line)
    m = e.get("message") or e
    if m.get("role") == "system":
        system = m
        break
if system is None:
    print("FAIL")
    print("  ❌ session 中无 system message")
    sys.exit(0)

lp = (system.get("sections") or {}).get("language_practices", "")
ok = True
langs = sorted(re.findall(r"## (\S+) 规范", lp))
if langs != expect_langs:
    ok = False
    print(f"  ❌ 语言命中 {langs} != 期望 {expect_langs}")
for f in features:
    if f not in lp:
        ok = False
        print(f"  ❌ 缺少特征: {f}")
for bad in ("来源: github", "Agent Support", "django-security"):
    if bad in lp:
        ok = False
        print(f"  ❌ 死引用/残留: {bad}")
if ok:
    print("PASS")
    print(f"  命中: {langs}")
PYEOF
)
  if [[ "$out" == PASS* ]]; then
    echo "$out" | sed 's/^/  ✓ /'
    PASS=$((PASS + 1))
  else
    echo "$out"
    FAIL=$((FAIL + 1))
  fi
}

check_skills() {
  # $1 session 文件；检查 5 个 skill 是否均被广告进 system prompt
  local out
  out=$(SESSION_FILE="$1" python3 <<'PYEOF'
import json, os, sys

required = ["golang-patterns", "golang-testing", "python-patterns", "python-testing", "e2e-testing"]
system = None
for line in open(os.environ["SESSION_FILE"]):
    e = json.loads(line)
    m = e.get("message") or e
    if m.get("role") == "system":
        system = m
        break
text = ""
if system:
    text = str(system.get("content") or "") + " ".join(str(v) for v in (system.get("sections") or {}).values())
missing = [s for s in required if s not in text]
if missing:
    print("FAIL")
    print(f"  ❌ 未被广告: {missing}")
else:
    print("PASS")
    print(f"  广告: {required}")
PYEOF
)
  echo "▶ [skills] 5 个 skill 广告检查"
  if [[ "$out" == PASS* ]]; then
    echo "$out" | sed 's/^/  ✓ /'
    PASS=$((PASS + 1))
  else
    echo "$out"
    FAIL=$((FAIL + 1))
  fi
}

run_case "go" "go.mod" "common,go" "## Race Detection"
run_case "web" "index.html" "common,web" "## Core Web Vitals Targets"
run_case "py" "pyproject.toml" "common,python" "# Python Project Management;;See skill: \`python-patterns\`"
run_case "none" "README.md" "common" ""

latest=$(ls -t "$SESSIONS_DIR"/*"lr-verify-$STAMP-go"*/*.jsonl 2>/dev/null | head -1)
if [[ -n "$latest" ]]; then
  check_skills "$latest"
fi

rm -rf "$BASE"

echo
echo "通过 $PASS / 失败 $FAIL"
[[ $FAIL -eq 0 ]] || exit 1
