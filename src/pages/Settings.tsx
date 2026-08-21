import * as React from 'react'
import { Check, FolderOpen, Monitor, Moon, Sun } from 'lucide-react'
import { toast } from 'sonner'
import { api } from '@/lib/api'
import { useApp } from '@/lib/store'
import { cn, copyText } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input, Field } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { PageBody, TopBar, Skeleton } from '@/components/layout/PageShell'

export default function Settings() {
  const { settings, saveSettings, theme, setTheme, loading } = useApp()
  const [dataDir, setDataDir] = React.useState('')
  const [dirty, setDirty] = React.useState(false)
  const [draft, setDraft] = React.useState(settings)

  React.useEffect(() => {
    setDraft(settings)
  }, [settings])

  React.useEffect(() => {
    void api.health().then((h) => setDataDir(h.dataDir)).catch(() => {})
  }, [])

  if (loading || !draft) {
    return (
      <>
        <TopBar title="设置" />
        <PageBody>
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-[180px] rounded-card" />
            ))}
          </div>
        </PageBody>
      </>
    )
  }

  const set = (patch: Partial<typeof draft>) => {
    setDraft((d) => (d ? { ...d, ...patch } : d))
    setDirty(true)
  }

  const commit = async () => {
    if (!draft) return
    await saveSettings(draft)
    setDirty(false)
    toast.success('设置已保存')
  }

  return (
    <>
      <TopBar
        title="设置"
        subtitle="报告标题、作者过滤与外观偏好"
        actions={
          <Button variant="primary" size="md" disabled={!dirty} onClick={commit}>
            <Check />
            保存
          </Button>
        }
      />

      <PageBody className="max-w-[720px] space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>报告标题</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <Field label="你的姓名" hint="用于报告署名，可留空">
              <Input value={draft.userName} onChange={(e) => set({ userName: e.target.value })} placeholder="肖磊" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="日报标题前缀" hint="新建日报时的默认标题">
                <Input value={draft.dailyTitle} onChange={(e) => set({ dailyTitle: e.target.value })} />
              </Field>
              <Field label="周报标题前缀">
                <Input value={draft.weeklyTitle} onChange={(e) => set({ weeklyTitle: e.target.value })} />
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Git 提取</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <Field
              label="默认作者过滤"
              hint="工作区未单独指定作者时使用。逗号分隔，可填邮箱或姓名。留空则统计所有人的提交。"
            >
              <Input
                value={draft.defaultAuthors.join(', ')}
                onChange={(e) =>
                  set({ defaultAuthors: e.target.value.split(',').map((s) => s.trim()).filter(Boolean) })
                }
                placeholder="rockcoding@163.com"
                className="font-mono text-[12px]"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="时区" hint="影响 git 提交的日期归属">
                <Input value={draft.timezone} onChange={(e) => set({ timezone: e.target.value })} className="font-mono text-[12px]" />
              </Field>
              <Field label="一周起始" hint="周报按 ISO 周计算，固定周一为起始">
                <Select value={String(draft.weekStartsOn)} onValueChange={(v) => set({ weekStartsOn: Number(v) as 0 | 1 })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">周一（ISO 标准）</SelectItem>
                    <SelectItem value="0">周日</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>外观</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5">
            <Field label="主题">
              <div className="grid grid-cols-3 gap-2">
                {([
                  { key: 'light', icon: Sun, label: '浅色' },
                  { key: 'dark', icon: Moon, label: '深色' },
                  { key: 'system', icon: Monitor, label: '跟随系统' },
                ] as const).map(({ key, icon: Icon, label }) => (
                  <button
                    key={key}
                    onClick={() => {
                      setTheme(key)
                      set({ theme: key })
                    }}
                    className={cn(
                      'flex items-center justify-center gap-1.5 rounded-control border px-3 py-2 text-[12.5px] transition-colors',
                      theme === key
                        ? 'border-primary/40 bg-primary-soft font-medium text-primary'
                        : 'border-border bg-surface text-muted-foreground hover:bg-muted',
                    )}
                  >
                    <Icon className="size-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="编辑器默认视图">
              <Select value={draft.editorMode} onValueChange={(v) => set({ editorMode: v as any })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="edit">仅编辑</SelectItem>
                  <SelectItem value="split">分栏（编辑 + 预览）</SelectItem>
                  <SelectItem value="preview">仅预览</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>数据存储</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="mb-2 text-[12.5px] leading-relaxed text-muted-foreground">
              所有报告都是 <code className="rounded bg-muted px-1 font-mono text-[11.5px]">data/</code> 下的普通 JSON 文件，
              网页和 AI Agent 读写的是同一份。可以直接纳入 git 版本管理。
            </p>
            <button
              onClick={async () => {
                const ok = await copyText(dataDir)
                ok ? toast.success('路径已复制') : toast.error('复制失败')
              }}
              className="flex w-full items-center gap-2 rounded-control border border-border bg-surface-sunken px-2.5 py-2 text-left font-mono text-[11.5px] text-muted-foreground transition-colors hover:text-foreground"
            >
              <FolderOpen className="size-3.5 shrink-0 text-subtle" />
              <span className="truncate">{dataDir || '读取中…'}</span>
            </button>
          </CardContent>
        </Card>
      </PageBody>
    </>
  )
}
