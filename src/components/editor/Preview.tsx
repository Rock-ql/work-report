import * as React from 'react'
import ReactMarkdown from 'react-markdown'
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

export const MarkdownPreview = React.memo(function MarkdownPreview({
  value,
  className,
  placeholder = '暂无内容',
}: {
  value: string
  className?: string
  placeholder?: string
}) {
  if (!value.trim()) {
    return <div className={cn('px-4 py-3.5 text-[13px] text-subtle', className)}>{placeholder}</div>
  }
  return (
    <div className={cn('prose prose-report prose-sm max-w-none px-4 py-3.5', className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
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
        }}
      >
        {value}
      </ReactMarkdown>
    </div>
  )
})
