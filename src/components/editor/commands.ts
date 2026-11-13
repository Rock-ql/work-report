import { ChangeSet } from '@codemirror/state'
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

interface ListLineInfo {
  indent: number
  /** 缩进 + 标记 + 标记后空格的列数，即正文起始列 */
  contentCol: number
  ordered: boolean
  number?: number
  delim?: string
  spacer: string
}

/** 解析列表行：返回缩进、正文列与序号信息 */
function listLineInfo(text: string): ListLineInfo | null {
  const m = /^(\s*)(?:([-*+])|(\d+)([.)]))(\s+)/.exec(text)
  if (!m) return null
  return {
    indent: m[1].length,
    contentCol: m[0].length,
    ordered: m[3] !== undefined,
    number: m[3] ? Number(m[3]) : undefined,
    delim: m[4],
    spacer: m[5],
  }
}

function leadingSpaces(text: string) {
  return /^\s*/.exec(text)?.[0].length ?? 0
}

/**
 * 算出某个缩进层上移入项应沿用的序号：紧邻的同层有序兄弟项 + 1，没有则从 1 开始。
 * 返回 0 表示找到的是同层无序列表项（不是同一有序列表）。
 */
function precedingSiblingNumber(doc: EditorView['state']['doc'], lineNumber: number, indent: number) {
  for (let n = lineNumber - 1; n >= 1; n--) {
    const text = doc.line(n).text
    if (!text.trim()) continue
    const prev = listLineInfo(text)
    if (prev) {
      if (prev.indent === indent) return prev.ordered ? (prev.number ?? 0) : 0
      if (prev.indent < indent) return 0
      continue
    }
    // 非列表行：只有缩进更深时才算列表项的续行
    if (leadingSpaces(text) <= indent) break
  }
  return 0
}

/**
 * Tab / Shift-Tab：列表行整行缩进、反缩进，变成真正的子项。
 * 两个坑都得补：
 * 1. remark 对有序列表要求缩进到父项正文列（`1. a` 下用 2 空格会被当成同级）；
 * 2. 子列表首项必须以 1 开头，否则 CommonMark 认为它不能打断段落，`2. b` 会被并进上一段。
 * 所以有序项挪位置时顺带重排序号。非列表行返回 false，保留 Tab 默认行为。
 */
export function indentList(view: EditorView, dir: 1 | -1): boolean {
  const doc = view.state.doc
  const firstLine = doc.lineAt(view.state.selection.main.from)
  const info = listLineInfo(firstLine.text)
  if (!info) return false

  let target: number
  if (dir === 1) {
    // 向上找最近的同级或更浅层列表项，缩进到它的正文列
    target = -1
    for (let n = firstLine.number - 1; n >= 1; n--) {
      const text = doc.line(n).text
      if (!text.trim()) continue
      const prev = listLineInfo(text)
      if (prev) {
        if (prev.indent <= info.indent) {
          target = prev.contentCol
          break
        }
        continue
      }
      // 非列表行只有缩进更深时才算列表项的续行，否则是块边界
      if (leadingSpaces(text) <= info.indent) break
    }
    if (target < 0 || target <= info.indent) return false
  } else {
    if (info.indent === 0) return false
    // 向上找更浅一层的列表项，反缩进到它的缩进量
    target = 0
    for (let n = firstLine.number - 1; n >= 1; n--) {
      const text = doc.line(n).text
      if (!text.trim()) continue
      const prev = listLineInfo(text)
      if (prev) {
        if (prev.indent < info.indent) {
          target = prev.indent
          break
        }
        continue
      }
      if (leadingSpaces(text) <= info.indent) break
    }
  }

  const delta = target - info.indent
  if (!delta) return false
  const movedIndent = info.indent + delta
  // 选中多行时，同层的连续有序项依次续号
  let counter = precedingSiblingNumber(doc, firstLine.number, movedIndent)
  const changes = currentLines(view).flatMap((line) => {
    if (!line.text.trim()) return []
    const curIndent = leadingSpaces(line.text)
    const newIndent = Math.max(0, curIndent + delta)
    const indent = ' '.repeat(newIndent)
    const li = listLineInfo(line.text)
    if (li?.ordered && newIndent === movedIndent) {
      counter += 1
      return [{
        from: line.from,
        to: line.from + li.contentCol,
        insert: `${indent}${counter}${li.delim}${li.spacer}`,
      }]
    }
    return [{ from: line.from, to: line.from + curIndent, insert: indent }]
  })
  if (!changes.length) return false
  const cs = ChangeSet.of(changes, doc.length)
  view.dispatch({ changes: cs, selection: view.state.selection.map(cs, 1) })
  view.focus()
  return true
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
