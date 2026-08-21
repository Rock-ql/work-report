import type { EditorView } from '@codemirror/view'

/**
 * 工具栏与快捷键共用的编辑命令。
 * 全部基于选区做智能 toggle：已经加粗的再点一次会去掉，而不是套两层。
 */

function currentLines(view: EditorView) {
  const { from, to } = view.state.selection.main
  const first = view.state.doc.lineAt(from)
  const last = view.state.doc.lineAt(to)
  const lines = []
  for (let n = first.number; n <= last.number; n++) lines.push(view.state.doc.line(n))
  return lines
}

/** 行内包裹：**粗体**、`代码` 等 */
export function wrapInline(view: EditorView, mark: string, endMark = mark) {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  const before = view.state.sliceDoc(Math.max(0, from - mark.length), from)
  const after = view.state.sliceDoc(to, Math.min(view.state.doc.length, to + endMark.length))

  // 已被包裹 -> 去掉
  if (before === mark && after === endMark) {
    view.dispatch({
      changes: [
        { from: from - mark.length, to: from, insert: '' },
        { from: to, to: to + endMark.length, insert: '' },
      ],
      selection: { anchor: from - mark.length, head: to - mark.length },
    })
    view.focus()
    return
  }
  // 选区自身带标记 -> 去掉
  if (selected.startsWith(mark) && selected.endsWith(endMark) && selected.length > mark.length + endMark.length) {
    const inner = selected.slice(mark.length, selected.length - endMark.length)
    view.dispatch({
      changes: { from, to, insert: inner },
      selection: { anchor: from, head: from + inner.length },
    })
    view.focus()
    return
  }

  view.dispatch({
    changes: { from, to, insert: `${mark}${selected}${endMark}` },
    selection: selected
      ? { anchor: from + mark.length, head: to + mark.length }
      : { anchor: from + mark.length },
  })
  view.focus()
}

/** 行前缀 toggle：引用、无序列表、任务列表、标题 */
export function toggleLinePrefix(view: EditorView, prefix: string, pattern: RegExp) {
  const lines = currentLines(view)
  const allHave = lines.every((l) => pattern.test(l.text))
  const changes = lines.map((line) => {
    if (allHave) {
      const m = pattern.exec(line.text)
      const len = m ? m[0].length : 0
      return { from: line.from, to: line.from + len, insert: '' }
    }
    // 先剥掉其它列表/引用标记，避免 "> - 1. " 叠加
    const strip = /^(\s*)(?:[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+|>\s?|#{1,6}\s+)?/.exec(line.text)
    const indent = strip?.[1] ?? ''
    const stripLen = strip?.[0].length ?? 0
    return { from: line.from, to: line.from + stripLen, insert: `${indent}${prefix}` }
  })
  view.dispatch({ changes })
  view.focus()
}

/** 有序列表 toggle：会自动重新编号 */
export function toggleOrderedList(view: EditorView) {
  const lines = currentLines(view)
  const pattern = /^\s*\d+[.)]\s+/
  const allHave = lines.every((l) => pattern.test(l.text))
  const changes = lines.map((line, i) => {
    if (allHave) {
      const len = pattern.exec(line.text)?.[0].length ?? 0
      return { from: line.from, to: line.from + len, insert: '' }
    }
    const strip = /^(\s*)(?:[-*+]\s+(?:\[[ xX]\]\s+)?|>\s?|#{1,6}\s+)?/.exec(line.text)
    const indent = strip?.[1] ?? ''
    const stripLen = strip?.[0].length ?? 0
    return { from: line.from, to: line.from + stripLen, insert: `${indent}${i + 1}. ` }
  })
  view.dispatch({ changes })
  view.focus()
}

export function insertBlock(view: EditorView, text: string, cursorOffset?: number) {
  const { from, to } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  // 当前行非空则先换行，保证块级元素独占一行
  const needsBreak = line.text.trim() && from === to
  const insert = needsBreak ? `\n${text}` : text
  const pos = needsBreak ? line.to : from
  view.dispatch({
    changes: { from: pos, to: needsBreak ? pos : to, insert },
    selection: { anchor: pos + (cursorOffset ?? insert.length) },
  })
  view.focus()
}

export function insertLink(view: EditorView) {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  if (selected) {
    view.dispatch({
      changes: { from, to, insert: `[${selected}](url)` },
      selection: { anchor: from + selected.length + 3, head: from + selected.length + 6 },
    })
  } else {
    view.dispatch({
      changes: { from, to, insert: '[链接文字](url)' },
      selection: { anchor: from + 1, head: from + 5 },
    })
  }
  view.focus()
}

export function insertTable(view: EditorView) {
  insertBlock(
    view,
    ['| 列一 | 列二 |', '| --- | --- |', '| 内容 | 内容 |'].join('\n') + '\n',
  )
}

export function insertCodeBlock(view: EditorView) {
  const { from, to } = view.state.selection.main
  const selected = view.state.sliceDoc(from, to)
  insertBlock(view, '```\n' + (selected || '') + '\n```\n', 4)
}

/** 在光标处插入【模块】标签 */
export function insertTag(view: EditorView, tag: string) {
  const { from, to } = view.state.selection.main
  const insert = `【${tag}】`
  view.dispatch({
    changes: { from, to, insert },
    selection: { anchor: from + insert.length },
  })
  view.focus()
}

/**
 * 粘贴清洗：从钉钉/飞书复制回来的文本常带全角空格、不间断空格和一堆空行，
 * 直接进编辑器会让 Markdown 列表失效。
 */
export function sanitizePaste(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/ /g, ' ')
    .replace(/　/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    // 钉钉里的 "1、xxx" 顺手转成 Markdown 有序列表
    .replace(/^(\s*)(\d+)[、．]\s*/gm, '$1$2. ')
    .trim()
}
