# saicmotor CLI 使用指南

> 装好就能用——在终端里查年假、看考勤、提交请假。人和 AI Agent 都能用同一套命令。

## 环境要求

- **Node.js ≥ 20**（内置 `fetch`，零额外依赖）
- 网络能访问公司内部 npm registry

## 安装

```bash
npm install -g @saicmotor/cli --registry=<内部 registry 地址>
```

一行搞定。装完后注册 AI skills：

```bash
saicmotor install
```

> **预期**：`✓ 2 个 AI skills 已注册`（`saicmotor-suite` + `saicmotor-shared`）。

验证安装：

```bash
saicmotor --version   # 应输出版本号
saicmotor --help      # 列出所有可用命令
```

> **npm v11 用户注意**：如果 skills 未注册，手动执行 `saicmotor install` 即可；如果 `saicmotor` 命令本身找不到，见下方「常见错误速查」。

## 安装业务插件

核心包 `@saicmotor/cli` 只含框架和 AI skills——**业务命令全部来自插件**，装完核心必须再装插件：

```bash
saicmotor plugin install leave --registry=<内部 registry 地址>
saicmotor plugin install attendance --registry=<内部 registry 地址>
saicmotor plugin install user --registry=<内部 registry 地址>
```

验证：

```bash
saicmotor plugin list    # 应列出已装插件
saicmotor leave --help   # 插件命令应可用
```

## 配置网关

默认网关指向本地 mock（`http://localhost:8081`）。生产使用前改为公司网关地址，二选一：

- 写入 `~/.saicmotor/config.json`：

  ```json
  { "gateway": "http://公司网关地址" }
  ```

- 或设环境变量（PowerShell：`$env:SAICMOTOR_GATEWAY="http://公司网关地址"`；bash：`export SAICMOTOR_GATEWAY=http://公司网关地址`）

## 登录

生产环境走飞书 OAuth（默认），敲命令后浏览器自动弹出授权：

```bash
saicmotor auth login
```

浏览器完成授权后 token 自动缓存，后续命令无需重复登录。

验证登录状态：

```bash
saicmotor auth status   # 应显示"已登录"
```

## 常用命令

### 查年假余额

```bash
saicmotor leave balance query
saicmotor leave balance query --format pretty   # 美化输出
saicmotor leave balance query --format json     # JSON（默认）
```

### 查考勤记录

```bash
saicmotor attendance records query --format pretty
```

### 提交请假

```bash
# 先预览（不真正提交）
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --dry-run

# 正式提交（必须加 --yes）
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --yes
```

### 补卡

```bash
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --dry-run
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --yes
```

### 查看已装插件

```bash
saicmotor plugin list
```

## 输出格式

所有命令支持三种格式，通过 `--format` 切换：

| 格式 | 用途 |
|------|------|
| `json` | 程序/脚本消费（默认） |
| `table` | 列表数据的人眼浏览（仅当命令返回数组时可用，如查询列表类接口） |
| `pretty` | 人眼阅读美化 |

## 写操作安全

所有会产生副作用的命令（提交请假、补卡等）：

- **不加 `--yes`**：被拒绝执行，提示"该命令有副作用，加 --yes 确认，或加 --dry-run 预览"
- **加 `--dry-run`**：预览请求内容但不发送
- **加 `--yes`**：确认执行

## 卸载

```bash
saicmotor uninstall
```

一键清除全部 AI skills、本地数据、自删 npm 包。无需手动清理任何残留。

## 常见错误速查

| 症状 | 解决 |
|------|------|
| `saicmotor` 找不到命令 | 关掉终端重新打开；检查 Node.js 全局 bin 是否在 PATH |
| `leave` 等业务命令不存在 | 未装插件——先 `saicmotor plugin install <name> --registry=<内部 registry 地址>` |
| "未登录" | `saicmotor auth login` 重新登录 |
| `401` 错误 | token 过期，`saicmotor auth login` 重新登录 |
| 请求打到 `localhost:8081` | 未配置生产网关——见「配置网关」 |
| 安装很慢或失败 | 检查 `--registry` 地址是否正确 |
| skills 未注册 | `saicmotor install --force` 手动注册 |
