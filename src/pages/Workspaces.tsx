import * as React from 'react'
import { motion } from 'framer-motion'
import {
  AlertCircle,
  Check,
  ChevronDown,
  Copy,
  FolderGit2,
  FolderSearch,
  GitBranch,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { nanoid } from 'nanoid'
import type { Workspace } from '@shared/schema'
import { nowIso } from '@shared/date'
import { api, ApiError, type WorkspaceProbe } from '@/lib/api'
import { useApp } from '@/lib/store'
import { cn, copyText, formatDateTime } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Field, Textarea } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Badge, TagChip } from '@/components/ui/badge'
import { Tip } from '@/components/ui/tooltip'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Dialog, DrawerContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { EmptyState, PageBody, TopBar, Skeleton } from '@/components/layout/PageShell'
import { ScanDialog } from './ScanDialog'

const PALETTE = [
  '#6366f1', '#8b5cf6', '#ec4899', '#ef4444', '#f59e0b',
  '#10b981', '#06b6d4', '#3b82f6', '#64748b', '#84cc16',
]

export default function Workspaces() {
  const { workspaces, saveWorkspaces, loading, settings } = useApp()
  const [editing, setEditing] = React.useState<Workspace | null>(null)
  const [open, setOpen] = React.useState(false)
  const [scanOpen, setScanOpen] = React.useState(false)
  const [dragIndex, setDragIndex] = React.useState<number | null>(null)

  const startAdd = () => {
    const ts = nowIso()
    setEditing({
      id: `ws_${nanoid(8)}`,
      name: '',
      moduleTag: '',
      path: '',
      authors: settings?.defaultAuthors ?? [],
      branches: [],
      enabled: true,
      color: PALETTE[workspaces.length % PALETTE.length],
      note: '',
      order: workspaces.length,
      createdAt: ts,
      updatedAt: ts,
    })
    setOpen(true)
  }

  const commit = async (ws: Workspace) => {
    const exists = workspaces.some((w) => w.id === ws.id)
    const next = exists
      ? workspaces.map((w) => (w.id === ws.id ? { ...ws, updatedAt: nowIso() } : w))
      : [...workspaces, ws]
    try {
      await saveWorkspaces(next)
      toast.success(exists ? '工作区已更新' : '工作区已添加')
      setOpen(false)
    } catch (e) {
      toast.error('保存失败', { description: e instanceof ApiError ? e.message : String(e) })
    }
  }

  const importMany = async (added: Workspace[]) => {
    await saveWorkspaces([...workspaces, ...added])
  }

  const remove = async (ws: Workspace) => {
    try {
      await saveWorkspaces(workspaces.filter((w) => w.id !== ws.id))
      toast.success(`已移除「${ws.name}」`)
    } catch (e) {
      toast.error('删除失败', { description: e instanceof ApiError ? e.message : String(e) })
    }
  }

  const toggle = async (ws: Workspace, enabled: boolean) => {
    try {
      await saveWorkspaces(
        workspaces.map((w) => (w.id === ws.id ? { ...w, enabled, updatedAt: nowIso() } : w)),
      )
    } catch (e) {
      toast.error('更新失败', { description: e instanceof ApiError ? e.message : String(e) })
    }
  }

  const reorder = async (from: number, to: number) => {
    if (from === to) return
    const next = [...workspaces]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    try {
      await saveWorkspaces(next)
    } catch (e) {
      toast.error('排序失败', { description: e instanceof ApiError ? e.message : String(e) })
    }
  }

  const enabledCount = workspaces.filter((w) => w.enabled).length

  return (
    <>
      <TopBar
        title="Git 工作区"
        subtitle={
          loading
            ? '加载中…'
            : `${workspaces.length} 个仓库，${enabledCount} 个参与统计 · 顺序决定报告里模块的出现次序`
        }
        actions={
          <>
            <Button variant="secondary" size="md" onClick={() => setScanOpen(true)}>
              <FolderSearch />
              扫描文件夹
            </Button>
            <Button variant="primary" size="md" onClick={startAdd}>
              <Plus />
              添加工作区
            </Button>
          </>
        }
      />

      <PageBody>
        <div className="mb-4 rounded-card border border-info/20 bg-info-soft px-3.5 py-2.5">
          <p className="text-[12.5px] leading-relaxed text-muted-foreground">
            这里登记的是 <strong className="font-medium text-foreground">AI 提取提交的范围</strong>。
            AI 执行 <code className="rounded bg-surface/70 px-1 font-mono text-[11.5px]">collect-git.mjs</code> 时只会扫描这些仓库，
            并且只认这里定义的<strong className="font-medium text-foreground">模块标签</strong>作为报告正文里【xxx】的取值
            —— 建议把标签改成你惯用的中文短名，它会原样出现在钉钉日报里。
          </p>
        </div>

        {loading ? (
          <div className="grid gap-3 md:grid-cols-2">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[104px] rounded-card" />
            ))}
          </div>
        ) : workspaces.length === 0 ? (
          <EmptyState
            icon={FolderGit2}
            title="还没有登记任何 Git 工作区"
            description="登记你日常提交代码的仓库。之后 AI 生成日报时，只会从这些仓库里提取提交记录。扫描文件夹可以一次把整个目录下的仓库找出来，并按「你的提交数」帮你挑。"
            action={
              <div className="flex gap-2">
                <Button variant="primary" size="sm" onClick={() => setScanOpen(true)}>
                  <FolderSearch />
                  扫描文件夹
                </Button>
                <Button variant="secondary" size="sm" onClick={startAdd}>
                  <Plus />
                  手动添加
                </Button>
              </div>
            }
          />
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {workspaces.map((ws, i) => (
              <motion.div
                key={ws.id}
                layout
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.18, delay: Math.min(i * 0.025, 0.15) }}
                draggable
                onDragStart={() => setDragIndex(i)}
                onDragEnd={() => setDragIndex(null)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex !== null) void reorder(dragIndex, i)
                  setDragIndex(null)
                }}
                className={cn(dragIndex === i && 'opacity-40')}
              >
                <WorkspaceCard
                  ws={ws}
                  onEdit={() => {
                    setEditing(ws)
                    setOpen(true)
                  }}
                  onDelete={() => remove(ws)}
                  onToggle={(v) => toggle(ws, v)}
                />
              </motion.div>
            ))}
          </div>
        )}
      </PageBody>

      <ScanDialog
        open={scanOpen}
        onOpenChange={setScanOpen}
        existing={workspaces}
        defaultAuthors={settings?.defaultAuthors ?? []}
        onImport={importMany}
      />

      <WorkspaceDrawer
        open={open}
        workspace={editing}
        existing={workspaces}
        defaultAuthors={settings?.defaultAuthors ?? []}
        onOpenChange={setOpen}
        onSubmit={commit}
      />
    </>
  )
}

function WorkspaceCard({
  ws,
  onEdit,
  onDelete,
  onToggle,
}: {
  ws: Workspace
  onEdit: () => void
  onDelete: () => void
  onToggle: (v: boolean) => void
}) {
  return (
    <div
      className={cn(
        'group relative rounded-card border border-border bg-surface p-3.5 shadow-card transition-all',
        'hover:-translate-y-px hover:shadow-card-hover',
        !ws.enabled && 'opacity-60',
      )}
    >
      <span
        className="absolute left-0 top-3.5 h-[calc(100%-28px)] w-[3px] rounded-r-full"
        style={{ background: ws.color }}
      />

      <div className="flex items-start gap-2.5 pl-2">
        <GripVertical className="mt-0.5 size-3.5 shrink-0 cursor-grab text-subtle opacity-0 transition-opacity group-hover:opacity-100" />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <h3 className="truncate text-[13px] font-semibold tracking-tight">{ws.name}</h3>
            <TagChip tag={ws.moduleTag} />
            {!ws.enabled && <Badge variant="neutral">已停用</Badge>}
          </div>

          <Tip label="点击复制路径">
            <button
              onClick={async () => {
                const ok = await copyText(ws.path)
                ok ? toast.success('路径已复制') : toast.error('复制失败')
              }}
              className="mt-1 flex max-w-full items-center gap-1 text-left font-mono text-[11px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <span className="truncate">{ws.path}</span>
              <Copy className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-60" />
            </button>
          </Tip>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-subtle">
            {ws.branches.length > 0 ? (
              <span className="flex items-center gap-1">
                <GitBranch className="size-3" />
                {ws.branches.join(', ')}
              </span>
            ) : (
              <span className="flex items-center gap-1">
                <GitBranch className="size-3" />
                所有分支
              </span>
            )}
            <span className="flex items-center gap-1">
              <Users className="size-3" />
              {ws.authors.length ? ws.authors.join(', ') : '跟随全局作者'}
            </span>
          </div>

          {ws.note && <p className="mt-1.5 text-[11.5px] text-muted-foreground">{ws.note}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Tip label={ws.enabled ? '停用后不参与提交提取' : '启用后参与提交提取'}>
            <span>
              <Switch checked={ws.enabled} onCheckedChange={onToggle} aria-label="启用" />
            </span>
          </Tip>
          <Tip label="编辑">
            <Button variant="ghost" size="icon-sm" onClick={onEdit} aria-label="编辑">
              <Pencil />
            </Button>
          </Tip>
          <ConfirmDialog
            title={`移除「${ws.name}」？`}
            description="只是从统计范围里移除，不会动你磁盘上的仓库。已生成的报告不受影响。"
            confirmText="移除"
            onConfirm={onDelete}
          >
            <Button variant="ghost" size="icon-sm" aria-label="移除">
              <Trash2 />
            </Button>
          </ConfirmDialog>
        </div>
      </div>
    </div>
  )
}

function WorkspaceDrawer({
  open,
  workspace,
  existing,
  defaultAuthors,
  onOpenChange,
  onSubmit,
}: {
  open: boolean
  workspace: Workspace | null
  existing: Workspace[]
  defaultAuthors: string[]
  onOpenChange: (v: boolean) => void
  onSubmit: (ws: Workspace) => Promise<void>
}) {
  const [draft, setDraft] = React.useState<Workspace | null>(workspace)
  const [probe, setProbe] = React.useState<WorkspaceProbe | null>(null)
  const [probing, setProbing] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [showAuthors, setShowAuthors] = React.useState(false)

  React.useEffect(() => {
    setDraft(workspace)
    setProbe(null)
    setShowAuthors(false)
  }, [workspace])

  const set = (patch: Partial<Workspace>) => setDraft((d) => (d ? { ...d, ...patch } : d))

  /** 失焦即体检路径：目录在不在、是不是 git 仓库、最近谁在提交 */
  const runProbe = React.useCallback(async (p: string) => {
    if (!p.trim()) {
      setProbe(null)
      return
    }
    setProbing(true)
    try {
      const res = await api.validateWorkspace(p)
      setProbe(res)
      setDraft((d) => {
        if (!d) return d
        const patch: Partial<Workspace> = {}
        // 用仓库根目录纠正用户填的子目录路径
        if (res.ok && res.resolvedPath && res.resolvedPath !== d.path) patch.path = res.resolvedPath
        // 名称和标签留空时用目录名兜底，减少填写负担
        const base = (res.resolvedPath || p).split('/').filter(Boolean).pop() ?? ''
        if (!d.name && base) patch.name = base
        if (!d.moduleTag && base) patch.moduleTag = base
        return Object.keys(patch).length ? { ...d, ...patch } : d
      })
    } catch (e) {
      setProbe(null)
      toast.error('路径校验失败', { description: e instanceof ApiError ? e.message : String(e) })
    } finally {
      setProbing(false)
    }
  }, [])

  if (!draft) return null

  const tagTaken = existing.some((w) => w.id !== draft.id && w.moduleTag === draft.moduleTag)
  const canSubmit =
    !!draft.name.trim() && !!draft.moduleTag.trim() && !!draft.path.trim() && !tagTaken && !probing

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DialogHeader>
          <DialogTitle>{existing.some((w) => w.id === draft.id) ? '编辑工作区' : '添加工作区'}</DialogTitle>
          <DialogDescription>
            登记一个 git 仓库作为工作范围。AI 只会从启用的工作区里提取提交。
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <Field
            label="仓库路径"
            required
            hint="填仓库根目录的绝对路径，支持 ~ 开头。失焦后自动校验。"
          >
            <div className="relative">
              <Input
                value={draft.path}
                onChange={(e) => set({ path: e.target.value })}
                onBlur={(e) => void runProbe(e.target.value)}
                placeholder="/Users/rockcoder/Documents/project/my-repo"
                className={cn(
                  'pr-8 font-mono text-[12px]',
                  probe && !probe.ok && 'border-danger/50 focus:border-danger/60 focus:ring-danger/15',
                  probe?.ok && 'border-success/50 focus:border-success/60 focus:ring-success/15',
                )}
                spellCheck={false}
              />
              <span className="absolute right-2.5 top-1/2 -translate-y-1/2">
                {probing ? (
                  <Loader2 className="size-3.5 animate-spin text-subtle" />
                ) : probe?.ok ? (
                  <Check className="size-3.5 text-success" />
                ) : probe ? (
                  <AlertCircle className="size-3.5 text-danger" />
                ) : null}
              </span>
            </div>
          </Field>

          {probe && <ProbeResult probe={probe} />}

          <div className="grid grid-cols-2 gap-3">
            <Field label="工作区名称" required hint="仅用于本页展示">
              <Input
                value={draft.name}
                onChange={(e) => set({ name: e.target.value })}
                placeholder="全局搜索"
              />
            </Field>
            <Field
              label="模块标签"
              required
              error={tagTaken ? '该标签已被其他工作区占用' : undefined}
              hint={tagTaken ? undefined : '报告里【xxx】的取值'}
            >
              <Input
                value={draft.moduleTag}
                onChange={(e) => set({ moduleTag: e.target.value })}
                placeholder="全局搜索"
                maxLength={20}
                className={cn(tagTaken && 'border-danger/50')}
              />
            </Field>
          </div>

          <Field
            label="作者过滤"
            hint={
              draft.authors.length
                ? '只统计这些作者的提交，逗号分隔'
                : `留空则跟随全局设置${defaultAuthors.length ? `（${defaultAuthors.join('、')}）` : '，但全局也未设置，将统计所有人'}`
            }
          >
            <Input
              value={draft.authors.join(', ')}
              onChange={(e) =>
                set({ authors: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
              }
              placeholder="rockcoding@163.com"
              className="font-mono text-[12px]"
            />
          </Field>

          {probe?.authors && probe.authors.length > 0 && (
            <div className="rounded-control border border-border bg-surface-sunken/60 p-2.5">
              <button
                onClick={() => setShowAuthors((v) => !v)}
                className="flex w-full items-center gap-1.5 text-[11.5px] font-medium text-muted-foreground"
              >
                <Users className="size-3.5" />
                该仓库近半年的提交者（{probe.authors.length}）
                <ChevronDown className={cn('ml-auto size-3.5 transition-transform', showAuthors && 'rotate-180')} />
              </button>
              {showAuthors && (
                <div className="mt-2 space-y-1">
                  {probe.authors.map((a) => {
                    const picked = draft.authors.includes(a.email)
                    return (
                      <button
                        key={a.email || a.name}
                        onClick={() =>
                          set({
                            authors: picked
                              ? draft.authors.filter((x) => x !== a.email)
                              : [...draft.authors, a.email],
                          })
                        }
                        className={cn(
                          'flex w-full items-center gap-2 rounded-[6px] px-2 py-1.5 text-left text-[12px] transition-colors',
                          picked ? 'bg-primary-soft text-primary' : 'hover:bg-muted',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-3.5 shrink-0 items-center justify-center rounded-[4px] border',
                            picked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                          )}
                        >
                          {picked && <Check className="size-2.5" />}
                        </span>
                        <span className="truncate font-medium">{a.name}</span>
                        <span className="truncate font-mono text-[10.5px] text-subtle">{a.email}</span>
                        <span className="ml-auto shrink-0 tabular-nums text-[10.5px] text-subtle">
                          {a.commits}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          <Field label="限定分支" hint="留空表示统计所有分支，逗号分隔">
            <Input
              value={draft.branches.join(', ')}
              onChange={(e) =>
                set({ branches: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
              }
              placeholder="main, develop"
              className="font-mono text-[12px]"
            />
          </Field>

          <Field label="标识色">
            <div className="flex flex-wrap gap-1.5">
              {PALETTE.map((c) => (
                <button
                  key={c}
                  onClick={() => set({ color: c })}
                  className={cn(
                    'size-6 rounded-[7px] transition-transform hover:scale-110',
                    draft.color === c && 'ring-2 ring-offset-2 ring-offset-surface',
                  )}
                  style={{ background: c, ...(draft.color === c ? { boxShadow: `0 0 0 2px ${c}` } : {}) }}
                  aria-label={c}
                />
              ))}
            </div>
          </Field>

          <Field label="备注">
            <Textarea
              value={draft.note}
              onChange={(e) => set({ note: e.target.value })}
              placeholder="这个仓库负责什么，可留空"
              rows={2}
              maxLength={200}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button
            variant="primary"
            size="sm"
            disabled={!canSubmit}
            loading={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await onSubmit(draft)
              } finally {
                setBusy(false)
              }
            }}
          >
            保存
          </Button>
        </DialogFooter>
      </DrawerContent>
    </Dialog>
  )
}

function ProbeResult({ probe }: { probe: WorkspaceProbe }) {
  if (!probe.ok) {
    return (
      <div className="flex items-start gap-2 rounded-control border border-danger/25 bg-danger-soft px-2.5 py-2">
        <AlertCircle className="mt-px size-3.5 shrink-0 text-danger" />
        <div className="min-w-0 text-[11.5px] leading-relaxed">
          <p className="font-medium text-danger">{probe.reason}</p>
          {probe.resolvedPath && (
            <p className="mt-0.5 truncate font-mono text-subtle">{probe.resolvedPath}</p>
          )}
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-control border border-success/25 bg-success-soft px-2.5 py-2">
      <div className="flex items-center gap-1.5 text-[11.5px] font-medium text-success">
        <Check className="size-3.5" />
        有效的 git 仓库
      </div>
      <div className="mt-1.5 space-y-0.5 text-[11px] text-muted-foreground">
        <p className="flex items-center gap-1.5">
          <GitBranch className="size-3 shrink-0" />
          当前分支 <code className="font-mono">{probe.branch}</code>
        </p>
        {probe.remote && <p className="truncate font-mono text-[10.5px] text-subtle">{probe.remote}</p>}
        {probe.lastCommitAt && (
          <p>最近提交：{formatDateTime(probe.lastCommitAt)} · 近半年 {probe.commitCount} 次提交</p>
        )}
      </div>
    </div>
  )
}
