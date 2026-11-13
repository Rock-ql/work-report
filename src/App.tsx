import { Navigate, Route, Routes } from 'react-router-dom'
import { Toaster } from 'sonner'
import { FlaskConical } from 'lucide-react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppProvider, useApp } from '@/lib/store'
import { Sidebar } from '@/components/layout/Sidebar'
import { ConnectionError } from '@/components/layout/PageShell'
import ReportList from '@/pages/ReportList'
import ReportDetail from '@/pages/ReportDetail'
import Workspaces from '@/pages/Workspaces'
import AiGuide from '@/pages/AiGuide'
import Settings from '@/pages/Settings'
import Performance from '@/pages/Performance'

/**
 * 沙箱横幅：运行在 WR_DATA_DIR 指定的临时目录时常驻顶部。
 * 有它在，就不会把测试数据误当成真实数据来看。
 */
function SandboxBanner({ dataDir }: { dataDir: string }) {
  return (
    <div className="flex items-center justify-center gap-2 bg-warning px-4 py-1 text-[11.5px] font-medium text-black">
      <FlaskConical className="size-3.5" />
      沙箱模式 · 正在使用测试数据目录
      <code className="rounded bg-black/15 px-1 font-mono">{dataDir}</code>
      <span className="opacity-70">你的真实数据不受影响</span>
    </div>
  )
}

function Shell() {
  const { error, loading, sandbox, dataDir } = useApp()

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {sandbox && <SandboxBanner dataDir={dataDir} />}
      <div className="flex min-h-0 flex-1 overflow-hidden">
      <Sidebar />
      <main className="flex-1 overflow-y-auto">
        {error && !loading ? (
          <ConnectionError message={error} />
        ) : (
          <Routes>
            <Route path="/" element={<ReportList />} />
            <Route path="/report/:type/:id" element={<ReportDetail />} />
            <Route path="/performance" element={<Performance />} />
            <Route path="/workspaces" element={<Workspaces />} />
            <Route path="/ai-guide" element={<AiGuide />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        )}
      </main>
      </div>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <TooltipProvider delayDuration={350} skipDelayDuration={200}>
        <Shell />
        <Toaster
          position="bottom-right"
          closeButton
          toastOptions={{
            className:
              'rounded-card border border-border bg-surface-raised text-foreground shadow-pop text-[12.5px]',
          }}
        />
      </TooltipProvider>
    </AppProvider>
  )
}
