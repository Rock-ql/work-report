import type {
  Report,
  PerformanceReport,
  ReportMeta,
  ReportType,
  Settings,
  Workspace,
  WorkspacesFile,
} from '@shared/schema'

/** 中间件返回的结构化错误；422/409 会带 detail */
export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    public detail?: any,
  ) {
    super(message)
    this.name = 'ApiError'
  }
  get isConflict() {
    return this.status === 409
  }
  /** 把 zod issues 拍平成人类可读的一行行 */
  get issues(): string[] {
    if (!Array.isArray(this.detail)) return []
    return this.detail.map((d: any) => `${d.path}：${d.message}`)
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(url, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    })
  } catch {
    throw new ApiError(0, '无法连接本地服务，请确认 pnpm dev 正在运行')
  }
  const text = await res.text()
  let body: any = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      throw new ApiError(res.status, `返回内容不是 JSON：${text.slice(0, 120)}`)
    }
  }
  if (!res.ok) {
    throw new ApiError(res.status, body?.error ?? `请求失败 (${res.status})`, body?.detail)
  }
  return body as T
}

// ---------------------------------------------------------------- settings

export const api = {
  listPerformance: () => request<{ reports: PerformanceReport[] }>('/api/performance'),
  getPerformance: (month: string) =>
    request<PerformanceReport>(`/api/performance/${encodeURIComponent(month)}`),
  generatePerformance: (month: string, source: { sourceType: 'daily' | 'offline'; text?: string; filename?: string }) =>
    request<PerformanceReport>(`/api/performance/${encodeURIComponent(month)}/generate`, {
      method: 'POST', body: JSON.stringify(source),
    }),
  savePerformance: (report: PerformanceReport, baseUpdatedAt?: string) =>
    request<PerformanceReport>(`/api/performance/${encodeURIComponent(report.month)}`, {
      method: 'PUT', body: JSON.stringify({ report, baseUpdatedAt }),
    }),
  health: () =>
    request<{ ok: boolean; dataDir: string; sandbox: boolean; backups: number; now: string }>(
      '/api/health',
    ),

  getSettings: () => request<Settings>('/api/settings'),
  saveSettings: (settings: Partial<Settings>) =>
    request<Settings>('/api/settings', { method: 'PUT', body: JSON.stringify(settings) }),

  // -------------------------------------------------------------- workspaces
  getWorkspaces: () => request<WorkspacesFile>('/api/workspaces'),
  saveWorkspaces: (workspaces: Workspace[]) =>
    request<WorkspacesFile>('/api/workspaces', {
      method: 'PUT',
      body: JSON.stringify({ workspaces }),
    }),
  validateWorkspace: (path: string) =>
    request<WorkspaceProbe>('/api/workspaces/validate', {
      method: 'POST',
      body: JSON.stringify({ path }),
    }),

  /** 递归扫描一个文件夹下的所有 git 仓库，用于批量导入 */
  scanWorkspaces: (path: string, depth: number, authors?: string[]) =>
    request<ScanResult>('/api/workspaces/scan', {
      method: 'POST',
      body: JSON.stringify({ path, depth, authors }),
    }),

  // ----------------------------------------------------------------- reports
  listReports: (type?: ReportType) =>
    request<{ reports: ReportMeta[]; today: string; thisWeek: string }>(
      `/api/reports${type ? `?type=${type}` : ''}`,
    ),

  getReport: (type: ReportType, id: string) =>
    request<Report>(`/api/reports/${type}/${encodeURIComponent(id)}`),

  /** 创建骨架；已存在则返回现有内容（幂等） */
  createReport: (type: ReportType, id: string) =>
    request<Report>(`/api/reports/${type}/${encodeURIComponent(id)}`, { method: 'POST' }),

  /**
   * 保存。baseUpdatedAt 用于乐观锁：
   * 若磁盘上的 updatedAt 与之不符（多半是 AI 刚写过），返回 409 且带上磁盘版本。
   */
  saveReport: (report: Report, baseUpdatedAt?: string, force = false) => {
    const id = report.type === 'daily' ? report.date : report.week
    return request<Report>(`/api/reports/${report.type}/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify({ report, baseUpdatedAt, force }),
    })
  },

  deleteReport: (type: ReportType, id: string) =>
    request<{ ok: true }>(`/api/reports/${type}/${encodeURIComponent(id)}`, { method: 'DELETE' }),
}

export interface ScannedRepo {
  path: string
  name: string
  relPath: string
  branch: string
  remote: string
  lastCommitAt: string
  lastCommitSubject: string
  lastCommitAuthor: string
  /** 近 90 天内匹配作者过滤的提交数 */
  myCommits: number
  /** 近 90 天总提交数 */
  totalCommits: number
  imported: boolean
  importedAs: string
}

export interface ScanResult {
  root: string
  depth: number
  authors: string[]
  repos: ScannedRepo[]
  dirsVisited: number
  /** 触及仓库数或目录数上限，结果可能不完整 */
  truncated: boolean
  elapsedMs: number
}

export interface WorkspaceProbe {
  ok: boolean
  path: string
  resolvedPath: string
  reason: string
  branch: string
  remote: string
  authors: { name: string; email: string; commits: number }[]
  lastCommitAt: string
  commitCount: number
}
