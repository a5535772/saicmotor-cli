import { execSync as nodeExecSync } from "node:child_process";
export declare const SKILLS_REPO: string;
/** 测试注入点：替换 execSync 实现 */
export declare function __setExecSync(fn: typeof nodeExecSync): void;
export declare function skillsAlreadyInstalled(): boolean;
export declare function installSkills({ force }?: {
    force?: boolean;
}): void;
/** npm lifecycle postinstall 入口 */
export declare function runPostinstall(): void;
