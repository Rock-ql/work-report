import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import * as dataFs from '../server/data-fs.mjs'

/**
 * node 脚本无法直接 import shared/*.ts，这里用 esbuild 把它们打成一个 ESM 产物再加载。
 * 产物比源文件旧就重新构建 —— 保证脚本永远跑在最新的数据契约上，
 * 不会出现"改了 schema.ts 忘了重新生成，AI 按旧规范写文件"的漂移。
 */

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
/** WR_DATA_DIR 可把数据目录整体挪走 —— 自动化测试用它指向临时目录 */
export const DATA_DIR = dataFs.resolveDataDir(ROOT)
export const IS_SANDBOX = dataFs.isSandbox()
export const SCHEMA_DIR = path.join(ROOT, 'schemas')

const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'work-report')
const OUT_FILE = path.join(CACHE_DIR, 'shared.mjs')

function newestSourceMtime() {
  const dir = path.join(ROOT, 'shared')
  let newest = 0
  for (const f of fs.readdirSync(dir)) {
    if (!f.endsWith('.ts')) continue
    newest = Math.max(newest, fs.statSync(path.join(dir, f)).mtimeMs)
  }
  return newest
}

let cached = null

export async function loadShared() {
  if (cached) return cached

  const srcMtime = newestSourceMtime()
  const stale = !fs.existsSync(OUT_FILE) || fs.statSync(OUT_FILE).mtimeMs < srcMtime

  if (stale) {
    const esbuild = await import('esbuild')
    fs.mkdirSync(CACHE_DIR, { recursive: true })
    await esbuild.build({
      entryPoints: [path.join(ROOT, 'shared', 'index.ts')],
      outfile: OUT_FILE,
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      external: ['zod'],
      logLevel: 'silent',
    })
  }

  cached = await import(pathToFileURL(OUT_FILE).href)
  return cached
}

// ------------------------------------------------------------------ CLI 工具

/** 解析 --key value / --flag 形式的参数 */
export function parseArgs(argv) {
  const out = { _: [] }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a.startsWith('--')) {
      const key = a.slice(2)
      const next = argv[i + 1]
      if (next === undefined || next.startsWith('--')) {
        out[key] = true
      } else {
        out[key] = next
        i++
      }
    } else {
      out._.push(a)
    }
  }
  return out
}

const ESC = String.fromCharCode(27)
const isTTY = process.stdout.isTTY
const paint = (code) => (s) => (isTTY ? `${ESC}[${code}m${s}${ESC}[0m` : String(s))

export const c = {
  dim: paint('2'),
  bold: paint('1'),
  red: paint('31'),
  green: paint('32'),
  yellow: paint('33'),
  blue: paint('34'),
  cyan: paint('36'),
}

export function die(message, code = 1) {
  console.error(`${c.red('x')} ${message}`)
  process.exit(code)
}

/** 写入数据文件：覆盖前自动留快照，再原子写。与网页 API 共用同一份实现 */
export function writeJsonAtomic(file, data) {
  dataFs.writeJsonAtomic(DATA_DIR, file, data)
}

export const { listSnapshots, restoreSnapshot, unlinkWithSnapshot } = dataFs

export function readJson(file) {
  if (!fs.existsSync(file)) return null
  return JSON.parse(fs.readFileSync(file, 'utf-8'))
}
