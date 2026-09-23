# 安装 saicmotor CLI

```bash
npm install -g @saicmotor/cli --registry=http://localhost:4873
saicmotor --version
```

验证安装成功：
```bash
saicmotor --help
```

如果 skills 未注册（npm v11 allow-scripts 阻止了 postinstall），手动执行：
```bash
saicmotor install
```

## 配置内部 Registry

**主推方式：`--registry` flag（推荐）**
```bash
npm install -g @saicmotor/cli --registry=http://localhost:4873
npx @saicmotor/cli@latest --registry=http://localhost:4873
```

**备选方式：scoped registry（长期固定配置）**
```bash
npm config set @saicmotor:registry http://localhost:4873
npm install -g @saicmotor/cli
```

## 验证

```bash
saicmotor --version   # 应输出版本号
saicmotor --help      # 应列出可用命令
```

## 卸载

```bash
saicmotor uninstall   # 清理 skills 与本地数据（S9）
npm uninstall -g @saicmotor/cli
```

> **端点说明：** `http://localhost:4873` 为 POC 环境占位。替换为内部 registry 地址后即可发布到内网页面。
> AI Agent 可通过 WebFetch 读取此页面，按指引完成一键安装。