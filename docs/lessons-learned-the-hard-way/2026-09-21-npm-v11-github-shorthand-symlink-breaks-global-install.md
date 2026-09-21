# 2026-09-21 — npm v11 `github:` 简写全局安装用 symlink 导致文件丢失

## 现象

```powershell
npm install -g github:a5535772/saicmotor-cli
```

看起来成功（`added 3 packages`），但 `saicmotor --help` 报 `MODULE_NOT_FOUND`：

```
Error: Cannot find module 'C:\Users\21452\AppData\Roaming\npm\node_modules\saicmotor-cli\scripts\run.js'
```

检查发现 `node_modules/saicmotor-cli/` 目录是**空的**。

## 根因

npm v11 (11.17.0) 对 `github:user/repo` 简写的处理变了：

```bash
$ npm ls -g --depth=0
saicmotor-cli@ -> .\..\..\Local\npm-cache\_cacache\tmp\git-cloneQ94Hod

$ readlink node_modules/saicmotor-cli
/c/Users/21452/AppData/Local/npm-cache/_cacache/tmp/git-cloneQ94Hod

$ ls /c/Users/21452/AppData/Local/npm-cache/_cacache/tmp/git-cloneQ94Hod/
# 空目录！
```

npm v11 创建了一个 **symlink** 指向 `_cacache/tmp/git-cloneXXXXX/` 临时目录，但这个临时目录在 `npm install` 完成前/后被清理了。

这导致：
1. `prepare` 钩子运行在空目录中 → 失败（但我们的 prepare 已无害化）
2. `postinstall` 钩子运行在空目录中 → `MODULE_NOT_FOUND`（但我们的 `|| true` 兜住了）
3. 安装完成后 `saicmotor` 命令不可用 — **CLI 入口 run.js 不在 symlink 目标中**

## 验证

三种安装方式对比（同一 npm v11.17.0）：

| 安装命令 | 结果 | 原因 |
|----------|------|------|
| `github:a5535772/saicmotor-cli` | ❌ 空目录 | symlink → 已清理的 temp |
| `git+https://github.com/a5535772/saicmotor-cli.git` | ❌ 空目录 | 同上 |
| `https://github.com/a5535772/saicmotor-cli/tarball/master` | ✅ 正常 | 正常文件复制 |
| `file:D:/path/to/local` | ✅ 正常 | 正常文件复制 |

## 修复

### 短期 — 更新安装文档

将推荐安装方式从 `github:user/repo` 改为 tarball URL：

```bash
npm install -g https://github.com/a5535772/saicmotor-cli/tarball/master
```

### 长期

- 等 npm v11 修复此回归（或我们找到 workaround）
- 或发布到 npm registry（`npm install -g saicmotor-cli`）彻底绕开 GitHub 安装路径

## 教训

- **npm v11 的 `github:` 语法行为已变。** 不要假设旧版 npm 的 `github:` 安装路径在新版中仍然有效。
- **tarball URL 是最稳定的 GitHub 安装方式。** `https://github.com/user/repo/tarball/branch` 对 npm v10 和 v11 都有效。
- **Symlink 安装 vs 文件复制。** npm v11 倾向于在可能的情况下使用 symlink（`github:`、`git+https://`），但在全局安装场景中这引入了新的故障模式。
- **我们的 bin shim 架构是正确且必要的。** 即使 npm 正确安装了所有文件，`scripts/run.js` 提供了清晰的错误信息（而不是晦涩的 Node.js 模块错误），对标 feishu-cli 的弹性设计理念。
- **postinstall `|| true` 兜底有效但不够。** 如果连文件都不存在，`|| true` 只能防止安装中断，不能修复文件缺失问题。