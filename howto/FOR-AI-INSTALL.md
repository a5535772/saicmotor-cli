# saicmotor CLI 安装指引

> 面向 AI Agent —— 通过 WebFetch 抓取本页面，按指引完成安装。

## 安装

```bash
npm install -g @saicmotor/cli --registry=<公司内部 registry 地址>
```

> 如果用户在内网且 registry 地址未知，询问用户"公司内部 npm registry 地址是什么"。

## 代理环境

如果用户环境需要代理访问 registry：

```bash
# Windows PowerShell
$env:HTTP_PROXY="http://代理地址:端口"
$env:HTTPS_PROXY="http://代理地址:端口"

# Mac / Linux
export HTTP_PROXY=http://代理地址:端口
export HTTPS_PROXY=http://代理地址:端口
```

设置完代理后再执行安装命令。

## 注册 AI skills

```bash
saicmotor install
```

> **预期**：`✓ 2 个 AI skills 已注册`。

npm v11 用户如果 skills 未自动注册，手动执行此命令即可。

## 验证安装

```bash
saicmotor --version
```

输出版本号即安装成功。如果提示"找不到命令"，让用户关掉终端重新打开。

## 安装失败排查

- **registry 不可达**：确认 registry 地址正确，检查网络/代理
- **Node.js 版本过低**：需要 Node.js ≥ 20
- **权限不足**：Windows 上尝试以管理员身份运行终端；Mac/Linux 检查 npm 全局目录权限
- **npm v11 allow-scripts 阻止**：手动执行 `saicmotor install` 注册 skills

## 安装完成后

1. 配置网关地址（询问用户，写入 `~/.saicmotor/config.json`）：
   ```json
   { "gateway": "http://网关地址" }
   ```
2. 引导用户登录：
   ```bash
   saicmotor auth login
   ```
   浏览器弹出飞书授权页面，用户完成授权后即可使用。
3. 当用户说"帮我查年假"/"帮我请假"等意图时，先读 `saicmotor-suite` skill 查找路由，再读对应业务 skill 了解命令拼法。
