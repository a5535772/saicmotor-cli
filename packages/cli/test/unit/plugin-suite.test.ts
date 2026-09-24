import { describe, it, expect } from "vitest";
import { buildSuiteRoutes, generateSuiteSkill } from "../../src/plugin/suite";

describe("buildSuiteRoutes", () => {
  it("returns empty object when no plugins", () => {
    expect(buildSuiteRoutes([])).toEqual({});
  });

  it("aggregates routes from all plugins", () => {
    const plugins = [
      {
        manifest: { name: "a", engine: "^1.0.0", routes: { "请假": "saicmotor-leave" } },
        entry: {} as any, rootDir: "", services: [],
      },
      {
        manifest: { name: "b", engine: "^1.0.0", routes: { "考勤": "saicmotor-attendance" } },
        entry: {} as any, rootDir: "", services: [],
      },
    ];
    const routes = buildSuiteRoutes(plugins as any);
    expect(routes).toEqual({ "请假": "saicmotor-leave", "考勤": "saicmotor-attendance" });
  });

  it("skips plugins without routes", () => {
    const plugins = [
      {
        manifest: { name: "a", engine: "^1.0.0" },
        entry: {} as any, rootDir: "", services: [],
      },
      {
        manifest: { name: "b", engine: "^1.0.0", routes: { "考勤": "saicmotor-attendance" } },
        entry: {} as any, rootDir: "", services: [],
      },
    ];
    expect(buildSuiteRoutes(plugins as any)).toEqual({ "考勤": "saicmotor-attendance" });
  });
});

describe("generateSuiteSkill", () => {
  it("generates markdown with frontmatter and routing table", () => {
    const md = generateSuiteSkill({ "请假": "saicmotor-leave", "考勤": "saicmotor-attendance" });
    expect(md).toContain("---");
    expect(md).toContain("name: saicmotor-suite");
    expect(md).toContain("| 意图 | 入口 Skill |");
    expect(md).toContain("| 请假 | saicmotor-leave |");
    expect(md).toContain("| 考勤 | saicmotor-attendance |");
    expect(md).toContain("此文件由 saicmotor 注册器自动生成");
  });

  it("generates valid markdown for empty routes", () => {
    const md = generateSuiteSkill({});
    expect(md).toContain("name: saicmotor-suite");
    expect(md).toContain("| 意图 | 入口 Skill |");
  });
});