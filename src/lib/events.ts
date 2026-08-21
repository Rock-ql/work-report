import { useEffect, useRef } from 'react'

export interface DataChangedPayload {
  files: string[]
  at: string
}

/**
 * 订阅中间件的 fs.watch 事件流。
 * AI Agent 改完 data/ 下的文件后，网页无需刷新即可感知——
 * 这是"AI 执行完毕后系统能正常展示"的关键闭环。
 */
export function useDataEvents(onChange: (payload: DataChangedPayload) => void) {
  const handler = useRef(onChange)
  handler.current = onChange

  useEffect(() => {
    let es: EventSource | null = null
    let retry: ReturnType<typeof setTimeout> | null = null
    let closed = false
    let backoff = 1000

    const connect = () => {
      if (closed) return
      es = new EventSource('/api/events')
      es.addEventListener('hello', () => {
        backoff = 1000
      })
      es.addEventListener('data-changed', (e) => {
        try {
          handler.current(JSON.parse((e as MessageEvent).data))
        } catch {
          /* 忽略畸形帧 */
        }
      })
      es.onerror = () => {
        es?.close()
        es = null
        if (closed) return
        // dev server 重启时指数退避重连，最长 10s
        retry = setTimeout(connect, backoff)
        backoff = Math.min(backoff * 2, 10000)
      }
    }
    connect()

    return () => {
      closed = true
      if (retry) clearTimeout(retry)
      es?.close()
    }
  }, [])
}

/** 从 SSE 的文件路径反解出报告标识，用于判断"变的是不是我正在编辑的这份" */
export function parseReportFile(file: string): { type: 'daily' | 'weekly'; id: string } | null {
  const m = /reports\/(daily|weekly)\/(.+)\.json$/.exec(file)
  if (!m) return null
  return { type: m[1] as 'daily' | 'weekly', id: m[2] }
}
