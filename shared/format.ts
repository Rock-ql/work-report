import type { Report, SectionDef } from './schema'
import { sectionsOf } from './schema'
import { weekdayCn } from './date'

/**
 * 把报告转换成钉钉可直接粘贴的纯文本。
 * 钉钉日报输入框不渲染 Markdown，所以有序列表要落成 "1. xxx"，
 * 无序列表落成 "· xxx"，粗体/行内代码的标记符号一律剥掉。
 */

/** Markdown -> 纯文本（保留列表编号与层级缩进） */
export function markdownToPlain(md: string): string {
  if (!md) return ''
  const lines = md.replace(/\r\n/g, '\n').split('\n')
  const out: string[] = []
  // 每个缩进层级维护独立的有序列表计数器
  const counters = new Map<number, number>()
  let inFence = false

  for (const raw of lines) {
    if (/^\s*```/.test(raw)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      out.push(raw)
      continue
    }

    const line = raw.replace(/\s+$/, '')
    if (!line.trim()) {
      out.push('')
      counters.clear()
      continue
    }

    const indent = (line.match(/^\s*/)?.[0].length ?? 0)
    const level = Math.floor(indent / 2)
    const body = line.trim()

    // 标题：去掉 # 号，单独成行
    const heading = /^#{1,6}\s+(.*)$/.exec(body)
    if (heading) {
      out.push(inline(heading[1]))
      counters.clear()
      continue
    }

    // 引用
    const quote = /^>\s?(.*)$/.exec(body)
    if (quote) {
      out.push(`${'  '.repeat(level)}${inline(quote[1])}`)
      continue
    }

    // 分割线
    if (/^([-*_])\1{2,}$/.test(body.replace(/\s/g, ''))) {
      out.push('————————')
      counters.clear()
      continue
    }

    // 有序列表
    const ordered = /^(\d+)[.)]\s+(.*)$/.exec(body)
    if (ordered) {
      const n = (counters.get(level) ?? 0) + 1
      counters.set(level, n)
      for (const k of counters.keys()) if (k > level) counters.delete(k)
      out.push(`${'  '.repeat(level)}${n}. ${inline(stripTask(ordered[2]))}`)
      continue
    }

    // 无序列表
    const bullet = /^[-*+]\s+(.*)$/.exec(body)
    if (bullet) {
      counters.delete(level)
      const marker = level === 0 ? '· ' : '- '
      out.push(`${'  '.repeat(level)}${marker}${inline(stripTask(bullet[1]))}`)
      continue
    }

    counters.clear()
    out.push(`${'  '.repeat(level)}${inline(body)}`)
  }

  return collapseBlankLines(out.join('\n')).trim()
}

/** 任务列表 "[ ] xxx" / "[x] xxx" -> "☐ xxx" / "☑ xxx" */
function stripTask(s: string): string {
  const m = /^\[([ xX])\]\s+(.*)$/.exec(s)
  if (!m) return s
  return `${m[1].toLowerCase() === 'x' ? '☑' : '☐'} ${m[2]}`
}

/** 剥掉行内标记符号 */
function inline(s: string): string {
  return s
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1（$2）')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(?!\s)(.*?)(?<!\s)\1/g, '$2')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim()
}

function collapseBlankLines(s: string): string {
  return s.replace(/\n{3,}/g, '\n\n')
}

function readPath(obj: unknown, path: string): string {
  let cur: unknown = obj
  for (const seg of path.split('.')) {
    if (cur == null || typeof cur !== 'object') return ''
    cur = (cur as Record<string, unknown>)[seg]
  }
  return typeof cur === 'string' ? cur : ''
}

export function sectionValue(report: Report, def: SectionDef): string {
  return readPath(report.sections, def.key)
}

/**
 * 组装钉钉纯文本。
 * 日报的三个"明日工作计划"子段会被合并到一个字段下，各自带【xxx】小标题，
 * 与钉钉模板截图完全一致。
 */
export function toDingTalkText(report: Report, opts: { withTitle?: boolean } = {}): string {
  const defs = sectionsOf(report.type)
  const blocks: string[] = []

  if (opts.withTitle !== false && report.title) {
    blocks.push(report.title, '')
  }

  if (report.type === 'daily') {
    const today = markdownToPlain(readPath(report.sections, 'todayCompleted'))
    blocks.push('今日工作完成情况', today || '（无）', '')

    const planParts: string[] = []
    for (const def of defs) {
      if (!def.key.startsWith('tomorrowPlan.')) continue
      const text = markdownToPlain(readPath(report.sections, def.key))
      planParts.push(def.dingHeading!)
      if (text) planParts.push(text)
      planParts.push('')
    }
    blocks.push('明日工作计划', ...planParts)

    const help = markdownToPlain(readPath(report.sections, 'needHelp'))
    blocks.push('需要协助的事项', help || '无', '')
  } else {
    for (const def of defs) {
      const text = markdownToPlain(readPath(report.sections, def.key))
      blocks.push(def.label, text || (def.key === 'needHelp' ? '无' : '（无）'), '')
    }
  }

  return collapseBlankLines(blocks.join('\n')).trim() + '\n'
}

export interface DingTalkBlock {
  /** 内部来源 key，供 UI 做 key */
  key: string
  /** 钉钉模板字段名 */
  label: string
  /** 直接粘贴到该字段的纯文本（不含字段名本身） */
  text: string
  empty: boolean
}

/** 日报的「明日工作计划」：把三个子段合并成一个字段，各自带【xxx】小标题。 */
function dailyPlanText(defs: SectionDef[], report: Report): string {
  const parts: string[] = []
  for (const def of defs) {
    if (!def.key.startsWith('tomorrowPlan.')) continue
    const text = markdownToPlain(readPath(report.sections, def.key))
    if (!text) continue
    parts.push(`${def.dingHeading!}\n${text}`)
  }
  return parts.join('\n\n')
}

/**
 * 把报告切成钉钉模板的字段块，供「分块复制」使用。
 * 钉钉日报/周报按模板分成多个输入框，全量文本粘进一个框会错位，
 * 所以逐块复制、逐块粘贴更稳。
 */
export function toDingTalkBlocks(report: Report): DingTalkBlock[] {
  const defs = sectionsOf(report.type)

  if (report.type === 'daily') {
    const today = markdownToPlain(readPath(report.sections, 'todayCompleted'))
    const plan = dailyPlanText(defs, report)
    const help = markdownToPlain(readPath(report.sections, 'needHelp'))
    return [
      { key: 'todayCompleted', label: '今日工作完成情况', text: today, empty: !today },
      { key: 'tomorrowPlan', label: '明日工作计划', text: plan, empty: !plan },
      { key: 'needHelp', label: '需要协助的事项', text: help, empty: !help },
    ]
  }

  return defs.map((def) => {
    const text = markdownToPlain(readPath(report.sections, def.key))
    return { key: def.key, label: def.label, text, empty: !text }
  })
}

/** 导出为 .md 文件内容（保留 Markdown 原貌 + 元信息） */
export function toMarkdownFile(report: Report): string {
  const defs = sectionsOf(report.type)
  const lines: string[] = []
  const idLabel =
    report.type === 'daily'
      ? `${report.date}（${weekdayCn(report.date)}）`
      : `${report.week}（${report.weekStart} ~ ${report.weekEnd}）`

  lines.push(`# ${report.title || idLabel}`, '')
  lines.push(`> ${idLabel} · ${report.status === 'final' ? '已定稿' : '草稿'}`)
  if (report.tags.length) lines.push(`> 涉及模块：${report.tags.join('、')}`)
  if (report.source.commits.length) {
    lines.push(`> 关联提交：${report.source.commits.length} 条`)
  }
  lines.push('')

  if (report.type === 'daily') {
    lines.push('## 今日工作完成情况', '', readPath(report.sections, 'todayCompleted') || '（无）', '')
    lines.push('## 明日工作计划', '')
    for (const def of defs) {
      if (!def.key.startsWith('tomorrowPlan.')) continue
      lines.push(`### ${def.label}`, '', readPath(report.sections, def.key) || '（无）', '')
    }
    lines.push('## 需要协助的事项', '', readPath(report.sections, 'needHelp') || '无', '')
  } else {
    for (const def of defs) {
      lines.push(`## ${def.label}`, '', readPath(report.sections, def.key) || '（无）', '')
    }
  }

  return collapseBlankLines(lines.join('\n')).trim() + '\n'
}

/** 列表页摘要：取正文第一条有内容的条目 */
export function excerptOf(report: Report): string {
  const defs = sectionsOf(report.type)
  for (const def of defs) {
    const text = markdownToPlain(readPath(report.sections, def.key))
    const first = text.split('\n').find((l) => l.trim())
    if (first) return first.replace(/^\d+\.\s*|^·\s*/, '').slice(0, 80)
  }
  return ''
}

/** 统计已填写的区块数 */
export function fillStats(report: Report): { filled: number; total: number } {
  const defs = sectionsOf(report.type)
  const filled = defs.filter((d) => readPath(report.sections, d.key).trim()).length
  return { filled, total: defs.length }
}

/** 从正文中提取所有【模块】标签，用于自动维护 tags */
export function extractTags(report: Report): string[] {
  const defs = sectionsOf(report.type)
  const found = new Set<string>()
  for (const def of defs) {
    const text = readPath(report.sections, def.key)
    for (const m of text.matchAll(/【([^】]{1,20})】/g)) found.add(m[1])
  }
  return [...found]
}
