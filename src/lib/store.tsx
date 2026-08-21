import * as React from 'react'
import { toast } from 'sonner'
import type { Settings, Workspace } from '@shared/schema'
import { DEFAULT_TIMEZONE, dateKeyInTz, weekKeyInTz } from '@shared/date'
import { api, ApiError } from './api'
import { useDataEvents } from './events'

type Theme = 'light' | 'dark' | 'system'

interface AppState {
  settings: Settings | null
  workspaces: Workspace[]
  loading: boolean
  error: string | null
  theme: Theme
  setTheme: (t: Theme) => void
  saveSettings: (patch: Partial<Settings>) => Promise<void>
  saveWorkspaces: (next: Workspace[]) => Promise<void>
  reloadWorkspaces: () => Promise<void>
  /** data/ 目录发生变化的时间戳，页面 effect 依赖它即可自动重取 */
  dataRevision: number
  lastChangedFiles: string[]
  /** 跑在 WR_DATA_DIR 沙箱目录时为 true，界面会显式标出，避免误以为在操作真实数据 */
  sandbox: boolean
  dataDir: string
}

const Ctx = React.createContext<AppState | null>(null)

function applyTheme(theme: Theme) {
  const dark =
    theme === 'dark' ||
    (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = React.useState<Settings | null>(null)
  const [workspaces, setWorkspaces] = React.useState<Workspace[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [dataRevision, setDataRevision] = React.useState(0)
  const [lastChangedFiles, setLastChangedFiles] = React.useState<string[]>([])
  const [sandbox, setSandbox] = React.useState(false)
  const [dataDir, setDataDir] = React.useState('')
  const [theme, setThemeState] = React.useState<Theme>(
    () => (localStorage.getItem('wr-theme') as Theme) || 'system',
  )

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t)
    localStorage.setItem('wr-theme', t)
    applyTheme(t)
  }, [])

  React.useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('system')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])

  const load = React.useCallback(async () => {
    try {
      const [s, w] = await Promise.all([api.getSettings(), api.getWorkspaces()])
      setSettings(s)
      setWorkspaces([...w.workspaces].sort((a, b) => a.order - b.order))
      setError(null)
      // settings 里存的主题优先于 localStorage（跨浏览器一致）
      if (s.theme && s.theme !== localStorage.getItem('wr-theme')) {
        setThemeState(s.theme)
        localStorage.setItem('wr-theme', s.theme)
        applyTheme(s.theme)
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    void load()
    void api
      .health()
      .then((h) => {
        setSandbox(h.sandbox)
        setDataDir(h.dataDir)
      })
      .catch(() => {})
  }, [load])

  // AI 或手工改动 data/ 时刷新全局配置并驱动各页面重取
  useDataEvents(
    React.useCallback(
      (payload) => {
        setLastChangedFiles(payload.files)
        setDataRevision((n) => n + 1)
        if (payload.files.some((f) => f.includes('workspaces.json') || f.includes('settings.json'))) {
          void load()
        }
      },
      [load],
    ),
  )

  const saveSettings = React.useCallback(async (patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...(prev ?? ({} as Settings)), ...patch }
      void api
        .saveSettings(next)
        .then((saved) => setSettings(saved))
        .catch((e: ApiError) => toast.error('保存设置失败', { description: e.message }))
      return next
    })
  }, [])

  const saveWorkspaces = React.useCallback(async (next: Workspace[]) => {
    const ordered = next.map((w, i) => ({ ...w, order: i }))
    const prev = workspaces
    setWorkspaces(ordered) // 乐观更新，失败回滚
    try {
      const saved = await api.saveWorkspaces(ordered)
      setWorkspaces([...saved.workspaces].sort((a, b) => a.order - b.order))
    } catch (e) {
      setWorkspaces(prev)
      throw e
    }
  }, [workspaces])

  const reloadWorkspaces = React.useCallback(async () => {
    const w = await api.getWorkspaces()
    setWorkspaces([...w.workspaces].sort((a, b) => a.order - b.order))
  }, [])

  const value: AppState = {
    settings,
    workspaces,
    loading,
    error,
    theme,
    setTheme,
    saveSettings,
    saveWorkspaces,
    reloadWorkspaces,
    dataRevision,
    lastChangedFiles,
    sandbox,
    dataDir,
  }

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export function useApp(): AppState {
  const ctx = React.useContext(Ctx)
  if (!ctx) throw new Error('useApp 必须在 AppProvider 内使用')
  return ctx
}

/**
 * 按配置时区算出的今天与本周。
 * 机器时区可能与实际工作时区不同（笔记本设成美西、人在国内），
 * 全站的"今天"必须走这里，否则会跟 collect-git.mjs 抓取的日期对不上。
 */
export function useToday(): { today: string; thisWeek: string; tz: string } {
  const { settings } = useApp()
  const tz = settings?.timezone || DEFAULT_TIMEZONE
  return React.useMemo(
    () => ({ today: dateKeyInTz(tz), thisWeek: weekKeyInTz(tz), tz }),
    [tz],
  )
}

/** 启用中的工作区，按 order 排序 —— 报告里模块的出现顺序以此为准 */
export function useActiveWorkspaces(): Workspace[] {
  const { workspaces } = useApp()
  return React.useMemo(() => workspaces.filter((w) => w.enabled), [workspaces])
}
