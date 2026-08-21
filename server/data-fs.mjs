import fs from 'node:fs'
import path from 'node:path'

/**
 * 数据文件的读写与保护。
 *
 * 被 server/data-api-plugin.ts（网页 API）和 scripts/_shared.mjs（AI 脚本）共同 import，
 * 是所有写入 data/ 的唯一出口 —— 保护逻辑只有一份，不会有哪条路径绕过去。
 *
 * 两层保护：
 *   1. WR_DATA_DIR 环境变量可把数据目录整体挪走，自动化测试用它指向临时目录，
 *      structurally 不可能碰到真实数据
 *   2. 每次覆盖/删除前自动留一份带时间戳的快照到 data/.backups/，滚动保留最近 N 份
 */

export const BACKUP_DIRNAME = '.backups'
/** 每个文件保留的历史快照数 */
export const BACKUP_KEEP = 40

/** 解析数据目录：WR_DATA_DIR 优先，否则用项目下的 data/ */
export function resolveDataDir(projectRoot) {
  const override = process.env.WR_DATA_DIR?.trim()
  if (override) return path.resolve(override)
  return path.join(projectRoot, 'data')
}

/** 当前是否运行在沙箱数据目录下（即测试环境） */
export function isSandbox() {
  return !!process.env.WR_DATA_DIR?.trim()
}

function backupNameFor(dataDir, file) {
  // data/reports/daily/2026-08-20.json -> reports__daily__2026-08-20
  const rel = path.relative(dataDir, file).split(path.sep).join('__')
  const base = rel.replace(/\.json$/, '')
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  const stamp =
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  return `${base}.${stamp}.json`
}

/** 同一文件只保留最近 BACKUP_KEEP 份快照 */
function prune(backupDir, prefix) {
  let files
  try {
    files = fs.readdirSync(backupDir).filter((f) => f.startsWith(`${prefix}.`) && f.endsWith('.json'))
  } catch {
    return
  }
  if (files.length <= BACKUP_KEEP) return
  files.sort() // 时间戳在文件名里，字典序即时间序
  for (const f of files.slice(0, files.length - BACKUP_KEEP)) {
    try {
      fs.unlinkSync(path.join(backupDir, f))
    } catch {
      /* 删不掉就算了，不影响主流程 */
    }
  }
}

/**
 * 覆盖或删除前留快照。内容没变化时不留，避免刷屏。
 * 返回快照路径，没留则返回 null。
 */
export function snapshot(dataDir, file, nextContent) {
  if (!fs.existsSync(file)) return null
  let current
  try {
    current = fs.readFileSync(file, 'utf-8')
  } catch {
    return null
  }
  if (nextContent !== undefined && current === nextContent) return null

  const backupDir = path.join(dataDir, BACKUP_DIRNAME)
  try {
    fs.mkdirSync(backupDir, { recursive: true })
    const name = backupNameFor(dataDir, file)
    const dest = path.join(backupDir, name)
    fs.writeFileSync(dest, current, 'utf-8')
    prune(backupDir, name.split('.')[0])
    return dest
  } catch (e) {
    // 备份失败不能阻断正常写入，但要让人看见
    console.warn('[work-report] 快照失败:', e?.message ?? e)
    return null
  }
}

/**
 * 原子写：先留快照，再写临时文件 + rename。
 * rename 保证网页永远读不到写了一半的 JSON。
 */
export function writeJsonAtomic(dataDir, file, data) {
  const content = JSON.stringify(data, null, 2) + '\n'
  snapshot(dataDir, file, content)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, content, 'utf-8')
  fs.renameSync(tmp, file)
}

/** 删除前也留快照，误删可恢复 */
export function unlinkWithSnapshot(dataDir, file) {
  snapshot(dataDir, file)
  try {
    fs.unlinkSync(file)
    return true
  } catch (e) {
    if (e?.code === 'ENOENT') return false
    throw e
  }
}

/** 列出快照。relPath 形如 workspaces.json / reports/daily/2026-08-20.json，留空则列全部 */
export function listSnapshots(dataDir, relPath) {
  const backupDir = path.join(dataDir, BACKUP_DIRNAME)
  let files
  try {
    files = fs.readdirSync(backupDir).filter((f) => f.endsWith('.json'))
  } catch {
    return []
  }
  const prefix = relPath ? relPath.split('/').join('__').replace(/\.json$/, '') : null
  return files
    .filter((f) => !prefix || f.startsWith(`${prefix}.`))
    .map((f) => {
      const m = /^(.+)\.(\d{8}-\d{6})\.json$/.exec(f)
      const stat = fs.statSync(path.join(backupDir, f))
      return {
        file: f,
        fullPath: path.join(backupDir, f),
        target: m ? `${m[1].split('__').join('/')}.json` : f,
        stamp: m ? m[2] : '',
        size: stat.size,
        mtime: stat.mtime,
      }
    })
    .sort((a, b) => (a.stamp < b.stamp ? 1 : -1))
}

/** 把某份快照恢复回它对应的数据文件（恢复动作本身也会先留快照） */
export function restoreSnapshot(dataDir, snapshotFile) {
  const full = path.isAbsolute(snapshotFile)
    ? snapshotFile
    : path.join(dataDir, BACKUP_DIRNAME, snapshotFile)
  if (!fs.existsSync(full)) throw new Error(`快照不存在: ${full}`)

  const name = path.basename(full)
  const m = /^(.+)\.(\d{8}-\d{6})\.json$/.exec(name)
  if (!m) throw new Error(`不是合法的快照文件名: ${name}`)

  const target = path.join(dataDir, ...m[1].split('__')) + '.json'
  const content = fs.readFileSync(full, 'utf-8')
  snapshot(dataDir, target, content)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  const tmp = `${target}.${process.pid}.tmp`
  fs.writeFileSync(tmp, content, 'utf-8')
  fs.renameSync(tmp, target)
  return target
}
