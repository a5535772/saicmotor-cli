# 03 — 安装全流程

> 从零到第一个命令的完整旅程。覆盖 npm 安装、Skills 注册、插件安装、验证步骤。

---

## 3.1 三步安装模型

```mermaid
flowchart LR
    S1["① 安装核心 CLI<br/>npm install -g @saicmotor/cli"] --> S2["② 注册 AI Skills<br/>saicmotor install"]
    S2 --> S3["③ 安装业务插件<br/>saicmotor plugin install leave"]
    S3 --> DONE["✅ 就绪"]
```

### ① 安装核心 CLI

```bash
npm install -g @saicmotor/cli --registry=<内部 registry>
```

**这条命令做了什么**：
- 从 registry 下载 `@saicmotor/cli` 包（含编译后的 JS 产物）
- 安装到 Node.js 全局目录，`saicmotor` 命令可用
- **不**触发任何自动注册——没有 postinstall hook

### ② 注册 AI Skills

```bash
saicmotor install
```

**这条命令做了什么**：

```
saicmotor install
  ├─ 扫描 CLI 包内 skills/ 目录 → 找到 saicmotor-suite + saicmotor-shared
  ├─ 确保各 AI 客户端 skills 目录存在
  │    ~/.claude/skills/
  │    ~/.agents/skills/
  │    ~/.codebuddy/skills/
  ├─ 对每个 skill 在每客户端建立 junction（或 symlink / copy）
  └─ 输出：✓ 2 个 AI skills 已注册
```

> 💡 **预期输出**：`✓ 2 个 AI skills 已注册`（`saicmotor-suite` + `saicmotor-shared`）。

### ③ 安装业务插件

```bash
saicmotor plugin install leave --registry=<内部 registry>
```

**这条命令做了什么**：

```
saicmotor plugin install leave
  ├─ "leave" → 自动展开为 @saicmotor/plugin-leave
  ├─ npm install 到 ~/.saicmotor/plugins/node_modules/@saicmotor/plugin-leave
  ├─ 读取 manifest → 校验 engine 兼容性
  ├─ registerPluginSkills（把插件的 skill 注册到各 AI 客户端）
  ├─ writeSuiteRoutes（全量重建 suite 路由表）
  ├─ saveState（写入 state.json）
  └─ 输出：✓ @saicmotor/plugin-leave 安装完成，1 个 skills 已注册
```

---

## 3.2 安装时序全图

```mermaid
sequenceDiagram
    participant U as 👤 用户
    participant NPM as npm registry
    participant C as CLI 核心
    participant FS as 文件系统
    participant AI as AI 客户端

    Note over U,AI: 步骤① 安装核心 CLI
    U->>NPM: npm install -g @saicmotor/cli
    NPM-->>FS: 写入全局 node_modules + bin link

    Note over U,AI: 步骤② 注册 Skills
    U->>C: saicmotor install
    C->>FS: 扫描 skills/ → saicmotor-suite, saicmotor-shared
    C->>FS: mkdir -p ~/.claude/skills/
    C->>FS: junction: ~/.claude/skills/saicmotor-suite → skills/saicmotor-suite
    C->>FS: junction: ~/.claude/skills/saicmotor-shared → skills/saicmotor-shared
    C-->>U: ✓ 2 个 AI skills 已注册

    Note over U,AI: 步骤③ 安装业务插件
    U->>C: saicmotor plugin install leave
    C->>NPM: npm install @saicmotor/plugin-leave
    NPM-->>FS: ~/.saicmotor/plugins/node_modules/@saicmotor/plugin-leave
    C->>FS: 读 manifest → 校验 engine 兼容性（与 getCoreVersion() 比对）
    C->>FS: junction: saicmotor-leave skill 到各 AI 客户端
    C->>FS: 全量重建 suite SKILL.md（含 leave 路由）
    C->>FS: 写入 state.json
    C-->>U: ✓ @saicmotor/plugin-leave 安装完成

    Note over AI: AI 客户端下次启动自动发现新 skill
```

---

## 3.3 `saicmotor install` vs `plugin install` — 分工明确

这是中级工程师最困惑的地方（[FAQ #1](../A1-faq.md#q1-saicmotor-install-和-plugin-install-的关系)），一张表说清楚：

| | `saicmotor install` | `saicmotor plugin install <name>` |
|---|---|---|
| **谁调用** | 用户手动（安装 CLI 后跑一次） | 用户手动（每装一个插件跑一次） |
| **注册什么** | 内核 skills：suite + shared | 该插件的 skills |
| **触发的连锁操作** | 注册 skills 到 AI 客户端 | 注册 skills + **刷新 suite 路由表** |
| **必须性** | 必须（否则 AI 发现不了 saicmotor） | 必须（否则业务命令不存在） |
| **可重复执行吗** | 可以，`--force` 强制重装 | 可以，`--json` 静默输出 |

> 💡 **黄金规则**：`saicmotor install` 只跑一次。之后每次 `plugin install/uninstall/enable/disable` 都会自动更新 suite 路由表——你不需要再手动跑 `saicmotor install`。

---

## 3.4 验证安装的检查清单

```bash
# 1. 核心命令可用
saicmotor --version    # 输出与 package.json 同步的动态版本（getCoreVersion()）
saicmotor --help       # → 含 install, uninstall, plugin, auth 等

# 2. Skills 落盘成功
ls ~/.claude/skills/   # → saicmotor-suite, saicmotor-shared

# 3. 插件命令存在（装插件后）
saicmotor leave --help  # → leave 子命令列表

# 4. Suite 路由表正确
cat ~/.claude/skills/saicmotor-suite/SKILL.md
# → 含 "请假 → saicmotor-leave" 等路由条目
```

---

## 3.5 安装失败排查

```mermaid
flowchart TD
    A["saicmotor 命令找不到"] --> B{"Node.js 全局 bin 在 PATH?"}
    B -->|"否"| FIX1["关掉终端重新打开"]
    B -->|"是"| C{"npm install -g 有报错吗?"}
    C -->|"registry 不可达"| FIX2["检查 --registry 地址 + 网络/代理"]
    C -->|"权限不足"| FIX3["用管理员权限或 nvm 切换 Node 版本"]
    D["skills 未注册"] --> E{"saicmotor install 执行了吗?"}
    E -->|"否"| FIX4["执行 saicmotor install"]
    E -->|"是"| FIX5["执行 saicmotor install --force"]
    F["插件命令不存在"] --> G{"plugin list 有这个插件吗?"}
    G -->|"否"| FIX6["saicmotor plugin install <name>"]
    G -->|"有但命令没有"| FIX7["检查 engine 兼容性 + catalog JSON 有效性"]
```

---

## ❓ 自学检查

1. 如果用户只执行 `npm install -g @saicmotor/cli` 而不执行 `saicmotor install`，AI Agent 能发现 saicmotor 吗？
2. 安装一个插件后，suite 路由表是什么时候更新的？需要用户手动做什么吗？
3. `saicmotor --help` 的输出在装插件前和装插件后有什么区别？为什么？

> **答案** → [A1 FAQ §自测答案](./A1-faq.md#自测答案)

## 下一步

- [04 插件系统](./04-plugin-system.md) — 深入了解插件的加载、生命周期、状态管理
- [05 Skills 与 Suite](./05-skills-and-suite.md) — AI Agent 发现机制深入