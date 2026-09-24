import { type PluginManifest } from "@saicmotor/sdk";
import { type Service } from "../schema/catalog";
import type { Config } from "../config";
import { type PluginStateEntry } from "./state";
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
/**
 * 双根扫描并加载所有兼容插件。
 * 不做全局副作用（不写 state，不注册 skills）。
 */
export declare function loadPlugins(_config: Config): LoadResult;
