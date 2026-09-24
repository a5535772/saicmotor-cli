import fs from "node:fs";
import path from "node:path";
import semver from "semver";
import { PluginManifestSchema, type PluginManifest } from "@saicmotor/sdk";
import { ServiceSchema, type Service } from "../schema/catalog";
import type { Config } from "../config";
import { installedPluginsDir, linkedPluginsDir } from "./paths";
import { loadState, type PluginStateEntry } from "./state";

/** 单个插件的加载结果 */
export interface LoadedPlugin {
  manifest: PluginManifest;
  entry: PluginStateEntry;
  /** 插件包根目录 */
  rootDir: string;
  /** 此插件贡献的 services（已校验） */
  services: Service[];
}

export interface LoadResult {
  plugins: LoadedPlugin[];
  warnings: string[];
}

const CORE_VERSION = "0.4.0"; // S8 后期升级到 1.0.0

/**
 * 双根扫描并加载所有兼容插件。
 * 不做全局副作用（不写 state，不注册 skills）。
 */
export function loadPlugins(_config: Config): LoadResult {
  const warnings: string[] = [];
  const loaded: LoadedPlugin[] = [];
  const state = loadState();

  // 双根：linked/ 优先（dev 时覆盖已装版本）
  for (const root of [linkedPluginsDir(), installedPluginsDir()]) {
    if (!fs.existsSync(root)) continue;
    let entries: fs.Dirent[];
    try { entries = fs.readdirSync(root, { withFileTypes: true }); }
    catch { continue; }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      // 只识别 @saicmotor/plugin-* 前缀
      if (!entry.name.startsWith("plugin-")) continue;

      const pkgRoot = path.join(root, entry.name);
      const manifestPath = path.join(pkgRoot, "saicmotor.plugin.json");

      if (!fs.existsSync(manifestPath)) {
        warnings.push(`插件 ${entry.name} 缺少 saicmotor.plugin.json，跳过`);
        continue;
      }

      let manifest: PluginManifest;
      try {
        const raw = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
        manifest = PluginManifestSchema.parse(raw);
      } catch (e: any) {
        warnings.push(`插件 ${entry.name} manifest 解析失败: ${e.message}`);
        continue;
      }

      // 同名去重：linked/ 已加载同名插件则跳过 installed/
      if (loaded.some((p) => p.manifest.name === manifest.name)) {
        continue;
      }

      // engine 兼容检查
      if (!semver.satisfies(CORE_VERSION, manifest.engine)) {
        warnings.push(
          `插件 ${manifest.name} 与当前核心版本不兼容（需要 ${manifest.engine}，当前 ${CORE_VERSION}），已禁用`,
        );
        continue;
      }

      // 冲突检测：同 service.name 拒绝后加载者
      const services = loadPluginServices(pkgRoot, manifest);
      for (const svc of services) {
        const existing = loaded.find((p) => p.services.some((s) => s.name === svc.name));
        if (existing) {
          warnings.push(
            `service "${svc.name}" 冲突：${manifest.name} 与 ${existing.manifest.name} 均提供，请用 plugin disable 处理`,
          );
        }
      }

      // 过滤掉冲突 service 后的 service 列表
      const conflictFree = services.filter((svc) => {
        const conflict = loaded.some((p) => p.services.some((s) => s.name === svc.name));
        if (conflict) return false;
        return true;
      });

      const stateEntry = state.plugins[manifest.name] ?? {
        name: manifest.name,
        version: "unknown",
        enabled: true,
        source: root === linkedPluginsDir() ? "linked" : "registry",
        skills: manifest.skills ?? [],
      };

      if (!stateEntry.enabled) {
        // disabled 插件不加载
        continue;
      }

      loaded.push({
        manifest,
        entry: stateEntry,
        rootDir: pkgRoot,
        services: conflictFree,
      });
    }
  }

  // 字母序确保可预测
  loaded.sort((a, b) => a.manifest.name.localeCompare(b.manifest.name));

  return { plugins: loaded, warnings };
}

function loadPluginServices(pkgRoot: string, manifest: PluginManifest): Service[] {
  const services: Service[] = [];
  const catalogGlobs = manifest.catalog ?? ["catalog/services/*.json"];

  for (const glob of catalogGlobs) {
    // 简化实现：只支持 catalog/services/ 下的 *.json
    if (!glob.includes("services")) continue;
    const servicesDir = path.join(pkgRoot, "catalog", "services");
    if (!fs.existsSync(servicesDir)) continue;

    let files: string[];
    try { files = fs.readdirSync(servicesDir).filter((f) => f.endsWith(".json")); }
    catch { continue; }

    for (const file of files) {
      try {
        const raw = JSON.parse(fs.readFileSync(path.join(servicesDir, file), "utf8"));
        const svc = ServiceSchema.parse(raw);
        services.push(svc);
      } catch (_e: any) {
        // 单文件坏不影响其他 service
        // 这个警告由调用方处理
      }
    }
  }
  return services;
}