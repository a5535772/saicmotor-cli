import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { buildSuiteRoutes, generateSuiteSkill } from "./suite";
import { findPackageRoot } from "../pkg-root";

/** AI 客户端 skills 目录列表（集中常量化） */
export const AI_CLIENT_SKILL_DIRS: Record<string, string> = {
  claude: path.join(os.homedir(), ".claude", "skills"),
  agents: path.join(os.homedir(), ".agents", "skills"),
  codebuddy: path.join(os.homedir(), ".codebuddy", "skills"),
};

export interface SkillRegResult {
  skillName: string;
  client: string;
  method: "junction" | "copy" | "skipped";
  reason?: string;
}

/**
 * 为单个 skill 目录在各 AI 客户端目录建立 junction（Windows）或符号链接（Unix）。
 * 失败时降级为复制整个 skill 目录。
 */
export function registerSkill(skillDir: string, skillName: string): SkillRegResult[] {
  const results: SkillRegResult[] = [];

  for (const [client, clientSkillsDir] of Object.entries(AI_CLIENT_SKILL_DIRS)) {
    const target = path.join(clientSkillsDir, skillName);

    // 已存在：检查归属
    if (fs.existsSync(target)) {
      results.push({ skillName, client, method: "skipped", reason: "目标已存在" });
      continue;
    }

    // 优先 junction（Windows 上无管理员需求）
    try {
      fs.symlinkSync(skillDir, target, "junction");
      results.push({ skillName, client, method: "junction" });
    } catch {
      // 降级为复制
      try {
        copyDirSync(skillDir, target);
        results.push({ skillName, client, method: "copy" });
      } catch (e: any) {
        results.push({ skillName, client, method: "skipped", reason: `复制失败: ${e.message}` });
      }
    }
  }

  return results;
}

/**
 * 注销单个 skill 条目（删除各 AI 客户端目录下的 junction/目录）。
 * 不触碰其他 skill。
 */
export function unregisterSkill(skillName: string): void {
  for (const clientSkillsDir of Object.values(AI_CLIENT_SKILL_DIRS)) {
    const target = path.join(clientSkillsDir, skillName);
    if (!fs.existsSync(target)) continue;
    try {
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink() || stat.isDirectory()) {
        fs.rmSync(target, { recursive: true, force: true });
      }
    } catch {
      // 删除失败不阻断卸载流程
    }
  }
}

/**
 * 注册插件的全部 skills。
 * 返回每个 skill 在每个客户端的注册结果。
 */
export function registerPluginSkills(pkgRoot: string, skillDirs: string[]): Record<string, SkillRegResult[]> {
  const allResults: Record<string, SkillRegResult[]> = {};

  for (const skillRel of skillDirs) {
    const skillDir = path.join(pkgRoot, skillRel);
    if (!fs.existsSync(skillDir)) continue;

    // skill 名取目录最后一段（如 skills/saicmotor-user → saicmotor-user）
    const skillName = path.basename(skillRel);
    const skillMdPath = path.join(skillDir, "SKILL.md");
    if (!fs.existsSync(skillMdPath)) continue;

    allResults[skillName] = registerSkill(skillDir, skillName);
  }

  // 刷新 suite（基于所有已装插件的 routes 动态生成）
  try {
    const routes = buildSuiteRoutes();
    const suiteMd = generateSuiteSkill(routes);
    const suiteDir = path.join(findPackageRoot(), "skills", "saicmotor-suite");
    if (!fs.existsSync(suiteDir)) fs.mkdirSync(suiteDir, { recursive: true });
    fs.writeFileSync(path.join(suiteDir, "SKILL.md"), suiteMd, "utf8");
    // 同时注册到 AI 客户端
    registerSkill(suiteDir, "saicmotor-suite");
  } catch {
    // suite 生成失败不阻断 skills 注册
  }

  return allResults;
}

/**
 * 注销插件的全部 skills。
 */
export function unregisterPluginSkills(skillDirs: string[]): void {
  for (const skillRel of skillDirs) {
    const skillName = path.basename(skillRel);
    unregisterSkill(skillName);
  }
}

/** 递归复制目录（同步版，用于降级） */
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}