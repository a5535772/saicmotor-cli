// src/install/uninstall.ts
// 一键卸载编排：清 skills → 删本地数据 → 自删 npm 包
import fs from "node:fs";
import { execSync } from "node:child_process";
import { unregisterAllSkills } from "../plugin/registrar";
import { saicmotorDir } from "../config";

export const PKG_NAME = "@saicmotor/cli";

export interface UninstallOptions {
  /** 是否自删 npm 全局包（测试时置 false，避免真实 npm uninstall） */
  selfRemove?: boolean;
}

export function uninstall({ selfRemove = true }: UninstallOptions = {}): void {
  // 1. 清 skills（幂等）
  const removed = unregisterAllSkills();
  console.log(
    removed.length > 0
      ? `✓ 已清除 ${removed.length} 个 saicmotor skills`
      : "✓ 无 saicmotor skills 需要清除"
  );

  // 2. 删本地数据（尊重 SAICMOTOR_HOME）
  const home = saicmotorDir();
  if (fs.existsSync(home)) {
    fs.rmSync(home, { recursive: true, force: true });
    console.log(`✓ 已删除本地数据 ${home}`);
  } else {
    console.log("✓ 无本地数据需要删除");
  }

  // 3. 自删 npm 包
  if (!selfRemove) return;

  try {
    execSync(`npm uninstall -g ${PKG_NAME}`, { stdio: "inherit" });
  } catch {
    console.error(`⚠ npm 包自删失败，请手动执行: npm uninstall -g ${PKG_NAME}`);
  }

  console.log(
    "卸载完成。验证：saicmotor --version 应不可用；各 AI 客户端 skills 目录应无 saicmotor-* 条目"
  );
}