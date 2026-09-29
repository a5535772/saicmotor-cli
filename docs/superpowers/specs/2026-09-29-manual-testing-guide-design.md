# 人工测试指南设计（howto/MANUAL-TESTING.md）

> 状态：已评审通过
> 关联：Sprint 8/9 系统全功能人工验证手册

## 背景

Sprint 8 插件化生态上线后，系统能力已大幅超出旧 S8 验证手册覆盖范围（新增一键卸载、preuninstall 兜底、disable/enable 对 skills/suite 的同步、`--registry` flag 等）。需要一份面向测试人员的**从零搭建环境、逐命令全覆盖**的人工测试指南。

## 目标受众

- 初次上手的开发/测试人员，用这份指南完成一次功能路演
- 了解系统全貌：安装 → 插件管理 → 业务功能 → AI 发现 → 开发者工具 → 卸载清理

## 约束

- **环境从零开始**：测试人员电脑上无预装任何 saicmotor 组件
- **认证仅飞书 OAuth**：默认 exchange 模式，不验证 password 模式
- **Mock 后端不在本仓库**：指南中用自然语言说明"从公司内部代码库获取 saicmotor-cli-mock-gateway 和 saicmotor-cli-mock-services"，不挂 md link
- **Windows 环境**：全部 PowerShell 命令，`mvnw` 而非 `mvn`

## 输出文件

`howto/MANUAL-TESTING.md`

## 格式约定

- 纯 Markdown
- 命令块全 PowerShell（`$env:USERPROFILE`、`rm -r -Force` 风格）
- 每条命令后紧跟 `> **预期**：xxx`
- 截图位保留（`**截图位：➊**` 等）
- 前置条件集中列在文件开头
- 测试账号：zhangsan / 123456（mock 后端预置）

## 结构（7 阶段）

### 阶段 0 — 环境准备（约 8 min）

**0.1 全量清理**：若装过旧版用 `saicmotor uninstall` 一键清，否则直接 `npm cache clean --force`

**0.2 启动 Verdaccio**：Docker 一行起容器，curl 验证 200

**0.3 编译 + 发布**：
- `npm run clean && npm run build`
- 逐个 publish（sdk 必须先于 cli）
- 5 个包全部 `npm view` 验证可见

**0.4 启动 mock 后端**：
- "从公司内部代码库获取 saicmotor-cli-mock-gateway 和 saicmotor-cli-mock-services"
- 两个终端各 `mvnw spring-boot:run`
- 测试账号 zhangsan / 123456

### 阶段 1 — 安装 CLI + 启动验证（约 3 min）

| 步骤 | 内容 |
|------|------|
| 1.1 | `npm install -g @saicmotor/cli --registry=http://localhost:4873` |
| 1.2 | `saicmotor install` → 内核 skills 注册，验证 2 个 SKILL.md 落盘 |
| 1.3 | `saicmotor --version` → `0.8.0` |
| 1.4 | `saicmotor --help` → 确认不出现 leave/attendance（插件未装） |
| 1.5 | `saicmotor plugin list` / `--json` → 空 |
| 1.6 | `saicmotor --help` 确认 `uninstall` 命令可见（新增验证点） |

### 阶段 2 — 插件生命周期（约 6 min）

逐条覆盖 install（短名展开 `leave`→`@saicmotor/plugin-leave`、`--json`、`--registry`）→ 三个插件全部安装 → list（文本 + JSON）→ `--help` 见 leave/attendance → disable → `--help` 消失 → enable → 恢复 → upgrade → uninstall 单个。共 8 子步骤。

### 阶段 3 — 业务功能端到端（约 6 min）

| 步骤 | 内容 |
|------|------|
| 3.1 | 配置网关：`config.json` 写入 `{"gateway":"http://localhost:8081"}` |
| 3.2 | `saicmotor auth login`（exchange 模式飞书 OAuth，弹浏览器授权）→ `auth status` 确认 |
| 3.3 | leave balance query 三种格式（json/pretty/table）|
| 3.4 | leave applications submit：dry-run → 无 `--yes` 被拒 → 正确提交 |
| 3.5 | attendance records query + corrections submit（dry-run → 提交）|

### 阶段 4 — Skills 注册 & AI 发现（约 5 min）

| 步骤 | 内容 |
|------|------|
| 4.1 | 5 个 SKILL.md 全部确认落盘（suite + shared + 3 个插件 skill）|
| 4.2 | suite SKILL.md 路由表验证（含 leave/attendance/user 路由）|
| 4.3 | **新增** disable leave → suite 路由收缩 + skill junction 消失；enable → 恢复 |
| 4.4 | 卸载 leave → suite 路由收缩；重装 → 恢复 |
| 4.5 | AI 实战 4 项：能力发现 → 拼 leave 命令 → 拼 attendance 命令 → 解析 plugin list --json |

### 阶段 5 — 开发者工具链（约 5 min）

create plugin → 验证生成文件 → validate 通过 → 坏 manifest 被拒 → `npm install --registry=...` → `dev` link → plugin list 可见 → `dev --stop` → 清理临时目录

### 阶段 6 — 卸载 & 残留清理（约 3 min）

全新——覆盖 `saicmotor uninstall` 一键卸载全流程：

| 步骤 | 内容 |
|------|------|
| 6.1 | 逐个 `plugin uninstall` 卸载插件 |
| 6.2 | `saicmotor uninstall` 一键清空（skills + 本地数据 + 自删 npm 包）|
| 6.3 | 验证 `saicmotor --version` 不可用 |
| 6.4 | 验证 skills 目录无 `saicmotor-*` 残留 |
| 6.5 | 验证 `~/.saicmotor` 已删除 |
| 6.6 | 停 mock 后端 + Verdaccio |

## 新增验证点（相对 S8 手册）

1. **`uninstall` 命令**：阶段 1.6 确认可见 + 阶段 6 完整验证
2. **disable/enable 对 skills 影响**：阶段 4.3 — disable 后 skill junction 消失、enable 后恢复
3. **`--registry` flag**：阶段 2 plugin install 显式带 `--registry`
4. **exchage 认证**：阶段 3.2 仅 exchange 模式（旧 S8 手册混用 password）

## 前置条件清单

```
- Node.js ≥ 20
- Docker Desktop（Verdaccio）
- Java 17 + Maven（mock-server）
- 从公司内部代码库获取：
  - saicmotor-cli（本仓库）
  - saicmotor-cli-mock-gateway（独立仓库）
  - saicmotor-cli-mock-services（独立仓库）
```