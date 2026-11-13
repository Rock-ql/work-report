# AI 生成日报/周报规范

> 这是本项目 AI 行为的**唯一事实来源**。
> 月度绩效扩展：使用当月已存在日报的 `todayCompleted` 或用户明确提供的离线清单，不抓取 git；按七项模板据实归纳，只通过 `report.mjs write --type performance --month YYYY-MM --patch …` 写入 `data/performance/`，再执行 `validate`。缺少量化证据时不得编造达标率、缺陷数、无违规或无产出。已有考核默认禁止覆盖；确需替换须先核对人工编辑，再显式 `--replace`。详见 [月度绩效使用说明](PERFORMANCE.md)。下文四步与正文格式约束适用于日报/周报，原人工字段保护不变。
> `CLAUDE.md` / `AGENTS.md` / `.claude/skills/work-report/SKILL.md` 都只是指向这里的入口，不重复定义规则。
> 网页 `/ai-guide` 页面是本文的可视化摘要，同样不是事实来源。

---

## 0. 你在这个系统里的角色

用户通过网页登记了一批 git 仓库（工作区），并手工维护报告里属于"计划/协助"的部分。
**你的职责只有一件事：把这些仓库在指定时间范围内的提交，归纳成人能读的工作条目，写进对应的报告文件。**

你不负责：决定用户明天做什么、替用户写需要协助的事项、编造没有发生过的工作。

---

## 1. 强制四步流程

任何"生成日报/周报"的请求，都必须严格按下面四步执行。**不允许跳步，不允许用别的方式改数据。**

### 第 1 步 · 抓取提交

```bash
node scripts/collect-git.mjs --type daily  --date 2026-08-20
node scripts/collect-git.mjs --type weekly --week 2026-W34
```

- 该脚本会读 `data/workspaces.json`，只扫描 `enabled: true` 的仓库
- 作者过滤、分支限定、日期边界（按 `settings.timezone` 判定）全部由脚本统一处理
- **不要自己拼 `git log` 命令。** 自己拼会导致时区口径、作者过滤与系统不一致
- JSON 结果输出到 stdout，人类可读摘要输出到 stderr

输出结构（节选）：

```jsonc
{
  "scope":   { "type": "daily", "id": "2026-08-20", "start": "...", "end": "..." },
  "range":   { "since": "2026-08-20T00:00:00+08:00", "until": "2026-08-20T23:59:59+08:00" },
  "timezone": "Asia/Shanghai",
  "workspaces": [{ "workspaceId": "ws_x", "name": "全局搜索", "moduleTag": "全局搜索", "commitCount": 7 }],
  "commits": [{ "workspaceId": "ws_x", "moduleTag": "全局搜索", "repo": "全局搜索",
                "hash": "a1b2c3d", "subject": "feat: 新增解绑邮箱接口",
                "authoredAt": "2026-08-20T14:22:01+08:00", "files": 5,
                "insertions": 120, "deletions": 8 }],
  "totals":  { "commits": 12, "repos": 3 },
  "warnings": []
}
```

若 `warnings` 非空（路径不存在、仓库读取失败），**必须在最终回复里如实告诉用户**，不要静默忽略。

### 第 2 步 · 归纳成条目

把 commits 按 `moduleTag` 聚合，写成第 3 节规定的格式。详见第 3 节。

**周报额外要求**：除 commits 外，必须先读当周所有日报（`data/reports/daily/YYYY-MM-DD.json`）的 `todayCompleted`，
把 Git 未体现的工作（部署发布、联调对接、需求沟通/宣讲、方案设计、配置处理、交接等）一并归纳，
并按「3.1 周报的分组」组织成业务/项目层级。

### 第 3 步 · 合并写入

```bash
node scripts/report.mjs write --type daily  --date 2026-08-20 --patch /tmp/patch.json
node scripts/report.mjs write --type weekly --week 2026-W34   --patch /tmp/patch.json
```

补丁也可以走 stdin：`cat patch.json | node scripts/report.mjs write --type daily --date 2026-08-20`

脚本负责：读现有文件 → 只覆盖 AI 字段 → 人工字段原样继承 → schema 校验 → 原子写入。
报告文件不存在时会自动建骨架，无需先跑 `new`。

### 第 4 步 · 校验

```bash
node scripts/report.mjs validate
```

**必须执行，且必须通过（退出码 0）才算完成任务。**
不通过时脚本会指出具体文件与字段路径，按提示修复后重新校验，直到全绿。

---

## 2. 字段归属：你能写什么，不能写什么

机器可读版本见 `schemas/field-ownership.json`。

### 日报 `data/reports/daily/YYYY-MM-DD.json`

| 报告区块 | JSON 字段 | 归属 | 补丁 key |
|---|---|---|---|
| 今日工作完成情况 | `sections.todayCompleted` | **AI** | `todayCompleted` |
| 接下来一天的产品规划工作 | `sections.tomorrowPlan.product` | 人工 | — |
| 接下来一天的开发工作 | `sections.tomorrowPlan.dev` | **AI** | `tomorrowPlanDev` |
| 待完成的所有工作 | `sections.tomorrowPlan.backlog` | 人工 | — |
| 需要协助的事项 | `sections.needHelp` | 人工 | — |

### 周报 `data/reports/weekly/YYYY-Www.json`

| 报告区块 | JSON 字段 | 归属 | 补丁 key |
|---|---|---|---|
| 本周工作完成情况 | `sections.weekCompleted` | **AI** | `weekCompleted` |
| 下周工作计划 | `sections.nextWeekPlan` | 人工 | — |
| 需要协助的事项 | `sections.needHelp` | 人工 | — |

### 补丁允许的完整字段集

```jsonc
// 日报
{
  "todayCompleted":  "1. 【模块】…（状态）",   // 可选
  "tomorrowPlanDev": "1. 【模块】…（状态）",   // 可选
  "commits":         [ /* 第 1 步输出的 commits，原样传入 */ ],  // 可选但推荐
  "workspaceIds":    ["ws_x"],                 // 可选
  "range":           { "since": "...", "until": "..." },        // 可选
  "tags":            ["全局搜索"]              // 可选，留空则由正文自动派生
}

// 周报：把 todayCompleted / tomorrowPlanDev 换成 weekCompleted，其余相同
```

**补丁里出现任何其他 key，`report.mjs write` 会整体拒绝并非零退出。**
这不是提示，是硬约束——人工字段你写不进去，不要尝试绕过。

推荐把第 1 步的 `commits` 原样带上：网页详情页会展示这些原始提交，方便用户核对你有没有漏掉或编造。

---

## 3. 正文格式约束

报告最终会被粘贴到钉钉，**钉钉不渲染 Markdown**。所以正文只能用最朴素的列表。

### 条目格式

```
1. 【模块标签】事项描述（状态）
```

- **模块标签**必须取自 `data/workspaces.json` 里各工作区的 `moduleTag`，**不得自创**
- **状态**必须是以下之一：`已完成`、`开发中`、`进行中`、`联调中`、`待测试`、`待上线`、`已上线`
- 单条不超过 40 字
- `todayCompleted` 通常 3–8 条；条目按模块聚合，**同一模块合并成一条，不逐 commit 罗列**

### 正例

```
1. 【全局搜索】联调测试解绑邮箱、解绑手机号、重置密码微服务（待上线）
2. 【商城】多商城开发（开发中）
3. 【组织权限】跟进测试进度，修复 bug（进行中）
```

### 反例

```
1. feat: 新增解绑邮箱接口 (a1b2c3d)     ← 保留了 commit 前缀和 hash
2. 修复了一些问题                        ← 没有模块标签、没有状态
3. 【前端】优化页面                      ← 「前端」不在 workspaces 的 moduleTag 里
## 商城                                  ← 钉钉不渲染标题
| 模块 | 内容 |                          ← 钉钉不渲染表格
```

### 允许的 Markdown

只允许：有序列表、无序列表、粗体、行内代码。
禁止：标题（`#`）、表格、代码块（``` ```）、图片、HTML。

### 从 commit 到条目的归纳原则

- 剥掉 `feat:` / `fix:` / `chore:` / `refactor:` 等 conventional commit 前缀
- 正文里**不得出现** commit hash、分支名、PR 编号
- 把同一模块的多条提交合并成一句业务描述，用户关心的是"做了什么功能"，不是"提交了几次"
- 状态判定参考：提交里有测试/发布相关内容偏 `待上线`；持续多天的同一主题偏 `开发中`；
  当天新增且看起来收尾的偏 `已完成`。**判断不了就用 `进行中`，不要瞎猜。**

### 3.1 周报的分组：按业务/项目，不区分前后端

周报要让人一眼看出「在推进哪几个项目」，而不是平铺一堆仓库。

- **顶层用业务/项目分组**：同属一个项目的前后端仓库合并到同一组，如「积分服务 + 积分前端 → 【积分商城】」「全局搜索 + 全局搜索前端 → 【全局搜索】」
- **组内不区分前后端**：一条业务事项合并成一句完整描述（后端接口 + 前端展示 + 联调验证），正文里**不写**「后端：」「前端：」前缀
- **分组标签可以超出 `moduleTag`**：项目级标签（如 `积分商城`）或跨项目事务分组（如 `工作交接`）是允许的；`validate` 对未登记标签只警告、不失败，`tags` 字段仍填入对应的 `moduleTag`，保证网页按模块筛选可用
- 组内条目通常 2–8 条，条目仍在 40 字以内、状态词仍取自允许集合

反例（同一业务被前后端拆开，读不出项目全貌）：

```
【积分服务】
1. 新增 NVR 通道数查询接口（已完成）
【积分前端】
1. 设备详情按通道展示增值服务（已完成）
```

正例：

```
【全局搜索】
1. 与运营对接 NVR 增值服务，新增通道数查询接口并按通道展示（已完成）
```

### 3.2 进度口径以日报为准，不夸大

- 生成周报前先读当周日报；**日报是进度的事实基准，Git 提交只是素材**
- 日报只写到「搭框架 / 开始开发」，周报就不得写成「核心功能完成 / 已交付」；提交量大不等于进度快
- 用户明确要求「不想上报那么多」时，按日报措辞收敛条目，只保留日报已体现的推进程度
- 只能写日报或提交里出现过的事实，不能因为代码写完就提前上报未宣布的里程碑

### 「接下来一天的开发工作」怎么写

依据当天提交里**未收尾**的工作推导：状态为 `开发中`/`进行中`/`联调中` 的条目，
写成明天继续推进的形式。如果当天所有工作都已完成，这一段可以留空——留空比编造好。

---

## 4. 明确禁止

1. **禁止**用 Write / Edit / sed 等方式直接修改 `data/reports/**` —— 必须走 `report.mjs write`
2. **禁止**覆盖人工字段：`tomorrowPlan.product`、`tomorrowPlan.backlog`、`needHelp`、周报 `nextWeekPlan`
3. **禁止**修改 `createdAt`、`schemaVersion`
4. **禁止**自己拼 `git log` 命令绕过 `collect-git.mjs`
5. **禁止**在正文出现 commit hash、分支名、`feat:`/`fix:` 前缀
6. **禁止**使用 Markdown 标题、表格、代码块
7. **禁止**自创模块标签（周报 3.1 规定的项目分组标签除外）
8. **禁止**编造。当天/当周没有提交时，如实写「当日无代码提交」/「本周无代码提交」，
   并在回复里告诉用户可能需要手动补充非代码类工作
9. **禁止**只凭 Git 提交归纳周报而忽略当周日报（部署、联调、沟通、方案、交接等可能不在提交里）
10. **禁止**把技术上已完成的工作提前写进周报——进度口径以日报为准（见 3.2）

---

## 5. 常见任务

### 生成今天的日报

```bash
node scripts/collect-git.mjs --type daily --date 2026-08-20 > /tmp/git.json
# 读 /tmp/git.json，归纳后写 /tmp/patch.json
node scripts/report.mjs write --type daily --date 2026-08-20 --patch /tmp/patch.json
node scripts/report.mjs validate
```

### 生成本周周报

```bash
node scripts/collect-git.mjs --type weekly --week 2026-W34 > /tmp/git.json
# 周报按业务/项目聚合整周工作（见 3.1），条目粒度比日报粗，通常 4–8 条/项目
# 写之前先读当周 data/reports/daily/*.json，补上 Git 未体现的工作（见 3.2）
node scripts/report.mjs write --type weekly --week 2026-W34 --patch /tmp/patch.json
node scripts/report.mjs validate
```

### 批量补齐多天日报

逐天独立走一遍四步流程。**不要**把多天的提交混在一份日报里。
全部写完后统一执行一次 `validate`。

### 只更新某一个 AI 字段

补丁里只放那一个 key。其余 AI 字段不出现在补丁里就不会被改动。

---

## 6. 辅助命令

```bash
node scripts/report.mjs new      --type daily --date 2026-08-20   # 建骨架（write 会自动建，一般不需要）
node scripts/report.mjs show     --type daily --date 2026-08-20   # 打印钉钉纯文本，用于自检
node scripts/report.mjs list                                       # 列出已有报告
node scripts/collect-git.mjs --type daily --date 2026-08-20 --workspace 全局搜索   # 只抓一个工作区
pnpm schema:gen                                                    # 改过 shared/schema.ts 后重新生成 schemas/
```

写完后建议跑一次 `show` 自检：看看条目格式、模块标签、状态词是否都符合第 3 节。

---

## 7. 数据文件位置

| 文件 | 说明 |
|---|---|
| `data/workspaces.json` | 工作区（git 仓库）清单，**由网页维护，AI 只读** |
| `data/settings.json` | 全局设置（时区、默认作者、标题），**由网页维护，AI 只读** |
| `data/reports/daily/YYYY-MM-DD.json` | 日报 |
| `data/reports/weekly/YYYY-Www.json` | 周报 |
| `schemas/*.schema.json` | 各文件的 JSON Schema（由 zod 自动生成） |
| `schemas/field-ownership.json` | 字段归属速查表 |

周编号采用 **ISO-8601**（周一为一周之始，含 1 月 4 日的那周为第 1 周）。

---

## 8. 完成任务后的回复

写完并校验通过后，向用户简要汇报：

- 处理了哪个日期/周，抓到多少条提交、涉及哪几个模块
- 生成的条目内容（直接贴出来，方便用户核对）
- 保留了哪些人工字段（`report.mjs write` 的输出里有）
- `collect-git.mjs` 的 warnings（如果有）
- 提示用户可以到网页对应页面编辑，或直接点「复制为钉钉格式」

网页会通过文件监听自动刷新，**不需要**让用户手动刷新页面。
