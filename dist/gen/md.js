"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateMarkdown = generateMarkdown;
function generateMarkdown(skill) {
    const lines = [];
    lines.push(`# ${skill.displayName ?? skill.name}（saicmotor-cli skill）`);
    lines.push("");
    lines.push(`对「${skill.name}」系统的操作，一律调用下方 saicmotor 命令，不要自己用 curl/fetch 绕过（登录/会话/参数由 saicmotor 处理）。`);
    lines.push("");
    for (const c of skill.commands) {
        const argPart = c.params.filter((p) => p.required).map((p) => `<${p.name}>`).join(" ");
        lines.push(`## ${c.name} — ${c.verb ?? ""}`);
        lines.push("");
        lines.push("```bash");
        lines.push(`saicmotor ${skill.name} ${c.name} ${argPart}`.trimEnd());
        lines.push("```");
        lines.push("");
        if (c.params.length) {
            lines.push("参数：");
            for (const p of c.params) {
                const req = p.required ? "必填" : "可选";
                const vals = p.values ? `（${Object.keys(p.values).join(" / ")}）` : "";
                lines.push(`- \`${p.name}\` (${p.type}, ${req})${vals}`);
            }
            lines.push("");
        }
    }
    return lines.join("\n");
}
//# sourceMappingURL=md.js.map