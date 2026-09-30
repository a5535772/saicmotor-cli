import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { loadPlugins } from "../../src/plugin/loader";

// 使用临时目录模拟 ~/.saicmotor/plugins/
const tmpBase = path.join(os.tmpdir(), `saicmotor-test-loader-${Date.now()}`);
const origHome = process.env.SAICMOTOR_HOME;

function setupPluginDir(
  pkgName: string,
  manifest: object,
  catalogFiles?: Record<string, object>,
) {
  const p = path.join(tmpBase, "plugins", "node_modules", pkgName);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(
    path.join(p, "saicmotor.plugin.json"),
    JSON.stringify(manifest, null, 2),
  );
  if (catalogFiles) {
    const svcDir = path.join(p, "catalog", "services");
    fs.mkdirSync(svcDir, { recursive: true });
    for (const [name, content] of Object.entries(catalogFiles)) {
      fs.writeFileSync(path.join(svcDir, name), JSON.stringify(content, null, 2));
    }
  }
}

function setupLinkedPluginDir(
  pkgName: string,
  manifest: object,
  catalogFiles?: Record<string, object>,
) {
  const p = path.join(tmpBase, "plugins", "linked", pkgName);
  fs.mkdirSync(p, { recursive: true });
  fs.writeFileSync(
    path.join(p, "saicmotor.plugin.json"),
    JSON.stringify(manifest, null, 2),
  );
  if (catalogFiles) {
    const svcDir = path.join(p, "catalog", "services");
    fs.mkdirSync(svcDir, { recursive: true });
    for (const [name, content] of Object.entries(catalogFiles)) {
      fs.writeFileSync(path.join(svcDir, name), JSON.stringify(content, null, 2));
    }
  }
}

describe("plugin loader", () => {
  beforeEach(() => {
    process.env.SAICMOTOR_HOME = tmpBase;
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
  });

  afterEach(() => {
    if (fs.existsSync(tmpBase)) fs.rmSync(tmpBase, { recursive: true });
    if (origHome === undefined) {
      delete process.env.SAICMOTOR_HOME;
    } else {
      process.env.SAICMOTOR_HOME = origHome;
    }
  });

  it("loads no plugins when directory is empty", () => {
    fs.mkdirSync(path.join(tmpBase, "plugins", "node_modules"), { recursive: true });
    const result = loadPlugins();
    expect(result.plugins).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it("loads a valid plugin with catalog", () => {
    setupPluginDir(
      "plugin-test",
      { name: "@saicmotor/plugin-test", engine: ">=0.4.0", catalog: ["catalog/services/*.json"] },
      {
        "test-svc.json": {
          name: "test-svc",
          servicePath: "/api/test",
          resources: {
            items: {
              methods: {
                list: { id: "list", path: "/items", httpMethod: "GET" },
              },
            },
          },
        },
      },
    );
    const result = loadPlugins();
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].manifest.name).toBe("@saicmotor/plugin-test");
    expect(result.plugins[0].services).toHaveLength(1);
    expect(result.plugins[0].services[0].name).toBe("test-svc");
  });

  it("warns when engine is incompatible", () => {
    setupPluginDir("plugin-old", { name: "@saicmotor/plugin-old", engine: ">=2.0.0" });
    const result = loadPlugins();
    expect(result.plugins).toHaveLength(0);
    expect(result.warnings.some((w: string) => w.includes("不兼容"))).toBe(true);
  });

  it("warns when manifest is missing", () => {
    const p = path.join(tmpBase, "plugins", "node_modules", "plugin-noman");
    fs.mkdirSync(p, { recursive: true });
    const result = loadPlugins();
    expect(result.warnings.some((w: string) => w.includes("缺少 saicmotor.plugin.json"))).toBe(true);
  });

  it("warns on invalid manifest JSON", () => {
    const p = path.join(tmpBase, "plugins", "node_modules", "plugin-badjson");
    fs.mkdirSync(p, { recursive: true });
    fs.writeFileSync(path.join(p, "saicmotor.plugin.json"), "not json {{{");
    const result = loadPlugins();
    expect(result.warnings.some((w: string) => w.includes("manifest 解析失败"))).toBe(true);
  });

  it("skips invalid manifest schema (missing name)", () => {
    setupPluginDir("plugin-noname", { engine: ">=0.4.0" });
    const result = loadPlugins();
    // Invalid manifest means it's skipped with a parse failure warning
    expect(result.warnings.some((w: string) => w.includes("manifest 解析失败"))).toBe(true);
    expect(result.plugins).toHaveLength(0);
  });

  it("loads from linked directory with linked source", () => {
    setupLinkedPluginDir(
      "plugin-dev",
      { name: "@saicmotor/plugin-dev", engine: ">=0.4.0", catalog: ["catalog/services/*.json"] },
      {
        "dev-svc.json": {
          name: "dev-svc",
          servicePath: "/api/dev",
          resources: {
            config: {
              methods: {
                get: { id: "get", path: "/config", httpMethod: "GET" },
              },
            },
          },
        },
      },
    );
    const result = loadPlugins();
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].manifest.name).toBe("@saicmotor/plugin-dev");
    expect(result.plugins[0].entry.source).toBe("linked");
  });

  it("loads linked plugins created as junction/symlink (dev link)", () => {
    // `dev` 用 fs.symlinkSync(..., "junction") 建链：Windows 下 junction 被
    // readdirSync(withFileTypes) 报告为 symlink 而非 directory，必须能加载。
    const realDir = path.join(tmpBase, "real-plugin-reimbursement");
    fs.mkdirSync(path.join(realDir, "catalog", "services"), { recursive: true });
    fs.writeFileSync(
      path.join(realDir, "saicmotor.plugin.json"),
      JSON.stringify({
        name: "@saicmotor/plugin-reimbursement",
        engine: ">=0.4.0",
        catalog: ["catalog/services/*.json"],
      }),
    );
    fs.writeFileSync(
      path.join(realDir, "catalog", "services", "reimb.json"),
      JSON.stringify({ name: "reimb", servicePath: "/api/reimb", resources: {} }),
    );

    const linkedDir = path.join(tmpBase, "plugins", "linked");
    fs.mkdirSync(linkedDir, { recursive: true });
    fs.symlinkSync(
      realDir,
      path.join(linkedDir, "plugin-reimbursement"),
      process.platform === "win32" ? "junction" : "dir",
    );

    const result = loadPlugins();
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].manifest.name).toBe("@saicmotor/plugin-reimbursement");
    expect(result.plugins[0].entry.source).toBe("linked");
    expect(result.plugins[0].services).toHaveLength(1);
  });

  it("linked plugins override installed plugins with same name (linked wins)", () => {
    // Setup installed version
    setupPluginDir(
      "plugin-override",
      { name: "@saicmotor/plugin-override", engine: ">=0.4.0" },
    );
    // Setup linked version with different manifest
    setupLinkedPluginDir(
      "plugin-override",
      { name: "@saicmotor/plugin-override", engine: ">=0.4.0", skills: ["dev-skill"] },
    );
    const result = loadPlugins();
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].entry.source).toBe("linked");
    expect(result.plugins[0].entry.skills).toContain("dev-skill");
  });

  it("detects service name conflicts between plugins", () => {
    const svcA = {
      "shared-svc.json": {
        name: "shared-svc",
        servicePath: "/api/a",
        resources: {
          items: {
            methods: {
              list: { id: "list", path: "/items", httpMethod: "GET" },
            },
          },
        },
      },
    };
    setupPluginDir(
      "plugin-alpha",
      { name: "@saicmotor/plugin-alpha", engine: ">=0.4.0", catalog: ["catalog/services/*.json"] },
      svcA,
    );
    setupPluginDir(
      "plugin-beta",
      { name: "@saicmotor/plugin-beta", engine: ">=0.4.0", catalog: ["catalog/services/*.json"] },
      svcA,
    );
    const result = loadPlugins();
    expect(result.warnings.some((w: string) => w.includes("冲突"))).toBe(true);
    // 冲突 warning 点名胜者（先加载，生效）与败者（后加载，未生效），并给出 disable 指引
    const conflictWarning = result.warnings.find((w: string) => w.includes("冲突"))!;
    expect(conflictWarning).toContain("@saicmotor/plugin-alpha");
    expect(conflictWarning).toContain("@saicmotor/plugin-beta");
    expect(conflictWarning).toContain("disable");
    // 点名先加载的胜者（plugin-alpha）当前生效，后加载者（plugin-beta）未生效
    expect(conflictWarning).toContain("当前 @saicmotor/plugin-alpha 生效");
    // First loaded plugin keeps the service
    const alpha = result.plugins.find((p) => p.manifest.name === "@saicmotor/plugin-alpha");
    const beta = result.plugins.find((p) => p.manifest.name === "@saicmotor/plugin-beta");
    expect(alpha!.services).toHaveLength(1);
    expect(beta!.services).toHaveLength(0);
  });

  it("does not skip non-plugin-* directories", () => {
    // A directory that is scoped and not a plugin-* dir
    const notPlugin = path.join(tmpBase, "plugins", "node_modules", "some-random-lib");
    fs.mkdirSync(notPlugin, { recursive: true });
    fs.writeFileSync(
      path.join(notPlugin, "saicmotor.plugin.json"),
      JSON.stringify({ name: "@saicmotor/plugin-random", engine: ">=0.4.0" }),
    );
    // "some-random-lib" does NOT start with "plugin-", so it should be skipped
    const result = loadPlugins();
    expect(result.plugins).toHaveLength(0);
  });

  it("loads catalog with multiple services from one plugin", () => {
    setupPluginDir(
      "plugin-multi",
      { name: "@saicmotor/plugin-multi", engine: ">=0.4.0", catalog: ["catalog/services/*.json"] },
      {
        "svc1.json": {
          name: "svc1",
          servicePath: "/api/svc1",
          resources: {
            items: {
              methods: {
                get: { id: "get", path: "/items", httpMethod: "GET" },
              },
            },
          },
        },
        "svc2.json": {
          name: "svc2",
          servicePath: "/api/svc2",
          resources: {
            data: {
              methods: {
                post: { id: "post", path: "/data", httpMethod: "POST" },
              },
            },
          },
        },
      },
    );
    const result = loadPlugins();
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].services).toHaveLength(2);
    const names = result.plugins[0].services.map((s) => s.name).sort();
    expect(names).toEqual(["svc1", "svc2"]);
  });

  it("skips bad catalog JSON silently (other services still load)", () => {
    setupPluginDir(
      "plugin-partial",
      { name: "@saicmotor/plugin-partial", engine: ">=0.4.0", catalog: ["catalog/services/*.json"] },
      {
        "good.json": {
          name: "good",
          servicePath: "/api/good",
          resources: {
            items: {
              methods: {
                list: { id: "list", path: "/items", httpMethod: "GET" },
              },
            },
          },
        },
        "bad.json": "NOT_JSON{{{{" as any,
      },
    );
    const result = loadPlugins();
    expect(result.plugins).toHaveLength(1);
    expect(result.plugins[0].services).toHaveLength(1);
    expect(result.plugins[0].services[0].name).toBe("good");
    expect(result.warnings.some((w: string) => w.includes("校验失败") || w.includes("解析失败"))).toBe(true);
  });

  it("results are sorted alphabetically", () => {
    setupPluginDir(
      "plugin-zeta",
      { name: "@saicmotor/plugin-zeta", engine: ">=0.4.0" },
    );
    setupPluginDir(
      "plugin-alpha",
      { name: "@saicmotor/plugin-alpha", engine: ">=0.4.0" },
    );
    const result = loadPlugins();
    expect(result.plugins).toHaveLength(2);
    expect(result.plugins[0].manifest.name).toBe("@saicmotor/plugin-alpha");
    expect(result.plugins[1].manifest.name).toBe("@saicmotor/plugin-zeta");
  });
});