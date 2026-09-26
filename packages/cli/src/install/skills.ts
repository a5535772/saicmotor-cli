// src/install/skills.ts
// skills 注册逻辑（用于 `saicmotor install`）
// S8：收回核心"注册器"，不再依赖外部 skills CLI / GitHub repo
import fs from "node:fs";
import path from "node:path";
import { findPackageRoot } from "../pkg-root";
import { registerSkill, AI_CLIENT_SKILL_DIRS } from "../plugin/registrar";

const PACKAGE_SKILLS_DIR = path.join(findPackageRoot(), "skills");

/** 列出核心包内置的所有 skill 目录 */
function listCoreSkills(): string[] {
  const skillsRoot = PACKAGE_SKILLS_DIR;
  if (!fs.existsSync(skillsRoot)) return [];

  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(skillsRoot, d.name, "SKILL.md")))
    .map((d) => d.name);
}

/** 确保各 AI 客户端 skills 目录存在 */
function ensureClientDirs(): void {
  for (const dir of Object.values(AI_CLIENT_SKILL_DIRS)) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}

/** 检查任意客户端是否已有本包的 skill 条目 */
export function skillsAlreadyInstalled(): boolean {
  const coreSkills = listCoreSkills();
  for (const [client, clientSkillsDir] of Object.entries(AI_CLIENT_SKILL_DIRS)) {
    for (const skillName of coreSkills) {
      if (fs.existsSync(path.join(clientSkillsDir, skillName))) return true;
    }
  }
  return false;
}

/** 注册核心包内置的全部 skills */
export function installSkills({ force = false }: { force?: boolean } = {}): void {
  ensureClientDirs();
  const coreSkills = listCoreSkills();

  if (coreSkills.length === 0) {
    console.log("未找到内置 skills");
    return;
  }

  if (!force && skillsAlreadyInstalled()) {
    console.log("AI skills 已安装，跳过");
    return;
  }

  let registered = 0;
  for (const skillName of coreSkills) {
    const skillDir = path.join(PACKAGE_SKILLS_DIR, skillName);
    const results = registerSkill(skillDir, skillName);
    const okCount = results.filter((r) => r.method !== "skipped" || r.reason === "目标已存在").length;
    if (okCount > 0) registered++;
  }

  if (registered > 0) {
    console.log(`✓ ${registered} 个 AI skills 已注册`);
  } else {
    console.log("⚠ AI skills 注册失败，稍后可手动运行: saicmotor install");
  }
}