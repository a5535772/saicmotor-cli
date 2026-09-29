# @saicmotor/plugin-attendance

> saicmotor 考勤业务插件——考勤记录查询、补卡申请提交。

---

## 引擎要求

`@saicmotor/cli` ≥ 0.8.0

---

## 安装

```bash
saicmotor plugin install attendance --registry=<内部 registry>
```

---

## 可用命令

```bash
# 查本月考勤记录
saicmotor attendance records query --format table
saicmotor attendance records query --format pretty

# 提交补卡申请
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --dry-run
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --yes
```

---

## 脚本覆盖

`attendance corrections submit` 有自定义脚本——提交前打印 `[script] 补卡申请前校验通过`。脚本在 `scripts/attendance/corrections/submit.ts`，编译后为 `dist/scripts/attendance/corrections/submit.js`。