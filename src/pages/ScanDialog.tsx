import * as React from 'react'
import {
  AlertTriangle,
  Check,
  FolderSearch,
  GitBranch,
  Loader2,
  Search,
  Sparkles,
  UserCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { nanoid } from 'nanoid'
import type { Workspace } from '@shared/schema'
import { nowIso } from '@shared/date'
import { api, ApiError, type ScannedRepo, type ScanResult } from '@/lib/api'
import { cn, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Tip } from '@/components/ui/tooltip'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#64748b', '#84cc16',
]

const TAG_MAX = 20

/** 仓库名里常见的脚手架前缀，对模块标签没有信息量 */
const NOISE_PREFIX = /^(mod|micro|open|wpwl|dsh|veepai|web|app|py|svc|service)[-_]/i

/**
 * 从仓库名派生默认模块标签。
 * 目录名常常带 mod_ / micro- 这类前缀且超过 20 字上限，直接拿来用会被后端拒掉。
 * 超长时按 - / _ 的分段裁剪而不是硬截断，避免出现 permission-managemen 这种半截词。
 * 真正好的标签（比如「全局搜索」）还是得你自己改，这里只保证给一个合法又不难看的起点。
 */
function deriveTag(name: string): string {
  // 只剥一层，避免把 mod_py_organization 削成 organization 丢掉语义
  let tag = name.trim().replace(NOISE_PREFIX, '') || name.trim()
  if (tag.length <= TAG_MAX) return tag

  const segs = tag.split(/[-_]+/).filter(Boolean)
  // 先从尾部丢：仓库名的头部通常才是主题词
  for (let n = segs.length - 1; n >= 1; n--) {
    const candidate = segs.slice(0, n).join('-')
    if (candidate.length <= TAG_MAX && candidate.length >= 4) return candidate
  }
  // 头部是长前缀时反过来从头丢
  for (let i = 1; i < segs.length; i++) {
    const candidate = segs.slice(i).join('-')
    if (candidate.length <= TAG_MAX && candidate.length >= 4) return candidate
  }
  return tag.slice(0, TAG_MAX)
}

/** 每个候选仓库在弹窗里的可编辑草稿 */
interface Draft {
  checked: boolean
  name: string
  moduleTag: string
}

/**
 * 扫描一个文件夹下的所有 git 仓库并批量导入。
 * 与逐个手填相比，这里的价值在于「我的提交数」那一列 ——
 * 一眼就能看出哪些仓库是你真正在做的，而不是顺手 clone 下来的。
 */
export function ScanDialog({
  open,
  onOpenChange,
  existing,
  defaultAuthors,
  onImport,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  existing: Workspace[]
  defaultAuthors: string[]
  onImport: (workspaces: Workspace[]) => Promise<void>
}) {
  const [rootPath, setRootPath] = React.useState('')
  const [depth, setDepth] = React.useState('3')
  const [scanning, setScanning] = React.useState(false)
  const [result, setResult] = React.useState<ScanResult | null>(null)
  const [drafts, setDrafts] = React.useState<Record<string, Draft>>({})
  const [onlyMine, setOnlyMine] = React.useState(true)
  const [keyword, setKeyword] = React.useState('')
  const [importing, setImporting] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    // 每次打开保留上次的路径，但清掉旧结果，避免看到过期数据
    setResult(null)
    setDrafts({})
    setKeyword('')
  }, [open])

  const scan = async () => {
    if (!rootPath.trim()) return
    setScanning(true)
    setResult(null)
    try {
      const res = await api.scanWorkspaces(rootPath, Number(depth))
      setResult(res)
      // 默认勾选"有我的提交且尚未登记"的仓库，这通常就是你想要的那批
      const next: Record<string, Draft> = {}
      for (const r of res.repos) {
        next[r.path] = {
          checked: !r.imported && r.myCommits > 0,
          name: r.name,
          moduleTag: deriveTag(r.name),
        }
      }
      setDrafts(next)
      // 一个都没匹配上作者时自动放开过滤，否则列表会莫名其妙地空掉
      const anyMine = res.repos.some((r) => r.myCommits > 0)
      if (!anyMine) setOnlyMine(false)
      if (!res.repos.length) {
        toast.info('没有找到 git 仓库', { description: '试试把扫描深度调大一些' })
      } else if (!anyMine) {
        toast.info(`找到 ${res.repos.length} 个仓库，但近 90 天都没有你的提交`, {
          description: '已为你展示全部结果，请手动勾选要导入的仓库',
        })
      }
    } catch (e) {
      toast.error('扫描失败', { description: e instanceof ApiError ? e.message : String(e) })
    } finally {
      setScanning(false)
    }
  }

  const visible = React.useMemo(() => {
    if (!result) return []
    const q = keyword.trim().toLowerCase()
    return result.repos.filter((r) => {
      if (onlyMine && r.myCommits === 0 && !r.imported) return false
      if (q && !`${r.name} ${r.relPath}`.toLowerCase().includes(q)) return false
      return true
    })
  }, [result, onlyMine, keyword])

  const selected = React.useMemo(
    () => (result?.repos ?? []).filter((r) => drafts[r.path]?.checked && !r.imported),
    [result, drafts],
  )

  /** 模块标签必须全局唯一：既不能撞已登记的，也不能在本次选中的之间重复 */
  const tagConflicts = React.useMemo(() => {
    const taken = new Map<string, string>()
    for (const w of existing) taken.set(w.moduleTag, `已被「${w.name}」占用`)
    const conflicts: Record<string, string> = {}
    const seen = new Map<string, string>()
    for (const r of selected) {
      const tag = drafts[r.path]?.moduleTag.trim() ?? ''
      if (!tag) {
        conflicts[r.path] = '模块标签不能为空'
        continue
      }
      if (tag.length > TAG_MAX) {
        conflicts[r.path] = `模块标签最多 ${TAG_MAX} 个字符，当前 ${tag.length}`
        continue
      }
      if (taken.has(tag)) {
        conflicts[r.path] = taken.get(tag)!
        continue
      }
      if (seen.has(tag)) {
        conflicts[r.path] = `与「${seen.get(tag)}」重复`
        continue
      }
      seen.set(tag, drafts[r.path]?.name || r.name)
    }
    return conflicts
  }, [selected, drafts, existing])

  const conflictCount = Object.keys(tagConflicts).length

  const setDraft = (path: string, patch: Partial<Draft>) =>
    setDrafts((d) => ({ ...d, [path]: { ...d[path], ...patch } }))

  const bulkCheck = (fn: (r: ScannedRepo) => boolean) =>
    setDrafts((d) => {
      const next = { ...d }
      for (const r of visible) {
        if (r.imported) continue
        next[r.path] = { ...next[r.path], checked: fn(r) }
      }
      return next
    })

  const doImport = async () => {
    if (!selected.length || conflictCount) return
    setImporting(true)
    const ts = nowIso()
    const base = existing.length
    const added: Workspace[] = selected.map((r, i) => ({
      id: `ws_${nanoid(8)}`,
      name: drafts[r.path].name.trim() || r.name,
      moduleTag: drafts[r.path].moduleTag.trim(),
      path: r.path,
      authors: [],
      branches: [],
      enabled: true,
      color: PALETTE[(base + i) % PALETTE.length],
      note: '',
      order: base + i,
      createdAt: ts,
      updatedAt: ts,
    }))
    try {
      await onImport(added)
      toast.success(`已导入 ${added.length} 个工作区`)
      onOpenChange(false)
    } catch (e) {
      toast.error('导入失败', { description: e instanceof ApiError ? e.message : String(e) })
    } finally {
      setImporting(false)
    }
  }

  const mineCount = result?.repos.filter((r) => r.myCommits > 0 && !r.imported).length ?? 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent width="max-w-[900px]" className="flex max-h-[86vh] flex-col">
        <DialogHeader>
          <DialogTitle>扫描文件夹批量导入</DialogTitle>
          <DialogDescription>
            递归扫描一个文件夹下的所有 git 仓库。找到 <code className="font-mono">.git</code> 就不再往下走，
            所以不会把依赖目录里的仓库也捞进来。
          </DialogDescription>
        </DialogHeader>

        {/* 扫描参数。说明文字放在整行下方，
            否则它会把路径这一列撑高，三个控件就落不到同一条基线上 */}
        <div className="border-b border-border px-5 py-3.5">
          <div className="flex items-end gap-2">
            <Field label="文件夹路径" className="flex-1">
              <Input
                value={rootPath}
                onChange={(e) => setRootPath(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && !scanning && scan()}
                placeholder="~/Documents"
                className="font-mono text-[12px]"
                spellCheck={false}
                autoFocus
              />
            </Field>
            <Field label="扫描深度" className="w-[104px]">
              <Select value={depth} onValueChange={setDepth}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {['1', '2', '3', '4', '5', '6'].map((d) => (
                    <SelectItem key={d} value={d}>
                      {d} 层
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Button variant="primary" onClick={scan} loading={scanning} disabled={!rootPath.trim()}>
              <FolderSearch />
              扫描
            </Button>
          </div>
          <p className="mt-1.5 text-[11.5px] text-subtle">支持 ~ 开头，例如 ~/Documents 或 ~/work</p>
        </div>

        {/* 结果 */}
        {scanning ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-5 animate-spin text-primary" />
            <p className="text-[12.5px]">正在扫描并读取各仓库的提交信息…</p>
          </div>
        ) : !result ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-16 text-center">
            <div className="flex size-11 items-center justify-center rounded-[10px] border border-border bg-surface-sunken">
              <FolderSearch className="size-5 text-subtle" />
            </div>
            <p className="text-[13px] font-medium">填一个文件夹路径开始扫描</p>
            <p className="max-w-[420px] text-[12px] leading-relaxed text-muted-foreground">
              扫描结果会显示每个仓库近 90 天里
              <strong className="font-medium text-foreground">属于你的提交数</strong>
              {defaultAuthors.length ? (
                <>（按 <code className="font-mono text-[11.5px]">{defaultAuthors.join('、')}</code> 过滤）</>
              ) : (
                <>—— 你还没在设置里填默认作者邮箱，这一列会等于总提交数</>
              )}
              ，方便你一眼挑出真正在做的项目。
            </p>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 border-b border-border px-5 py-2.5">
              <div className="relative w-[180px]">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-subtle" />
                <Input
                  value={keyword}
                  onChange={(e) => setKeyword(e.target.value)}
                  placeholder="筛选仓库名"
                  className="pl-7"
                />
              </div>
              <button
                onClick={() => setOnlyMine((v) => !v)}
                className={cn(
                  'flex h-8.5 items-center gap-1.5 rounded-control border px-2.5 text-[12.5px] transition-colors',
                  onlyMine
                    ? 'border-primary/40 bg-primary-soft font-medium text-primary'
                    : 'border-border bg-surface text-muted-foreground hover:bg-muted',
                )}
              >
                <UserCheck className="size-3.5" />
                只看有我提交的
                {mineCount > 0 && <span className="tabular-nums opacity-70">{mineCount}</span>}
              </button>
              <span className="flex-1" />
              <Button variant="ghost" size="md" onClick={() => bulkCheck(() => true)}>
                全选
              </Button>
              <Button variant="ghost" size="md" onClick={() => bulkCheck(() => false)}>
                清空
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-3">
              {result.truncated && (
                <div className="mb-2.5 flex items-start gap-2 rounded-control border border-warning/25 bg-warning-soft px-2.5 py-2">
                  <AlertTriangle className="mt-px size-3.5 shrink-0 text-warning" />
                  <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                    结果已截断（触及扫描上限）。缩小范围或降低扫描深度可以拿到完整列表。
                  </p>
                </div>
              )}

              {visible.length === 0 ? (
                <p className="py-10 text-center text-[12.5px] text-subtle">
                  {onlyMine ? '这些仓库里没有你的提交，试试关掉「只看有我提交的」' : '没有匹配的仓库'}
                </p>
              ) : (
                <div className="space-y-1">
                  {visible.map((r) => (
                    <RepoRow
                      key={r.path}
                      repo={r}
                      draft={drafts[r.path]}
                      conflict={tagConflicts[r.path]}
                      onChange={(patch) => setDraft(r.path, patch)}
                    />
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        <DialogFooter>
          {result && (
            <span className="mr-auto text-[11.5px] text-subtle">
              扫描 {result.dirsVisited} 个目录，找到 {result.repos.length} 个仓库 · {result.elapsedMs}ms
            </span>
          )}
          {conflictCount > 0 && (
            <span className="text-[11.5px] text-danger">{conflictCount} 个模块标签有冲突</span>
          )}
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!selected.length || conflictCount > 0}
            loading={importing}
            onClick={doImport}
          >
            <Check />
            {selected.length ? `导入 ${selected.length} 个工作区` : '导入工作区'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function RepoRow({
  repo: r,
  draft,
  conflict,
  onChange,
}: {
  repo: ScannedRepo
  draft?: Draft
  conflict?: string
  onChange: (patch: Partial<Draft>) => void
}) {
  const checked = !!draft?.checked && !r.imported
  const dir = r.relPath === '.' ? '' : r.relPath.split('/').slice(0, -1).join('/')

  return (
    <div
      className={cn(
        'flex items-center gap-2.5 rounded-control border px-2.5 py-2 transition-colors',
        r.imported
          ? 'border-transparent bg-surface-sunken/50 opacity-60'
          : checked
            ? 'border-primary/35 bg-primary-soft/40'
            : 'border-border bg-surface hover:bg-muted/50',
      )}
    >
      <button
        type="button"
        disabled={r.imported}
        onClick={() => onChange({ checked: !checked })}
        className={cn(
          'flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors',
          checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input bg-surface',
          r.imported && 'cursor-not-allowed opacity-50',
        )}
        aria-label={checked ? '取消选择' : '选择'}
      >
        {checked && <Check className="size-3" />}
      </button>

      {/* 名称与模块标签就地可编辑 */}
      <Input
        value={draft?.name ?? r.name}
        onChange={(e) => onChange({ name: e.target.value })}
        disabled={r.imported}
        className="h-7 w-[176px] shrink-0 text-[12.5px]"
        placeholder="工作区名称"
      />
      <Tip label={conflict ?? '报告正文里【xxx】的取值，必须唯一'}>
        <Input
          value={draft?.moduleTag ?? r.name}
          onChange={(e) => onChange({ moduleTag: e.target.value })}
          disabled={r.imported}
          maxLength={TAG_MAX}
          className={cn(
            'h-7 w-[140px] shrink-0 text-[12.5px]',
            conflict && 'border-danger/60 focus:border-danger focus:ring-danger/15',
          )}
          placeholder="模块标签"
        />
      </Tip>

      <div className="min-w-0 flex-1">
        <p className="truncate font-mono text-[11px] text-muted-foreground">
          {dir && <span className="text-subtle">{dir}/</span>}
          <span>{r.relPath.split('/').pop()}</span>
        </p>
        {conflict ? (
          <p className="mt-0.5 truncate text-[10.5px] text-danger">{conflict}</p>
        ) : (
        <p className="mt-0.5 flex items-center gap-2 text-[10.5px] text-subtle">
          <span className="flex items-center gap-1 truncate">
            <GitBranch className="size-2.5 shrink-0" />
            {r.branch}
          </span>
          {r.lastCommitAt && <span className="shrink-0">{formatDateTime(r.lastCommitAt)}</span>}
        </p>
        )}
      </div>

      {r.imported ? (
        <Badge variant="neutral">已登记</Badge>
      ) : r.myCommits > 0 ? (
        <Tip label={`近 90 天你提交了 ${r.myCommits} 次，该仓库共 ${r.totalCommits} 次`}>
          <Badge variant="primary">
            <Sparkles />
            我 {r.myCommits}
          </Badge>
        </Tip>
      ) : (
        <Tip label={`近 90 天没有你的提交，该仓库共 ${r.totalCommits} 次`}>
          <Badge variant="outline">{r.totalCommits} 次</Badge>
        </Tip>
      )}
    </div>
  )
}
