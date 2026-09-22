# npm v11 全局安装的三个坑（实测）

> **日期**：2026-09-22
> **环境**：Windows 11, npm 11.17.0, Node v24.19.0
> **背景**：人工验证 `npm install -g <github tarball>` 安装链路时逐一踩中，全部经过实测复现与验证。

---

## 坑 1：`--allow-scripts=<pkg>` 对全局安装（`-g`）不生效

npm v11 的 allowScripts 策略默认阻止安装脚本。按警告提示和文档直觉，加包名白名单应该能放行：

```powershell
npm install -g --allow-scripts=saicmotor-cli https://github.com/a5535772/saicmotor-cli/tarball/master
```

**实测**：警告照出，postinstall 仍然被阻止。试过的所有变体都无效：

| 写法 | 结果 |
|------|------|
| `--allow-scripts=saicmotor-cli` | ❌ |
| `--allow-scripts`（不带值） | ❌ |
| `npm config set allow-scripts=saicmotor-cli --location=user` 后再装 | ❌ |
| `npm approve-scripts saicmotor-cli` 预装（全局包不在本地依赖树，ENOMATCH） | ❌ |
| `--dangerously-allow-all-scripts` | ✅ 唯一有效 |

**教训**：全局安装场景下，`--allow-scripts=<pkg>` 白名单似乎根本不参与解析，只有 `--dangerously-allow-all-scripts` 能绕过。写文档时不要把 `--allow-scripts=<pkg>` 作为全局安装的解决方案。

---

## 坑 2：postinstall 实际跑了，但 stdout 被 npm 吞掉

用 `--dangerously-allow-all-scripts` 安装时，输出只有：

```
added 3 packages in 27s
```

postinstall 里的 `console.log("saicmotor CLI 安装完成")`、`console.log("✓ AI skills 已注册")` **完全不显示**。npm v11 不回传全局安装 lifecycle 脚本的 stdout。

**坑点**：不能凭"没看到成功输出"判断 postinstall 失败。我们一度误判 skills 注册失败，实际 skills 全部注册成功。

**正确验证方式**（不依赖安装输出）：

```powershell
npx -y skills ls -g
```

看到 `saicmotor-suite/leave/attendance/shared` 即在。或直接跑 `saicmotor install --force`，显示"已安装，跳过"也说明此前注册成功。

**教训**：安装成功与否要看产物（skills 目录 / 命令可用），不要看安装日志里有没有 lifecycle 输出。

---

## 坑 3：`--proxy` 不传给 postinstall 的子进程

GitHub 直连超时，给 npm 加代理标志：

```powershell
npm install -g --dangerously-allow-all-scripts --proxy http://127.0.0.1:7897 --https-proxy http://127.0.0.1:7897 <url>
```

npm 下载 tarball 走了代理（安装成功），但 postinstall 里执行的 `npx skills add ...` 是**独立子进程**，不继承 npm 的 proxy 配置；它连 GitHub 照样超时，skills 注册静默失败。

**正确做法**：用环境变量设代理（子进程会继承）：

```powershell
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
npm install -g --dangerously-allow-all-scripts <url>
```

**教训**：npm 的 `--proxy` 只管 npm 自身的网络请求；lifecycle 脚本里的网络调用需要靠 `HTTP_PROXY/HTTPS_PROXY` 环境变量。

---

## 最终可用的安装命令（需要代理的环境）

```powershell
set HTTP_PROXY=http://127.0.0.1:7897
set HTTPS_PROXY=http://127.0.0.1:7897
npm install -g --dangerously-allow-all-scripts https://github.com/a5535772/saicmotor-cli/tarball/master
npx -y skills ls -g    # 验证 skills 真的注册上，别信安装日志
```

根本出路仍是 [[npm-registry-publish-strategy]]：发布到可访问的内部 registry 后，`npm install -g saicmotor-cli` 全走内网，以上三个坑全部消失。