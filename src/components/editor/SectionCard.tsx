import * as React from 'react'
import { Bot, Copy, Hand, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { SectionDef } from '@shared/schema'
import { cn, copyText } from '@/lib/utils'
import { markdownToPlain } from '@shared/format'
import { Badge } from '@/components/ui/badge'
import { Tip } from '@/components/ui/tooltip'
import { MarkdownEditor, type EditorMode } from './MarkdownEditor'

/**
 * 报告的一个区块。卡头明确标注这一段归 AI 还是归人工，
 * 对应 AI_SPEC 里"AI 永不覆盖人工字段"的约定，让分工在界面上一眼可见。
 */
export function SectionCard({
  def,
  value,
  onChange,
  tags,
  mode,
  onModeChange,
  regeneratePrompt,
  nested,
  minHeight = 160,
}: {
  def: SectionDef
  value: string
  onChange: (v: string) => void
  tags: string[]
  mode: EditorMode
  onModeChange: (m: EditorMode) => void
  regeneratePrompt?: string
  nested?: boolean
  minHeight?: number
}) {
  const isAi = def.owner === 'ai'

  return (
    <div className={cn(nested ? 'space-y-2' : 'space-y-2.5')}>
      <div className="flex items-center gap-2">
        <h3
          className={cn(
            'font-semibold tracking-tight',
            nested ? 'text-[12.5px] text-muted-foreground' : 'text-[13.5px]',
          )}
        >
          {nested && <span className="mr-0.5 font-mono text-subtle">【</span>}
          {def.label}
          {nested && <span className="ml-0.5 font-mono text-subtle">】</span>}
          {def.required && <span className="ml-0.5 text-danger">*</span>}
        </h3>

        {isAi ? (
          <Tip label="这一段由 AI 从 git 提交归纳生成，重新生成会覆盖">
            <Badge variant="info">
              <Bot />
              AI 生成
            </Badge>
          </Tip>
        ) : (
          <Tip label="这一段只由你手动填写，AI 永远不会覆盖">
            <Badge variant="outline">
              <Hand />
              手动填写
            </Badge>
          </Tip>
        )}

        <span className="flex-1" />

        {isAi && regeneratePrompt && (
          <Tip label="复制提示词，到 Claude Code 里粘贴执行">
            <button
              type="button"
              onClick={async () => {
                const ok = await copyText(regeneratePrompt)
                ok
                  ? toast.success('提示词已复制', {
                      description: '到 Claude Code 会话里粘贴执行，写完这里会自动刷新',
                    })
                  : toast.error('复制失败')
              }}
              className="flex h-6 items-center gap-1 rounded-[6px] px-1.5 text-[11.5px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Sparkles className="size-3.5" />
              重新生成
            </button>
          </Tip>
        )}

        <Tip label="复制本段纯文本">
          <button
            type="button"
            onClick={async () => {
              const ok = await copyText(markdownToPlain(value))
              ok ? toast.success('已复制（钉钉纯文本）') : toast.error('复制失败')
            }}
            disabled={!value.trim()}
            className="flex size-6 items-center justify-center rounded-[6px] text-subtle transition-colors hover:bg-muted hover:text-foreground disabled:opacity-40"
            aria-label="复制本段"
          >
            <Copy className="size-3.5" />
          </button>
        </Tip>
      </div>

      <MarkdownEditor
        value={value}
        onChange={onChange}
        placeholder={def.placeholder}
        tags={tags}
        mode={mode}
        onModeChange={onModeChange}
        minHeight={minHeight}
        compactToolbar
      />
    </div>
  )
}
