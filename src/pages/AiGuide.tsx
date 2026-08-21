import * as React from 'react'
import { Bot, Check, Copy, Hand, Terminal, ShieldCheck, ShieldX } from 'lucide-react'
import { toast } from 'sonner'
import { DAILY_SECTIONS, ITEM_STATUS, WEEKLY_SECTIONS } from '@shared/schema'
import { useApp, useToday } from '@/lib/store'
import { copyText, cn } from '@/lib/utils'
import { promptLibrary } from '@/lib/prompts'
import { Button } from '@/components/ui/button'
import { Badge, TagChip } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PageBody, TopBar } from '@/components/layout/PageShell'

const STEPS = [
  {
    n: 1,
    title: '抓取范围内的提交',
    cmd: 'node scripts/collect-git.mjs --type daily --date 2026-08-20',
    desc: '读 workspaces.json，按启用的仓库 + 作者 + 日期过滤，输出统一的提交 JSON。AI 不自己拼 git 命令。',
  },
  {
    n: 2,
    title: 'AI 归纳成条目',
    cmd: '# 产出 patch.json：{ "todayCompleted": "...", "tomorrowPlanDev": "..." }',
    desc: '按模块聚合，一个模块一条，不逐 commit 罗列。补丁里只允许出现 AI 字段。',
  },
  {
    n: 3,
    title: '合并写入',
    cmd: 'node scripts/report.mjs write --type daily --date 2026-08-20 --patch patch.json',
    desc: '脚本负责合并：人工字段从磁盘现有文件原样继承，AI 只能覆盖白名单字段，然后原子写入。',
  },
  {
    n: 4,
    title: '校验',
    cmd: 'node scripts/report.mjs validate',
    desc: '全量校验 data/ 下所有文件。不通过就非零退出并指出具体字段，AI 需自行修复直到通过。',
  },
]

export default function AiGuide() {
  const { workspaces } = useApp()
  const { today, thisWeek, tz } = useToday()
  const prompts = React.useMemo(() => promptLibrary(today, thisWeek), [today, thisWeek])
  const tags = workspaces.filter((w) => w.enabled).map((w) => w.moduleTag)

  return (
    <>
      <TopBar
        title="AI 使用规范"
        subtitle={`报告由 AI Agent 在对话里生成，这里是给你抄的提示词和给 AI 的硬约束 · 时区 ${tz}`}
      />

      <PageBody className="space-y-5">
        <div className="rounded-card border border-primary/20 bg-primary-soft px-4 py-3">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            规范的唯一事实来源是项目根目录的{' '}
            <code className="rounded bg-surface/70 px-1 font-mono text-[11.5px]">docs/AI_SPEC.md</code>，
            Claude Code 会通过{' '}
            <code className="rounded bg-surface/70 px-1 font-mono text-[11.5px]">CLAUDE.md</code> 自动加载。
            本页是它的可视化摘要——<strong className="font-medium text-foreground">改规范请改那个文件，不要改这里</strong>。
          </p>
        </div>

        {/* 提示词 */}
        <section>
          <h2 className="mb-2.5 text-[13.5px] font-semibold tracking-tight">一键复制的提示词</h2>
          <div className="grid gap-2.5 md:grid-cols-2">
            {prompts.map((p) => (
              <PromptCard key={p.id} title={p.title} description={p.description} body={p.body} />
            ))}
          </div>
        </section>

        {/* 四步流程 */}
        <section>
          <h2 className="mb-2.5 text-[13.5px] font-semibold tracking-tight">AI 必须走的四步</h2>
          <div className="space-y-2">
            {STEPS.map((s) => (
              <div key={s.n} className="flex gap-3 rounded-card border border-border bg-surface p-3.5 shadow-card">
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[11.5px] font-semibold text-primary-foreground">
                  {s.n}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-[13px] font-medium">{s.title}</h3>
                  <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">{s.desc}</p>
                  <div className="mt-2 flex items-center gap-2 overflow-x-auto rounded-control bg-surface-sunken px-2.5 py-1.5">
                    <Terminal className="size-3 shrink-0 text-subtle" />
                    <code className="whitespace-nowrap font-mono text-[11.5px] text-muted-foreground">{s.cmd}</code>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 字段归属 */}
        <section>
          <h2 className="mb-2.5 text-[13.5px] font-semibold tracking-tight">字段归属：谁能写哪一段</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>日报</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {DAILY_SECTIONS.map((d) => (
                  <OwnerRow key={d.key} label={d.label} owner={d.owner} />
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>周报</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1.5">
                {WEEKLY_SECTIONS.map((d) => (
                  <OwnerRow key={d.key} label={d.label} owner={d.owner} />
                ))}
              </CardContent>
            </Card>
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-subtle">
            这不是君子协定：<code className="font-mono">report.mjs write</code> 只接受 AI 字段的补丁，
            人工字段永远从磁盘现有文件继承，AI 就算想覆盖也写不进去。
          </p>
        </section>

        {/* 内容格式 */}
        <section>
          <h2 className="mb-2.5 text-[13.5px] font-semibold tracking-tight">正文格式约束</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-success">
                  <ShieldCheck className="size-3.5" />
                  正例
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded-control bg-surface-sunken px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
{`1. 【全局搜索】联调解绑邮箱、解绑手机号微服务（待上线）
2. 【商城】多商城开发（开发中）
3. 【组织权限】跟进测试进度，修复 bug（进行中）`}
                </pre>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-1.5 text-danger">
                  <ShieldX className="size-3.5" />
                  反例
                </CardTitle>
              </CardHeader>
              <CardContent>
                <pre className="whitespace-pre-wrap rounded-control bg-surface-sunken px-2.5 py-2 font-mono text-[11.5px] leading-relaxed text-muted-foreground">
{`1. feat: 新增解绑邮箱接口 (a1b2c3d)   ← 保留了 commit 前缀和 hash
2. 修复了一些问题                      ← 没有模块标签、没有状态
## 商城                                ← 钉钉不渲染标题`}
                </pre>
              </CardContent>
            </Card>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>允许的状态词</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-1.5">
                {ITEM_STATUS.map((s) => (
                  <Badge key={s} variant="neutral">
                    {s}
                  </Badge>
                ))}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>允许的模块标签</CardTitle>
              </CardHeader>
              <CardContent>
                {tags.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {tags.map((t) => (
                      <TagChip key={t} tag={t} />
                    ))}
                  </div>
                ) : (
                  <p className="text-[12px] text-subtle">
                    还没有启用的工作区。先去「Git 工作区」登记仓库，标签才会出现在这里。
                  </p>
                )}
                <p className="mt-2 text-[11.5px] leading-relaxed text-subtle">
                  AI 只能从这个列表里取值，不得自创标签。
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        {/* 禁止事项 */}
        <section>
          <h2 className="mb-2.5 text-[13.5px] font-semibold tracking-tight">明确禁止</h2>
          <Card>
            <CardContent className="space-y-1.5 pt-4">
              {[
                '直接用 Write/Edit 修改 data/reports/** —— 必须走 report.mjs write',
                '覆盖人工字段（明日产品规划、待完成的所有工作、需要协助的事项、下周工作计划）',
                '修改 createdAt、schemaVersion',
                '当天没有提交时编造内容 —— 应如实写「当日无代码提交」',
                '在正文里出现 commit hash、分支名、feat:/fix: 前缀',
                '使用 Markdown 标题、表格、代码块（钉钉不渲染）',
              ].map((t) => (
                <div key={t} className="flex items-start gap-2 text-[12.5px] leading-relaxed">
                  <ShieldX className="mt-0.5 size-3.5 shrink-0 text-danger" />
                  <span className="text-muted-foreground">{t}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </PageBody>
    </>
  )
}

function OwnerRow({ label, owner }: { label: string; owner: 'ai' | 'manual' }) {
  return (
    <div className="flex items-center gap-2 rounded-control bg-surface-sunken/60 px-2.5 py-1.5">
      <span className="flex-1 truncate text-[12.5px]">{label}</span>
      {owner === 'ai' ? (
        <Badge variant="info">
          <Bot />
          AI 生成
        </Badge>
      ) : (
        <Badge variant="outline">
          <Hand />
          手动填写
        </Badge>
      )}
    </div>
  )
}

function PromptCard({ title, description, body }: { title: string; description: string; body: string }) {
  const [copied, setCopied] = React.useState(false)
  return (
    <div className="flex flex-col rounded-card border border-border bg-surface p-3.5 shadow-card transition-shadow hover:shadow-card-hover">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="text-[13px] font-medium">{title}</h3>
          <p className="mt-0.5 text-[11.5px] leading-relaxed text-muted-foreground">{description}</p>
        </div>
        <Button
          variant={copied ? 'soft' : 'secondary'}
          size="sm"
          onClick={async () => {
            const ok = await copyText(body)
            if (ok) {
              setCopied(true)
              toast.success('提示词已复制', { description: '到 Claude Code 会话里粘贴执行' })
              setTimeout(() => setCopied(false), 1800)
            } else {
              toast.error('复制失败')
            }
          }}
        >
          {copied ? <Check /> : <Copy />}
          {copied ? '已复制' : '复制'}
        </Button>
      </div>
      <pre
        className={cn(
          'mt-2.5 flex-1 whitespace-pre-wrap rounded-control bg-surface-sunken px-2.5 py-2',
          'font-sans text-[11.5px] leading-relaxed text-muted-foreground',
        )}
      >
        {body}
      </pre>
    </div>
  )
}
