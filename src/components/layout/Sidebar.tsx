import { NavLink, useLocation } from 'react-router-dom'
import {
  BookOpen,
  CalendarDays,
  FolderGit2,
  Settings2,
  Sparkles,
  Monitor,
  Moon,
  Sun,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useApp, useToday } from '@/lib/store'
import { Tip } from '@/components/ui/tooltip'

const NAV = [
  { to: '/', label: '报告列表', icon: CalendarDays, end: true },
  { to: '/workspaces', label: 'Git 工作区', icon: FolderGit2 },
  { to: '/ai-guide', label: 'AI 使用规范', icon: Sparkles },
  { to: '/settings', label: '设置', icon: Settings2 },
]

const THEMES = [
  { key: 'light', icon: Sun, label: '浅色' },
  { key: 'dark', icon: Moon, label: '深色' },
  { key: 'system', icon: Monitor, label: '跟随系统' },
] as const

export function Sidebar() {
  const { theme, setTheme, saveSettings, workspaces } = useApp()
  const location = useLocation()
  const { today, thisWeek } = useToday()
  const enabledCount = workspaces.filter((w) => w.enabled).length

  return (
    <aside className="hairline-r flex w-[212px] shrink-0 flex-col bg-surface-sunken">
      {/* 品牌 */}
      <div className="flex h-13 items-center gap-2.5 px-4">
        <div className="flex size-7 items-center justify-center rounded-[7px] bg-primary shadow-[0_1px_2px_rgba(99,102,241,0.4)]">
          <BookOpen className="size-4 text-primary-foreground" />
        </div>
        <div className="leading-tight">
          <div className="text-[13px] font-semibold tracking-tight">工作报告</div>
          <div className="text-[10.5px] text-subtle">Work Report</div>
        </div>
      </div>

      {/* 快捷入口 */}
      <div className="px-2.5 pb-1 pt-1">
        <QuickLink to={`/report/daily/${today}`} label="今天的日报" hint={today} />
        <QuickLink to={`/report/weekly/${thisWeek}`} label="本周的周报" hint={thisWeek} />
      </div>

      <div className="mx-4 my-2 h-px bg-border" />

      {/* 主导航 */}
      <nav className="flex-1 space-y-0.5 px-2.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              cn(
                'group flex h-8 items-center gap-2.5 rounded-control px-2.5 text-[13px] transition-colors',
                isActive || (to !== '/' && location.pathname.startsWith(to))
                  ? 'bg-surface font-medium text-foreground shadow-card'
                  : 'text-muted-foreground hover:bg-surface/70 hover:text-foreground',
              )
            }
          >
            <Icon className="size-4 shrink-0 opacity-70 transition-opacity group-hover:opacity-100" />
            <span className="flex-1 truncate">{label}</span>
            {to === '/workspaces' && enabledCount > 0 && (
              <span className="rounded-badge bg-muted px-1.5 text-[10.5px] font-medium text-muted-foreground">
                {enabledCount}
              </span>
            )}
          </NavLink>
        ))}
      </nav>

      {/* 主题切换 */}
      <div className="p-2.5">
        <div className="flex items-center gap-0.5 rounded-control border border-border bg-surface p-0.5">
          {THEMES.map(({ key, icon: Icon, label }) => (
            <Tip key={key} label={label} side="top">
              <button
                onClick={() => {
                  setTheme(key)
                  void saveSettings({ theme: key })
                }}
                className={cn(
                  'flex h-6 flex-1 items-center justify-center rounded-[5px] transition-colors',
                  theme === key
                    ? 'bg-muted text-foreground'
                    : 'text-subtle hover:text-muted-foreground',
                )}
                aria-label={label}
              >
                <Icon className="size-3.5" />
              </button>
            </Tip>
          ))}
        </div>
      </div>
    </aside>
  )
}

function QuickLink({ to, label, hint }: { to: string; label: string; hint: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'group flex h-8 items-center gap-2 rounded-control px-2.5 text-[12.5px] transition-colors',
          isActive
            ? 'bg-primary-soft font-medium text-primary'
            : 'text-muted-foreground hover:bg-surface/70 hover:text-foreground',
        )
      }
    >
      <span className="size-1.5 shrink-0 rounded-full bg-primary/60" />
      <span className="flex-1 truncate">{label}</span>
      <span className="font-mono text-[10px] tabular-nums text-subtle">{hint}</span>
    </NavLink>
  )
}
