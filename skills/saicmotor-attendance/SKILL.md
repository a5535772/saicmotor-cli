---
name: saicmotor-attendance
version: 1.0.0
description: "考勤系统：查询打卡记录、申请补卡。当用户需要查考勤、打卡记录、申请补卡时使用。不负责：请假（走 saicmotor-leave）。"
metadata:
  requires:
    bins: ["saicmotor"]
  cliHelp: "saicmotor attendance --help"
---

# 考勤 (attendance)

**CRITICAL — 开始前 MUST 先用 Read 工具读取 [`../saicmotor-shared/SKILL.md`](../saicmotor-shared/SKILL.md)，其中包含认证、配置处理。**

## Shortcuts

| Shortcut | 说明 |
|----------|------|
| `records query` | 查询本月打卡记录 |
| `corrections submit` | 申请补卡（写操作，需要 `--yes`） |

## 命令详情

### `records query` — 查打卡记录

```bash
saicmotor attendance records query
```

返回：

| 字段 | 类型 | 说明 |
|------|------|------|
| `work_days` | integer | 应出勤天数 |
| `late_days` | integer | 迟到天数 |
| `early_days` | integer | 早退天数 |

用法提示：
- 无参数，直接返回当前登录用户的当月考勤统计。

### `corrections submit` — 申请补卡

```bash
saicmotor attendance corrections submit --date <补卡日期> --reason <补卡原因> --yes
```

参数：

| 参数 | 必填 | 格式 | 说明 |
|------|------|------|------|
| `--date` | 是 | `YYYY-MM-DD` | 需要补卡的日期 |
| `--reason` | 是 | 字符串 | 补卡原因 |

返回：

| 字段 | 类型 | 说明 |
|------|------|------|
| `correction_id` | string | 补卡申请单号 |
| `status` | string | 状态（`PENDING` = 待审批） |

**⚠️ 重要**：这是写操作（POST），必须加 `--yes` 确认。

## 写操作确认

所有 `corrections submit` 会产生副作用，默认要求 `--yes`：

```bash
# 正确
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --yes

# 预览
saicmotor attendance corrections submit --date 2026-09-21 --reason 忘记打卡 --dry-run
```

## 输出格式

```bash
saicmotor attendance records query --format json    # JSON（默认）
saicmotor attendance records query --format table   # 表格
saicmotor attendance records query --format pretty  # 美化
```

## 不在本 skill 范围

- 请假、年假 → [saicmotor-leave](../saicmotor-leave/SKILL.md)
- 登录/登出/配置 → [saicmotor-shared](../saicmotor-shared/SKILL.md)

**注意（强制性）：**
- 日期参数必须使用 `YYYY-MM-DD` 格式。