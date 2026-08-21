import * as React from 'react'
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { EditorView, keymap } from '@codemirror/view'
import { Prec } from '@codemirror/state'
import { autocompletion, type CompletionContext } from '@codemirror/autocomplete'
import { Columns2, Eye, PencilLine } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/ui/tooltip'
import { cmHighlight, cmTheme } from './cm-theme'
import { Toolbar } from './Toolbar'
import { MarkdownPreview } from './Preview'
import { sanitizePaste, toggleLinePrefix, toggleOrderedList, wrapInline, insertLink } from './commands'

export type EditorMode = 'edit' | 'split' | 'preview'

const MODES: { key: EditorMode; icon: React.ComponentType<{ className?: string }>; label: string }[] = [
  { key: 'edit', icon: PencilLine, label: '编辑' },
  { key: 'split', icon: Columns2, label: '分栏' },
  { key: 'preview', icon: Eye, label: '预览' },
]

export function MarkdownEditor({
  value,
  onChange,
  placeholder,
  tags = [],
  mode = 'split',
  onModeChange,
  minHeight = 180,
  readOnly,
  toolbarExtra,
  compactToolbar,
  className,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  tags?: string[]
  mode?: EditorMode
  onModeChange?: (m: EditorMode) => void
  minHeight?: number
  readOnly?: boolean
  toolbarExtra?: React.ReactNode
  compactToolbar?: boolean
  className?: string
}) {
  const ref = React.useRef<ReactCodeMirrorRef>(null)
  const [view, setView] = React.useState<EditorView | null>(null)
  const tagsRef = React.useRef(tags)
  tagsRef.current = tags

  /** 输入【时补全模块标签，杜绝 AI 规范里"标签必须取自 workspaces"被手写破坏 */
  const tagCompletion = React.useCallback((ctx: CompletionContext) => {
    const before = ctx.matchBefore(/【[^】]*/)
    if (!before || (before.from === before.to && !ctx.explicit)) return null
    const typed = before.text.slice(1)
    const options = tagsRef.current
      .filter((t) => !typed || t.toLowerCase().includes(typed.toLowerCase()))
      .map((t) => ({ label: t, apply: `【${t}】`, type: 'keyword' as const, detail: '模块' }))
    if (!options.length) return null
    return { from: before.from, options, filter: false }
  }, [])

  const extensions = React.useMemo(
    () => [
      // 不挂 codeLanguages：本应用禁用代码块，省下全部语言包
      markdown({ base: markdownLanguage, addKeymap: true }),
      cmTheme,
      cmHighlight,
      EditorView.lineWrapping,
      autocompletion({ override: [tagCompletion], activateOnTyping: true, icons: false }),
      // Prec.highest 保证这些键位盖过 CodeMirror 默认绑定
      Prec.highest(
        keymap.of([
          { key: 'Mod-b', run: (v) => (wrapInline(v, '**'), true) },
          { key: 'Mod-i', run: (v) => (wrapInline(v, '*'), true) },
          { key: 'Mod-e', run: (v) => (wrapInline(v, '`'), true) },
          { key: 'Mod-k', run: (v) => (insertLink(v), true) },
          { key: 'Mod-Shift-l', run: (v) => (toggleLinePrefix(v, '- ', /^[-*+]\s+/), true) },
          { key: 'Mod-Shift-o', run: (v) => (toggleOrderedList(v), true) },
        ]),
      ),
      EditorView.domEventHandlers({
        paste(event, v) {
          const text = event.clipboardData?.getData('text/plain')
          if (!text) return false
          const cleaned = sanitizePaste(text)
          if (cleaned === text) return false
          event.preventDefault()
          const { from, to } = v.state.selection.main
          v.dispatch({
            changes: { from, to, insert: cleaned },
            selection: { anchor: from + cleaned.length },
          })
          return true
        },
      }),
    ],
    [tagCompletion],
  )

  const stats = React.useMemo(() => {
    const chars = value.replace(/\s/g, '').length
    const items = value.split('\n').filter((l) => /^\s*(?:\d+[.)]|[-*+])\s+/.test(l)).length
    return { chars, items }
  }, [value])

  const showEditor = mode !== 'preview'
  const showPreview = mode !== 'edit'

  return (
    <div className={cn('overflow-hidden rounded-control border border-border bg-surface', className)}>
      {/* 工具条 */}
      <div className="flex items-center gap-2 border-b border-border bg-surface-sunken/60 px-2 py-1.5">
        <Toolbar view={view} tags={tags} compact={compactToolbar} className="flex-1" />
        {toolbarExtra}
        {onModeChange && (
          <div className="flex items-center gap-0.5 rounded-[6px] border border-border bg-surface p-0.5">
            {MODES.map(({ key, icon: Icon, label }) => (
              <Tip key={key} label={label}>
                <button
                  type="button"
                  onClick={() => onModeChange(key)}
                  className={cn(
                    'flex size-6 items-center justify-center rounded-[4px] transition-colors',
                    mode === key ? 'bg-muted text-foreground' : 'text-subtle hover:text-muted-foreground',
                  )}
                  aria-label={label}
                >
                  <Icon className="size-3.5" />
                </button>
              </Tip>
            ))}
          </div>
        )}
      </div>

      {/* 编辑 / 预览。高度随内容增长，只保底 minHeight —— 短内容不留大片空白 */}
      <div
        className={cn(
          'grid items-stretch',
          showEditor && showPreview ? 'grid-cols-2 divide-x divide-border' : 'grid-cols-1',
        )}
      >
        {showEditor && (
          <div className="min-w-0">
            <CodeMirror
              ref={ref}
              value={value}
              minHeight={`${minHeight}px`}
              placeholder={placeholder}
              editable={!readOnly}
              basicSetup={{
                lineNumbers: false,
                foldGutter: false,
                highlightActiveLine: true,
                highlightActiveLineGutter: false,
                bracketMatching: true,
                closeBrackets: false,
                autocompletion: false,
                highlightSelectionMatches: false,
                searchKeymap: false,
              }}
              extensions={extensions}
              onChange={onChange}
              onCreateEditor={(v) => setView(v)}
            />
          </div>
        )}
        {showPreview && (
          <div style={{ minHeight }} className="min-w-0 overflow-auto bg-surface">
            <MarkdownPreview value={value} placeholder={placeholder ?? '暂无内容'} />
          </div>
        )}
      </div>

      {/* 状态栏 */}
      <div className="flex items-center justify-between border-t border-border bg-surface-sunken/60 px-3 py-1 text-[10.5px] text-subtle">
        <span className="tabular-nums">
          {stats.items > 0 && <>{stats.items} 条 · </>}
          {stats.chars} 字
        </span>
        <span className="font-mono opacity-70">Markdown</span>
      </div>
    </div>
  )
}
