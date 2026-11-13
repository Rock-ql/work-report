import fs from 'node:fs'
import path from 'node:path'
import { writeJsonAtomic } from './data-fs.mjs'

export class PerformanceError extends Error {
  constructor(status, message) { super(message); this.status = status }
}

/** 注入 shared，API 使用静态 TS 导入，CLI 使用 loadShared，避免两份业务实现。 */
export function createPerformanceService(dataDir, shared) {
  const dir = path.join(dataDir, 'performance')
  const check = (schema, raw) => {
    const parsed = schema.safeParse(raw)
    if (!parsed.success) throw new PerformanceError(422, parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
    return parsed.data
  }
  const fileFor = (month) => path.join(dir, `${check(shared.monthStr, month)}.json`)
  const read = (file) => {
    try { return JSON.parse(fs.readFileSync(file, 'utf8')) }
    catch (e) { if (e.code === 'ENOENT') return null; throw new PerformanceError(500, `读取 ${path.basename(file)} 失败: ${e.message}`) }
  }
  const get = (month) => {
    const raw = read(fileFor(month))
    if (raw === null) return null
    const parsed = shared.performanceSchema.safeParse(raw)
    if (!parsed.success || parsed.data.month !== month) throw new PerformanceError(500, `绩效文件 ${month}.json 不合规或月份不匹配`)
    return parsed.data
  }
  // 同步读-比较-写在一个调用中完成；另加文件锁，保护 CLI 和 API 多进程竞争。
  /** 进程被杀会留下锁文件；超过该时长视为残留锁，可被接管 */
  const LOCK_STALE_MS = 30_000
  const openLock = (lock) => {
    try { return fs.openSync(lock, 'wx') }
    catch (e) {
      if (e.code !== 'EEXIST') throw e
      let stale = true
      try { stale = Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS }
      catch { /* 已被别人清理，直接重试 */ }
      if (!stale) throw new PerformanceError(409, '该月份正在保存，请稍后重试')
      try { fs.unlinkSync(lock) } catch { /* 忽略：可能已被其他进程删掉 */ }
      try { return fs.openSync(lock, 'wx') }
      catch { throw new PerformanceError(409, '该月份正在保存，请稍后重试') }
    }
  }
  const withLock = (month, fn) => {
    const file = fileFor(month)
    fs.mkdirSync(dir, { recursive: true })
    const lock = `${file}.lock`
    const fd = openLock(lock)
    try {
      return fn(file)
    } finally {
      try { fs.closeSync(fd) } catch { /* 忽略 */ }
      try { fs.unlinkSync(lock) } catch { /* 忽略，不能让清理失败掩盖真正的错误 */ }
    }
  }
  const persist = (file, report, existing) => {
    // 时间戳严格递增，即使同毫秒连续保存，旧版本也不会命中新版本。
    const now = new Date(Math.max(Date.now(), existing ? Date.parse(existing.updatedAt) + 1 : 0)).toISOString()
    const next = check(shared.performanceSchema, { ...report, createdAt: existing?.createdAt ?? now, updatedAt: now })
    writeJsonAtomic(dataDir, file, next)
    return next
  }
  return {
    get,
    list() {
      if (!fs.existsSync(dir)) return []
      return fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort().reverse().map((f) => {
        const month = f.slice(0, -5)
        if (!shared.monthStr.safeParse(month).success) throw new PerformanceError(500, `绩效文件名不合规: ${f}`)
        return get(month)
      })
    },
    generate(month, rawBody) {
      fileFor(month)
      const body = check(shared.performanceGenerateSchema, rawBody)
      let source
      if (body.sourceType === 'offline') {
        source = check(shared.performanceSourceSchema, { type: 'offline', label: body.filename ? path.basename(body.filename.replace(/\\/g, '/')) : '离线文本', text: body.text, dates: [] })
      } else {
        const dailyDir = path.join(dataDir, 'reports', 'daily')
        const reports = []
        const warnings = []
        for (const name of fs.existsSync(dailyDir) ? fs.readdirSync(dailyDir).sort() : []) {
          if (!name.startsWith(`${month}-`) || !name.endsWith('.json')) continue
          try {
            const parsed = shared.dailyReportSchema.safeParse(read(path.join(dailyDir, name)))
            if (!parsed.success || `${parsed.data.date}.json` !== name) throw new Error('schema 或文件日期不一致')
            reports.push(parsed.data)
          } catch (e) { warnings.push(`跳过异常日报 ${name}: ${e.message}`) }
        }
        try { source = shared.dailyPerformanceSource(month, reports) }
        catch { throw new PerformanceError(422, `当月没有非空的日报今日工作完成情况${warnings.length ? `；${warnings.join('；')}` : ''}`) }
        const draft = shared.generatePerformance(month, source)
        draft.warnings.push(...warnings)
        return draft
      }
      return shared.generatePerformance(month, source)
    },
    save(month, rawBody) {
      const body = check(shared.performanceSaveSchema, rawBody)
      if (body.report.month !== month) throw new PerformanceError(422, 'URL 月份与报告月份不一致')
      return withLock(month, (file) => {
        const existing = get(month)
        if (!existing && body.baseUpdatedAt !== undefined) {
          throw new PerformanceError(409, '该月份尚未保存绩效，不能提供 baseUpdatedAt')
        }
        if (existing && body.baseUpdatedAt !== existing.updatedAt) {
          throw new PerformanceError(409, '绩效已变更，请重新加载后保存（已有报告必须提供 baseUpdatedAt）')
        }
        return persist(file, body.report, existing)
      })
    },
    writePatch(month, rawPatch, replace = false) {
      const patch = check(shared.performancePatchSchema, rawPatch)
      return withLock(month, (file) => {
        const existing = get(month)
        if (existing && !replace) throw new PerformanceError(409, '绩效已存在，默认拒绝覆盖人工编辑；确认后使用 --replace')
        if (!existing && !patch.source) throw new PerformanceError(422, '首次创建绩效必须提供 source（来源原文与日期），不能只写 sections')
        const ts = new Date().toISOString()
        const base = existing ?? { schemaVersion: 1, month, title: `${month} 月度绩效`,
          sections: Object.fromEntries(shared.PERFORMANCE_ITEMS.map(({ key }) => [key, ''])),
          warnings: [], createdAt: ts, updatedAt: ts }
        const next = check(shared.performanceSchema, { ...base, ...patch, sections: { ...base.sections, ...patch.sections } })
        return persist(file, next, existing)
      })
    },
  }
}
