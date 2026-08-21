import { EditorView } from '@codemirror/view'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'

/**
 * CodeMirror 主题。颜色全部走 CSS 变量，
 * 这样深浅色切换由 .dark class 驱动，编辑器无需重建。
 */
export const cmTheme = EditorView.theme({
  '&': { color: 'hsl(var(--foreground))', backgroundColor: 'transparent' },
  '.cm-content': { caretColor: 'hsl(var(--primary))' },
  '&.cm-focused .cm-cursor': { borderLeftColor: 'hsl(var(--primary))' },
  '.cm-panels': { backgroundColor: 'hsl(var(--surface))', color: 'hsl(var(--foreground))' },
  '.cm-searchMatch': { backgroundColor: 'hsl(var(--warning) / 0.28)' },
  '.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: 'hsl(var(--warning) / 0.5)' },
  '.cm-matchingBracket': {
    backgroundColor: 'hsl(var(--primary) / 0.16)',
    outline: 'none',
  },
})

export const cmHighlight = syntaxHighlighting(
  HighlightStyle.define([
    { tag: t.heading1, fontWeight: '700', fontSize: '1.15em', color: 'hsl(var(--foreground))' },
    { tag: t.heading2, fontWeight: '700', fontSize: '1.08em', color: 'hsl(var(--foreground))' },
    { tag: [t.heading3, t.heading4, t.heading5, t.heading6], fontWeight: '650', color: 'hsl(var(--foreground))' },
    { tag: t.strong, fontWeight: '700', color: 'hsl(var(--foreground))' },
    { tag: t.emphasis, fontStyle: 'italic' },
    { tag: t.strikethrough, textDecoration: 'line-through', opacity: 0.65 },
    { tag: t.link, color: 'hsl(var(--primary))', textDecoration: 'underline' },
    { tag: t.url, color: 'hsl(var(--primary))', opacity: 0.75 },
    { tag: [t.monospace], color: 'hsl(var(--success))' },
    { tag: t.quote, color: 'hsl(var(--muted-foreground))', fontStyle: 'italic' },
    { tag: t.list, color: 'hsl(var(--primary))' },
    // Markdown 标记符号本身淡化，让正文更突出
    { tag: t.processingInstruction, color: 'hsl(var(--subtle-foreground))', opacity: 0.7 },
    { tag: t.comment, color: 'hsl(var(--subtle-foreground))', fontStyle: 'italic' },
    { tag: t.keyword, color: 'hsl(var(--primary))' },
    { tag: [t.string, t.special(t.string)], color: 'hsl(var(--success))' },
    { tag: t.number, color: 'hsl(var(--warning))' },
    { tag: t.contentSeparator, color: 'hsl(var(--subtle-foreground))' },
  ]),
)
