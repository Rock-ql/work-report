# work-report

工作日报/周报可视化系统。网页负责圈定 git 工作范围与编辑查看，**报告内容由 AI 在对话里生成**。

## ⛔ data/ 是用户的真实数据，不是你的测试场

`data/` 下是用户手工配置的工作区和写过的报告，**代表不可再生的人工投入**。

**任何形式的测试、验证、演示、截图，都必须跑在沙箱数据目录里：**

```bash
pnpm sandbox:seed      # 往 .sandbox/data 灌假数据（拒绝在真实目录运行）
pnpm dev:sandbox       # 用沙箱数据启动，页面顶部会有黄色横幅
WR_DATA_DIR=.sandbox/data node scripts/report.mjs write ...   # 脚本同理
```

不可协商：

1. **禁止**为了测试而清空、重置或覆盖 `data/workspaces.json`、`data/settings.json`、`data/reports/**`
2. **禁止**在真实 `data/` 上跑浏览器自动化 —— 用 `pnpm dev:sandbox`
3. 需要造数据就设 `WR_DATA_DIR`，绝不直接写真实目录
4. 真要改真实数据（用户明确要求时），先 `node scripts/report.mjs backups` 确认有快照
5. 误删误改了：`node scripts/report.mjs backups` 找快照，`restore --snapshot <文件名>` 回滚

写入保护由 `server/data-fs.mjs` 统一实现（快照 + 原子写），网页 API 和 node 脚本共用同一份，
没有旁路。但保护是兜底，**不是你可以随便动真实数据的理由**。

---

## 生成日报/周报时

**必须先读 [`docs/AI_SPEC.md`](docs/AI_SPEC.md) 并严格遵循。** 那是唯一事实来源。

核心约束（细则见规范文件）：

1. 走强制四步：`collect-git.mjs` → 归纳 → `report.mjs write` → `report.mjs validate`
2. **禁止**用 Write/Edit 直接改 `data/reports/**`
3. **禁止**覆盖人工字段（明日产品规划、待完成的所有工作、需要协助的事项、下周工作计划）
4. 正文格式固定为 `1. 【模块标签】事项描述（状态）`，模块标签取自 `data/workspaces.json`
5. 任务完成的标志是 `node scripts/report.mjs validate` 退出码为 0

```bash
node scripts/collect-git.mjs --type daily --date 2026-08-20 > /tmp/git.json
node scripts/report.mjs write --type daily --date 2026-08-20 --patch /tmp/patch.json
node scripts/report.mjs validate
```

## 开发这个项目本身时

| | |
|---|---|
| 启动 | `pnpm dev`（数据读写中间件挂在 dev/preview server 上，静态部署无 API） |
| 类型检查 | `pnpm typecheck` |
| 构建 | `pnpm build` |
| 改了 `shared/schema.ts` | 必须跑 `pnpm schema:gen` 重新生成 `schemas/` |

- `shared/schema.ts`（zod）是数据契约唯一事实来源，前端、中间件、node 脚本全部复用
- `shared/date.ts` 的时区函数是日期口径的正解入口；判断"今天"一律用 `dateKeyInTz`，不要用 `dateKey`
- `server/data-api-plugin.ts` 是 Vite 插件形态的本地文件 API，含乐观锁与 SSE 文件监听
- `scripts/*.mjs` 通过 `_shared.mjs` 用 esbuild 动态加载 TS，改 TS 后脚本会自动重建，无需手动同步
