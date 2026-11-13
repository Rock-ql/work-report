import * as React from 'react'
import { useNavigate, useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  ChevronDown,
  ClipboardCopy,
  CloudOff,
  Copy,
  Download,
  FileWarning,
  GitCommitHorizontal,
  Loader2,
  RotateCcw,
  Sparkles,
  Trash2,
} from 'lucide-react'
import { toast } from 'sonner'
import type { Report, ReportType, SectionDef } from '@shared/schema'
import { sectionsOf } from '@shared/schema'
import { toDingTalkBlocks, toDingTalkText, toMarkdownFile } from '@shared/format'
import { weekdayCn, weekRange } from '@shared/date'
import { api, ApiError } from '@/lib/api'
import { useApp } from '@/lib/store'
import { cn, copyText, downloadText, formatTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Badge, TagChip } from '@/components/ui/badge'
import { Tip } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { PageBody, Skeleton, TopBar, EmptyState } from '@/components/layout/PageShell'
import { SectionCard } from '@/components/editor/SectionCard'
import { MarkdownPreview } from '@/components/editor/Preview'
import type { EditorMode } from '@/components/editor/MarkdownEditor'
import { parseReportFile } from '@/lib/events'
import { generatePrompt, regeneratePrompt } from '@/lib/prompts'

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

/** 读写 sections 上的点号路径，如 tomorrowPlan.dev */
function readPath(obj: any, path: string): string {
  return path.split('.').reduce((acc, k) => (acc == null ? undefined : acc[k]), obj) ?? ''
}
function writePath<T>(obj: T, path: string, value: string): T {
  const keys = path.split('.')
  const clone: any = structuredClone(obj)
  let cur = clone
  for (let i = 0; i < keys.length - 1; i++) cur = cur[keys[i]]
  cur[keys[keys.length - 1]] = value
  return clone
}

export default function ReportDetail() {
  const { type, id } = useParams<{ type: ReportType; id: string }>()
  const navigate = useNavigate()
  const { workspaces, settings, saveSettings, lastChangedFiles } = useApp()

  const [report, setReport] = React.useState<Report | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saveState, setSaveState] = React.useState<SaveState>('idle')
  const [savedAt, setSavedAt] = React.useState<string>('')
  const [conflict, setConflict] = React.useState<{ disk: Report; diskUpdatedAt: string } | null>(null)
  const [showCommits, setShowCommits] = React.useState(false)
  const [mode, setMode] = React.useState<EditorMode>(settings?.editorMode ?? 'split')

  /** 磁盘基线：保存时带上做乐观锁 */
  const baseRef = React.useRef<string>('')
  const dirtyRef = React.useRef(false)
  /** 每次本地改动 +1，用来判断保存回包到达时用户是否又在打字 */
  const editSeqRef = React.useRef(0)
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null)

  const tags = React.useMemo(
    () => workspaces.filter((w) => w.enabled).map((w) => w.moduleTag),
    [workspaces],
  )
  const defs: SectionDef[] = React.useMemo(() => (type ? sectionsOf(type) : []), [type])

  React.useEffect(() => {
    if (settings?.editorMode) setMode(settings.editorMode)
  }, [settings?.editorMode])

  // ---------------------------------------------------------------- 载入
  const load = React.useCallback(
    async (opts: { create?: boolean } = {}) => {
      if (!type || !id) return
      setLoading(true)
      try {
        const data = opts.create ? await api.createReport(type, id) : await api.getReport(type, id)
        setReport(data)
        baseRef.current = data.updatedAt
        dirtyRef.current = false
        setSaveState('idle')
        setError(null)
      } catch (e) {
        if (e instanceof ApiError && e.status === 404 && !opts.create) {
          // 不存在就直接建骨架，省掉一次"要不要创建"的确认
          return load({ create: true })
        }
        setError(e instanceof ApiError ? [e.message, ...e.issues].join('\n') : String(e))
      } finally {
        setLoading(false)
      }
    },
    [type, id],
  )

  React.useEffect(() => {
    void load()
  }, [load])

  // ------------------------------------------------- 外部（AI）写入时的同步
  React.useEffect(() => {
    if (!type || !id) return
    const hit = lastChangedFiles.some((f) => {
      const p = parseReportFile(f)
      return p && p.type === type && p.id === id
    })
    if (!hit) return

    void api.getReport(type, id).then((disk) => {
      // 磁盘上还是我们已知的那一版：这次事件只是自己保存产生的回声，
      // 不该当成"被外部修改"来打扰用户
      if (disk.updatedAt === baseRef.current) return
      if (dirtyRef.current) {
        // 本地有未保存改动，不能静默覆盖，交给用户决定
        setConflict({ disk, diskUpdatedAt: disk.updatedAt })
      } else {
        setReport(disk)
        baseRef.current = disk.updatedAt
        toast.success('已同步 AI 的最新内容')
      }
    })
  }, [lastChangedFiles, type, id])

  // ---------------------------------------------------------------- 保存
  const persist = React.useCallback(
    async (next: Report, force = false) => {
      setSaveState('saving')
      const seq = editSeqRef.current
      try {
        const saved = await api.saveReport(next, force ? undefined : baseRef.current, force)
        baseRef.current = saved.updatedAt
        // 保存期间又打了字（seq 变了）就别回写 state，否则会把刚输入的内容冲掉
        if (editSeqRef.current === seq) {
          setReport(saved)
          dirtyRef.current = false
          setSaveState('saved')
        }
        setSavedAt(formatTime(saved.updatedAt))
      } catch (e) {
        if (e instanceof ApiError && e.isConflict) {
          setSaveState('dirty')
          setConflict({ disk: e.detail.disk, diskUpdatedAt: e.detail.diskUpdatedAt })
          return
        }
        setSaveState('error')
        toast.error('保存失败', {
          description: e instanceof ApiError ? [e.message, ...e.issues].join('；') : String(e),
        })
      }
    },
    [],
  )

  const scheduleSave = React.useCallback(
    (next: Report) => {
      dirtyRef.current = true
      editSeqRef.current += 1
      setSaveState('dirty')
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => void persist(next), 800)
    },
    [persist],
  )

  const update = React.useCallback(
    (mutate: (r: Report) => Report) => {
      setReport((prev) => {
        if (!prev) return prev
        const next = mutate(prev)
        scheduleSave(next)
        return next
      })
    },
    [scheduleSave],
  )

  const saveNow = React.useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (report && dirtyRef.current) void persist(report)
  }, [report, persist])

  // ⌘S 立即保存
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        saveNow()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [saveNow])

  // 离开页面前冲掉待保存的改动
  React.useEffect(() => {
    const onLeave = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) {
        e.preventDefault()
        e.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', onLeave)
    return () => {
      window.removeEventListener('beforeunload', onLeave)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  // ---------------------------------------------------------------- 操作
  const copyDing = async () => {
    if (!report) return
    const ok = await copyText(toDingTalkText(report))
    ok
      ? toast.success('已复制钉钉格式', { description: '切到钉钉日报，直接粘贴即可' })
      : toast.error('复制失败')
  }

  const copyBlock = async (label: string, text: string) => {
    const ok = await copyText(text)
    ok
      ? toast.success(`已复制「${label}」`, { description: '切到钉钉日报，粘贴到对应字段' })
      : toast.error('复制失败')
  }

  const copyGenPrompt = async () => {
    if (!type || !id) return
    const ok = await copyText(generatePrompt(type, id))
    ok
      ? toast.success('提示词已复制', { description: '到 Claude Code 里粘贴执行' })
      : toast.error('复制失败')
  }

  const remove = async () => {
    if (!type || !id) return
    await api.deleteReport(type, id)
    toast.success(`已删除 ${id}`)
    navigate('/')
  }

  // ---------------------------------------------------------------- 渲染
  if (loading) {
    return (
      <>
        <TopBar title={<Skeleton className="h-4 w-40" />} />
        <PageBody>
          <div className="space-y-5">
            {[0, 1, 2].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3.5 w-32" />
                <Skeleton className="h-[180px] w-full rounded-control" />
              </div>
            ))}
          </div>
        </PageBody>
      </>
    )
  }

  if (error || !report || !type || !id) {
    return (
      <>
        <TopBar
          title="报告打不开"
          actions={
            <Button variant="secondary" size="sm" asChild>
              <Link to="/">
                <ArrowLeft />
                返回列表
              </Link>
            </Button>
          }
        />
        <PageBody>
          <EmptyState
            icon={FileWarning}
            title="这份报告不符合数据规范"
            description={
              <>
                <span className="whitespace-pre-wrap">{error}</span>
                <br />
                <span className="mt-2 block">
                  在 Claude Code 里执行 <code className="rounded bg-muted px-1">node scripts/report.mjs validate</code> 可以定位并修复。
                </span>
              </>
            }
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                <RotateCcw />
                重新加载
              </Button>
            }
          />
        </PageBody>
      </>
    )
  }

  const idLabel =
    report.type === 'daily'
      ? `${report.date} ${weekdayCn(report.date)}`
      : `${report.week} · ${report.weekStart} ~ ${report.weekEnd}`

  const topLevel = defs.filter((d) => !d.key.startsWith('tomorrowPlan.'))
  const planDefs = defs.filter((d) => d.key.startsWith('tomorrowPlan.'))

  return (
    <>
      <TopBar
        title={
          <span className="flex items-center gap-2">
            <Button variant="ghost" size="icon-sm" asChild className="-ml-1.5">
              <Link to="/" aria-label="返回列表">
                <ArrowLeft />
              </Link>
            </Button>
            {report.title || idLabel}
          </span>
        }
        subtitle={
          <span className="flex items-center gap-2">
            <span className="font-mono tabular-nums">{idLabel}</span>
            <SaveIndicator state={saveState} savedAt={savedAt} />
          </span>
        }
        actions={
          <>
            <Tip label="切换草稿 / 已定稿">
              <Button
                variant={report.status === 'final' ? 'soft' : 'secondary'}
                size="md"
                onClick={() =>
                  update((r) => ({ ...r, status: r.status === 'final' ? 'draft' : 'final' }) as Report)
                }
              >
                <Check />
                {report.status === 'final' ? '已定稿' : '标为定稿'}
              </Button>
            </Tip>
            <Tip label="复制生成提示词，到 Claude Code 里执行">
              <Button variant="secondary" size="icon" onClick={copyGenPrompt} aria-label="AI 生成提示词">
                <Sparkles />
              </Button>
            </Tip>
            <Tip label="导出 Markdown 文件">
              <Button
                variant="secondary"
                size="icon"
                onClick={() => downloadText(`${id}.md`, toMarkdownFile(report))}
                aria-label="导出 Markdown"
              >
                <Download />
              </Button>
            </Tip>
            <ConfirmDialog
              title={`删除 ${id}？`}
              description="对应的 JSON 文件会从 data/ 目录移除，此操作不可撤销。"
              onConfirm={remove}
            >
              <Button variant="ghost" size="icon" aria-label="删除报告">
                <Trash2 />
              </Button>
            </ConfirmDialog>
            <Button variant="primary" size="md" onClick={copyDing}>
              <ClipboardCopy />
              复制为钉钉格式
            </Button>
          </>
        }
      />

      <PageBody>
        {/* 元信息条 */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          {report.tags.map((t) => (
            <TagChip key={t} tag={t} />
          ))}
          {report.source.commits.length > 0 && (
            <button
              onClick={() => setShowCommits((v) => !v)}
              className="flex items-center gap-1 rounded-badge border border-border bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <GitCommitHorizontal className="size-3" />
              {report.source.commits.length} 条提交
              <ChevronDown className={cn('size-3 transition-transform', showCommits && 'rotate-180')} />
            </button>
          )}
          {report.source.generatedBy === 'ai' && report.source.generatedAt && (
            <Badge variant="info">AI 生成于 {formatTime(report.source.generatedAt)}</Badge>
          )}
        </div>

        {showCommits && <CommitPanel report={report} />}

        {/* 区块 */}
        <div className="space-y-6">
          {report.type === 'daily' ? (
            <>
              <SectionCard
                def={topLevel[0]}
                value={readPath(report.sections, topLevel[0].key)}
                onChange={(v) => update((r) => ({ ...r, sections: writePath(r.sections, topLevel[0].key, v) }) as Report)}
                tags={tags}
                mode={mode}
                onModeChange={(m) => {
                  setMode(m)
                  void saveSettings({ editorMode: m })
                }}
                regeneratePrompt={regeneratePrompt(type, id, topLevel[0].key)}
                minHeight={132}
              />

              <div className="space-y-3.5 rounded-card border border-border bg-surface-sunken/40 p-4">
                <h2 className="text-[13.5px] font-semibold tracking-tight">明日工作计划</h2>
                {planDefs.map((def) => (
                  <SectionCard
                    key={def.key}
                    def={def}
                    value={readPath(report.sections, def.key)}
                    onChange={(v) => update((r) => ({ ...r, sections: writePath(r.sections, def.key, v) }) as Report)}
                    tags={tags}
                    mode={mode}
                    onModeChange={(m) => {
                      setMode(m)
                      void saveSettings({ editorMode: m })
                    }}
                    regeneratePrompt={def.owner === 'ai' ? regeneratePrompt(type, id, def.key) : undefined}
                    nested
                    minHeight={96}
                  />
                ))}
              </div>

              <SectionCard
                def={topLevel[1]}
                value={readPath(report.sections, topLevel[1].key)}
                onChange={(v) => update((r) => ({ ...r, sections: writePath(r.sections, topLevel[1].key, v) }) as Report)}
                tags={tags}
                mode={mode}
                onModeChange={(m) => {
                  setMode(m)
                  void saveSettings({ editorMode: m })
                }}
                minHeight={96}
              />
            </>
          ) : (
            defs.map((def) => (
              <SectionCard
                key={def.key}
                def={def}
                value={readPath(report.sections, def.key)}
                onChange={(v) => update((r) => ({ ...r, sections: writePath(r.sections, def.key, v) }) as Report)}
                tags={tags}
                mode={mode}
                onModeChange={(m) => {
                  setMode(m)
                  void saveSettings({ editorMode: m })
                }}
                regeneratePrompt={def.owner === 'ai' ? regeneratePrompt(type, id, def.key) : undefined}
                minHeight={def.key === 'weekCompleted' ? 180 : 108}
              />
            ))
          )}
        </div>

        {/* 钉钉分块复制 */}
        <div className="mt-8">
          <div className="mb-2 flex items-center gap-2">
            <h2 className="text-[13.5px] font-semibold tracking-tight">
              {report.type === 'daily' ? '钉钉日报分块复制' : '钉钉周报分块复制'}
            </h2>
            <span className="text-[11.5px] text-subtle">钉钉已按模板分块，逐块复制到对应输入框</span>
            <span className="flex-1" />
            <Button variant="ghost" size="sm" onClick={copyDing}>
              <ClipboardCopy />
              全量复制
            </Button>
          </div>
          <div className="space-y-2.5">
            {toDingTalkBlocks(report).map((b) => (
              <div key={b.key} className="rounded-card border border-border bg-surface-sunken/40 p-3.5">
                <div className="flex items-center gap-2">
                  <span className="text-[13px] font-semibold tracking-tight">{b.label}</span>
                  {b.empty ? (
                    <Badge variant="outline">空白</Badge>
                  ) : (
                    <span className="text-[11px] text-subtle">
                      {b.text.split('\n').filter((l) => l.trim()).length} 行
                    </span>
                  )}
                  <span className="flex-1" />
                  <Button variant="secondary" size="sm" disabled={b.empty} onClick={() => copyBlock(b.label, b.text)}>
                    <Copy />
                    复制本块
                  </Button>
                </div>
                {!b.empty && (
                  <pre className="mt-2.5 overflow-x-auto whitespace-pre-wrap rounded-control bg-surface px-3 py-2.5 font-sans text-[12.5px] leading-[1.8] text-muted-foreground">
                    {b.text}
                  </pre>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11.5px] leading-relaxed text-subtle">
            钉钉模板的「补日志」字段用于补写当天日志，当天保持空白即可。
          </p>
        </div>
      </PageBody>

      <ConflictDialog
        conflict={conflict}
        onClose={() => setConflict(null)}
        onReload={() => {
          if (!conflict) return
          setReport(conflict.disk)
          baseRef.current = conflict.diskUpdatedAt
          dirtyRef.current = false
          setSaveState('idle')
          setConflict(null)
          toast.success('已加载磁盘上的最新版本')
        }}
        onOverwrite={() => {
          if (!report) return
          setConflict(null)
          void persist(report, true)
          toast.success('已用当前编辑内容覆盖')
        }}
      />
    </>
  )
}

function SaveIndicator({ state, savedAt }: { state: SaveState; savedAt: string }) {
  if (state === 'saving')
    return (
      <span className="flex items-center gap-1 text-primary">
        <Loader2 className="size-3 animate-spin" />
        保存中
      </span>
    )
  if (state === 'dirty')
    return (
      <span className="flex items-center gap-1 text-warning">
        <span className="size-1.5 rounded-full bg-warning" />
        未保存
      </span>
    )
  if (state === 'saved')
    return (
      <span className="flex items-center gap-1 text-success">
        <Check className="size-3" />
        已保存 {savedAt}
      </span>
    )
  if (state === 'error')
    return (
      <span className="flex items-center gap-1 text-danger">
        <CloudOff className="size-3" />
        保存失败
      </span>
    )
  return null
}

function CommitPanel({ report }: { report: Report }) {
  const byRepo = React.useMemo(() => {
    const map = new Map<string, typeof report.source.commits>()
    for (const c of report.source.commits) {
      const arr = map.get(c.repo || c.moduleTag)
      if (arr) arr.push(c)
      else map.set(c.repo || c.moduleTag, [c])
    }
    return [...map.entries()]
  }, [report])

  return (
    <div className="mb-4 space-y-3 rounded-card border border-border bg-surface-sunken/50 p-3.5">
      <p className="text-[11.5px] text-subtle">
        AI 生成时抓取到的原始提交，只读，用于核对正文有没有漏掉或编造。
      </p>
      {byRepo.map(([repo, commits]) => (
        <div key={repo}>
          <div className="mb-1 flex items-center gap-1.5">
            <TagChip tag={commits[0]?.moduleTag ?? repo} />
            <span className="text-[11.5px] text-muted-foreground">{repo}</span>
            <span className="text-[11px] text-subtle">{commits.length} 条</span>
          </div>
          <ul className="space-y-0.5">
            {commits.map((c) => (
              <li key={c.hash} className="flex items-start gap-2 text-[12px] leading-relaxed">
                <code className="mt-px shrink-0 rounded bg-muted px-1 font-mono text-[10.5px] text-subtle">
                  {c.hash.slice(0, 7)}
                </code>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">{c.subject}</span>
                <span className="shrink-0 font-mono text-[10.5px] tabular-nums text-subtle">
                  {c.authoredAt.slice(11, 16)}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

function ConflictDialog({
  conflict,
  onClose,
  onReload,
  onOverwrite,
}: {
  conflict: { disk: Report; diskUpdatedAt: string } | null
  onClose: () => void
  onReload: () => void
  onOverwrite: () => void
}) {
  return (
    <Dialog open={!!conflict} onOpenChange={(o) => !o && onClose()}>
      <DialogContent width="max-w-xl">
        <DialogHeader>
          <DialogTitle>文件已被外部修改</DialogTitle>
          <DialogDescription>
            磁盘上的这份报告在 {conflict && formatTime(conflict.diskUpdatedAt)} 被更新过——多半是 AI Agent 刚写完。
            你本地还有未保存的改动，需要决定保留哪一份。
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[42vh] overflow-auto px-5 py-4">
          <p className="mb-2 text-[12px] font-medium text-muted-foreground">磁盘上的版本预览</p>
          <div className="rounded-control border border-border bg-surface-sunken">
            {conflict && <MarkdownPreview value={toDingTalkText(conflict.disk, { withTitle: false })} />}
          </div>
        </div>
        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={onOverwrite}>
            保留我的编辑并覆盖
          </Button>
          <Button variant="primary" size="sm" onClick={onReload}>
            加载磁盘版本
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
