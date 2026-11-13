# work-report · 工作日报 / 周报可视化系统

用可视化的方式**圈定 git 工作范围**，用 AI Agent **生成报告内容**，用漂亮的 Markdown 编辑器**快速编辑查看**。

报告最终产出是钉钉可直接粘贴的纯文本。

```
浏览器 (React SPA)  ──HTTP──>  Vite 中间件 /api/*  ──fs──>  data/*.json
                                                              ↑
Claude Code Agent ──node scripts/report.mjs write──────────────┘
                  <──SSE /api/events (fs.watch) ── 网页自动刷新
```

无后端服务、无数据库。`data/` 下是普通 JSON 文件，可 git 追踪、可手改。

---

## 快速开始

```bash
pnpm install
pnpm dev            # http://localhost:5273
```

1. 打开 **设置**，确认时区与默认 git 作者邮箱（时区默认中国标准时间 `Asia/Shanghai`）
2. 打开 **Git 工作区** → **扫描文件夹**，填一个目录（如 `~/Documents`）批量找出所有 git 仓库。
   列表会显示每个仓库近 90 天里**属于你的提交数**，默认帮你勾好有你提交的那些；
   名称和**模块标签**可以就地改。模块标签就是报告正文里 `【xxx】` 的取值，建议改成你惯用的中文短名
3. 在 Claude Code 里执行 `/work-report`，或到 **AI 使用规范** 页复制现成的提示词
4. AI 写完，网页会自动刷新出结果。补上人工字段，点 **复制为钉钉格式**，粘贴到钉钉

---

## 月度绩效考核

侧栏 **月度绩效** → 选择月份 → 从系统日报或线下 `.md` / `.txt` 清单生成七项初稿 → 编辑保存、逐项复制或下载。
网页使用本地规则整理，不伪造达标率；AI Agent 可依据同一来源归纳七段完成情况。详见 [`docs/PERFORMANCE.md`](docs/PERFORMANCE.md)。

---

## 人机分工

报告分成两类字段，界限由代码强制执行，不是靠约定：

| | 日报 | 周报 |
|---|---|---|
| **AI 生成** | 今日工作完成情况<br>接下来一天的开发工作 | 本周工作完成情况 |
| **人工填写** | 接下来一天的产品规划工作<br>待完成的所有工作<br>需要协助的事项 | 下周工作计划<br>需要协助的事项 |

`scripts/report.mjs write` 只接受 AI 字段的补丁，人工字段一律从磁盘现有文件继承。
**AI 即使把人工字段塞进补丁也会被整体拒绝并非零退出** —— 你手写的内容不会被覆盖。

---

## AI 规范

[`docs/AI_SPEC.md`](docs/AI_SPEC.md) 是 AI 行为的**唯一事实来源**。
`CLAUDE.md`、`AGENTS.md`、`.claude/skills/work-report/SKILL.md` 和网页的 `/ai-guide` 页面都只是入口，不重复定义规则。

AI 必须走的四步：

```bash
node scripts/collect-git.mjs --type daily --date 2026-08-20 > /tmp/git.json   # 1 抓取
#                                                                              2 归纳成 patch.json
node scripts/report.mjs write --type daily --date 2026-08-20 --patch patch.json  # 3 合并写入
node scripts/report.mjs validate                                              # 4 校验（必须退出码 0）
```

正文格式固定为 `1. 【模块标签】事项描述（状态）`，模块标签只能取自 `data/workspaces.json`，
状态只能是 `已完成 / 开发中 / 进行中 / 联调中 / 待测试 / 待上线 / 已上线`。

---

## Git 工作区

两种登记方式：

- **扫描文件夹**（推荐）— 递归找出目录下所有 git 仓库。找到 `.git` 就不再往下走，
  所以不会把依赖目录里的仓库也捞进来；跳过 `node_modules`、`dist`、`Library` 等无关目录。
  实测扫描整个 home 目录（深度 4）约 1.9 秒。结果按最近提交时间排序，
  并标出已登记过的仓库避免重复导入
- **手动添加** — 单个填路径，失焦即校验（目录在不在、是不是仓库、子目录自动纠正到仓库根），
  并列出该仓库近半年的提交者供你勾选作者过滤

**模块标签必须全局唯一**，且不超过 20 字 —— 导入前弹窗里就会校验并指出冲突，不会等到写库才报错。

---

## 数据安全

`data/` 下是你手工配置的工作区和写过的报告——不可再生的人工投入。两层保护：

**1. 沙箱隔离**：`WR_DATA_DIR` 环境变量可把数据目录整体挪走。
任何开发、测试、演示都跑沙箱，结构上就碰不到真实数据：

```bash
pnpm sandbox:seed     # 往 .sandbox/data 灌假数据（在真实目录下会硬性拒绝执行）
pnpm dev:sandbox      # 用沙箱数据启动，页面顶部有黄色横幅提示
pnpm sandbox:reset    # 重置沙箱
```

**2. 自动快照**：任何覆盖或删除前，旧内容自动存一份到 `data/.backups/`，每个文件滚动保留 40 份。

```bash
pnpm backups                                        # 查看所有快照
pnpm backups -- --file workspaces.json              # 只看某个文件
pnpm restore -- --snapshot workspaces.20260821-001755.json   # 回滚（恢复前也会再存一份）
```

写入保护由 `server/data-fs.mjs` 统一实现，网页 API 与 node 脚本共用同一份，没有旁路。

---

## 命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动开发服务器（含数据读写中间件） |
| `pnpm build` / `pnpm preview` | 构建并预览（中间件同样挂在 preview 上） |
| `pnpm dev:sandbox` | 用沙箱假数据启动，不碰真实 `data/` |
| `pnpm sandbox:seed` / `pnpm sandbox:reset` | 灌入/重置沙箱数据 |
| `pnpm backups` / `pnpm restore` | 查看快照 / 从快照回滚 |
| `pnpm typecheck` | 类型检查 |
| `pnpm schema:gen` | 改过 `shared/schema.ts` 后重新生成 `schemas/` |
| `node scripts/collect-git.mjs --help` | 提交抓取 |
| `node scripts/report.mjs --help` | 报告读写与校验 |

> 数据 API 由 Vite 插件提供，只在 `dev` / `preview` 下可用。
> 把 `dist/` 当纯静态托管时没有 `/api`，网页会提示无法读取本地数据。

---

## 目录

```
data/                 唯一数据源（AI 与网页共同读写）
  .backups/             自动快照，覆盖或删除前留档
  settings.json         全局设置        · 网页维护，AI 只读
  workspaces.json       git 工作区清单  · 网页维护，AI 只读
  reports/daily/YYYY-MM-DD.json
  reports/weekly/YYYY-Www.json
schemas/              由 zod 自动生成的 JSON Schema，给 AI 读
scripts/              collect-git / report / gen-schema
shared/               schema.ts(zod) + date.ts(时区) + format.ts(钉钉导出)，三端共用
server/               Vite 插件形态的本地文件 API（乐观锁 + SSE）
  data-fs.mjs           数据写入的唯一出口：快照 + 原子写，网页与脚本共用
src/                  React 应用
docs/AI_SPEC.md       AI 规范唯一事实来源
```

---

## 几个设计要点

- **`shared/schema.ts`（zod）是数据契约唯一事实来源**：前端表单、中间件校验、node 脚本、
  给 AI 读的 JSON Schema 全部由它派生，不会出现多处定义漂移
- **时区独立于机器时区**：报告的"哪一天"按 `settings.timezone` 判定。
  笔记本设成美西、人在国内时，半夜的提交才不会落到错误的日期上
- **乐观锁**：网页保存时带上基线 `updatedAt`，磁盘被 AI 改过就返回 409，
  弹窗让你选「加载磁盘版本」还是「保留我的编辑并覆盖」，不会静默丢失内容
- **SSE 文件监听**：AI 写完文件，网页无需刷新即时更新
- **原子写**：临时文件 + rename，网页永远读不到写了一半的 JSON
- **坏数据不白屏**：不符合 schema 的文件在列表里显示为「数据异常」并给出具体字段
- **周编号采用 ISO-8601**（周一为一周之始），前端、中间件、脚本共用同一份周算法
