import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { unregisterAllSkills, AI_CLIENT_SKILL_DIRS } from "../../src/plugin/registrar";

const origDirs: Record<string, string> = { ...AI_CLIENT_SKILL_DIRS };

describe("unregisterAllSkills", () => {
  let tmpClient: string;

  beforeEach(() => {
    tmpClient = path.join(os.tmpdir(), `saicmotor-unregall-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    for (const k of Object.keys(AI_CLIENT_SKILL_DIRS)) {
      AI_CLIENT_SKILL_DIRS[k] = path.join(tmpClient, k, "skills");
      fs.mkdirSync(AI_CLIENT_SKILL_DIRS[k], { recursive: true });
      fs.mkdirSync(path.join(AI_CLIENT_SKILL_DIRS[k], "saicmotor-suite"), { recursive: true });
      fs.mkdirSync(path.join(AI_CLIENT_SKILL_DIRS[k], "saicmotor-user"), { recursive: true });
      fs.mkdirSync(path.join(AI_CLIENT_SKILL_DIRS[k], "other-skill"), { recursive: true });
    }
  });

  afterEach(() => {
    Object.assign(AI_CLIENT_SKILL_DIRS, origDirs);
    if (fs.existsSync(tmpClient)) fs.rmSync(tmpClient, { recursive: true, force: true });
  });

  it("removes all saicmotor-* entries, keeps others", () => {
    const removed = unregisterAllSkills();

    for (const dir of Object.values(AI_CLIENT_SKILL_DIRS)) {
      expect(fs.existsSync(path.join(dir as string, "saicmotor-suite"))).toBe(false);
      expect(fs.existsSync(path.join(dir as string, "saicmotor-user"))).toBe(false);
      expect(fs.existsSync(path.join(dir as string, "other-skill"))).toBe(true);
    }
    expect(removed).toContain("saicmotor-suite");
    expect(removed).toContain("saicmotor-user");
  });

  it("removes symlink/junction entries but not plain files", () => {
    const firstDir = Object.values(AI_CLIENT_SKILL_DIRS)[0] as string;
    const srcDir = path.join(tmpClient, "linked-src");
    fs.mkdirSync(srcDir, { recursive: true });

    const linkedTarget = path.join(firstDir, "saicmotor-linked");
    let linkCreated = false;
    try {
      fs.symlinkSync(srcDir, linkedTarget, "junction");
      linkCreated = true;
    } catch {
      linkCreated = false;
    }

    const fileTarget = path.join(firstDir, "saicmotor-file");
    fs.writeFileSync(fileTarget, "x");

    unregisterAllSkills();

    // 普通文件（非目录/链接）不删——验证 isSymbolicLink()/isDirectory() 守卫
    expect(fs.existsSync(fileTarget)).toBe(true);

    // 平台拒绝创建 junction 时，删除断言优雅跳过；文件断言仍照常执行
    if (linkCreated) {
      expect(fs.existsSync(linkedTarget)).toBe(false);
    }
  });

  it("is idempotent and returns empty list on second call", () => {
    const first = unregisterAllSkills();
    expect(first.length).toBeGreaterThan(0);

    let second: string[] = [];
    expect(() => {
      second = unregisterAllSkills();
    }).not.toThrow();
    expect(second).toEqual([]);
  });
});