# work-report — Agent 指南

本项目的 AI 行为规范以 [`docs/AI_SPEC.md`](docs/AI_SPEC.md) 为**唯一事实来源**，
生成日报/周报前必须先读它。本文件与 `CLAUDE.md` 均只是入口，不重复定义规则。

**最高优先级：`data/` 是用户的真实数据，不是测试场。**
任何测试/验证/截图都必须跑沙箱：`pnpm sandbox:seed` + `pnpm dev:sandbox`，
或对脚本设 `WR_DATA_DIR=.sandbox/data`。禁止为测试清空或覆盖真实 `data/`。
误操作后用 `node scripts/report.mjs backups` / `restore --snapshot <文件名>` 回滚。

其余不可协商的红线：

- 报告文件只能通过 `node scripts/report.mjs write` 修改，禁止 Write/Edit 直改 `data/reports/**`
- 人工字段（明日产品规划、待完成的所有工作、需要协助的事项、下周工作计划）AI 永不覆盖
- 提交提取只能走 `node scripts/collect-git.mjs`，禁止自拼 `git log`
- 任务完成的判定标准：`node scripts/report.mjs validate` 退出码为 0
