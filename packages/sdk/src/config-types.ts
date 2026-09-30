/** 插件脚本可见的配置子集——仅暴露 gateway，不透出 CLI 认证内部实现 */
export interface Config {
  gateway: string;
}
