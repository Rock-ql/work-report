import * as React from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import {
  CalendarDays,
  CalendarRange,
  ChevronRight,
  Copy,
  Download,
  FileText,
  GitCommitHorizontal,
  MoreHorizontal,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import { toast } from 'sonner'
import type { ReportMeta, ReportType } from '@shared/schema'
import { dateKey, relativeDay, weekRange, weekdayCn } from '@shared/date'
import { toDingTalkText, toMarkdownFile } from '@shared/format'
import { api, ApiError } from '@/lib/api'
import { useApp, useToday } from '@/lib/store'
import { cn, copyText, downloadText, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { TagChip } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dropdown, DropdownContent, DropdownItem, DropdownSeparator, DropdownTrigger } from '@/components/ui/dropdown'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { EmptyState, ListSkeleton, PageBody, TopBar } from '@/components/layout/PageShell'
import { FillMeter, InvalidBadge, SourceBadge, StatusBadge, TypeBadge } from '@/components/layout/ReportBadges'
import { Tip } from '@/components/ui/tooltip'

type RangeKey = 'all' | 'week' | 'month' | 'd30'

const RANGE_LABEL: Record<RangeKey, string> = {
  all: '全部时间',
  week: '本周',
  month: '本月',
  d30: '近 30 天',
}

export default function ReportList() {
  const navigate = useNavigate()
  const { dataRevision, lastChangedFiles } = useApp()
  const { today, thisWeek } = useToday()
  const [reports, setReports] = React.useState<ReportMeta[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const [type, setType] = React.useState<ReportType | 'all'>('all')
  const [range, setRange] = React.useState<RangeKey>('all')
  const [status, setStatus] = React.useState<'all' | 'draft' | 'final'>('all')
  const [tag, setTag] = React.useState<string>('all')
  const [query, setQuery] = React.useState('')

  const load = React.useCallback(async () => {
    try {
      const res = await api.listReports()
      setReports(res.reports)
      setError(null)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
  }, [load, dataRevision])

  // AI 在别处写完文件，这里给一次明确的提示，而不是静默刷新
  const firstRender = React.useRef(true)
  React.useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const changed = lastChangedFiles
      .map((f) => /reports\/(daily|weekly)\/(.+)\.json$/.exec(f))
      .filter(Boolean)
      .map((m) => m![2])
    if (changed.length) {
      toast.success('检测到报告更新', {
        description: `${changed.join('、')} 已由外部写入并刷新`,
      })
    }
  }, [lastChangedFiles])

  const allTags = React.useMemo(() => {
    const s = new Set<string>()
    reports.forEach((r) => r.tags.forEach((t) => s.add(t)))
    return [...s].sort()
  }, [reports])

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    const now = new Date()
    let since = ''
    if (range === 'week') since = weekRange(thisWeek).start
    else if (range === 'month') since = `${dateKey(now).slice(0, 7)}-01`
    else if (range === 'd30') since = dateKey(new Date(now.getTime() - 29 * 86400000))

    return reports.filter((r) => {
      if (type !== 'all' && r.type !== type) return false
      if (status !== 'all' && r.status !== status) return false
      if (tag !== 'all' && !r.tags.includes(tag)) return false
      if (since && r.date < since) return false
      if (q) {
        const hay = `${r.id} ${r.title} ${r.excerpt} ${r.tags.join(' ')}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [reports, type, status, tag, range, query, thisWeek])

  // 按月份分组，长列表里更容易定位
  const groups = React.useMemo(() => {
    const map = new Map<string, ReportMeta[]>()
    for (const r of filtered) {
      const key = r.date.slice(0, 7)
      const arr = map.get(key)
      if (arr) arr.push(r)
      else map.set(key, [r])
    }
    return [...map.entries()]
  }, [filtered])

  const hasFilter = type !== 'all' || status !== 'all' || tag !== 'all' || range !== 'all' || !!query
  const todayReport = reports.find((r) => r.type === 'daily' && r.id === today)
  const weekReport = reports.find((r) => r.type === 'weekly' && r.id === thisWeek)

  const openOrCreate = async (t: ReportType, id: string) => {
    try {
      await api.createReport(t, id)
      navigate(`/report/${t}/${id}`)
    } catch (e) {
      toast.error('创建失败', { description: e instanceof ApiError ? e.message : String(e) })
    }
  }

  const remove = async (r: ReportMeta) => {
    try {
      await api.deleteReport(r.type, r.id)
      setReports((prev) => prev.filter((x) => !(x.type === r.type && x.id === r.id)))
      toast.success(`已删除 ${r.id}`)
    } catch (e) {
      toast.error('删除失败', { description: e instanceof ApiError ? e.message : String(e) })
    }
  }

  const copyDing = async (r: ReportMeta) => {
    try {
      const full = await api.getReport(r.type, r.id)
      const ok = await copyText(toDingTalkText(full))
      ok ? toast.success('已复制钉钉格式，可直接粘贴') : toast.error('复制失败')
    } catch (e) {
      toast.error('读取失败', { description: e instanceof ApiError ? e.message : String(e) })
    }
  }

  const exportMd = async (r: ReportMeta) => {
    try {
      const full = await api.getReport(r.type, r.id)
      downloadText(`${r.id}.md`, toMarkdownFile(full))
    } catch (e) {
      toast.error('导出失败', { description: e instanceof ApiError ? e.message : String(e) })
    }
  }

  return (
    <>
      <TopBar
        title="报告列表"
        subtitle={
          loading ? '加载中…' : `共 ${reports.length} 份${hasFilter ? ` · 筛选出 ${filtered.length} 份` : ''}`
        }
        actions={
          <Dropdown>
            <DropdownTrigger asChild>
              <Button variant="primary" size="md">
                <Plus />
                新建报告
              </Button>
            </DropdownTrigger>
            <DropdownContent align="end">
              <DropdownItem onSelect={() => openOrCreate('daily', today)}>
                <CalendarDays />
                今天的日报
                <span className="ml-auto font-mono text-[11px] text-subtle">{today}</span>
              </DropdownItem>
              <DropdownItem onSelect={() => openOrCreate('weekly', thisWeek)}>
                <CalendarRange />
                本周的周报
                <span className="ml-auto font-mono text-[11px] text-subtle">{thisWeek}</span>
              </DropdownItem>
              <DropdownSeparator />
              <DropdownItem
                onSelect={() =>
                  openOrCreate('daily', dateKey(new Date(Date.now() - 86400000)))
                }
              >
                <CalendarDays />
                昨天的日报
              </DropdownItem>
            </DropdownContent>
          </Dropdown>
        }
      >
        {/* 筛选栏 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-6 py-2.5">
          <div className="relative w-[220px]">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="搜索日期、标题、正文…"
              className="pl-7 pr-7"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-subtle hover:text-foreground"
                aria-label="清空搜索"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <Select value={type} onValueChange={(v) => setType(v as any)}>
            <SelectTrigger className="w-[104px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部类型</SelectItem>
              <SelectItem value="daily">日报</SelectItem>
              <SelectItem value="weekly">周报</SelectItem>
            </SelectContent>
          </Select>

          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[112px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(RANGE_LABEL) as RangeKey[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {RANGE_LABEL[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={(v) => setStatus(v as any)}>
            <SelectTrigger className="w-[104px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部状态</SelectItem>
              <SelectItem value="draft">草稿</SelectItem>
              <SelectItem value="final">已定稿</SelectItem>
            </SelectContent>
          </Select>

          {allTags.length > 0 && (
            <Select value={tag} onValueChange={setTag}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部模块</SelectItem>
                {allTags.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}

          {hasFilter && (
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setType('all')
                setRange('all')
                setStatus('all')
                setTag('all')
                setQuery('')
              }}
            >
              <X />
              清除筛选
            </Button>
          )}
        </div>
      </TopBar>

      <PageBody>
        {/* 快捷卡 */}
        <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <QuickCard
            icon={CalendarDays}
            title="今天的日报"
            meta={`${today} ${weekdayCn(today)}`}
            exists={!!todayReport}
            existsHint={todayReport ? `${todayReport.filled}/${todayReport.totalSections} 区块已填写` : undefined}
            onClick={() => openOrCreate('daily', today)}
          />
          <QuickCard
            icon={CalendarRange}
            title="本周的周报"
            meta={`${thisWeek} · ${weekRange(thisWeek).start} ~ ${weekRange(thisWeek).end}`}
            exists={!!weekReport}
            existsHint={weekReport ? `${weekReport.filled}/${weekReport.totalSections} 区块已填写` : undefined}
            onClick={() => openOrCreate('weekly', thisWeek)}
          />
        </div>

        {loading ? (
          <ListSkeleton rows={5} />
        ) : error ? (
          <EmptyState
            icon={FileText}
            title="读取报告失败"
            description={error}
            action={
              <Button variant="secondary" size="sm" onClick={() => void load()}>
                重试
              </Button>
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            icon={FileText}
            title={hasFilter ? '没有符合条件的报告' : '还没有任何报告'}
            description={
              hasFilter
                ? '试试放宽筛选条件，或清除全部筛选。'
                : '先在「Git 工作区」登记你的仓库，然后在 Claude Code 里执行 /work-report daily 生成第一份日报。'
            }
            action={
              hasFilter ? (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setType('all')
                    setRange('all')
                    setStatus('all')
                    setTag('all')
                    setQuery('')
                  }}
                >
                  清除筛选
                </Button>
              ) : (
                <div className="flex gap-2">
                  <Button variant="primary" size="sm" asChild>
                    <Link to="/workspaces">
                      <Plus />
                      登记工作区
                    </Link>
                  </Button>
                  <Button variant="secondary" size="sm" asChild>
                    <Link to="/ai-guide">查看 AI 规范</Link>
                  </Button>
                </div>
              )
            }
          />
        ) : (
          <div className="space-y-6">
            {groups.map(([month, items]) => (
              <section key={month}>
                <div className="mb-2 flex items-center gap-2 px-0.5">
                  <h2 className="text-[11.5px] font-medium tabular-nums text-muted-foreground">
                    {month.replace('-', ' 年 ')} 月
                  </h2>
                  <span className="h-px flex-1 bg-border" />
                  <span className="text-[11px] text-subtle">{items.length} 份</span>
                </div>
                <div className="space-y-1.5">
                  {items.map((r, i) => (
                    <ReportRow
                      key={`${r.type}-${r.id}`}
                      report={r}
                      index={i}
                      onCopy={() => copyDing(r)}
                      onExport={() => exportMd(r)}
                      onDelete={() => remove(r)}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}
      </PageBody>
    </>
  )
}

function QuickCard({
  icon: Icon,
  title,
  meta,
  exists,
  existsHint,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  meta: string
  exists: boolean
  existsHint?: string
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex items-center gap-3 overflow-hidden rounded-card border p-3.5 text-left transition-all',
        'hover:-translate-y-px hover:shadow-card-hover',
        exists ? 'border-border bg-surface shadow-card' : 'border-dashed border-border bg-surface/50',
      )}
    >
      <div
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-[9px] transition-colors',
          exists ? 'bg-primary-soft text-primary' : 'bg-muted text-subtle',
        )}
      >
        <Icon className="size-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13px] font-medium">
          {title}
          {!exists && <span className="text-[11px] font-normal text-subtle">未创建</span>}
        </div>
        <div className="mt-0.5 truncate font-mono text-[11px] tabular-nums text-muted-foreground">{meta}</div>
        {existsHint && <div className="mt-0.5 text-[11px] text-subtle">{existsHint}</div>}
      </div>
      <ChevronRight className="size-4 shrink-0 text-subtle transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}

function ReportRow({
  report: r,
  index,
  onCopy,
  onExport,
  onDelete,
}: {
  report: ReportMeta
  index: number
  onCopy: () => void
  onExport: () => void
  onDelete: () => void
}) {
  const label = r.type === 'daily' ? r.id : `${r.weekStart} ~ ${r.weekEnd}`
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.02, 0.16), ease: [0.16, 1, 0.3, 1] }}
    >
      <Link
        to={`/report/${r.type}/${r.id}`}
        className={cn(
          'group flex items-center gap-3 rounded-card border border-border bg-surface px-3.5 py-3 shadow-card',
          'transition-all hover:-translate-y-px hover:shadow-card-hover',
          r.invalid && 'border-danger/30',
        )}
      >
        {/* 日期块 */}
        <div className="flex w-[46px] shrink-0 flex-col items-center rounded-[8px] bg-surface-sunken py-1.5">
          <span className="text-[15px] font-semibold leading-none tabular-nums">
            {r.type === 'daily' ? Number(r.id.slice(8, 10)) : `W${r.id.slice(6)}`}
          </span>
          <span className="mt-0.5 text-[10px] text-subtle">
            {r.type === 'daily' ? weekdayCn(r.id) : '周'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <TypeBadge type={r.type} />
            {r.invalid ? <InvalidBadge error={r.error} /> : <StatusBadge status={r.status} />}
            {!r.invalid && <SourceBadge by={r.generatedBy} />}
            {r.tags.slice(0, 4).map((t) => (
              <TagChip key={t} tag={t} />
            ))}
            {r.tags.length > 4 && <span className="text-[11px] text-subtle">+{r.tags.length - 4}</span>}
          </div>
          <p className="mt-1 truncate text-[12.5px] text-muted-foreground">
            {r.invalid ? (
              <span className="text-danger">{r.error}</span>
            ) : (
              r.excerpt || <span className="text-subtle">尚未填写内容</span>
            )}
          </p>
        </div>

        <div className="hidden shrink-0 items-center gap-3 text-[11px] text-subtle md:flex">
          {r.commitCount > 0 && (
            <Tip label={`关联 ${r.commitCount} 条 git 提交`}>
              <span className="flex items-center gap-1 tabular-nums">
                <GitCommitHorizontal className="size-3.5" />
                {r.commitCount}
              </span>
            </Tip>
          )}
          {!r.invalid && <FillMeter filled={r.filled} total={r.totalSections} />}
          <Tip label={`更新于 ${formatDateTime(r.updatedAt)}`}>
            <span className="w-[64px] text-right font-mono tabular-nums">{relativeDay(r.date)}</span>
          </Tip>
        </div>

        <Dropdown>
          <DropdownTrigger asChild>
            <button
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
              }}
              className="flex size-7 shrink-0 items-center justify-center rounded-[6px] text-subtle opacity-0 transition-all hover:bg-muted hover:text-foreground focus:opacity-100 group-hover:opacity-100"
              aria-label="更多操作"
            >
              <MoreHorizontal className="size-4" />
            </button>
          </DropdownTrigger>
          <DropdownContent align="end" onClick={(e) => e.preventDefault()}>
            <DropdownItem
              onSelect={(e) => {
                e.preventDefault()
                onCopy()
              }}
            >
              <Copy />
              复制为钉钉格式
            </DropdownItem>
            <DropdownItem
              onSelect={(e) => {
                e.preventDefault()
                onExport()
              }}
            >
              <Download />
              导出 Markdown
            </DropdownItem>
            <DropdownSeparator />
            <DropdownItem danger onSelect={(e) => e.preventDefault()} asChild>
              <ConfirmDialog
                title={`删除 ${label}？`}
                description="对应的 JSON 文件会从 data/ 目录移除，此操作不可撤销。"
                onConfirm={onDelete}
              >
                <button className="flex w-full items-center gap-2 rounded-[5px] px-2 py-1.5 text-left text-[13px] text-danger hover:bg-danger-soft">
                  <Trash2 className="size-3.5" />
                  删除
                </button>
              </ConfirmDialog>
            </DropdownItem>
          </DropdownContent>
        </Dropdown>
      </Link>
    </motion.div>
  )
}
