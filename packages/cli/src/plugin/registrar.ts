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
 * 重写 saicmotor-suite 的 SKILL.md 并注册到各 AI 客户端。
 * 这是「派生产物同步」中 suite 的唯一切入点：任何改变有效插件集合的操作
 * 完成后都应调用它，使 suite 始终反映当前有效插件的 routes。
 * @param suiteDir 可选，测试时注入临时目录；默认写回 CLI 包内 skills/saicmotor-suite。
 */
export function writeSuiteRoutes(suiteDir?: string): void {
  try {
    const routes = buildSuiteRoutes();
    const md = generateSuiteSkill(routes);
    const targetDir = suiteDir ?? path.join(findPackageRoot(), "skills", "saicmotor-suite");
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "SKILL.md"), md, "utf8");
    registerSkill(targetDir, "saicmotor-suite");
  } catch (e: any) {
    console.error(`[saicmotor] suite 路由刷新失败: ${e.message}`);
  }
}

/**
 * 注册插件的全部 skills（只注册 skills，不刷新 suite）。
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

/**
 * 卸载全部 saicmotor skills：扫描各 AI 客户端目录，删除所有 `saicmotor-` 前缀的条目。
 * 不依赖 state.json 完整——即使用户手动删过状态，残留 junction 也能被兜住。
 * 幂等：删除不存在的条目是 no-op。返回已删除的 skill 名（去重）。
 */
export function unregisterAllSkills(): string[] {
  const removed = new Set<string>();

  for (const clientSkillsDir of Object.values(AI_CLIENT_SKILL_DIRS)) {
    if (!fs.existsSync(clientSkillsDir)) continue;

    let entries: string[];
    try {
      entries = fs.readdirSync(clientSkillsDir);
    } catch {
      continue;
    }

    for (const name of entries) {
      if (!name.startsWith("saicmotor-")) continue;
      const target = path.join(clientSkillsDir, name);
      try {
        const stat = fs.lstatSync(target);
        if (stat.isSymbolicLink() || stat.isDirectory()) {
          fs.rmSync(target, { recursive: true, force: true });
          removed.add(name);
        }
      } catch {
        // 删除失败不阻断卸载流程
      }
    }
  }

  return [...removed];
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