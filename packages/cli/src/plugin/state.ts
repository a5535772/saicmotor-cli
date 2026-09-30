import fs from "node:fs";
import path from "node:path";
import { stateFilePath } from "./paths";

export interface PluginStateEntry {
  name: string;           // 包名，如 "@saicmotor/plugin-user"
  version: string;        // 已安装版本
  enabled: boolean;
  source: "registry" | "linked";
  linkedPath?: string;    // dev link 指向的工程路径（source=linked 时有值）
  skills: string[];       // 已注册的 skill 目录名列表
  routes?: Record<string, string>;  // 插件声明的 suite 路由
}

export interface PluginState {
  plugins: Record<string, PluginStateEntry>;
}

export function loadState(): PluginState {
  try {
    const raw = fs.readFileSync(stateFilePath(), "utf8");
    return JSON.parse(raw);
  } catch {
    // state.json 缺失/损坏时回退空插件表，是有意降级——文件损坏不阻断 CLI 启动（代价是已装插件列表看似清空，属可接受）
    return { plugins: {} };
  }
}

export function saveState(state: PluginState): void {
  const dir = path.dirname(stateFilePath());
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(stateFilePath(), JSON.stringify(state, null, 2), { encoding: "utf8", mode: 0o600 });
}