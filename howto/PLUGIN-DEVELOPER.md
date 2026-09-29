# saicmotor 插件开发手册

> 面向业务开发者：不 clone 核心仓库、不碰 `src/`，在独立工程里完成全部 skill 开发。

## 目录

- [1. 前置准备](#1-前置准备)
- [2. 项目结构](#2-项目结构)
- [3. 快速开始](#3-快速开始)
- [4. 声明式开发（零代码）](#4-声明式开发零代码)
- [5. 脚本开发（必要时落代码）](#5-脚本开发必要时落代码)
- [6. 本地联调](#6-本地联调)
- [7. 校验](#7-校验)
- [8. 发布](#8-发布)
- [9. SKILL.md 规范](#9-skillmd-规范)
- [10. 排障](#10-排障)
- [附录 A: saicmotor.plugin.json 字段参考](#附录-a-saicmotorpluginjson-字段参考)

---

## 1. 前置准备

- **Node.js ≥ 20**（内置 `fetch`，零 HTTP 依赖）
- **@saicmotor/cli ≥ 0.8.0** 已全局安装
- **内部 npm registry** 已配置（`--registry` flag 或 `.npmrc` scoped config）

### 安装 CLI

```bash
npm install -g @saicmotor/cli --registry=<内部 registry 地址>
saicmotor --version  # 应输出 0.8.0
```

> **推荐使用 `--registry` flag 而非全局 `.npmrc`**：flag 是显式的、一次性的，不会影响本机其他 npm 包。

---

## 2. 项目结构

每个插件包遵循标准结构：

```
plugin-<name>/
├── package.json              # npm 包（@saicmotor/plugin-<name>）
├── tsconfig.json             # TypeScript 编译配置
├── saicmotor.plugin.json     # 插件 manifest（核心声明，含 routes 意图路由）
├── catalog/
│   └── services/
│       └── <name>.json       # 服务声明（API 接口 + 参数）
├── skills/
│   └── saicmotor-<name>/
│       └── SKILL.md          # AI Agent 方向盘
├── scripts/                  # 自定义脚本源码（可选，声明式覆盖不到时才加）
│   └── <service>/
│       └── <resource>/
│           └── <method>.ts   # 与 catalog JSON 树形对应，编译产物在 dist/scripts/
├── src/                      # 源码（如果需要辅助逻辑）
└── test/                     # 测试
```

**关键文件：**

| 文件 | 给谁用 | 必须？ |
|------|--------|:------:|
| `saicmotor.plugin.json` | CLI 引擎（加载时读） | ✅ |
| `catalog/services/*.json` | CLI 引擎（动态注册命令） | ✅ |
| `skills/*/SKILL.md` | AI Agent（发现 + 编排） | ✅ |
| `scripts/**/*.ts` | CLI 引擎（编译后按 manifest.scripts 查找 `.js`，见 §5.2） | ❌（必要时才加） |
| manifest 中的 `routes` 字段 | CLI 引擎（suite 路由聚合） | ❌（无路由需求可不写） |

```text
开发工作流（5 步出插件）

create plugin ──→ 编辑 catalog + SKILL.md ──→ dev 联调 ──→ validate ──→ publish
  生成骨架          声明 API + AI 手册       linked/ 加载   zod 校验    内部 registry
```

> §3 快速开始的编号步骤是上述 5 步的展开（cd + npm install 是环境准备，不单独计步）。

---

## 3. 快速开始

```bash
# 1. 生成骨架
saicmotor create plugin my-system

# 2. 进入工程
cd plugin-my-system
npm install

# 3. 编辑 catalog/services/my-system.json（声明你的 API）
# 4. 编辑 skills/saicmotor-my-system/SKILL.md（给 AI 的说明）
# 5. 本地调试验证
saicmotor dev
saicmotor plugin list           # 确认 linked 可见
saicmotor my-system --help      # 确认命令可用

# 6. 校验通过后发布
saicmotor validate .
npm publish --registry=<内部 registry>
```

---

## 4. 声明式开发（零代码）

**原则：声明式 catalog 能解决就不写 script。**

### 4.1 catalog JSON 结构

```json
{
  "name": "my-system",
  "title": "我的业务系统",
  "description": "业务系统的简要说明",
  "servicePath": "/api/my-system",
  "resources": {
    "items": {
      "methods": {
        "list": {
          "id": "items.list",
          "path": "/items",
          "httpMethod": "GET",
          "description": "查询列表"
        },
        "create": {
          "id": "items.create",
          "path": "/items",
          "httpMethod": "POST",
          "description": "创建记录",
          "requestBody": {
            "name": { "type": "string", "required": true, "description": "名称", "example": "示例" },
            "count": { "type": "integer", "required": false, "description": "数量" }
          },
          "responseBody": {
            "id": { "type": "string", "example": "ITEM-001" },
            "status": { "type": "string", "example": "CREATED" }
          }
        }
      }
    }
  }
}
```

CLI 引擎自动将这个 JSON 编译为：

```bash
saicmotor my-system items list
saicmotor my-system items create --name "示例" --yes
```

**你不需要写任何代码**——引擎自动完成参数解析、HTTP 请求、格式输出。

### 4.2 判定：什么时候需要写 script？

| 场景 | 声明式？ | 需要 script？ |
|------|:---:|:---:|
| 简单的 CRUD 操作（GET/POST/PUT） | ✅ | ❌ |
| 参数校验不需要额外逻辑 | ✅ | ❌ |
| 前置校验（如：查余额够才让提交） | ❌ | ✅ |
| 多步骤编排（如：先登 A 系统取 token 再调 B 系统） | ❌ | ✅ |
| 响应处理/转换/聚合 | ❌ | ✅ |
| 调用非标 HTTP 接口（非 RESTful） | ❌ | ✅ |

```text
何时写 script？

     业务请求
        │
  需要先查再判断 / 多步编排 / 响应聚合？
        │是                    │否
        ▼                      ▼
  写 script 覆盖          声明式 catalog
  scripts/<svc>/<res>/<method>.ts    （零代码）
```

**简记**：如果你的流程需要"先查再判断再决定发不发"，就写 script；如果只是"收到的参数直发给上游"，声明式足够。

---

## 5. 脚本开发（必要时落代码）

### 5.1 脚本签名

```typescript
import type { ScriptContext, ScriptFn, RunResult } from "@saicmotor/sdk";

const submit: ScriptFn = async (ctx: ScriptContext): Promise<RunResult> => {
  // ctx.config     — 网关配置（含 gateway 地址）
  // ctx.service    — 当前 service 声明
  // ctx.method     — 当前 method 声明（含 path, httpMethod, requestBody）
  // ctx.values     — 用户传参（已校验 + 类型转换）
  // ctx.dryRun     — 是否 --dry-run
  // ctx.ensureToken() — 获取/刷新 auth token

  if (ctx.dryRun) {
    return { ok: true, data: { dryRun: true } };
  }

  const token = await ctx.ensureToken();
  const url = `${ctx.config.gateway}${ctx.service.servicePath}${ctx.method.path}`;

  const response = await fetch(url, {
    method: ctx.method.httpMethod,
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(ctx.values),
  });

  const body = await response.json();
  return { ok: true, data: body.data };
};

export default submit;
```

### 5.2 脚本文件位置

脚本的目录树必须与 catalog 声明**完全对应**：

```
catalog/services/my-system.json
  → name: "my-system"
  → resources.items.methods.submit

对应脚本源码路径：
scripts/my-system/items/submit.ts
编译产物（引擎实际查找）：
dist/scripts/my-system/items/submit.js
```

规则：源码放 `scripts/<service名>/<resource名>/<method名>.ts`，`tsc` 编译后在 `dist/scripts/` 下产出同名 `.js`。

**引擎查找路径**（`src/engine/script.ts` 的 `findScript`）按以下顺序找 `.js` 文件：

```
1. $SAICMOTOR_SCRIPTS/<svc>/<res>/<method>.{js,ts}    ← 测试/定制覆盖
2. <插件根>/<manifest.scripts>/<svc>/<res>/<method>.js  ← 插件贡献（★ 唯一插件入口）
3. CLI 包 dist/scripts/<svc>/<res>/<method>.js         ← 内核脚本
```

> **关键**：`manifest.scripts` 指向的目录里必须是**编译后的 `.js`**（引擎不认 `.ts`，也不扫描插件 `dist/` 默认位置）。因此 manifest 应声明编译产物目录：

```json
{ "scripts": "dist/scripts" }
```

> **已知引擎缺陷**（todo 已登记）：当前三个参考插件（leave/attendance/user）manifest 声明 `"scripts": "scripts"` 指向 `.ts` 源码目录，其脚本覆盖实际从未生效（测试用 `SAICMOTOR_SCRIPTS` 覆盖路径验证逻辑，掩盖了该问题）。修复前，新插件按上文「`dist/scripts`」方式声明即可正常工作。

### 5.3 脚本中使用 @saicmotor/sdk

```typescript
import type { ScriptContext, ScriptFn, RunResult } from "@saicmotor/sdk";
```

sdk 只提供类型，不提供引擎代码。脚本自行实现 HTTP 调用（Node 内置 `fetch`）。

---

## 6. 本地联调

```bash
# 在插件工程根目录
saicmotor dev

# 输出：
# ✓ dev link 已建立: ~/.saicmotor/plugins/linked/plugin-my-system → C:\path\to\plugin-my-system
#   全局/npx CLI 已加载该插件
#   解除: saicmotor dev --stop

# 验证
saicmotor plugin list
#   @saicmotor/plugin-my-system@dev  linked → C:\path\to\plugin-my-system  ✓

saicmotor my-system --help  # 对应命令应可用

# 联调完成后解除
saicmotor dev --stop
```

**注意**：`dev` link 的插件**覆盖**同名已安装插件（linked 优先于 registry）。

---

## 7. 校验

```bash
saicmotor validate .
```

校验内容：
- `saicmotor.plugin.json` 存在且 JSON 可解析
- manifest 字段类型符合 zod schema（`name`/`engine` 为非空字符串、`catalog`/`skills` 为字符串数组、`routes` 为字符串映射等）

> **范围注**：`name` 前缀（`@saicmotor/plugin-`）、`engine` semver 有效性、catalog 文件存在性**不在校验范围内**——这些问题会在插件加载期以别的方式暴露（如命令不注册、加载警告）。发现此类问题时先对照「10. 排障」。

```bash
# 通过
✓ manifest 校验通过
✓ 插件校验通过

# 失败（示例）
✗ manifest 校验失败: engine must be a non-empty string
```

---

## 8. 发布

### 8.1 版本号

插件包独立版本号，不跟随核心。推荐 semver：

- `0.1.0` — 初始开发版
- `1.0.0` — 首个正式版
- `1.0.1` — 小修正
- `1.1.0` — 新增功能（向后兼容）

### 8.2 engine 兼容声明

`saicmotor.plugin.json` 中的 `engine` 字段声明插件兼容的核心版本范围：

```json
{
  "engine": "^0.8.0",
  "engine-alt-gte": ">=0.8.0",
  "engine-alt-tilde": "~0.8.0"
}
```

含义：`^0.8.0` 兼容 0.8.x；`>=0.8.0` 兼容 0.8 及以后所有版本；`~0.8.0` 仅兼容 0.8.x 补丁版。同级的三个键仅示意不同 range 写法，实际 manifest 只写一个 `engine` 字段。

每次命令执行时（插件加载期）CLI 检查 `CORE_VERSION` 是否满足插件的 `engine` range。不兼容的插件被禁用并打印警告。

### 8.3 发布流程

```bash
# 1. 确保编译通过
npm run build

# 2. 运行测试
npm test

# 3. 校验通过
saicmotor validate .

# 4. 发布到内部 registry
npm publish --registry=<内部 registry>

# 5. 验证发布
npm view @saicmotor/plugin-my-system version --registry=<内部 registry>
```

---

## 9. SKILL.md 规范

SKILL.md 是 AI Agent 的操作手册。Agent 读取它来决定**什么时候、怎么**调用你的插件。

### 9.1 格式要求

````markdown
---
name: saicmotor-my-system
version: 0.1.0
description: "业务系统的简要说明（AI Agent 用它判断意图）"
metadata:
  requires:
    bins: ["saicmotor"]
---

# 业务系统名

简要说明业务系统的用途和范围。

## Shortcuts

| Shortcut | 说明 |
|----------|------|
| `items list` | 查询列表 |
| `items create` | 创建记录（写操作，需要 `--yes`） |

## 命令详情

### `items list` — 查询列表

```bash
saicmotor my-system items list
```

...

### `items create` — 创建记录

```bash
saicmotor my-system items create --name <名称> --yes
```

**⚠️ 重要**：这是写操作，必须加 `--yes` 或 `--dry-run`。

## 写操作确认

所有 `items create` 会产生副作用：

```bash
# 正确
saicmotor my-system items create --name "测试" --yes

# 预览
saicmotor my-system items create --name "测试" --dry-run
```

## 输出格式

```bash
saicmotor my-system items list --format json     # JSON（默认）
saicmotor my-system items list --format table    # 表格
saicmotor my-system items list --format pretty   # 美化
```
````

### 9.2 Frontmatter 必填字段

| 字段 | 说明 |
|------|------|
| `name` | 与 skill 目录名一致，如 `saicmotor-my-system` |
| `version` | 跟随插件版本号 |
| `description` | AI Agent 用它做意图匹配——写清楚"本 skill 管什么、不管什么" |
| `metadata.requires.bins` | 必须含 `["saicmotor"]` |

> **脚手架用户注意**：`saicmotor create plugin` 生成的 SKILL.md 只含 `name` + `description` 最小骨架，需按本表补齐 `version` 与 `metadata.requires.bins` 后再发布。

### 9.3 写作要点

1. **描述清晰边界**：说清楚"负责什么，不负责什么"——Agent 靠描述判断路由
2. **写操作加警告**：占用 `--yes` 的命令要醒目提示
3. **关联其他 skill**：如果用到了共享能力（如 auth），交叉引用 `saicmotor-shared`
4. **示例要能直接运行**：不要把 `<name>` 做参数名又不给示例值
5. **声明 routes**：在 manifest 中写 `"routes": { "关键词": "saicmotor-xxx" }`——这是 AI 发现你的插件的入口。不声明 routes，意图路由表中就没有指向你的条目，AI 只能靠 skill description 匹配

---

## 10. 排障

### npm install 提示 peer dependency 警告

**原因**：插件包不写 `peerDependencies`（npm ≥7 会自动安装 peer，导致 CLI 嵌套进插件目录）。  
**处理**：忽略——CLI 安装命令自带 `--legacy-peer-deps`。

### `saicmotor dev` 后 `plugin list` 看不到

检查：
```bash
ls ~/.saicmotor/plugins/linked/           # junction 是否建立
cat ~/.saicmotor/plugins/state.json       # 条目是否存在，enabled 是否为 true
```

### `saicmotor my-system` 命令不存在

```bash
# 1. 确认插件已加载
saicmotor plugin list                     # 应有你的插件

# 2. 检查 manifest
saicmotor validate .

# 3. 确认 catalog/services/<name>.json 存在且格式正确
# 4. 检查 engine 兼容（当前核心版本 0.8.0，manifest engine 需满足）
```

### 脚本没有被执行

引擎按 `manifest.scripts` 指定的目录查找**编译后的 `.js`**（见 §5.2 查找顺序）。确认：

```bash
# 1. 编译并确认产物存在
npm run build
ls dist/scripts/<service>/<resource>/<method>.js

# 2. manifest.scripts 指向产物目录（不是 .ts 源码目录）
#    "scripts": "dist/scripts"   ← ✅ 引擎可查到
#    "scripts": "scripts"        ← ❌ 源码是 .ts，引擎不认

# 3. 已发布的包：package.json files 字段须含产物目录
#    "files": [..., "dist/**/*.js"]
```

---

## 附录 A: saicmotor.plugin.json 字段参考

```typescript
{
  // 插件包名，必须与 package.json name 一致（如 "@saicmotor/plugin-my-system"）
  "name": "@saicmotor/plugin-xxx",

  // semver 范围，声明兼容的核心版本（如 "^0.8.0"）
  "engine": "^0.8.0",

  // catalog glob 列表（通常固定为 ["catalog/services/*.json"]）
  "catalog": ["catalog/services/*.json"],

  // skill 目录列表，每项对应 skills/<name>/SKILL.md
  "skills": ["skills/saicmotor-xxx"],

  // scripts 根目录（可选，有 script 覆盖时才需要）——须指向编译产物目录（.js），
  // 如 tsc outDir 为 dist 时声明 "dist/scripts"（见 §5.2）
  "scripts": "dist/scripts",

  // 意图路由（可选，声明后会出现在 saicmotor-suite 的路由表中）
  "routes": {
    "业务关键词": "saicmotor-xxx",
    "另一个说法": "saicmotor-xxx"
  }
}
```

> **注意**：插件包的 `package.json` **不写 `peerDependencies`**。兼容契约仅由 manifest `engine` 字段承担。
