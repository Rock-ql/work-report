import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router-dom'
import * as AlertDialog from '@radix-ui/react-alert-dialog'
import { AlertCircle, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, ClipboardCheck, Columns2, Copy, Download, Eye, FileText, MoreHorizontal, PencilLine, RefreshCw, Save, Settings2, Upload } from 'lucide-react'
import { toast } from 'sonner'
import { performanceSchema, type PerformanceReport } from '@shared/schema'
import { PERFORMANCE_ITEMS, performanceText } from '@shared/performance'
import { api, ApiError } from '@/lib/api'
import { useApp, useToday } from '@/lib/store'
import { Button } from '@/components/ui/button'
import { EmptyState, PageBody, Skeleton, TopBar } from '@/components/layout/PageShell'
import { MarkdownEditor, type EditorMode } from '@/components/editor/MarkdownEditor'
import { MarkdownPreview } from '@/components/editor/Preview'
import { ConfirmDialog } from '@/components/ui/alert-dialog'
import { Dropdown, DropdownContent, DropdownItem, DropdownTrigger } from '@/components/ui/dropdown'
import { Tip } from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/
const inputClass = 'rounded-control border border-border bg-surface px-3 py-2 text-sm text-foreground focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary'
const messageOf = (e: unknown) => e instanceof Error ? e.message : String(e)

async function copy(text: string) {
  try { await navigator.clipboard.writeText(text); toast.success('已复制') }
  catch { toast.error('剪贴板不可用，请选中文字复制，或下载文本') }
}

export default function Performance() {
  const { today } = useToday()
  const [params, setParams] = useSearchParams()
  const previous = new Date(Number(today.slice(0, 4)), Number(today.slice(5, 7)) - 2, 1)
  const fallback = `${previous.getFullYear()}-${String(previous.getMonth() + 1).padStart(2, '0')}`
  const month = params.get('month') || fallback
  const [history, setHistory] = useState<PerformanceReport[]>([])
  const [historyError, setHistoryError] = useState('')
  const { dataRevision, dataDir } = useApp()
  async function refreshHistory() {
    try { setHistory((await api.listPerformance()).reports); setHistoryError('') }
    catch (e) { setHistoryError(messageOf(e)) }
  }
  useEffect(() => { void refreshHistory() }, [dataRevision])
  const changeMonth = (value: string) => { if (MONTH.test(value)) setParams({ month: value }) }
  const navigation = <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-6 py-2.5">
    <div className="flex items-center gap-1">
      <Tip label="上个月"><Button size="icon-sm" variant="ghost" aria-label="上个月" disabled={!MONTH.test(month) || month === '0000-01'} onClick={() => changeMonth(shiftMonth(month, -1))}><ChevronLeft /></Button></Tip>
      <label className="flex items-center gap-2 rounded-control border border-border bg-surface px-2.5 py-1">
        <CalendarDays className="size-3.5 text-muted-foreground" />
        <span className="sr-only">考核月份</span>
        <input aria-label="考核月份" type="month" className="w-[132px] bg-transparent text-[13px] font-medium tabular-nums [color-scheme:light] dark:[color-scheme:dark]" value={month} onChange={e => changeMonth(e.target.value)} />
      </label>
      <Tip label="下个月"><Button size="icon-sm" variant="ghost" aria-label="下个月" disabled={!MONTH.test(month) || month === '9999-12'} onClick={() => changeMonth(shiftMonth(month, 1))}><ChevronRight /></Button></Tip>
      {month !== fallback && <Button size="sm" variant="ghost" onClick={() => changeMonth(fallback)}>回到上月</Button>}
    </div>
    <label className="flex min-w-0 items-center gap-2 text-[12px] text-muted-foreground">
      <span className="shrink-0">历史考核</span>
      <select aria-label="已保存考核" className="h-8 max-w-[200px] rounded-control border border-border bg-surface px-2 text-[12px] text-foreground" value={history.some(r => r.month === month) ? month : ''} onChange={e => changeMonth(e.target.value)}>
        <option value="">{history.length ? '选择已保存月份' : '暂无已保存考核'}</option>
        {history.map(r => <option key={r.month} value={r.month}>{r.month} · {r.source.type === 'offline' ? '线下清单' : '系统日报'}</option>)}
      </select>
    </label>
  </div>
  const historyNotice = historyError && <div role="alert" className="text-sm text-danger">历史列表加载失败：{historyError} <Button size="sm" onClick={refreshHistory}>重试</Button></div>
  return MONTH.test(month)
    ? <MonthEditor key={dataDir + ':' + month} month={month} storageScope={dataDir} onSaved={refreshHistory} navigation={navigation} historyNotice={historyNotice} />
    : <><TopBar title="月度绩效考核">{navigation}</TopBar><PageBody><p role="alert">月份无效，请选择 YYYY-MM 格式的月份。</p></PageBody></>
}

function shiftMonth(month: string, delta: number) {
  const total = Number(month.slice(0, 4)) * 12 + Number(month.slice(5, 7)) - 1 + delta
  return String(Math.floor(total / 12)).padStart(4, '0') + '-' + String(total % 12 + 1).padStart(2, '0')
}

function MonthEditor({ month, storageScope, onSaved, navigation, historyNotice }: { month: string; storageScope: string; onSaved: () => Promise<void>; navigation: ReactNode; historyNotice: ReactNode }) {
  const [report, setReport] = useState<PerformanceReport | null>(null)
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string>()
  const [dirty, setDirty] = useState(false)
  const [sourceType, setSourceType] = useState<'daily' | 'offline'>('daily')
  const [text, setText] = useState('')
  const [filename, setFilename] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [loadFailed, setLoadFailed] = useState(false)
  const [inputDirty, setInputDirty] = useState(false)
  const [showSetup, setShowSetup] = useState(false)
  const [confirmReload, setConfirmReload] = useState(false)
  const [mode, setMode] = useState<EditorMode>('edit')
  const { workspaces } = useApp()
  const tags = workspaces.filter(w => w.enabled).map(w => w.moduleTag)
  const alive = useRef(true)
  const storageKey = `wr-performance-draft:${storageScope}:${month}`
  const inputKey = `${storageKey}:input`
  function rememberInput(type: 'daily' | 'offline', value: string, name: string) {
    setSourceType(type); setText(value); setFilename(name); setInputDirty(true)
    try { sessionStorage.setItem(inputKey, JSON.stringify({ sourceType: type, text: value, filename: name })) }
    catch { /* 禁用存储时通过离开提示保护 */ }
  }
  function restoreInput() {
    try {
      const value = JSON.parse(sessionStorage.getItem(inputKey) || 'null')
      if (value && ['daily', 'offline'].includes(value.sourceType) && typeof value.text === 'string' && typeof value.filename === 'string') {
        setSourceType(value.sourceType); setText(value.text); setFilename(value.filename); setInputDirty(true); setShowSetup(true)
      }
    } catch { /* 忽略无效浏览器草稿 */ }
  }

  function adopt(next: PerformanceReport | null, base?: string, changed = false) {
    setReport(next); setBaseUpdatedAt(base); setDirty(changed)
    if (next) {
      setSourceType(next.source.type)
      setText(next.source.type === 'offline' ? next.source.text : '')
      setFilename(next.source.type === 'offline' ? next.source.label : '')
    }
  }
  async function load(restoreDraft: boolean) {
    setLoading(true); setError(''); setLoadFailed(false)
    try {
      let stored: PerformanceReport | null = null
      try { stored = await api.getPerformance(month) }
      catch (e) { if (!(e instanceof ApiError && e.status === 404)) throw e }
      if (!alive.current) return
      if (restoreDraft) {
        try {
          const raw = JSON.parse(sessionStorage.getItem(storageKey) || 'null')
          const parsed = performanceSchema.safeParse(raw?.report)
          if (parsed.success && parsed.data.month === month) {
            adopt(parsed.data, raw.baseUpdatedAt, true)
            restoreInput()
            toast.info('已恢复当前标签页的未保存草稿')
            return
          }
        } catch { /* 浏览器存储禁用时仍允许使用 */ }
      }
      adopt(stored, stored?.updatedAt)
      if (restoreDraft) restoreInput()
      else {
        try { sessionStorage.removeItem(storageKey); sessionStorage.removeItem(inputKey) } catch { /* 无存储 */ }
        setInputDirty(false)
        if (!stored) { setSourceType('daily'); setText(''); setFilename('') }
      }
    } catch (e) { if (alive.current) { setError(messageOf(e)); setLoadFailed(true) } }
    finally { if (alive.current) setLoading(false) }
  }
  useEffect(() => {
    alive.current = true
    void load(true)
    return () => { alive.current = false }
  }, [])
  useEffect(() => {
    if (!dirty || !report) return
    try { sessionStorage.setItem(storageKey, JSON.stringify({ report, baseUpdatedAt })) }
    catch { /* 保存按钮仍然可用 */ }
  }, [report, dirty, baseUpdatedAt, storageKey])
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty || inputDirty) { e.preventDefault(); e.returnValue = '' } }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty, inputDirty])

  async function generate() {
    setBusy('generate'); setError('')
    try {
      const next = await api.generatePerformance(month, { sourceType, ...(sourceType === 'offline' ? { text, filename: filename || '粘贴的线下清单' } : {}) })
      if (alive.current) {
        setReport(next); setDirty(true); setInputDirty(false); setShowSetup(false)
        try { sessionStorage.removeItem(inputKey) } catch { /* 无存储 */ }
        toast.success('七项初稿已生成，请核对后保存')
      }
    } catch (e) { if (alive.current) setError(messageOf(e)) }
    finally { if (alive.current) setBusy('') }
  }
  async function save() {
    if (!report) return
    setBusy('save'); setError('')
    try {
      const next = await api.savePerformance(report, baseUpdatedAt)
      try { sessionStorage.removeItem(storageKey) } catch { /* 无存储 */ }
      if (!alive.current) return
      adopt(next, next.updatedAt)
      restoreInput()
      toast.success('绩效考核已保存')
      await onSaved()
    } catch (e) {
      if (alive.current) setError(e instanceof ApiError && e.isConflict
        ? '该月份已被其他页面或 AI 修改，未覆盖任何内容。请先复制当前草稿，再点击“读取已保存版本”核对后重新编辑。'
        : messageOf(e))
    } finally { if (alive.current) setBusy('') }
  }
  async function importFile(file?: File) {
    if (!file) return
    if (!/\.(md|txt)$/i.test(file.name) || file.size > 500_000) { setError('请选择不超过 500 KB 的 UTF-8 .md 或 .txt 文件'); return }
    setBusy('import'); setError('')
    try { const content = await file.text(); if (alive.current) rememberInput('offline', content, file.name) }
    catch (e) { if (alive.current) setError(`文件读取失败：${messageOf(e)}，请重选文件或粘贴正文`) }
    finally { if (alive.current) setBusy('') }
  }
  function download() {
    if (!report) return
    const url = URL.createObjectURL(new Blob([performanceText(report)], { type: 'text/plain;charset=utf-8' }))
    const a = document.createElement('a'); a.href = url; a.download = `${month}-绩效考核.txt`; a.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  const disabled = loading || !!busy
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        if (report && dirty && !disabled) void save()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const requestReload = () => {
    if (dirty || inputDirty) setConfirmReload(true)
    else void load(false)
  }
  const reload = <Button size="sm" variant="ghost" disabled={disabled} onClick={requestReload}><RefreshCw />读取已保存版本</Button>
  const generateButton = <Button variant={report ? 'secondary' : 'primary'} loading={busy === 'generate'} disabled={disabled || loadFailed || (sourceType === 'offline' && !text.trim())} onClick={report ? undefined : generate}><RefreshCw />{report ? '重新生成初稿' : '生成七项初稿'}</Button>
  const filled = report ? PERFORMANCE_ITEMS.filter(({ key }) => report.sections[key].trim()).length : 0
  return <>
    <TopBar title="月度绩效考核" subtitle={<span className="flex items-center gap-2">
      <span>{month}</span>
      {report ? <span role="status" className={cn('flex items-center gap-1', dirty ? 'text-muted-foreground' : 'text-success')}>
        {dirty ? <span className="size-1.5 rounded-full bg-warning" /> : <Check className="size-3" />}
        {dirty ? '未保存 · 请核对后保存' : '已保存'}
      </span> : <span>从当月工作成果开始</span>}
    </span>} actions={report && <>
      <Dropdown>
        <Tip label="更多操作"><DropdownTrigger asChild><Button size="icon" variant="ghost" aria-label="更多操作" disabled={disabled}><MoreHorizontal /></Button></DropdownTrigger></Tip>
        <DropdownContent align="end">
          <DropdownItem onSelect={download}><Download />下载文本</DropdownItem>
          <DropdownItem onSelect={requestReload}><RefreshCw />读取已保存版本</DropdownItem>
        </DropdownContent>
      </Dropdown>
      <Tip label="复制标题和七项完成情况"><Button disabled={disabled} onClick={() => copy(performanceText(report))}><Copy /><span className="hidden sm:inline">复制全部</span><span className="sr-only sm:hidden">复制全部</span></Button></Tip>
      <Tip label="核对后保存 · ⌘S / Ctrl+S"><Button variant="primary" disabled={disabled || !dirty} loading={busy === 'save'} onClick={save}><Save />保存考核</Button></Tip>
    </>}>{navigation}</TopBar>
    <AlertDialog.Root open={confirmReload} onOpenChange={setConfirmReload}>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-[400px] -translate-x-1/2 -translate-y-1/2 rounded-card border border-border bg-surface-raised p-5 shadow-pop">
          <AlertDialog.Title className="text-[15px] font-semibold">读取已保存版本？</AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm leading-relaxed text-muted-foreground">当前未保存的修改和导入文本将被放弃。可以先取消并复制草稿。</AlertDialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <AlertDialog.Cancel asChild><Button size="sm">取消</Button></AlertDialog.Cancel>
            <AlertDialog.Action asChild><Button size="sm" variant="danger" onClick={() => void load(false)}>放弃草稿并读取</Button></AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
    <PageBody className="space-y-5" >
      {historyNotice}
      {error && <div role="alert" className="flex items-start gap-3 rounded-control border border-danger/25 bg-danger-soft p-4 text-sm leading-relaxed">
        <AlertCircle className="mt-0.5 size-4 shrink-0 text-danger" /><div className="min-w-0 flex-1"><p>{error}</p><div className="mt-2">{reload}</div></div>
      </div>}
      {loading && !report ? <div role="status" aria-label="正在读取绩效考核" className="space-y-6">{[0, 1, 2].map(i => <div key={i} className="space-y-3"><Skeleton className="h-4 w-48" /><Skeleton className="h-40 w-full" /></div>)}</div> : <>
        {report && <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5 rounded-badge bg-muted px-2 py-1"><FileText className="size-3.5" />{report.source.type === 'daily' ? '系统日报 · ' + report.source.dates.length + ' 天记录' : '线下工作清单'}</span>
            <span>已填写 {filled} / 7 项</span>
          </div>
          <Button size="sm" variant={showSetup ? 'soft' : 'ghost'} aria-expanded={showSetup} aria-controls="performance-setup" onClick={() => setShowSetup(v => !v)}><Settings2 />生成设置<ChevronDown className={cn(showSetup && 'rotate-180')} /></Button>
        </div>}
        {(!report || showSetup) && <section id="performance-setup" className="rounded-card border border-border bg-surface-sunken/40 p-4 sm:p-5">
          <div className="mb-4"><h2 className="text-sm font-semibold">{report ? '重新整理工作成果' : month + ' 还没有绩效考核'}</h2><p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">选择生成依据，整理七项完成情况。初稿核对后再保存，不会改动日报。</p></div>
          <fieldset disabled={disabled || loadFailed} className="min-w-0 space-y-4">
            <legend className="sr-only">生成依据</legend>
            <div className="grid gap-3 sm:grid-cols-2">
              {([{ value: 'daily', title: '系统日报', hint: '汇总当月已完成的工作', icon: CalendarDays }, { value: 'offline', title: '线下工作清单', hint: '导入文件或直接粘贴正文', icon: Upload }] as const).map(({ value, title, hint, icon: Icon }) => <label key={value} className={cn('flex cursor-pointer items-center gap-3 rounded-control border px-4 py-3 focus-within:ring-2 focus-within:ring-ring', sourceType === value ? 'border-primary/40 bg-primary-soft' : 'border-border bg-surface')}>
                <input type="radio" className="sr-only" name="performance-source" value={value} checked={sourceType === value} onChange={() => rememberInput(value, text, filename)} />
                <Icon className={cn('size-5 shrink-0', sourceType === value ? 'text-primary' : 'text-muted-foreground')} />
                <span className="min-w-0 flex-1"><span className="block text-sm font-medium">{title}</span><span className="mt-0.5 block text-[12px] text-muted-foreground">{hint}</span></span>
                <span className={cn('flex size-4 shrink-0 items-center justify-center rounded-full border', sourceType === value ? 'border-primary bg-primary text-primary-foreground' : 'border-input')}>{sourceType === value && <Check className="size-3" />}</span>
              </label>)}
            </div>
            {sourceType === 'daily' ? <p className="text-[13px] leading-relaxed text-muted-foreground">只读取 {month} 日报的“今日工作完成情况”，合并重复条目，不把计划与待办计入成果。</p> : <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2"><label htmlFor="performance-source-text" className="text-[13px] font-medium">清单正文</label><span className="text-[12px] tabular-nums text-muted-foreground">{text.length.toLocaleString()} / 500,000 字符</span></div>
              <textarea id="performance-source-text" aria-label="清单正文" className={cn(inputClass, 'min-h-40 w-full resize-y leading-7')} value={text} maxLength={500000} onChange={e => rememberInput('offline', e.target.value, '粘贴的线下清单')} placeholder="粘贴当月的工作清单，例如：完成订单退款接口上线与回归验证…" />
              <label className="block text-[12px] text-muted-foreground">导入 UTF-8 .md / .txt 文件，最大 500 KB
                <input aria-label="导入清单" type="file" accept=".md,.txt,text/plain,text/markdown" className="mt-2 block w-full text-[12px] file:mr-3 file:rounded-control file:border file:border-border file:bg-surface file:px-3 file:py-1.5 file:text-foreground" onChange={e => { void importFile(e.target.files?.[0]); e.target.value = '' }} />
              </label>
              {filename && <p className="break-all text-[12px] text-muted-foreground">来源：{filename}</p>}
            </div>}
            <div className="flex flex-wrap items-center gap-3 border-t border-border pt-4">
              {report ? <ConfirmDialog title="重新生成七项初稿？" description="将替换编辑区的全部七项内容。已保存版本不会立即被覆盖，但当前未保存修改会被替换。" confirmText="确认重新生成" danger={false} onConfirm={generate}>{generateButton}</ConfirmDialog> : generateButton}
              <span className="text-[12px] text-muted-foreground">本地规则整理，非 AI 语义生成；请人工核对。</span>
            </div>
          </fieldset>
        </section>}
        {report ? <>
          {!!report.warnings.length && <details className="group rounded-control border border-border bg-surface-sunken/40">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[13px] [&::-webkit-details-marker]:hidden"><AlertCircle className="size-4 text-warning" /><span className="font-medium">提交前核对</span><span className="text-muted-foreground">{report.warnings.length} 项提示</span><ChevronDown className="ml-auto size-4 text-subtle group-open:rotate-180" /></summary>
            <div className="border-t border-border px-4 py-3"><p className="mb-2 text-[12px] text-muted-foreground">以下提示不会包含在复制或下载的文本中。</p><ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed">{report.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul></div>
          </details>}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
            <div><h2 className="text-sm font-semibold">七项完成情况</h2><p className="mt-1 text-[12px] text-muted-foreground">逐项核对与修改，保存后可复制提交。</p></div>
            <div aria-label="内容显示模式" className="flex items-center gap-0.5 rounded-control border border-border bg-surface-sunken p-0.5">
              {([{ key: 'edit', label: '编辑', icon: PencilLine }, { key: 'split', label: '分栏', icon: Columns2 }, { key: 'preview', label: '预览', icon: Eye }] as const).map(({ key, label, icon: Icon }) => <Button key={key} size="sm" variant="ghost" aria-label={label + '模式'} aria-pressed={mode === key} className={cn(mode === key && 'bg-surface text-foreground shadow-card')} onClick={() => setMode(key)}><Icon />{label}</Button>)}
            </div>
          </div>
          <div className="space-y-6" aria-busy={disabled}>
            {PERFORMANCE_ITEMS.map(({ key, title }, index) => <section key={key} id={'perf-' + key} aria-labelledby={'perf-title-' + key} className="min-w-0 space-y-2.5 scroll-mt-36">
              {index === 4 && <h2 className="border-t border-border pb-1 pt-5 text-[12px] font-medium text-muted-foreground">加分与流程规范</h2>}
              <div className="flex items-center gap-2">
                <h3 id={'perf-title-' + key} className="min-w-0 text-sm font-semibold">{title.split('（')[0]}</h3>
                <span className={cn('shrink-0 rounded-badge px-1.5 py-0.5 text-[11px] font-medium tabular-nums', index < 4 ? 'bg-primary-soft text-primary' : 'bg-muted text-muted-foreground')}>{title.split('（')[1].replace('）', '')}</span>
                {!report.sections[key].trim() && <span className="text-[11px] text-muted-foreground">待补充</span>}
                <Tip label="复制此项完成情况"><Button className="ml-auto shrink-0" size="icon-sm" variant="ghost" disabled={disabled || !report.sections[key].trim()} aria-label={'复制' + title} onClick={() => copy(report.sections[key])}><Copy /></Button></Tip>
              </div>
              {mode === 'preview' ? <div className="overflow-hidden rounded-control border border-border bg-surface"><MarkdownPreview value={report.sections[key]} placeholder="暂无完成情况，切换编辑模式补充。" className="break-words" /></div>
                : <fieldset disabled={disabled} className="min-w-0"><legend className="sr-only">{title}</legend><MarkdownEditor className="[&_.prose-report]:break-words" value={report.sections[key]} readOnly={disabled} mode={mode} compactToolbar tags={tags} minHeight={index < 4 ? 116 : 80} ariaLabel={title + '完成情况'} responsiveSplit placeholder="填写本月可确认的工作成果，不确定的量化结论请留待核对…" onChange={value => { if (!disabled) { setReport(current => current && ({ ...current, sections: { ...current.sections, [key]: value } })); setDirty(true) } }} /></fieldset>}
            </section>)}
          </div>
          <details className="group rounded-control border border-border">
            <summary className="flex cursor-pointer list-none items-center gap-2 p-4 text-[13px] [&::-webkit-details-marker]:hidden"><FileText className="size-4 text-muted-foreground" />查看生成依据原文{report.source.type === 'daily' ? '与日报日期' : ''}<ChevronDown className="ml-auto size-4 text-subtle group-open:rotate-180" /></summary>
            <div className="border-t border-border p-4"><p className="break-all text-[12px] text-muted-foreground">{report.source.label}</p>
              {report.source.dates.length > 0 && <div className="mt-3 flex flex-wrap gap-2 text-[12px]">{report.source.dates.map(date => <a className="rounded-badge bg-primary-soft px-2 py-1 font-mono text-primary underline-offset-4 hover:underline" key={date} href={'/report/daily/' + date} target="_blank" rel="noreferrer">{date}</a>)}</div>}
              <pre className="mt-3 max-h-96 overflow-y-auto whitespace-pre-wrap break-words font-sans text-sm leading-7 text-muted-foreground">{report.source.text}</pre>
            </div>
          </details>
          <p className="pb-3 text-center text-[12px] text-muted-foreground">草稿保留在当前标签页，正式保存请点击“保存考核”或按 ⌘S / Ctrl+S。</p>
        </> : loadFailed && <EmptyState icon={ClipboardCheck} title="暂时无法读取考核" description="当前草稿未被清除，请恢复连接后重试。" action={reload} />}
      </>}
    </PageBody>
  </>
}

