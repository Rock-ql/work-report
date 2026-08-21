import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import type { Connect, Plugin, ViteDevServer, PreviewServer } from 'vite'
import type { ServerResponse } from 'node:http'

import {
  ID_PATTERN,
  dailyReportSchema,
  reportSchema,
  settingsSchema,
  weeklyReportSchema,
  workspacesFileSchema,
  sectionsOf,
  type Report,
  type ReportMeta,
  type ReportType,
} from '../shared/schema'
import { excerptOf, extractTags, fillStats } from '../shared/format'
// @ts-expect-error - 纯 JS 模块，供网页 API 与 node 脚本共用同一份写入保护
import * as dataFs from './data-fs.mjs'
import { DEFAULT_TIMEZONE, dateKeyInTz, nowIso, weekKeyInTz, weekRange } from '../shared/date'

const execFileAsync = promisify(execFile)

/**
 * 本地文件读写中间件。
 * data/ 下的 JSON 是 AI Agent 与网页共同的唯一数据源：
 *   - 网页经由此中间件读写
 *   - AI 经由 scripts/report.mjs 直接改文件
 *   - fs.watch 把文件变化通过 SSE 推给网页，AI 写完即刻可见
 */

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8' }

// ---------------------------------------------------------------- 工具

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, JSON_HEADERS)
  res.end(JSON.stringify(body))
}

function fail(res: ServerResponse, status: number, message: string, extra?: unknown) {
  send(res, status, { error: message, ...(extra ? { detail: extra } : {}) })
}

async function readBody(req: Connect.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(chunk as Buffer)
  if (!chunks.length) return {}
  const raw = Buffer.concat(chunks).toString('utf-8')
  if (!raw.trim()) return {}
  try {
    return JSON.parse(raw)
  } catch (e) {
    throw new HttpError(400, `请求体不是合法 JSON: ${(e as Error).message}`)
  }
}

class HttpError extends Error {
  constructor(public status: number, message: string, public detail?: unknown) {
    super(message)
  }
}

/**
 * 写入数据文件。委托给 data-fs.mjs：覆盖前自动留快照，然后原子写。
 * dataDir 在运行时由 DataStore 注入，见下面的 setWriteRoot。
 */
let writeRoot = ''
function setWriteRoot(dir: string) {
  writeRoot = dir
}
async function writeJsonAtomic(file: string, data: unknown) {
  dataFs.writeJsonAtomic(writeRoot, file, data)
}

async function readJson<T>(file: string): Promise<T | null> {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf-8')) as T
  } catch (e: any) {
    if (e?.code === 'ENOENT') return null
    throw new HttpError(500, `读取 ${path.basename(file)} 失败: ${e.message}`)
  }
}

function zodIssues(err: any) {
  return (err?.issues ?? []).map((i: any) => ({
    path: i.path.join('.') || '(root)',
    message: i.message,
  }))
}

// ---------------------------------------------------------------- 数据目录

class DataStore {
  readonly dir: string
  /** true 表示跑在 WR_DATA_DIR 指定的沙箱目录里，而不是项目的 data/ */
  readonly sandbox: boolean
  constructor(root: string) {
    this.dir = dataFs.resolveDataDir(root)
    this.sandbox = dataFs.isSandbox()
    setWriteRoot(this.dir)
  }

  get settingsFile() {
    return path.join(this.dir, 'settings.json')
  }
  get workspacesFile() {
    return path.join(this.dir, 'workspaces.json')
  }
  reportsDir(type: ReportType) {
    return path.join(this.dir, 'reports', type)
  }
  reportFile(type: ReportType, id: string) {
    if (!ID_PATTERN[type].test(id)) {
      throw new HttpError(400, `非法的报告 ID「${id}」，${type === 'daily' ? '应为 YYYY-MM-DD' : '应为 YYYY-Www'}`)
    }
    const file = path.join(this.reportsDir(type), `${id}.json`)
    // 双保险：解析后的路径必须仍在 data/ 内
    const rel = path.relative(this.dir, file)
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new HttpError(400, '路径越界')
    }
    return file
  }

  async ensure() {
    await fsp.mkdir(this.reportsDir('daily'), { recursive: true })
    await fsp.mkdir(this.reportsDir('weekly'), { recursive: true })
    if (!fs.existsSync(this.settingsFile)) {
      await writeJsonAtomic(
        this.settingsFile,
        settingsSchema.parse({
          version: 1,
          // 默认按中国标准时间判定报告日期，用户仍可在设置页覆盖
          timezone: DEFAULT_TIMEZONE,
        }),
      )
    }
    if (!fs.existsSync(this.workspacesFile)) {
      await writeJsonAtomic(this.workspacesFile, { version: 1, workspaces: [] })
    }
  }
}

// ---------------------------------------------------------------- 骨架

export function createSkeleton(
  type: ReportType,
  id: string,
  settings: { dailyTitle: string; weeklyTitle: string },
): Report {
  const ts = nowIso()
  if (type === 'daily') {
    return dailyReportSchema.parse({
      schemaVersion: 1,
      type: 'daily',
      date: id,
      title: `${settings.dailyTitle} ${id}`,
      status: 'draft',
      sections: {
        todayCompleted: '',
        tomorrowPlan: { product: '', dev: '', backlog: '' },
        needHelp: '',
      },
      source: { workspaceIds: [], range: { since: '', until: '' }, commits: [], generatedBy: 'manual' },
      tags: [],
      createdAt: ts,
      updatedAt: ts,
    })
  }
  const { start, end } = weekRange(id)
  return weeklyReportSchema.parse({
    schemaVersion: 1,
    type: 'weekly',
    week: id,
    weekStart: start,
    weekEnd: end,
    title: `${settings.weeklyTitle} ${id}`,
    status: 'draft',
    sections: { weekCompleted: '', nextWeekPlan: '', needHelp: '' },
    source: { workspaceIds: [], range: { since: '', until: '' }, commits: [], generatedBy: 'manual' },
    tags: [],
    createdAt: ts,
    updatedAt: ts,
  })
}

function toMeta(type: ReportType, id: string, parsed: Report): ReportMeta {
  const stats = fillStats(parsed)
  return {
    type,
    id,
    date: type === 'daily' ? (parsed as any).date : (parsed as any).weekStart,
    weekStart: type === 'weekly' ? (parsed as any).weekStart : undefined,
    weekEnd: type === 'weekly' ? (parsed as any).weekEnd : undefined,
    title: parsed.title,
    status: parsed.status,
    tags: parsed.tags,
    commitCount: parsed.source.commits.length,
    generatedBy: parsed.source.generatedBy,
    excerpt: excerptOf(parsed),
    filled: stats.filled,
    totalSections: stats.total,
    createdAt: parsed.createdAt,
    updatedAt: parsed.updatedAt,
  }
}

// ---------------------------------------------------------------- git 校验

async function git(cwd: string, args: string[], timeout = 8000): Promise<string> {
  const { stdout } = await execFileAsync('git', args, {
    cwd,
    timeout,
    maxBuffer: 8 * 1024 * 1024,
    windowsHide: true,
  })
  return stdout.trim()
}

function expandHome(p: string): string {
  return path.resolve(p.trim().replace(/^~(?=$|\/)/, process.env.HOME ?? '~'))
}

/** 并发上限执行，避免一次性 spawn 上百个 git 进程把机器压垮 */
async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor++
      out[i] = await fn(items[i])
    }
  })
  await Promise.all(workers)
  return out
}

/** 遍历时直接跳过的目录：要么体量巨大，要么不可能是工作仓库 */
const SCAN_SKIP = new Set([
  'node_modules', '.git', 'dist', 'build', 'out', 'target', 'vendor', 'coverage',
  '.next', '.nuxt', '.turbo', '.cache', '.venv', 'venv', 'env', '__pycache__',
  '.gradle', '.idea', '.vscode', 'Pods', 'DerivedData', '.Trash', 'Library',
  '.pnpm-store', '.yarn', 'bower_components', '.terraform', '.svn', '.hg',
])

const SCAN_MAX_REPOS = 300
const SCAN_MAX_DIRS = 20000

export interface ScannedRepo {
  path: string
  name: string
  relPath: string
  branch: string
  remote: string
  lastCommitAt: string
  lastCommitSubject: string
  lastCommitAuthor: string
  /** 近 90 天内匹配 authors 的提交数；authors 为空时等于 totalCommits */
  myCommits: number
  /** 近 90 天总提交数 */
  totalCommits: number
  imported: boolean
  importedAs: string
}

/**
 * 递归扫描一个文件夹下的所有 git 仓库。
 * 找到 .git 就不再往下走 —— 仓库内部的子目录不可能是"另一个工作区"，
 * 继续深入只会把 node_modules 里的依赖仓库也捞进来。
 */
async function scanForRepos(rootRaw: string, maxDepth: number) {
  const root = expandHome(rootRaw)
  const found: string[] = []
  let dirsVisited = 0
  let truncated = false

  async function walk(dir: string, depth: number) {
    if (truncated || depth > maxDepth) return
    if (dirsVisited++ > SCAN_MAX_DIRS) {
      truncated = true
      return
    }

    let entries: import('node:fs').Dirent[]
    try {
      entries = await fsp.readdir(dir, { withFileTypes: true })
    } catch {
      return // 权限不足等，跳过而不是中断整次扫描
    }

    // worktree 的 .git 是文件而非目录，两种都算仓库
    if (entries.some((e) => e.name === '.git' && (e.isDirectory() || e.isFile()))) {
      found.push(dir)
      if (found.length >= SCAN_MAX_REPOS) truncated = true
      return
    }

    const subdirs = entries.filter(
      (e) => e.isDirectory() && !e.name.startsWith('.') && !SCAN_SKIP.has(e.name),
    )
    for (const sub of subdirs) {
      if (truncated) return
      await walk(path.join(dir, sub.name), depth + 1)
    }
  }

  await walk(root, 0)
  return { root, repos: found, dirsVisited, truncated }
}

/** 给扫描到的仓库补充展示所需的元信息 */
async function describeRepo(
  repoPath: string,
  root: string,
  authors: string[],
): Promise<ScannedRepo> {
  const info: ScannedRepo = {
    path: repoPath,
    name: path.basename(repoPath),
    relPath: path.relative(root, repoPath) || '.',
    branch: '',
    remote: '',
    lastCommitAt: '',
    lastCommitSubject: '',
    lastCommitAuthor: '',
    myCommits: 0,
    totalCommits: 0,
    imported: false,
    importedAs: '',
  }

  const SEP = String.fromCharCode(31)
  await Promise.all([
    git(repoPath, ['rev-parse', '--abbrev-ref', 'HEAD'], 5000)
      .then((v) => (info.branch = v))
      .catch(() => (info.branch = '(空仓库)')),
    git(repoPath, ['remote', 'get-url', 'origin'], 5000)
      .then((v) => (info.remote = v))
      .catch(() => {}),
    git(repoPath, ['log', '-1', `--pretty=format:%aI${SEP}%an${SEP}%s`], 5000)
      .then((v) => {
        const [at, an, subject] = v.split(SEP)
        info.lastCommitAt = at ?? ''
        info.lastCommitAuthor = an ?? ''
        info.lastCommitSubject = subject ?? ''
      })
      .catch(() => {}),
    git(repoPath, ['rev-list', '--all', '--count', '--since=90.days.ago'], 6000)
      .then((v) => (info.totalCommits = Number(v) || 0))
      .catch(() => {}),
  ])

  if (authors.length) {
    const args = ['rev-list', '--all', '--count', '--since=90.days.ago']
    for (const a of authors) args.push(`--author=${a}`)
    info.myCommits = await git(repoPath, args, 6000)
      .then((v) => Number(v) || 0)
      .catch(() => 0)
  } else {
    info.myCommits = info.totalCommits
  }

  return info
}

/** 登记工作区时的路径体检：目录存在？是 git 仓库？分支和最近作者是什么？ */
async function validateWorkspacePath(rawPath: string) {
  const result = {
    ok: false,
    path: rawPath,
    resolvedPath: '',
    reason: '',
    branch: '',
    remote: '',
    authors: [] as { name: string; email: string; commits: number }[],
    lastCommitAt: '',
    commitCount: 0,
  }
  if (!rawPath?.trim()) {
    result.reason = '路径不能为空'
    return result
  }
  const resolved = expandHome(rawPath)
  result.resolvedPath = resolved

  let stat: fs.Stats
  try {
    stat = await fsp.stat(resolved)
  } catch {
    result.reason = '目录不存在'
    return result
  }
  if (!stat.isDirectory()) {
    result.reason = '该路径不是目录'
    return result
  }

  try {
    const top = await git(resolved, ['rev-parse', '--show-toplevel'])
    if (path.resolve(top) !== resolved) {
      result.reason = `该目录不是仓库根目录，仓库根在 ${top}`
      result.resolvedPath = top
    }
  } catch {
    result.reason = '不是 git 仓库（未找到 .git）'
    return result
  }

  const root = result.resolvedPath
  try {
    result.branch = await git(root, ['rev-parse', '--abbrev-ref', 'HEAD'])
  } catch {
    result.branch = '(空仓库)'
  }
  try {
    result.remote = await git(root, ['remote', 'get-url', 'origin'])
  } catch {
    result.remote = ''
  }
  try {
    // 近半年提交作者排行，作为作者过滤下拉的候选
    const out = await git(root, [
      'log', '--all', '--since=6.months.ago', '--pretty=format:%an\t%ae',
    ])
    const tally = new Map<string, { name: string; email: string; commits: number }>()
    for (const line of out.split('\n')) {
      if (!line.trim()) continue
      const [name, email] = line.split('\t')
      const key = email || name
      const hit = tally.get(key)
      if (hit) hit.commits += 1
      else tally.set(key, { name, email: email ?? '', commits: 1 })
    }
    result.authors = [...tally.values()].sort((a, b) => b.commits - a.commits).slice(0, 15)
    result.commitCount = [...tally.values()].reduce((s, a) => s + a.commits, 0)
  } catch {
    /* 空仓库，忽略 */
  }
  try {
    result.lastCommitAt = await git(root, ['log', '-1', '--pretty=format:%aI'])
  } catch {
    /* 空仓库，忽略 */
  }

  result.ok = true
  if (!result.reason) result.reason = ''
  return result
}

// ---------------------------------------------------------------- SSE

class EventHub {
  private clients = new Set<ServerResponse>()
  private watcher: fs.FSWatcher | null = null
  private timer: NodeJS.Timeout | null = null
  private pending = new Set<string>()

  attach(res: ServerResponse) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    })
    res.write(`event: hello\ndata: {"ok":true}\n\n`)
    this.clients.add(res)
    const ping = setInterval(() => res.write(': ping\n\n'), 25000)
    res.on('close', () => {
      clearInterval(ping)
      this.clients.delete(res)
    })
  }

  broadcast(event: string, payload: unknown) {
    const frame = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`
    for (const res of this.clients) {
      try {
        res.write(frame)
      } catch {
        this.clients.delete(res)
      }
    }
  }

  /** 监听 data/ 目录，合并 300ms 内的抖动后广播一次 */
  watch(dir: string) {
    if (this.watcher) return
    try {
      this.watcher = fs.watch(dir, { recursive: true }, (_type, filename) => {
        if (!filename) return
        const name = String(filename)
        if (!name.endsWith('.json') || name.includes('.tmp')) return
        if (name.split('/')[0] === '.backups' || name.includes(`${path.sep}.backups`)) return
        this.pending.add(name.split(path.sep).join('/'))
        if (this.timer) clearTimeout(this.timer)
        this.timer = setTimeout(() => {
          const files = [...this.pending]
          this.pending.clear()
          this.broadcast('data-changed', { files, at: nowIso() })
        }, 300)
      })
    } catch (e) {
      console.warn('[work-report] 无法监听 data/ 目录，网页将不会自动刷新:', e)
    }
  }

  close() {
    this.watcher?.close()
    this.watcher = null
    for (const res of this.clients) res.end()
    this.clients.clear()
  }
}

// ---------------------------------------------------------------- 路由

interface Ctx {
  store: DataStore
  hub: EventHub
  /** 网页自身写入时打上标记，SSE 广播里带上，避免自己触发自己刷新 */
  markSelfWrite: (id: string) => void
}

async function loadSettings(store: DataStore) {
  const raw = await readJson<any>(store.settingsFile)
  const parsed = settingsSchema.safeParse(raw ?? { version: 1 })
  return parsed.success ? parsed.data : settingsSchema.parse({ version: 1 })
}

async function listReports(store: DataStore, type: ReportType): Promise<ReportMeta[]> {
  const dir = store.reportsDir(type)
  let files: string[] = []
  try {
    files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json') && !f.includes('.tmp'))
  } catch {
    return []
  }
  const metas: ReportMeta[] = []
  for (const file of files) {
    const id = file.replace(/\.json$/, '')
    if (!ID_PATTERN[type].test(id)) continue
    let raw: unknown
    try {
      raw = JSON.parse(await fsp.readFile(path.join(dir, file), 'utf-8'))
    } catch (e) {
      metas.push(invalidMeta(type, id, `JSON 解析失败: ${(e as Error).message}`))
      continue
    }
    const parsed = reportSchema.safeParse(raw)
    if (!parsed.success) {
      const first = zodIssues(parsed.error)[0]
      metas.push(invalidMeta(type, id, `字段 ${first?.path}: ${first?.message}`))
      continue
    }
    metas.push(toMeta(type, id, parsed.data))
  }
  return metas
}

function invalidMeta(type: ReportType, id: string, error: string): ReportMeta {
  return {
    type,
    id,
    date: type === 'daily' ? id : weekRange(id).start,
    title: id,
    status: 'draft',
    tags: [],
    commitCount: 0,
    generatedBy: 'manual',
    excerpt: '',
    filled: 0,
    totalSections: sectionsOf(type).length,
    createdAt: '',
    updatedAt: '',
    invalid: true,
    error,
  }
}

async function handle(
  req: Connect.IncomingMessage,
  res: ServerResponse,
  ctx: Ctx,
): Promise<boolean> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const pathname = url.pathname
  if (!pathname.startsWith('/api/')) return false

  const { store, hub } = ctx
  const method = (req.method ?? 'GET').toUpperCase()

  // --- SSE
  if (pathname === '/api/events') {
    hub.attach(res)
    return true
  }

  if (pathname === '/api/health') {
    send(res, 200, {
      ok: true,
      dataDir: store.dir,
      sandbox: store.sandbox,
      backups: dataFs.listSnapshots(store.dir).length,
      now: nowIso(),
    })
    return true
  }

  // --- 设置
  if (pathname === '/api/settings') {
    if (method === 'GET') {
      send(res, 200, await loadSettings(store))
      return true
    }
    if (method === 'PUT') {
      const body = await readBody(req)
      const parsed = settingsSchema.safeParse({ ...body, version: 1, updatedAt: nowIso() })
      if (!parsed.success) throw new HttpError(422, '设置校验失败', zodIssues(parsed.error))
      await writeJsonAtomic(store.settingsFile, parsed.data)
      send(res, 200, parsed.data)
      return true
    }
  }

  // --- 扫描文件夹里的所有 git 仓库
  if (pathname === '/api/workspaces/scan' && method === 'POST') {
    const body = await readBody(req)
    const target = String(body?.path ?? '')
    if (!target.trim()) throw new HttpError(400, '请填写要扫描的文件夹路径')

    const resolved = expandHome(target)
    let stat: fs.Stats
    try {
      stat = await fsp.stat(resolved)
    } catch {
      throw new HttpError(404, `目录不存在：${resolved}`)
    }
    if (!stat.isDirectory()) throw new HttpError(400, '该路径不是目录')

    const depth = Math.min(Math.max(Number(body?.depth ?? 3) || 3, 1), 6)
    const settings = await loadSettings(store)
    const authors: string[] = Array.isArray(body?.authors)
      ? body.authors.filter((a: unknown) => typeof a === 'string' && a.trim())
      : settings.defaultAuthors

    const started = Date.now()
    const { root, repos, dirsVisited, truncated } = await scanForRepos(resolved, depth)

    // 已登记的仓库要标出来，避免重复导入
    const wsRaw = await readJson<any>(store.workspacesFile)
    const existing = new Map<string, string>()
    for (const w of wsRaw?.workspaces ?? []) {
      existing.set(path.resolve(w.path), w.name)
    }

    const described = await mapLimit(repos, 8, (repoPath) =>
      describeRepo(repoPath, root, authors),
    )
    for (const r of described) {
      const hit = existing.get(path.resolve(r.path))
      if (hit !== undefined) {
        r.imported = true
        r.importedAs = hit
      }
    }

    // 最近有提交的排前面，正是你最可能想登记的那些
    described.sort((a, b) => (a.lastCommitAt < b.lastCommitAt ? 1 : a.lastCommitAt > b.lastCommitAt ? -1 : 0))

    send(res, 200, {
      root,
      depth,
      authors,
      repos: described,
      dirsVisited,
      truncated,
      elapsedMs: Date.now() - started,
    })
    return true
  }

  // --- 工作区校验
  if (pathname === '/api/workspaces/validate' && method === 'POST') {
    const body = await readBody(req)
    send(res, 200, await validateWorkspacePath(String(body?.path ?? '')))
    return true
  }

  // --- 工作区
  if (pathname === '/api/workspaces') {
    if (method === 'GET') {
      const raw = await readJson<any>(store.workspacesFile)
      const parsed = workspacesFileSchema.safeParse(raw ?? { version: 1, workspaces: [] })
      if (!parsed.success) {
        throw new HttpError(500, 'workspaces.json 格式错误', zodIssues(parsed.error))
      }
      send(res, 200, parsed.data)
      return true
    }
    if (method === 'PUT') {
      const body = await readBody(req)
      const parsed = workspacesFileSchema.safeParse({ version: 1, workspaces: body?.workspaces ?? [] })
      if (!parsed.success) throw new HttpError(422, '工作区校验失败', zodIssues(parsed.error))
      // moduleTag 必须唯一，否则报告里的【标签】会指向两个仓库
      const seen = new Set<string>()
      for (const w of parsed.data.workspaces) {
        if (seen.has(w.moduleTag)) {
          throw new HttpError(422, `模块标签「${w.moduleTag}」重复，请保持唯一`)
        }
        seen.add(w.moduleTag)
      }
      await writeJsonAtomic(store.workspacesFile, parsed.data)
      send(res, 200, parsed.data)
      return true
    }
  }

  // --- 报告列表
  if (pathname === '/api/reports' && method === 'GET') {
    const typeParam = url.searchParams.get('type')
    const types: ReportType[] =
      typeParam === 'daily' || typeParam === 'weekly' ? [typeParam] : ['daily', 'weekly']
    const all: ReportMeta[] = []
    for (const t of types) all.push(...(await listReports(store, t)))
    all.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.type < b.type ? 1 : -1))
    const tz = (await loadSettings(store)).timezone
    send(res, 200, { reports: all, today: dateKeyInTz(tz), thisWeek: weekKeyInTz(tz) })
    return true
  }

  // --- 单份报告
  const m = /^\/api\/reports\/(daily|weekly)\/([^/]+)$/.exec(pathname)
  if (m) {
    const type = m[1] as ReportType
    const id = decodeURIComponent(m[2])
    const file = store.reportFile(type, id)

    if (method === 'GET') {
      const raw = await readJson<any>(file)
      if (!raw) throw new HttpError(404, `报告 ${id} 不存在`)
      const parsed = reportSchema.safeParse(raw)
      if (!parsed.success) {
        throw new HttpError(422, `报告 ${id} 不符合数据规范`, zodIssues(parsed.error))
      }
      send(res, 200, parsed.data)
      return true
    }

    if (method === 'POST') {
      // 创建骨架；已存在则直接返回现有内容，保证幂等
      const existing = await readJson<any>(file)
      if (existing) {
        send(res, 200, existing)
        return true
      }
      const settings = await loadSettings(store)
      const skeleton = createSkeleton(type, id, settings)
      await writeJsonAtomic(file, skeleton)
      ctx.markSelfWrite(`${type}/${id}`)
      send(res, 201, skeleton)
      return true
    }

    if (method === 'PUT') {
      const body = await readBody(req)
      const disk = await readJson<any>(file)

      // 乐观锁：网页拿到数据后若磁盘被 AI 改过，拒绝覆盖
      const baseUpdatedAt = body?.baseUpdatedAt
      if (disk && baseUpdatedAt && disk.updatedAt !== baseUpdatedAt && body?.force !== true) {
        throw new HttpError(409, '文件已被其他进程更新', {
          diskUpdatedAt: disk.updatedAt,
          baseUpdatedAt,
          disk,
        })
      }

      const incoming = { ...(body?.report ?? body) }
      delete incoming.baseUpdatedAt
      delete incoming.force

      const merged = {
        ...incoming,
        schemaVersion: 1,
        type,
        createdAt: disk?.createdAt ?? incoming.createdAt ?? nowIso(),
        updatedAt: nowIso(),
      }
      const parsed = reportSchema.safeParse(merged)
      if (!parsed.success) {
        throw new HttpError(422, '报告校验失败', zodIssues(parsed.error))
      }
      // tags 由正文中的【模块】自动派生，前端无需维护
      parsed.data.tags = extractTags(parsed.data)
      await writeJsonAtomic(file, parsed.data)
      ctx.markSelfWrite(`${type}/${id}`)
      send(res, 200, parsed.data)
      return true
    }

    if (method === 'DELETE') {
      try {
        // 删除前留快照，误删可用 report.mjs restore 找回
        dataFs.unlinkWithSnapshot(store.dir, file)
      } catch (e: any) {
        if (e?.code !== 'ENOENT') throw new HttpError(500, `删除失败: ${e.message}`)
      }
      ctx.markSelfWrite(`${type}/${id}`)
      send(res, 200, { ok: true })
      return true
    }
  }

  throw new HttpError(404, `未知的接口 ${method} ${pathname}`)
}

// ---------------------------------------------------------------- 插件

export function dataApiPlugin(root: string): Plugin {
  const store = new DataStore(root)
  const hub = new EventHub()
  const selfWrites = new Set<string>()

  const ctx: Ctx = {
    store,
    hub,
    markSelfWrite: (id) => {
      selfWrites.add(id)
      setTimeout(() => selfWrites.delete(id), 1500)
    },
  }

  let ready: Promise<void> | null = null
  const middleware: Connect.NextHandleFunction = (req, res, next) => {
    if (!req.url?.startsWith('/api/')) return next()
    if (!ready) ready = store.ensure()
    ready
      .then(() => handle(req, res, ctx))
      .then((handled) => {
        if (!handled) next()
      })
      .catch((err) => {
        if (err instanceof HttpError) {
          fail(res, err.status, err.message, err.detail)
        } else {
          console.error('[work-report] API 异常:', err)
          fail(res, 500, err?.message ?? '服务器内部错误')
        }
      })
  }

  /**
   * 中间件必须在 configureServer 的同步阶段挂上，
   * 否则会排在 Vite 的 SPA fallback 之后，/api/* 会被当成页面路由返回 index.html。
   */
  function setup(server: ViteDevServer | PreviewServer) {
    server.middlewares.use(middleware)
    void store.ensure().then(() => hub.watch(store.dir))
    const origin = hub.broadcast.bind(hub)
    hub.broadcast = (event, payload: any) => {
      // 过滤掉网页自己刚写的文件，避免"保存后立刻提示被外部修改"
      if (event === 'data-changed' && Array.isArray(payload?.files)) {
        const files = payload.files.filter((f: string) => {
          const hit = /reports\/(daily|weekly)\/(.+)\.json$/.exec(f)
          return !(hit && selfWrites.has(`${hit[1]}/${hit[2]}`))
        })
        if (!files.length) return
        payload = { ...payload, files }
      }
      origin(event, payload)
    }
  }

  return {
    name: 'work-report:data-api',
    configureServer(server) {
      setup(server)
    },
    configurePreviewServer(server) {
      setup(server)
    },
    closeBundle() {
      hub.close()
    },
  }
}
