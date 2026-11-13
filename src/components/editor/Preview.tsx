import * as React from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'

/** 把正文里的【模块】渲染成彩色 chip，让预览与列表页视觉一致 */
function decorateTags(text: string): React.ReactNode[] {
  const parts: React.ReactNode[] = []
  const re = /【([^】]{1,20})】/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    parts.push(
      <span
        key={`t${key++}`}
        className="mx-[1px] rounded-[4px] bg-primary-soft px-1 py-[1px] text-[0.92em] font-medium text-primary"
      >
        {m[1]}
      </span>,
    )
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(text.slice(last))
  return parts
}

function withTags(children: React.ReactNode): React.ReactNode {
  return React.Children.map(children, (child) =>
    typeof child === 'string' ? <>{decorateTags(child)}</> : child,
  )
}

const COMPONENTS: Components = {
  p: ({ children }) => <p>{withTags(children)}</p>,
  li: ({ children }) => <li>{withTags(children)}</li>,
  strong: ({ children }) => <strong>{withTags(children)}</strong>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary no-underline hover:underline">
      {children}
    </a>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto">
      <table className="w-full text-[12.5px]">{children}</table>
    </div>
  ),
  input: ({ checked, type }) =>
    type === 'checkbox' ? (
      <input
        type="checkbox"
        checked={!!checked}
        readOnly
        className="mr-1.5 size-3.5 translate-y-[2px] accent-[hsl(var(--primary))]"
      />
    ) : null,
}

type Block = { header: string | null; body: string }

/** 单独成行的【模块】视为分组标题，其后的内容归到该组，预览里缩进一级 */
function splitGroups(value: string): Block[] {
  const blocks: Block[] = []
  let header: string | null = null
  let buf: string[] = []
  let inFence = false

  const flush = () => {
    const body = buf.join('\n').trim()
    if (header !== null || body) blocks.push({ header, body })
    header = null
    buf = []
  }

  for (const line of value.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence
    const m = inFence ? null : /^\s*【([^】]{1,24})】\s*$/.exec(line)
    if (m) {
      flush()
      header = m[1]
    } else {
      buf.push(line)
    }
  }
  flush()
  return blocks
}

function MarkdownBlock({ body, className }: { body: string; className?: string }) {
  if (!body.trim()) return null
  return (
    <div className={className}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {body}
      </ReactMarkdown>
    </div>
  )
}

export const MarkdownPreview = React.memo(function MarkdownPreview({
  value,
  className,
  placeholder = '暂无内容',
}: {
  value: string
  className?: string
  placeholder?: string
}) {
  const blocks = React.useMemo(() => splitGroups(value), [value])

  if (!value.trim()) {
    return <div className={cn('px-4 py-3.5 text-[13px] text-subtle', className)}>{placeholder}</div>
  }

  const grouped = blocks.some((b) => b.header !== null)

  return (
    <div className={cn('prose prose-report prose-sm max-w-none px-4 py-3.5', className)}>
      {grouped
        ? blocks.map((b, i) =>
            b.header === null ? (
              <MarkdownBlock key={`g${i}`} body={b.body} />
            ) : (
              <section key={`g${i}`} className="mt-3 first:mt-0">
                <div className="flex items-center gap-1.5">
                  <span className="rounded-[4px] bg-primary-soft px-1.5 py-[2px] text-[12px] font-semibold leading-[1.5] text-primary">
                    {b.header}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
                <MarkdownBlock
                  body={b.body}
                  className="border-l-2 border-primary/15 pl-2.5 [&>*:first-child]:mt-0 [&>*:last-child]:mb-0"
                />
              </section>
            ),
          )
        : (
            <MarkdownBlock body={value} />
          )}
    </div>
  )
})
