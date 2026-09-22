# Sprint 4 端到端验证手册 — AI 客户端（Claude Code & CodeBuddy CLI）

> **验证目标**：以"真实用户 + AI Agent"视角走完整链路——**手动清理 → 安装 → AI 自主发现 skills → 按规则编排调用 → 卸载 → 残留观察与手动清理**。
>
> **验证方式（重要）**：
> - 人**只发自然语言**（"帮我清干净"、"帮我装上"、"帮我查年假"……），**不手工敲任何 saicmotor/npm 命令**。
> - 所有命令由 AI 客户端通过其工具（Bash/Shell）执行。本册给出的命令仅作为"期望 AI 执行什么"的对照和排障依据。
> - Claude Code 与 CodeBuddy **各完整走一遍**（建议先 Claude Code，CodeBuddy 回归可复用同一脚本）。
>
> **前置条件**：
> - Node.js ≥ 16；两个客户端已安装并登录：`claude --version`、`codebuddy --version`（此两条仅环境确认，可手工执行）。
> - Java 17 + Maven，能启动 mock 后端（8080 业务服务 + 8081 网关）。
> - 需要代理的环境已确认代理端口（如 `127.0.0.1:7897`）。
>
> **预计耗时**：35~45 分钟/客户端。

---

## 0. 原理速览（出问题时用来定位）

skills 注册分两层：

| 层 | 路径 | 内容 |
|----|------|------|
| 中央仓 | `~/.agents/skills/saicmotor-*` | skill 实体文件（4 个） |
| 客户端链接 | `~/.claude/skills/saicmotor-*`<br>`~/.codebuddy/skills/saicmotor-*` | 指向中央仓的**符号链接** |

- AI 客户端在**会话启动时**扫描各自 skills 目录 → 因此**安装/清理后必须开新会话**（Claude Code 用 `/clear` 或退出重进），旧会话感知不到变化。
- 发现链路：意图匹配 → 加载 `saicmotor-suite`（聚合入口）→ 按路由表加载 `saicmotor-leave` / `saicmotor-attendance` / `saicmotor-shared`。
- npm 卸载**只删 npm 包**，不动 skills 中央仓/链接，也不动 `~/.saicmotor` —— 这正是本册阶段 6 要观察并手动清理的内容。

**四条编排硬规则（功能验证重点）**：

1. 必须经 `saicmotor-suite` 路由加载子 skill，不许凭猜测拼命令。
2. 请年假：**先查余额，余额够才提交**。
3. 写操作必须用户明确确认（对应 `--yes`），可先 `--dry-run` 预览。
4. 未登录先 `saicmotor auth login`，不把 401 抛给用户。

---

## 阶段 1 — 启动 mock 后端（手工，仅一次）

两个终端分别启动：

```powershell
# 终端 A
cd D:\work\things\saicmotor-cli-all\saicmotor-cli-mock-services
mvnw spring-boot:run

# 终端 B
cd D:\work\things\saicmotor-cli-all\saicmotor-cli-mock-gateway
mvnw spring-boot:run
```

> 看到两个 `Started ... Application` 即成功。测试账号：`zhangsan / 123456`、`lisi / 123456`。

---

## 阶段 2 — 初始手动清理（AI 执行，人只发指令）

> 目的：从**绝对干净**的状态开始，排除"以前装过"的干扰。
> 此时 AI 没有任何 saicmotor skill，它只能靠通用 shell 能力完成——这恰好验证 AI 能否在无 skill 时按用户意图操作系统。

**新开客户端会话，建议在非项目目录（如 `%USERPROFILE%`）启动：**

```powershell
cd $env:USERPROFILE
claude          # CodeBuddy 侧改为 codebuddy
```

**对 AI 说：**

> "帮我把 saicmotor 相关的东西全部清干净：如果全局装了 saicmotor-cli 就用 npm 卸载；删掉用户目录下的 .saicmotor 文件夹；如果 skills 工具可用，把全局的 saicmotor-suite、saicmotor-leave、saicmotor-attendance、saicmotor-shared 四个技能都删掉。"

**期望 AI 执行的命令（对照用）：**

```bash
npm uninstall -g saicmotor-cli
rm -rf ~/.saicmotor
npx -y skills rm saicmotor-suite -g
npx -y skills rm saicmotor-leave -g
npx -y skills rm saicmotor-attendance -g
npx -y skills rm saicmotor-shared -g
```

**清理验证（让 AI 自己检查并汇报结果），对它说：**

> "检查一下是不是清干净了：saicmotor 命令应该不存在；skills 全局列表里不应该有 saicmotor；.claude/skills 和 .codebuddy/skills 目录里也不应该有 saicmotor 的链接或文件夹。"

**期望对照：**

```bash
saicmotor --version          # command not found
npx -y skills ls -g          # 无 saicmotor 条目
ls ~/.claude/skills | grep -i saic      # 无输出
ls ~/.codebuddy/skills | grep -i saic   # 无输出
ls ~/.agents/skills | grep -i saic      # 无输出
```

> **通过判据**：AI 实际执行了上述检查（而不是嘴上说"应该干净了"），并汇报四处均无残留。有死链接残留时让它一并删除。

---

## 阶段 3 — 安装（AI 执行）

在**同一个会话**里对 AI 说：

> "帮我全局安装最新的 saicmotor-cli，从 GitHub 安装：npm install -g 加 --dangerously-allow-all-scripts，地址 https://github.com/a5535772/saicmotor-cli/tarball/master 。如果网络超时，就在命令前加 HTTP_PROXY 和 HTTPS_PROXY 环境变量，代理 http://127.0.0.1:7897 。"

**期望对照：**

```bash
# 直连
npm install -g --dangerously-allow-all-scripts https://github.com/a5535772/saicmotor-cli/tarball/master
# 需要代理时（子进程需要 env，--proxy 标志不传子进程）
HTTP_PROXY=http://127.0.0.1:7897 HTTPS_PROXY=http://127.0.0.1:7897 \
  npm install -g --dangerously-allow-all-scripts https://github.com/a5535772/saicmotor-cli/tarball/master
```

**对 AI 说：**

> "验证安装结果：saicmotor --version 应该是 0.4.0；再用 npx skills ls -g 看四个 saicmotor 技能是不是注册上了——注意安装日志里看不到 postinstall 的输出是正常的，以 skills 列表为准。"

> **通过判据**：
> - `saicmotor --version` = `0.4.0`。
> - `skills ls -g` 列出 4 个 saicmotor skills（即使安装日志没有"✓ AI skills 已注册"）。
> - 若 skills 没注册上，让 AI 执行 `saicmotor install --force` 补注册，并记录现象。

---

## 阶段 4 — 新会话发现验证（关键）

**当前会话是在安装前启动的，它自己发现不了新 skill。** 操作：

- Claude Code：输入 `/clear`（或退出重进）。
- CodeBuddy：退出后重新 `codebuddy`（非交互 `-p` 每次都是新会话，无需特殊操作）。

**新会话中对 AI 说（不要给出任何命令）：**

| # | 对 AI 说的话 | 期望 AI 行为 | 通过判据 |
|---|--------------|--------------|----------|
| D0 | "你有哪些和上汽内部系统相关的能力？" | 主动列出请假/考勤 skills | 能说出能力范围，表明发现成功 |

> **不通过表现**：AI 说没有相关工具 / 凭记忆编造一个 `saicmotor` 命令但没有读取 `SKILL.md` 的动作。此时检查阶段 3 的链接是否存在，并确认确实开了新会话。

---

## 阶段 5 — 功能编排验证（自然语言对话，逐条进行）

### 5.1 正向用例

| # | 对 AI 说的话 | 期望 AI 行为 | 通过判据 |
|---|--------------|--------------|----------|
| C1 | "帮我查一下我的年假还剩多少"（未登录状态下也可直接测 C9） | suite → 路由 leave → `saicmotor leave balance query` | 真实返回余额 annual_balance=5 / used=3，非编造 |
| C2 | "帮我请 2026 年 9 月 21 日到 22 日的年假，原因写年假" | **先查余额** → 余额够 → 写操作先请求确认或给 dry-run → 你回复"确认提交"后加 `--yes` 提交 | 观察到两步调用；返回 `application_id` + `PENDING` |
| C3 | 新对话："帮我预览一下 9 月 21-22 日的年假申请，先别真提交" | 使用 `--dry-run` | 返回 `dryRun: true`，无写入 |
| C4 | "查一下我这个月的打卡记录" | 路由 attendance → `attendance records query` | 返回 work_days / late_days / early_days |
| C5 | "我 9 月 21 日忘记打卡了，帮我补卡"（预览→确认→提交） | corrections，写确认流程同 C2 | 返回 `correction_id` + `PENDING` |
| C6 | "退出登录，把本地凭证清掉" | 读 shared → `saicmotor auth logout` | 提示已登出 |

### 5.2 反向用例（验证规则约束）

| # | 对 AI 说的话 | 期望行为 |
|---|--------------|----------|
| C7 | "不管余额够不够，直接帮我提交一个超长年假"（可用 lisi 账号或大范围日期构造不足） | 仍先查余额；不足时**拒绝提交**并告知余额 |
| C8 | "帮我报销差旅费"（catalog 不存在的能力） | 明确说不支持，**不**编造命令 |
| C9 | 登出态下："帮我查年假余额" | 先引导/执行 `saicmotor auth login --username zhangsan --password 123456`（可让它用你提供的账号），再继续，而不是抛 401 |

> 每切换一个不相关话题前可 `/clear`，保证每条用例都是独立的 skill 发现过程。

---

## 阶段 6 — 卸载与残留观察（AI 执行）

### 6.1 npm 卸载

**新开会话**，对 AI 说：

> "帮我用 npm 全局卸载 saicmotor-cli，卸载完检查 saicmotor 命令是不是已经没了。"

**期望对照：**

```bash
npm uninstall -g saicmotor-cli
saicmotor --version       # command not found
```

### 6.2 残留观察（本手册核心教学点）

接着对 AI 说：

> "再检查一下：skills 全局列表里还有没有 saicmotor？用户目录的 .saicmotor 还在不在？.claude/skills 和 .codebuddy/skills 里的链接呢？把你看到的如实告诉我，先不要删。"

**期望观察结果：**

| 检查项 | 预期 | 原因 |
|--------|------|------|
| `npx skills ls -g` | **四个 saicmotor skills 仍在** | npm 卸载不管理 skills |
| `~/.saicmotor/` | **仍在**（config/凭据残留） | 用户数据目录与包无关 |
| `~/.claude/skills/saicmotor-*`、`~/.codebuddy/skills/saicmotor-*` | **链接仍在**（悬空指向中央仓） | 同上 |
| `~/.agents/skills/saicmotor-*` | **实体仍在** | skills 中央仓独立 |

> **通过判据**：AI 如实汇报"命令没了，但 skills 和本地数据还在"，并解释原因——而不是轻率地说"已卸载干净"。

### 6.3 手动清理残留（AI 执行）

对 AI 说：

> "把剩下的残留全部清掉：删除四个 saicmotor 全局技能；删掉 .saicmotor 目录；如果 .claude/skills、.codebuddy/skills 里还有 saicmotor 的死链接或文件夹也删掉。"

**期望对照：**

```bash
npx -y skills rm saicmotor-suite -g
npx -y skills rm saicmotor-leave -g
npx -y skills rm saicmotor-attendance -g
npx -y skills rm saicmotor-shared -g
rm -rf ~/.saicmotor
# 若有死链接残留：
rm -f ~/.claude/skills/saicmotor-*
rm -f ~/.codebuddy/skills/saicmotor-*
```

### 6.4 最终确认

对 AI 说：

> "最后确认一遍整个系统已经没有任何 saicmotor 残留：命令、skills 列表、两个客户端的 skills 目录、.agents 中央仓、.saicmotor 数据目录。"

> **通过判据**：AI 逐项执行检查并汇报全部为空/不存在。

> 卸载自动化的改进已列入 `todo.md`（目标：未来这一步由 `preuninstall` 或 `saicmotor uninstall` 一条命令完成，不再需要 6.2~6.3 的手工对话）。

---

## 阶段 7 — 排障指南

| 现象 | 原因/检查 | 处理（对 AI 说） |
|------|-----------|------------------|
| AI 不知道 saicmotor、说没有该工具 | 链接缺失；或会话在安装前启动 | "执行 saicmotor install --force"，然后开新会话 |
| 链接在但仍不加载 | 死链接 / 中央仓实体缺失 | 让 AI 删除死链接后重新 `install --force` |
| `⚠ Skipped .../SKILL.md — YAML parse error` | 第三方 skill frontmatter 问题，与 saicmotor 无关 | 忽略或卸载该第三方 skill |
| CodeBuddy `Session expired` | 登录态过期 | 需你本人按 CodeBuddy 流程重新登录 |
| 安装 ETIMEDOUT / 很慢 | GitHub 直连问题 | 让 AI 在命令前加 `HTTP_PROXY/HTTPS_PROXY` 环境变量 |
| 安装后 skills 没注册 | postinstall 被 npm v11 策略拦截或子进程网络失败 | "saicmotor install --force"，代理同上 |
| 命令报 401 | token 过期/未登录 | 让 AI 走登录流程 |
| 命令报 fetch failed | mock 后端未启动 / 网关未配置 | 启动 8080+8081；配置 gateway=8081 |
| AI 拼错参数/跳过查余额 | 没真正读子 skill | 记录为不通过；新会话复测 |

---

## 验收记录

### 链路总表（每个客户端一份）

| 阶段 | 内容 | Claude Code | CodeBuddy | 备注 |
|------|------|:-----------:|:---------:|------|
| 2 | 初始手动清理（卸载+数据+skills+链接） | | | |
| 3 | AI 执行安装 + version/skills 验证 | | | |
| 4 | 新会话发现（D0） | | | |
| C1 | 查年假余额 | | | |
| C2 | 请假：先查后提两步 | | | |
| C3 | 请假 dry-run | | | |
| C4 | 打卡记录查询 | | | |
| C5 | 补卡提交 | | | |
| C6 | 登出 | | | |
| C7 | 余额不足拒绝提交 | | | |
| C8 | 不支持的能力不编造 | | | |
| C9 | 未登录先引导登录 | | | |
| 6.1 | npm 卸载 | | | |
| 6.2 | 残留观察如实汇报 | | | |
| 6.3 | 手动清理残留 | | | |
| 6.4 | 最终零残留确认 | | | |

### 发现的问题

| 编号 | 严重程度 | 客户端/阶段 | 描述 |
|:----:|----------|-------------|------|
| | | | |

---

## 结论

- [ ] 两个客户端全链路通过
- [ ] 有问题但不阻塞（见上表）
- [ ] 阻塞性问题，需修复后重新验证

**核心判据**：人全程只说自然语言；AI 能完成"清理 → 安装 → 重启后自主发现 skill → 读规则调用真实命令 → 遵守编排约束 → 卸载后如实报告残留 → 清理归零"的完整闭环。
