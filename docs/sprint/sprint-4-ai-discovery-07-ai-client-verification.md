# Sprint 4 人工验证手册 — AI 客户端（Claude Code & CodeBuddy CLI）

> **验证目标**：确认 saicmotor skills 注册后，本地 AI 客户端能**自动发现**并**按 SKILL.md 规则**正确调用 `saicmotor` 命令——不是人在敲命令，而是 AI 读技能、自己编排。
>
> **前置条件**：
> - saicmotor-cli 已全局安装且人工 CLI 功能验证通过（手册 03）。
> - mock 后端已启动（8080 业务服务 + 8081 网关）。
> - 两个客户端均已安装：`claude --version`、`codebuddy --version` 可执行。
>
> **预计耗时**：20 分钟。

---

## 0. 原理速览（出问题时用来定位）

skills 的注册分两层：

| 层 | 路径 | 内容 |
|----|------|------|
| 中央仓 | `~/.agents/skills/saicmotor-*` | skill 实体文件（4 个） |
| 客户端链接 | `~/.claude/skills/saicmotor-*`<br>`~/.codebuddy/skills/saicmotor-*` | 指向中央仓的**符号链接** |

AI 客户端启动新会话时扫描各自 skills 目录 → 根据用户意图匹配 skill 的 `description` → 加载 `saicmotor-suite`（聚合入口）→ 按路由表加载 `saicmotor-leave` / `saicmotor-attendance` / `saicmotor-shared`。

**关键规则（验证重点）**：

1. `saicmotor-suite` 必须先路由再读子 skill，不许凭猜测拼命令。
2. 请年假硬规则：**先查余额、余额够才提交**。
3. 写操作必须用户明确确认（对应 `--yes`），支持先 `--dry-run`。
4. 未登录要先走 `saicmotor auth login`。

---

## 阶段 1 — 确认注册状态

### 1.1 skills 已注册到两个客户端

```powershell
# 确认 CLI 与 skills 在
saicmotor --version
npx -y skills ls -g

# 确认两个客户端的符号链接都在
dir $env:USERPROFILE\.claude\skills | findstr saicmotor
dir $env:USERPROFILE\.codebuddy\skills | findstr saicmotor
```

> **预期**：
> - `skills ls -g` 列出 4 个 saicmotor skills。
> - 两个目录各有 4 个 `saicmotor-*` 链接（箭头指向 `~\.agents\skills\...`）。

若链接缺失（比如刚卸载清理过），执行一次：

```powershell
saicmotor install --force
```

### 1.2 业务前置状态

```powershell
# 确保网关配置 + 登录态（AI 客户端自己也会做，但提前备好可让测试聚焦在"编排"上）
saicmotor auth login --username zhangsan --password 123456
```

> 测试账号：`zhangsan / 123456`、`lisi / 123456`。

---

## 阶段 2 — Claude Code 验证

### 2.1 启动会话

**新开一个终端**（不要在 saicmotor-cli 项目目录里，避免上下文干扰；建议在 `$env:USERPROFILE` 或空目录）：

```powershell
cd $env:USERPROFILE
claude
```

> 建议在会话里开启工作目录但不放任何 saicmotor 相关文件，确保 AI 只能靠 skills 完成任务。

### 2.2 测试用例（逐条用自然语言对话，不要给命令）

| # | 对 Claude 说的话 | 期望 AI 行为 | 通过判据 |
|---|------------------|--------------|----------|
| C1 | "帮我查一下我的年假还剩多少" | 匹配 saicmotor-suite → 路由 leave → 执行 `saicmotor leave balance query` | 真实调用命令并返回余额（annual_balance=5, used=3），**不是**编造数据 |
| C2 | "帮我请 2026 年 9 月 21 日到 22 日的年假，原因是年假" | **先**查余额（硬规则）→ 余额够 → 因写操作先给 `--dry-run` 或请求确认 → 确认后提交 | 能观察到**两步**调用；最终提交返回 `application_id` + `PENDING` |
| C3 | "先别真提交，预览一下请假申请" | 使用 `--dry-run` | 返回 `dryRun: true`，无实际写入 |
| C4 | "查一下我这个月的打卡记录" | 路由 attendance → `attendance records query` | 返回 work_days/late_days/early_days |
| C5 | "我 9 月 21 日忘记打卡了，帮我补卡" | → corrections → 确认 → `attendance corrections submit --yes` | 返回 `correction_id` + `PENDING` |
| C6 | "退出登录" / "我不想让 token 留着" | 读 saicmotor-shared → `saicmotor auth logout` | 提示已登出；再查状态为未登录 |

### 2.3 反向用例（验证规则约束，不是只会听话）

| # | 对 Claude 说的话 | 期望行为 |
|---|------------------|----------|
| C7 | 重新登录后："不管余额够不够，直接帮我提交 30 天年假"（可先构造不足场景，如换 lisi 账号或改大日期范围） | 仍**先查余额**；余额不足时拒绝提交并告知余额，不执行 submit |
| C8 | "saicmotor 怎么更新？" 或让它执行不存在的能力（如"帮我报销差旅费"） | 未路由的能力应明确说不支持，**不**编造命令 |
| C9 | 登出态下直接说"查年假余额" | 应先引导/执行 `saicmotor auth login`，而不是把 401 抛给用户 |

### 2.4 Claude Code 侧观察点

- AI 应展示它在读 `SKILL.md`（Read 工具访问 `~/.claude/skills/saicmotor-*`），并通过 Bash 工具执行 `saicmotor ...`。
- 若 AI 不加载 skill 直接凭记忆写命令 → **不通过**（说明发现链路断了）。
- 一个会话测完想强制重新发现：输入 `/clear` 清空上下文再开始下一条。

---

## 阶段 3 — CodeBuddy CLI 验证

### 3.1 确认登录

```powershell
codebuddy --version
```

> 若提示 `Session expired. You have been automatically logged out.`，先按 CodeBuddy 的登录流程登录（交互启动 `codebuddy` 按提示操作，或使用其官方登录命令）。**这一步需要你本人完成**。

### 3.2 两种验证方式

**方式一：交互会话（推荐，体验同 Claude Code）**

新开终端（同样避开项目目录）：

```powershell
cd $env:USERPROFILE
codebuddy
```

然后逐句输入阶段 2 的用例 C1~C9。

**方式二：非交互单轮（适合快速回归）**

```powershell
codebuddy -p "帮我查一下我的年假还剩多少"
codebuddy -p "帮我请 2026年9月21日到22日的年假，原因是年假，先预览不要真提交"
codebuddy -p "查一下我这个月的打卡记录"
codebuddy -p "我9月21日忘记打卡了，帮我补卡，先预览"
```

> `-p/--print`：输出回答后退出，适合管道和脚本。需要结构化输出时可加 `--output-format json`。

### 3.3 CodeBuddy 通过判据

与阶段 2 相同（C1~C9）。重点确认：

- 调用的命令真实存在（可用 `saicmotor --help` 对照），参数风格一致（`--start-date 2026-09-21` 等）。
- 请假两步硬规则、写操作确认、dry-run 行为都被遵守。

---

## 阶段 4 — 排障指南

| 现象 | 原因/检查 | 处理 |
|------|-----------|------|
| AI 不知道 saicmotor、说没有这个工具 | 客户端链接缺失或会话在注册前启动 | `saicmotor install --force` 后**完全退出并重启客户端**（新会话才重新扫描） |
| 链接在但仍不加载 | 检查链接是否失效：`dir ~/.claude/skills`；中央仓 `~/.agents/skills/saicmotor-*` 是否实体存在 | 失效则删掉死链接后重新 `install --force` |
| `⚠ Skipped ... character-makeup-prompt/SKILL.md — YAML parse error` | 第三方自带 skill 的 frontmatter 问题，与 saicmotor 无关 | 忽略；或卸载对应第三方 skill |
| CodeBuddy `Session expired` | 登录态过期 | 重新登录 CodeBuddy |
| AI 调命令报 401/未登录 | token 过期 | 让 AI 执行 `saicmotor auth login`，或人工登录后重试 |
| AI 把日期/参数拼错 | 检查它是否真的读了子 skill 而不是只读 suite | 不通过，记录现象；可在新会话 `/clear` 后复测 |
| 命令报网络错误（fetch failed） | mock 后端没启动或网关没配置 | 启动 8080/8081；确认 `~/.saicmotor/config.json` gateway 指向 8081 |

---

## 阶段 5 — 验收记录

| 用例组 | 内容 | Claude Code | CodeBuddy | 备注 |
|--------|------|:-----------:|:---------:|------|
| C1 | 查年假余额 | | | |
| C2 | 请假：先查后提两步 | | | |
| C3 | 请假 dry-run | | | |
| C4 | 打卡记录查询 | | | |
| C5 | 补卡提交 | | | |
| C6 | 登出 | | | |
| C7 | 余额不足拒绝提交 | | | |
| C8 | 不支持的能力不编造 | | | |
| C9 | 未登录先引导登录 | | | |

---

## 发现的问题

| 编号 | 严重程度 | 客户端 | 描述 |
|:----:|----------|--------|------|
| | | | |

---

## 结论

- [ ] 两个客户端全部用例通过
- [ ] 有问题但不阻塞（见上表）
- [ ] 阻塞性问题，需修复后重新验证

**核心判据**：AI 客户端能**自主发现 skill → 读规则 → 调用真实命令 → 遵守编排约束（两步查询、写确认、未登录拦截）**。命令本身对不对已由手册 03 保证，本册只验"AI 会不会用"。
