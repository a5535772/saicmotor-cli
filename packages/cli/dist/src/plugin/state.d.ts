export interface PluginStateEntry {
    name: string;
    version: string;
    enabled: boolean;
    source: "registry" | "linked";
    linkedPath?: string;
    skills: string[];
    routes?: Record<string, string>;
}
export interface PluginState {
    plugins: Record<string, PluginStateEntry>;
}
export declare function loadState(): PluginState;
export declare function saveState(state: PluginState): void;
