/**
 * lang-rules — 根据项目语言自动注入对应的语言实践规范。
 *
 * 规则文件解析优先级（同名覆盖）:
 * 1. <cwd>/.pi/rules/<name>.md     项目覆盖（需项目信任）
 * 2. <agent-dir>/rules/<name>.md   用户覆盖（agent-dir 默认 ~/.pi/agent）
 * 3. <package>/rules/<name>.md     包内置默认
 *
 * 支持语言: typescript / python / go / web + common 基线
 * 规范来源: github.com/affaan-m/ECC (MIT)，清洗合并后使用。
 *
 * 注入方式: before_agent_start 中就地修改 systemPromptOptions.sections
 * （保留结构化 transcript delta），不使用整段 systemPrompt 替换。
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { homedir } from "node:os";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const SECTION_NAME = "language_practices";
const MAX_TOTAL_LINES = 1200;

// 包内置规范目录（<package>/extensions/../rules）
const PACKAGE_RULES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "rules");

interface LangSpec {
	files?: string[]; // 精确文件名（cwd 下）
	globs?: string[]; // 后缀通配（浅层: 根目录 + 一层子目录）
}

const LANG_SPECS: Record<string, LangSpec> = {
	typescript: { files: ["tsconfig.json"] },
	python: { files: ["pyproject.toml", "requirements.txt", "setup.py", "setup.cfg", "Pipfile", ".python-version"] },
	go: { files: ["go.mod"] },
	web: { globs: ["*.html", "*.css", "*.scss", "*.less"] },
};

// TypeScript 补充守卫: 无 tsconfig 但有 package.json + 浅层 .ts 文件也算 TS 项目
const TS_GUARD = { dirs: ["", "src", "lib", "app"], exts: [".ts", ".tsx"] };

interface LangRule {
	lang: string;
	content: string;
	source: string;
}

let cachedRules: LangRule[] | undefined;

function readTrimmed(file: string): string | undefined {
	try {
		const content = fs.readFileSync(file, "utf8").trim();
		return content || undefined;
	} catch {
		return undefined;
	}
}

/** 三级同名覆盖: 项目（trusted）> 用户 agent-dir > 包内置 */
function resolveRule(cwd: string, trusted: boolean, name: string): { content: string; source: string } | undefined {
	if (trusted) {
		const project = path.join(cwd, ".pi", "rules", name);
		const projectContent = readTrimmed(project);
		if (projectContent) return { content: projectContent, source: `.pi/rules/${name} [项目]` };
	}
	const agentDir = process.env.PI_CODING_AGENT_DIR || path.join(homedir(), ".pi", "agent");
	const user = path.join(agentDir, "rules", name);
	const userContent = readTrimmed(user);
	if (userContent) return { content: userContent, source: `~/rules/${name}` };
	const builtin = path.join(PACKAGE_RULES_DIR, name);
	const builtinContent = readTrimmed(builtin);
	if (builtinContent) return { content: builtinContent, source: `pi-lang-rules:rules/${name}` };
	return undefined;
}

function fileExists(...parts: string[]): boolean {
	try {
		return fs.statSync(path.join(...parts)).isFile();
	} catch {
		return false;
	}
}

function hasSourceFile(cwd: string, guard: { dirs: string[]; exts: string[] }): boolean {
	for (const dir of guard.dirs) {
		try {
			const entries = fs.readdirSync(path.join(cwd, dir), { withFileTypes: true });
			if (entries.some((e) => e.isFile() && guard.exts.some((ext) => e.name.endsWith(ext)))) {
				return true;
			}
		} catch {
			// 目录不存在，继续
		}
	}
	return false;
}

function matchGlobSuffix(cwd: string, pattern: string): boolean {
	// "*.html" -> ".html"
	const suffix = pattern.replace(/^\*/, "");
	if (!suffix) return false;
	try {
		const entries = fs.readdirSync(cwd, { withFileTypes: true });
		if (entries.some((e) => e.name.endsWith(suffix))) return true;
		for (const e of entries) {
			if (!e.isDirectory() || e.name.startsWith(".") || e.name === "node_modules") continue;
			try {
				const sub = fs.readdirSync(path.join(cwd, e.name), { withFileTypes: true });
				if (sub.some((s) => s.name.endsWith(suffix))) return true;
			} catch {
				// 子目录不可读，忽略
			}
		}
	} catch {
		// cwd 不可读
	}
	return false;
}

function detectLanguages(cwd: string): string[] {
	const detected: string[] = [];
	for (const [lang, spec] of Object.entries(LANG_SPECS)) {
		let hit = spec.files?.some((f) => fileExists(cwd, f)) ?? false;
		if (!hit && spec.globs?.some((g) => matchGlobSuffix(cwd, g))) hit = true;

		// TypeScript 补充: package.json + 浅层 .ts 文件（无 tsconfig 的 TS 项目）
		if (!hit && lang === "typescript" && fileExists(cwd, "package.json") && hasSourceFile(cwd, TS_GUARD)) {
			hit = true;
		}
		if (hit) detected.push(lang);
	}
	return detected;
}

function loadRules(cwd: string, trusted: boolean): LangRule[] {
	const rules: LangRule[] = [];

	const common = resolveRule(cwd, trusted, "common.md");
	if (common) rules.push({ lang: "common", ...common });

	for (const lang of detectLanguages(cwd)) {
		const rule = resolveRule(cwd, trusted, `${lang}.md`);
		if (rule) rules.push({ lang, ...rule });
	}
	return rules;
}

function renderSection(rules: LangRule[]): string {
	const totalLines = rules.reduce((n, r) => n + r.content.split("\n").length, 0);

	if (totalLines > MAX_TOTAL_LINES) {
		// 索引模式: 内容过长时只给路径，按需加载
		const lines = rules.map((r) => `- ${r.lang}: ${r.source}`);
		return [
			"本项目检测到以下工程规范（内容较长，未全文注入）。",
			"编写或修改对应语言的代码前，先用 read 工具加载相关文件:",
			...lines,
		].join("\n");
	}

	const blocks = rules.map((r) => `## ${r.lang} 规范（来源: ${r.source}）\n\n${r.content}`);
	return [
		"以下规范由 pi 扩展根据本项目语言自动注入，编写或修改对应语言的代码时必须遵循:",
		"",
		...blocks,
	].join("\n");
}

export default function langRulesExtension(pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		cachedRules = loadRules(ctx.cwd, ctx.isProjectTrusted());
		if (cachedRules.length > 0) {
			const langs = cachedRules.map((r) => r.lang).join(", ");
			ctx.ui.notify(`lang-rules: 已加载规范 → ${langs}`, "info");
		}
	});

	pi.on("before_agent_start", async (event, ctx) => {
		// 惰性兜底: session_start 未触发（或扩展热加载）时补探测
		if (cachedRules === undefined) {
			cachedRules = loadRules(ctx.cwd, ctx.isProjectTrusted());
		}
		if (cachedRules.length === 0) return;
		// 就地修改结构化 sections，由 pi 生成 transcript delta
		event.systemPromptOptions.sections[SECTION_NAME] = renderSection(cachedRules);
	});
}
