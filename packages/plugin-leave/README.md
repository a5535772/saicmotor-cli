# @saicmotor/plugin-leave

> saicmotor 请假业务插件——年假余额查询、请假申请提交。

---

## 引擎要求

`@saicmotor/cli` ≥ 0.8.0

---

## 安装

```bash
saicmotor plugin install leave --registry=<内部 registry>
```

---

## 可用命令

```bash
# 查年假余额
saicmotor leave balance query
saicmotor leave balance query --format pretty

# 提交请假申请
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --dry-run
saicmotor leave applications submit --start-date 2026-09-21 --end-date 2026-09-22 --reason 年假 --yes
```

---

## 脚本覆盖

`leave applications submit` 有自定义脚本——提交前打印 `[script] 请假申请前校验通过`，你可以在脚本中加参数校验、调用其他 API 等。脚本在 `scripts/leave/applications/submit.ts`，编译后为 `dist/scripts/leave/applications/submit.js`。