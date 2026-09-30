# Story — skillsAlreadyInstalled 判定粒度修正（支持升级补装新 skill/客户端）

> **来源**：Sprint 8 代码质量评审 L8（见 [sprint-8-code-quality-review-2.0.md](../sprint-1-8/sprint-8-code-quality-review-2.0.md)）
> **状态**：⏸ 稍后处理（backlog）
> **优先级**：🟢 低（体验，当前核心 skills 集合稳定）
> **提出时间**：2026-09-30

---

## 问题

`install/skills.ts` 的 `skillsAlreadyInstalled()` 以「**任意**一个客户端目录里存在**任意**一个内置 skill」即返回 `true`，导致 `installSkills()`（不带 `--force`）整体跳过。

真实影响场景：后续 CLI 升级若**新增内置 skill**，或 `AI_CLIENT_SKILL_DIRS` **新增客户端**，用户再跑 `saicmotor install` 时旧 skill 已存在 → 直接跳过 → 新 skill / 新客户端永远不注册。用户通常不知道要加 `--force`。

## 为什么延后（不修原因）

- 当前核心 skills 集合与客户端集合稳定，短期内无「新增」触发条件。
- `registerSkill()` 本身幂等（已存在目标返回 `method: "skipped", reason: "目标已存在"`），真正干活的层没问题，只差这道过早跳过。
- 有 `--force` 可全量重装规避。

## 修复方向（推荐甲，待实现）

把判定改精确：仅当**每个 skill × 每个客户端**都已存在才返回 `true`；任一缺失返回 `false` 走注册循环（`registerSkill` 对已存在者幂等跳过）。

```typescript
export function skillsAlreadyInstalled(): boolean {
  const coreSkills = listCoreSkills();
  for (const [client, clientSkillsDir] of Object.entries(AI_CLIENT_SKILL_DIRS)) {
    for (const skillName of coreSkills) {
      if (!fs.existsSync(path.join(clientSkillsDir, skillName))) return false; // 任一缺失 → 需补装
    }
  }
  return true;
}
```

## 触发条件（何时捡起）

- 核心包新增内置 skill，或 `AI_CLIENT_SKILL_DIRS` 新增客户端时一并处理。

## 验收标准

- 新增一个内置 skill 后，`saicmotor install`（不带 `--force`）能补装该 skill，而非整体跳过。
- 全部已存在时仍打印「AI skills 已安装，跳过」。
