import { Bot, CircleDot, CheckCircle2, Hand, FileWarning } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Tip } from '@/components/ui/tooltip'

export function StatusBadge({ status }: { status: 'draft' | 'final' }) {
  return status === 'final' ? (
    <Badge variant="success">
      <CheckCircle2 />
      已定稿
    </Badge>
  ) : (
    <Badge variant="warning">
      <CircleDot />
      草稿
    </Badge>
  )
}

export function TypeBadge({ type }: { type: 'daily' | 'weekly' }) {
  return (
    <Badge variant={type === 'daily' ? 'neutral' : 'primary'}>{type === 'daily' ? '日报' : '周报'}</Badge>
  )
}

export function SourceBadge({ by }: { by: 'ai' | 'manual' }) {
  return by === 'ai' ? (
    <Tip label="正文由 AI 从 git 提交归纳生成">
      <Badge variant="info">
        <Bot />
        AI 生成
      </Badge>
    </Tip>
  ) : (
    <Tip label="尚未经过 AI 生成，或全部手工填写">
      <Badge variant="outline">
        <Hand />
        手工
      </Badge>
    </Tip>
  )
}

export function InvalidBadge({ error }: { error?: string }) {
  return (
    <Tip label={error ?? '文件不符合数据规范'}>
      <Badge variant="danger">
        <FileWarning />
        数据异常
      </Badge>
    </Tip>
  )
}

/** 填写进度：5 个区块填了几个 */
export function FillMeter({ filled, total }: { filled: number; total: number }) {
  return (
    <Tip label={`${total} 个区块已填写 ${filled} 个`}>
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: total }).map((_, i) => (
          <span
            key={i}
            className={
              'h-3 w-[3px] rounded-full transition-colors ' +
              (i < filled ? 'bg-primary' : 'bg-border')
            }
          />
        ))}
      </div>
    </Tip>
  )
}
