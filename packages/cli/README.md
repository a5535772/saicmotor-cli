# @saicmotor/cli

> saicmotor 核心框架包——引擎、认证、插件管理、CLI 入口。
> 发布为 `@saicmotor/cli`，通过 `saicmotor` 全局命令使用。

---

## 安装

```bash
npm install -g @saicmotor/cli --registry=<内部 registry>
```

**要求**：Node.js ≥ 20。

装完注册 AI skills：

```bash
saicmotor install
```

预期输出 `✓ 2 个 AI skills 已注册`（`saicmotor-suite` + `saicmotor-shared`）。

---

## 配置

默认网关指向 `http://localhost:8081`（本地开发 mock）。生产使用时改为公司网关地址。

### 方式一：用户配置文件（推荐）

```json
// ~/.saicmotor/config.json
{ "gateway": "https://api.example.com" }
```

### 方式二：环境变量

```bash
export SAICMOTOR_GATEWAY=https://api.example.com
```

优先级：环境变量 > 配置文件 > 包级默认 > 硬编码兜底。

---

## 登录

```bash
saicmotor auth login
```

默认走飞书 OAuth，浏览器弹出授权页面，完成后 token 自动缓存。

### 查看状态

```bash
saicmotor auth status
```

### 非交互环境（CI/自动化）

设环境变量后直接使用：

```bash
export SAICMOTOR_AUTH_TYPE=password
export SAICMOTOR_USERNAME=<工号>
export SAICMOTOR_PASSWORD=<密码>
```

---

## 安装业务插件

核心包只含框架——**业务命令全部来自插件**：

```bash
saicmotor plugin install leave --registry=<内部 registry>
saicmotor plugin install attendance --registry=<内部 registry>
saicmotor plugin install user --registry=<内部 registry>
```

### 插件管理

```bash
saicmotor plugin list          # 列出已装插件
saicmotor plugin list --json   # 机读格式
saicmotor plugin enable <名称>  # 启用
saicmotor plugin disable <名称> # 禁用
saicmotor plugin uninstall <名称> # 卸载
saicmotor plugin upgrade <名称>  # 升级
```

---

## 命令结构

所有业务命令遵循统一格式：

```
saicmotor <服务名> <资源名> <方法名> [--参数] [选项]
```

例如：

```bash
# 查年假余额
saicmotor leave balance query --format pretty

# 提交请假（--dry-run 预览，--yes 确认）
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --dry-run
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --yes

# 查考勤
saicmotor attendance records query --format table

# 补卡
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --yes
```

---

## 输出格式

`--format` 支持三种：

| 值 | 用途 |
|----|------|
| `json` | 程序/脚本消费（默认） |
| `table` | 列表数据人眼浏览 |
| `pretty` | 人眼美化 |

---

## 写操作安全

所有 `POST`/`PUT`/`DELETE` 命令：

- **不加 `--yes` 也不加 `--dry-run`**：拒绝执行
- **`--dry-run`**：预览请求内容，不发送
- **`--yes`**：确认执行

---

## 卸载

```bash
saicmotor uninstall
```

一键清除 skills、插件、本地数据、自删 npm 包。

---

## 常见问题

| 症状 | 方案 |
|------|------|
| `saicmotor` 找不到命令 | 关闭终端重新打开 / 检查 PATH |
| 业务命令不存在 | 未装插件：`saicmotor plugin install <name> --registry=<内部 registry>` |
| 未登录 | `saicmotor auth login` |
| 401 错误 | token 过期，重新 `saicmotor auth login` |
| skills 未注册 | `saicmotor install --force` |
| 请求打到 localhost | 未配生产网关，见上方「配置」