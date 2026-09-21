# Sprint 2 — Attendance 集成测试补齐

> **状态**: ✅ 完成 | **时间**: 2026-09-21

## Sprint 2.0

### 目标

补齐另一个会话改造后（mock-leave-server → mock-services，新增 AttendanceController）的测试覆盖。

### 完成项

#### 1. Attendance 集成测试

新文件 `test/integration/attendance-gateway.test.ts`，3 个测试：

| 测试 | 覆盖 |
|------|------|
| `records then corrections round-trips through gateway` | 查打卡记录 → 提交补卡 → 验证 token 缓存（只登录一次） |
| `rejects missing required param before sending` | 不传 `date` → `coerceFields` 抛 validation error，不走到 HTTP |
| `dry-run shows preview without sending` | `--dry-run` 只预览请求，不做 HTTP 调用 |

### 测试结果

13 test files, 46 tests, all passing ✅

---

## Sprint 2.1 — 测试覆盖对称补齐 + 401 重登集成

> **状态**: ✅ 完成 | **时间**: 2026-09-21

### 目标

leave 集成测试与 attendance 不对称（1 vs 3 个），且 401 自动重登只在单元层测了。补齐集成层的覆盖。

### 完成项

#### 1. leave 集成测试补齐 → 对称 4 个

`test/integration/leave-gateway.test.ts` 新增 3 个测试：

| 测试 | 覆盖 |
|------|------|
| `rejects missing required param before sending` | 不传 `start_date` → `coerceFields` 抛 validation error |
| `dry-run shows preview without sending` | `--dry-run` 只预览，不走 HTTP |
| `relogs in on 401 and retries successfully` | 预埋过期 token → 401 → 自动重登 → 重试成功 |

#### 2. attendance 集成补齐 401 重登

`test/integration/attendance-gateway.test.ts` 新增 1 个测试：

| 测试 | 覆盖 |
|------|------|
| `relogs in on 401 and retries successfully` | 过期 token → 401 → 自动清缓存重登 → 重试成功 |

#### 3. 测试结果

13 test files, 50 tests, all passing ✅

#### 4. 覆盖率矩阵

| 场景 | leave | attendance | unit (run) |
|------|-------|------------|------------|
| happy-path round-trip | ✅ | ✅ | ✅ |
| rejects missing required param | ✅ | ✅ | — |
| dry-run preview | ✅ | ✅ | ✅ |
| 401 auto re-login + retry | ✅ | ✅ | ✅ |
| upstream error (code≠0) | — | — | ✅ |

### 发现的问题

无。现有代码结构完好，源代码无需任何修改。