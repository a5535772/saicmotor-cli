import path from "node:path";
import { saicmotorDir } from "../config";

/** 插件安装根目录：~/.saicmotor/plugins/ */
export function pluginsDir(): string {
  return path.join(saicmotorDir(), "plugins");
}

/** 已安装插件目录（npm install 目标） */
export function installedPluginsDir(): string {
  return path.join(pluginsDir(), "node_modules");
}

/** dev link 目录 */
export function linkedPluginsDir(): string {
  return path.join(pluginsDir(), "linked");
}

/** state.json 路径 */
export function stateFilePath(): string {
  return path.join(pluginsDir(), "state.json");
}