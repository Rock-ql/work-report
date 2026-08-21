import * as React from 'react'
import type { EditorView } from '@codemirror/view'
import {
  Bold,
  Code,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Table,
  Tag,
  Undo2,
} from 'lucide-react'
import { redo, undo } from '@codemirror/commands'
import { cn } from '@/lib/utils'
import { Tip } from '@/components/ui/tooltip'
import { Dropdown, DropdownContent, DropdownItem, DropdownLabel, DropdownTrigger } from '@/components/ui/dropdown'
import {
  insertCodeBlock,
  insertLink,
  insertTable,
  insertTag,
  insertBlock,
  toggleLinePrefix,
  toggleOrderedList,
  wrapInline,
} from './commands'

interface ToolItem {
  key: string
  icon: React.ComponentType<{ className?: string }>
  label: string
  shortcut?: string
  run: (view: EditorView) => void
}

const GROUPS: ToolItem[][] = [
  [
    { key: 'h1', icon: Heading1, label: '一级标题', run: (v) => toggleLinePrefix(v, '# ', /^#\s+/) },
    { key: 'h2', icon: Heading2, label: '二级标题', run: (v) => toggleLinePrefix(v, '## ', /^##\s+/) },
    { key: 'h3', icon: Heading3, label: '三级标题', run: (v) => toggleLinePrefix(v, '### ', /^###\s+/) },
  ],
  [
    { key: 'bold', icon: Bold, label: '加粗', shortcut: '⌘B', run: (v) => wrapInline(v, '**') },
    { key: 'italic', icon: Italic, label: '斜体', shortcut: '⌘I', run: (v) => wrapInline(v, '*') },
    { key: 'strike', icon: Strikethrough, label: '删除线', run: (v) => wrapInline(v, '~~') },
    { key: 'code', icon: Code, label: '行内代码', shortcut: '⌘E', run: (v) => wrapInline(v, '`') },
  ],
  [
    { key: 'ol', icon: ListOrdered, label: '有序列表', shortcut: '⌘⇧O', run: toggleOrderedList },
    { key: 'ul', icon: List, label: '无序列表', shortcut: '⌘⇧L', run: (v) => toggleLinePrefix(v, '- ', /^[-*+]\s+/) },
    { key: 'task', icon: ListTodo, label: '任务列表', run: (v) => toggleLinePrefix(v, '- [ ] ', /^[-*+]\s+\[[ xX]\]\s+/) },
    { key: 'quote', icon: Quote, label: '引用', run: (v) => toggleLinePrefix(v, '> ', /^>\s?/) },
  ],
  [
    { key: 'link', icon: Link2, label: '链接', shortcut: '⌘K', run: insertLink },
    { key: 'codeblock', icon: Code2, label: '代码块', run: insertCodeBlock },
    { key: 'table', icon: Table, label: '表格', run: insertTable },
    { key: 'hr', icon: Minus, label: '分割线', run: (v) => insertBlock(v, '\n---\n') },
  ],
]

export function Toolbar({
  view,
  tags,
  className,
  compact,
}: {
  view: EditorView | null
  tags: string[]
  className?: string
  compact?: boolean
}) {
  const disabled = !view
  // 钉钉不渲染标题/表格/代码块，紧凑模式下把它们收起来避免误用
  const groups = compact ? [GROUPS[1], GROUPS[2], [GROUPS[3][0]]] : GROUPS

  return (
    <div className={cn('flex flex-wrap items-center gap-0.5', className)}>
      {groups.map((group, gi) => (
        <React.Fragment key={gi}>
          {gi > 0 && <span className="mx-1 h-4 w-px bg-border" />}
          {group.map((item) => (
            <Tip key={item.key} label={item.shortcut ? `${item.label} ${item.shortcut}` : item.label}>
              <button
                type="button"
                disabled={disabled}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => view && item.run(view)}
                className={cn(
                  'flex size-7 items-center justify-center rounded-[6px] text-muted-foreground',
                  'transition-colors hover:bg-muted hover:text-foreground',
                  'disabled:pointer-events-none disabled:opacity-40',
                )}
                aria-label={item.label}
              >
                <item.icon className="size-[15px]" />
              </button>
            </Tip>
          ))}
        </React.Fragment>
      ))}

      {tags.length > 0 && (
        <>
          <span className="mx-1 h-4 w-px bg-border" />
          <Dropdown>
            <Tip label="插入模块标签">
              <DropdownTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  className={cn(
                    'flex h-7 items-center gap-1 rounded-[6px] px-1.5 text-muted-foreground',
                    'transition-colors hover:bg-muted hover:text-foreground',
                    'disabled:pointer-events-none disabled:opacity-40',
                  )}
                >
                  <Tag className="size-[15px]" />
                </button>
              </DropdownTrigger>
            </Tip>
            <DropdownContent align="start">
              <DropdownLabel>插入模块标签</DropdownLabel>
              {tags.map((tag) => (
                <DropdownItem key={tag} onSelect={() => view && insertTag(view, tag)}>
                  <span className="font-mono text-[12px] text-subtle">【</span>
                  {tag}
                  <span className="font-mono text-[12px] text-subtle">】</span>
                </DropdownItem>
              ))}
            </DropdownContent>
          </Dropdown>
        </>
      )}

      <span className="mx-1 h-4 w-px bg-border" />
      <Tip label="撤销 ⌘Z">
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => view && undo(view)}
          className="flex size-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          aria-label="撤销"
        >
          <Undo2 className="size-[15px]" />
        </button>
      </Tip>
      <Tip label="重做 ⌘⇧Z">
        <button
          type="button"
          disabled={disabled}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => view && redo(view)}
          className="flex size-7 items-center justify-center rounded-[6px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
          aria-label="重做"
        >
          <Redo2 className="size-[15px]" />
        </button>
      </Tip>
    </div>
  )
}
