/** 检查任意客户端是否已有本包的 skill 条目 */
export declare function skillsAlreadyInstalled(): boolean;
/** 注册核心包内置的全部 skills */
export declare function installSkills({ force }?: {
    force?: boolean;
}): void;
