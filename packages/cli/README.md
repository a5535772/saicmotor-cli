# @saicmotor/cli

面向 AI Agent 的企业 CLI 工具平台：skill 编排 + catalog 声明 + 引擎执行。

## 架构

> 当前 0.8.0 已支持插件加载、生命周期管理、开发者工具链。详见 [ARCHITECTURE.md](../../docs/ARCHITECTURE.md)。

## 快速开始

```bash
npm install -g @saicmotor/cli --registry=<内部registry>
saicmotor --help
```

## 插件管理

```bash
saicmotor plugin install <名称>     # 安装插件
saicmotor plugin list               # 列出已装插件
saicmotor plugin enable <名称>      # 启用
saicmotor plugin disable <名称>     # 禁用
saicmotor plugin uninstall <名称>   # 卸载
```

## 开发者

```bash
saicmotor create plugin <名称>      # 生成插件脚手架
saicmotor validate .                # 校验插件
saicmotor dev                       # 本地联调
saicmotor dev --stop                # 解除联调
```

详见 [DEVELOPER.md](../../docs/DEVELOPER.md)。