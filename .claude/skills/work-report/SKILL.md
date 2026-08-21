---
name: work-report
description: 生成、补齐或校验工作日报与周报。当用户提到写日报、写周报、生成日报、补日报、本周周报、钉钉日报、汇总这周的工作时使用。会从已登记的 git 工作区提取提交并按规范写入 data/reports/。
---

# 工作日报 / 周报生成

完整规范见 [`docs/AI_SPEC.md`](../../../docs/AI_SPEC.md)——**开始前先读它**，本文只是操作速查。

## 四步流程（不可跳步）

```bash
# 1. 抓取提交（日报用 --date，周报用 --week）
node scripts/collect-git.mjs --type daily --date <YYYY-MM-DD> > /tmp/wr-git.json

# 2. 归纳后写补丁 /tmp/wr-patch.json，只放 AI 字段：
#    日报 { "todayCompleted": "...", "tomorrowPlanDev": "...", "commits": [...] }
#    周报 { "weekCompleted": "...", "commits": [...] }

# 3. 合并写入（人工字段自动继承，报告不存在会自动建）
node scripts/report.mjs write --type daily --date <YYYY-MM-DD> --patch /tmp/wr-patch.json

# 4. 校验，必须退出码 0
node scripts/report.mjs validate
```

## 条目格式

```
1. 【模块标签】事项描述（状态）
```

- 模块标签只能取自 `data/workspaces.json` 的 `moduleTag`，不得自创
- 状态只能是：已完成 / 开发中 / 进行中 / 联调中 / 待测试 / 待上线 / 已上线
- 按模块聚合，同模块合并成一条；单条 ≤ 40 字
- 不出现 commit hash、分支名、`feat:`/`fix:` 前缀
- 只用列表和粗体，不用标题/表格/代码块（钉钉不渲染）

## 红线

- 禁止 Write/Edit 直改 `data/reports/**`
- 禁止覆盖人工字段：明日产品规划、待完成的所有工作、需要协助的事项、下周工作计划
- 禁止自拼 `git log`
- 没有提交时如实写「当日无代码提交」，禁止编造

## 参数速查

| 场景 | 命令 |
|---|---|
| 今天的日报 | `--type daily`（不给 `--date` 默认按配置时区取今天） |
| 指定某天 | `--type daily --date 2026-08-20` |
| 本周周报 | `--type weekly`（不给 `--week` 默认本周） |
| 指定某周 | `--type weekly --week 2026-W34` |
| 自定义区间抓取 | `collect-git.mjs --since 2026-08-01 --until 2026-08-07` |
| 只抓一个工作区 | `collect-git.mjs ... --workspace 全局搜索` |
| 自检输出 | `report.mjs show --type daily --date 2026-08-20` |

## 完成后

向用户汇报：抓到多少提交、涉及哪些模块、生成了什么条目、保留了哪些人工字段、
以及 `collect-git.mjs` 的 warnings（若有）。网页会自动刷新，无需提示用户手动刷新。
