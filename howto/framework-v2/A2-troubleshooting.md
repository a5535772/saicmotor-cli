# A2 — 排障速查

> 常见错误的症状 → 原因 → 解决方法。按问题的出现频率排序。

---

## 安装阶段

| 症状 | 原因 | 解决 |
|------|------|------|
| `saicmotor` 找不到命令 | Node.js 全局 bin 不在 PATH | 关掉终端重新打开；检查 npm 全局 bin 路径 |
| `npm install -g` 报 registry 错误 | registry 不可达 | 确认 `--registry` 地址正确；检查网络/代理（`HTTP_PROXY`） |
| `npm install -g` 权限不足 | macOS/Linux 全局安装需 sudo 或用 nvm | 用管理员权限或切换到 nvm 管理的 Node 版本 |
| skills 未注册（`ls ~/.claude/skills/saicmotor-*` 为空） | 没执行 `saicmotor install` | `saicmotor install --force` |
| npm v11 警告 skills 未注册 | npm v11 allow-scripts 白名单对 `-g` 无效 | 手动执行 `saicmotor install`（原本的 postinstall 已移除） |
| 安装后 `saicmotor plugin list` 为空（连内核 skill 都不显示） | npm 全局安装路径问题 | 检查 `npm ls -g --depth=0` 确认 @saicmotor/cli 已安装 |

---

## 配置阶段

| 症状 | 原因 | 解决 |
|------|------|------|
| 请求打到 `localhost:8081` | 未配置生产网关 | 写入 `~/.saicmotor/config.json`：`{"gateway": "http://生产地址"}` |
| `SAICMOTOR_GATEWAY` 不生效 | PowerShell 用了 `set` 而非 `$env:` | PowerShell: `$env:SAICMOTOR_GATEWAY="http://地址"`；bash: `export SAICMOTOR_GATEWAY=http://地址` |
| 配置改了没反应 | 需要重新打开终端或重新执行命令 | 环境变量只在当前 shell 生效；用户配置每次 `loadConfig()` 重新读取 |
| 某个 auth.* 字段覆盖不生效 | 用户配置中 auth 是浅合并 | 不需要写完整 auth 块——只写要覆盖的字段即可 |

---

## 插件阶段

| 症状 | 原因 | 解决 |
|------|------|------|
| `leave` 等业务命令不存在 | 插件未安装 | `saicmotor plugin install <name> --registry=<地址>` |
| `plugin install` 失败"短名解析" | registry 上没有 `@saicmotor/plugin-<name>` | 确认 package name 正确，`npm view @saicmotor/plugin-<name> --registry=<地址>` |
| `plugin list` 显示插件但命令不可用 | 插件 engine 不兼容（被跳过） | 检查 manifest `engine` 字段；检查 `CORE_VERSION`（目前 0.8.0） |
| `plugin list` 显示 disabled | 之前被 `disable` 过 | `saicmotor plugin enable <name>` |
| `dev` link 的插件不显示 | junction 建立失败或权限问题 | `ls ~/.saicmotor/plugins/linked/` 确认 junction 存在 |
| 同名 service 冲突 | 两个插件提供相同的 service name | 先加载者胜出，后加载者该 service 被过滤（`plugin list` 有警告） |

---

## 认证阶段

| 症状 | 原因 | 解决 |
|------|------|------|
| "未登录" | 没有 cached token | `saicmotor auth login` |
| OAuth 浏览器不弹出 | 端口 3000 被占用 | 检查 3000 端口 → 释放或改 `loopbackPort` 配置 |
| OAuth 超时 | 在飞书页面停留太久（>2 分钟） | 重新 `saicmotor auth login` |
| `401` 错误 | token 过期 | 引擎自动重试一次（重新登录）→ 如果还是 401，手动 `saicmotor auth login` |
| `password` 模式提示"未登录" | 没有 credentials | `saicmotor auth login --username <工号> --password <密码>` |
| `SAICMOTOR_AUTH_TYPE=password` 不生效 | 环境变量设置错误 | 确认在当前 shell 中设置了变量 |

---

## 引擎执行阶段

### 按退出码定位

| 退出码 | category | 常见原因 | 排查方向 |
|:---:|----------|----------|----------|
| 2 | `validation` | 缺少必填参数、类型不匹配 | 检查命令参数拼写和类型（`--help` 查看） |
| 3 | `auth` | 未登录、token 无效 | `saicmotor auth login` |
| 4 | `network` | 网关不可达、DNS 解析失败、超时 | `curl <网关地址>` 测试连通性；检查代理 |
| 5 | `upstream` | HTTP 4xx/5xx、body.code ≠ 0 | 查看网关日志；检查请求参数是否正确 |
| 6 | `spec` | catalog JSON 不合法、manifest 缺失字段 | `saicmotor validate .` 校验插件 |

### 具体症状

| 症状 | 可能原因 | 排查 |
|------|----------|------|
| 命令返回 `upstream` 错误但网关日志正常 | body.code ≠ 0（业务层错误） | 检查 stderr 中的 `upstream` 字段——含网关返回的 code 和 msg |
| `--format table` 报错"表格输出需要数组数据" | API 返回的不是数组 | 改用 `--format json` 查看实际数据结构 |
| 脚本不执行（走了 HTTP 直连） | `manifest.scripts` 未声明或指向错误 | 检查 `dist/scripts/<svc>/<res>/<method>.js` 存在且 `manifest.scripts` 指向 `dist/scripts` |
| 网络超时（15s） | 网关响应慢或不可达 | `curl -w "\n%{time_total}" <网关地址>` 测延迟 |

---

## 卸载阶段

| 症状 | 原因 | 解决 |
|------|------|------|
| `npm uninstall -g` 后 skills 还在 | preuninstall 被跳过（npx 或非全局） | `saicmotor uninstall` 一键清理 |
| `npm uninstall @saicmotor/plugin-leave` 后残留 | 直接 npm uninstall 不走 saicmotor 流程 | 用 `saicmotor plugin uninstall leave` |
| `rm -rf ~/.saicmotor` 后 CLI 还能用 | CLI 二进制在 npm 全局 bin，与 `~/.saicmotor` 数据分开 | `npm uninstall -g @saicmotor/cli` |
| 卸载后 terminal 仍显示旧结果 | 终端缓存 | 关掉终端重新打开 |

---

## 开发阶段

| 症状 | 原因 | 解决 |
|------|------|------|
| `saicmotor validate .` 失败"engine must be a non-empty string" | manifest 缺少 `engine` 字段 | 加 `"engine": "^0.8.0"` |
| `tsc` 编译报类型错误（插件中） | 插件中 `import` 了 SDK 的 value（而非 type） | 用 `import type { ScriptContext }` 而非 `import { ScriptContext }` |
| `create plugin` 生成的文件不全 | 脚手架只会生成基础骨架，catalog/skill 需要手动填 | 这是预期行为。按 [10 插件开发指南](./10-plugin-development.md) 补充 |
| `saicmotor dev` 后 `plugin list --json` 为空 | linked/ 目录不存在或 junction 建立失败 | 检查 `~/.saicmotor/plugins/linked/` 目录，重新执行 `saicmotor dev` |
| npm install 提示 peer dependency 警告 | 插件不写 peerDependencies，npm ≥7 会提示 | 忽略——CLI 安装命令自带 `--legacy-peer-deps` |

---

## 紧急情况

| 场景 | 命令 |
|------|------|
| 全部重来（从零开始） | `saicmotor uninstall` → 重装 |
| 紧急禁用某个插件 | `saicmotor plugin disable <name>` |
| 强制重装 skills | `saicmotor install --force` |
| 清空 auth 重新登录 | `rm ~/.saicmotor/token.json && saicmotor auth login` |
| 查看当前全部状态 | `saicmotor plugin list --json` + `saicmotor auth status` |