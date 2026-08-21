#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import {
  DATA_DIR,
  IS_SANDBOX,
  c,
  die,
  listSnapshots,
  loadShared,
  parseArgs,
  readJson,
  restoreSnapshot,
  writeJsonAtomic,
} from './_shared.mjs'

/**
 * 报告文件的唯一写入通道。
 *
 * 存在的意义：把「AI 只能写 AI 字段」从君子协定变成代码约束。
 * write 子命令只接受 AI 字段的补丁，人工字段一律从磁盘现有文件继承 ——
 * AI 就算把人工字段塞进补丁里也会被拒绝，写不进去。
 *
 * 子命令：
 *   new       创建骨架
 *   write     合并 AI 补丁并写入（默认行为，含校验）
 *   validate  全量校验 data/ 下所有文件
 *   show      打印某份报告的钉钉纯文本
 *   list      列出已有报告
 *   backups   列出自动快照
 *   restore   从快照恢复
 */

const USAGE = `用法:
  node scripts/report.mjs new      --type daily  --date 2026-08-20
  node scripts/report.mjs write    --type daily  --date 2026-08-20 --patch patch.json
  node scripts/report.mjs write    --type weekly --week 2026-W34   --patch patch.json
  node scripts/report.mjs validate
  node scripts/report.mjs show     --type daily  --date 2026-08-20
  node scripts/report.mjs list     [--type daily|weekly]
  node scripts/report.mjs backups  [--file workspaces.json]
  node scripts/report.mjs restore  --snapshot <快照文件名>

write 的补丁字段（其余字段一律拒绝）:
  日报: todayCompleted, tomorrowPlanDev, tags, commits, workspaceIds, range
  周报: weekCompleted,  tags, commits, workspaceIds, range

  补丁也可以走 stdin:  cat patch.json | node scripts/report.mjs write --type daily --date 2026-08-20`

const reportsDir = (type) => path.join(DATA_DIR, 'reports', type)
const reportFile = (type, id) => path.join(reportsDir(type), `${id}.json`)

// ------------------------------------------------------------------ 通用

function resolveTarget(args, shared) {
  const { DEFAULT_TIMEZONE, ID_PATTERN, weekKeyInTz, dateKeyInTz } = shared
  const tz = loadSettings().timezone || DEFAULT_TIMEZONE
  let type = args.type
  let id = args.date ?? args.week ?? args.id

  if (!type && id) type = ID_PATTERN.weekly.test(String(id)) ? 'weekly' : 'daily'
  if (!type) die(`缺少 --type\n\n${USAGE}`)
  if (type !== 'daily' && type !== 'weekly') die(`--type 只能是 daily 或 weekly，收到「${type}」`)

  // 不给 id 就默认今天 / 本周，减少 AI 出错的机会
  if (id === undefined || id === true) {
    id = type === 'daily' ? dateKeyInTz(tz) : weekKeyInTz(tz)
  }
  id = String(id)
  if (!ID_PATTERN[type].test(id)) {
    die(`${type} 的 ID 应为 ${type === 'daily' ? 'YYYY-MM-DD' : 'YYYY-Www'}，收到「${id}」`)
  }
  return { type, id }
}

function loadSettings() {
  return (
    readJson(path.join(DATA_DIR, 'settings.json')) ?? {
      dailyTitle: '工作日报',
      weeklyTitle: '工作周报',
    }
  )
}

function skeleton(type, id, shared) {
  const { nowIso, weekRange } = shared
  const settings = loadSettings()
  const ts = nowIso()
  const base = {
    schemaVersion: 1,
    type,
    title: '',
    status: 'draft',
    source: {
      workspaceIds: [],
      range: { since: '', until: '' },
      commits: [],
      generatedBy: 'manual',
    },
    tags: [],
    createdAt: ts,
    updatedAt: ts,
  }
  if (type === 'daily') {
    return {
      ...base,
      date: id,
      title: `${settings.dailyTitle ?? '工作日报'} ${id}`,
      sections: {
        todayCompleted: '',
        tomorrowPlan: { product: '', dev: '', backlog: '' },
        needHelp: '',
      },
    }
  }
  const { start, end } = weekRange(id)
  return {
    ...base,
    week: id,
    weekStart: start,
    weekEnd: end,
    title: `${settings.weeklyTitle ?? '工作周报'} ${id}`,
    sections: { weekCompleted: '', nextWeekPlan: '', needHelp: '' },
  }
}

function formatIssues(err) {
  return (err?.issues ?? []).map((i) => `  ${c.dim('->')} ${i.path.join('.') || '(root)'}: ${i.message}`)
}

// --------------------------------------------------------------- 子命令

function cmdNew(args, shared) {
  const { type, id } = resolveTarget(args, shared)
  const file = reportFile(type, id)
  if (fs.existsSync(file)) {
    console.log(`${c.yellow('=')} ${path.relative(DATA_DIR, file)} 已存在，未改动`)
    return 0
  }
  const draft = skeleton(type, id, shared)
  const parsed = shared.reportSchema.safeParse(draft)
  if (!parsed.success) {
    console.error(`${c.red('x')} 骨架不符合 schema:`)
    formatIssues(parsed.error).forEach((l) => console.error(l))
    return 1
  }
  writeJsonAtomic(file, parsed.data)
  console.log(`${c.green('+')} 已创建 ${c.bold(path.relative(DATA_DIR, file))}`)
  return 0
}

async function readPatch(args) {
  if (args.patch && args.patch !== true) {
    const p = String(args.patch)
    if (!fs.existsSync(p)) die(`补丁文件不存在: ${p}`)
    try {
      return JSON.parse(fs.readFileSync(p, 'utf-8'))
    } catch (e) {
      die(`补丁文件不是合法 JSON: ${e.message}`)
    }
  }
  if (!process.stdin.isTTY) {
    const chunks = []
    for await (const chunk of process.stdin) chunks.push(chunk)
    const raw = Buffer.concat(chunks).toString('utf-8').trim()
    if (raw) {
      try {
        return JSON.parse(raw)
      } catch (e) {
        die(`stdin 不是合法 JSON: ${e.message}`)
      }
    }
  }
  die(`缺少补丁。用 --patch <file>，或把 JSON 从 stdin 管道进来\n\n${USAGE}`)
}

async function cmdWrite(args, shared) {
  const { type, id } = resolveTarget(args, shared)
  const { dailyPatchSchema, weeklyPatchSchema, reportSchema, nowIso, extractTags } = shared

  const raw = await readPatch(args)
  const patchSchema = type === 'daily' ? dailyPatchSchema : weeklyPatchSchema
  const parsedPatch = patchSchema.safeParse(raw)
  if (!parsedPatch.success) {
    console.error(`${c.red('x')} 补丁不合法（只允许 AI 字段，人工字段会被拒绝）:`)
    formatIssues(parsedPatch.error).forEach((l) => console.error(l))
    console.error('')
    console.error(c.dim(USAGE))
    return 1
  }
  const patch = parsedPatch.data

  // 现有文件就是人工字段的来源；不存在则先建骨架
  const file = reportFile(type, id)
  const existing = readJson(file)
  const created = !existing
  const base = existing ?? skeleton(type, id, shared)

  // 只覆盖白名单字段 —— 这是"AI 不覆盖人工内容"的实际执行点
  const next = structuredClone(base)
  const touched = []

  if (type === 'daily') {
    if (patch.todayCompleted !== undefined) {
      next.sections.todayCompleted = patch.todayCompleted
      touched.push('sections.todayCompleted')
    }
    if (patch.tomorrowPlanDev !== undefined) {
      next.sections.tomorrowPlan.dev = patch.tomorrowPlanDev
      touched.push('sections.tomorrowPlan.dev')
    }
  } else if (patch.weekCompleted !== undefined) {
    next.sections.weekCompleted = patch.weekCompleted
    touched.push('sections.weekCompleted')
  }

  if (patch.commits !== undefined) {
    next.source.commits = patch.commits
    touched.push(`source.commits (${patch.commits.length} 条)`)
  }
  if (patch.workspaceIds !== undefined) next.source.workspaceIds = patch.workspaceIds
  if (patch.range !== undefined) next.source.range = patch.range

  if (touched.length) {
    next.source.generatedBy = 'ai'
    next.source.generatedAt = nowIso()
  }

  // createdAt / schemaVersion 永远沿用磁盘上的值
  next.createdAt = base.createdAt
  next.schemaVersion = 1
  next.updatedAt = nowIso()

  const parsed = reportSchema.safeParse(next)
  if (!parsed.success) {
    console.error(`${c.red('x')} 合并后的报告不符合 schema:`)
    formatIssues(parsed.error).forEach((l) => console.error(l))
    return 1
  }

  // tags 从正文的【模块】自动派生，补丁显式给了就以补丁为准
  parsed.data.tags = patch.tags ?? extractTags(parsed.data)

  writeJsonAtomic(file, parsed.data)

  console.log(`${c.green(created ? '+' : '~')} ${created ? '已创建并写入' : '已更新'} ${c.bold(path.relative(DATA_DIR, file))}`)
  for (const t of touched) console.log(`  ${c.dim('->')} ${t}`)
  if (!touched.length) console.log(`  ${c.yellow('!')} 补丁没有包含任何可写字段，内容未变`)

  const preserved = collectManual(parsed.data, type)
  if (preserved.length) {
    console.log(`  ${c.dim('保留人工字段:')} ${c.dim(preserved.join(', '))}`)
  }

  // 校验模块标签是否都在 workspaces 里，防止 AI 自创标签
  const unknown = unknownTags(parsed.data, shared)
  if (unknown.length) {
    console.log(`  ${c.yellow('!')} 正文出现未登记的模块标签: ${unknown.join('、')}`)
    console.log(`  ${c.dim('  标签应取自 data/workspaces.json 的 moduleTag')}`)
  }
  return 0
}

function collectManual(report, type) {
  const out = []
  if (type === 'daily') {
    if (report.sections.tomorrowPlan.product.trim()) out.push('明日产品规划')
    if (report.sections.tomorrowPlan.backlog.trim()) out.push('待完成的所有工作')
    if (report.sections.needHelp.trim()) out.push('需要协助的事项')
  } else {
    if (report.sections.nextWeekPlan.trim()) out.push('下周工作计划')
    if (report.sections.needHelp.trim()) out.push('需要协助的事项')
  }
  return out
}

function unknownTags(report, shared) {
  const wsData = readJson(path.join(DATA_DIR, 'workspaces.json'))
  if (!wsData) return []
  const known = new Set((wsData.workspaces ?? []).map((w) => w.moduleTag))
  return shared.extractTags(report).filter((t) => !known.has(t))
}

function cmdValidate(args, shared) {
  const { reportSchema, workspacesFileSchema, settingsSchema, ID_PATTERN } = shared
  let checked = 0
  let bad = 0

  const report = (label, ok, issues = []) => {
    checked += 1
    if (ok) {
      if (args.verbose) console.log(`  ${c.green('ok')} ${label}`)
    } else {
      bad += 1
      console.log(`  ${c.red('x')}  ${label}`)
      issues.forEach((l) => console.log(l))
    }
  }

  console.log('')
  console.log(c.bold('校验 data/ 目录'))

  // settings
  const sFile = path.join(DATA_DIR, 'settings.json')
  if (fs.existsSync(sFile)) {
    try {
      const parsed = settingsSchema.safeParse(readJson(sFile))
      report('settings.json', parsed.success, parsed.success ? [] : formatIssues(parsed.error))
    } catch (e) {
      report('settings.json', false, [`  ${c.dim('->')} JSON 解析失败: ${e.message}`])
    }
  }

  // workspaces
  const wFile = path.join(DATA_DIR, 'workspaces.json')
  if (fs.existsSync(wFile)) {
    try {
      const parsed = workspacesFileSchema.safeParse(readJson(wFile))
      report('workspaces.json', parsed.success, parsed.success ? [] : formatIssues(parsed.error))
      if (parsed.success) {
        const seen = new Set()
        for (const w of parsed.data.workspaces) {
          if (seen.has(w.moduleTag)) {
            bad += 1
            console.log(`  ${c.red('x')}  workspaces.json: 模块标签「${w.moduleTag}」重复`)
          }
          seen.add(w.moduleTag)
          if (!fs.existsSync(w.path)) {
            console.log(`  ${c.yellow('!')}  工作区「${w.name}」路径不存在: ${w.path}`)
          }
        }
      }
    } catch (e) {
      report('workspaces.json', false, [`  ${c.dim('->')} JSON 解析失败: ${e.message}`])
    }
  }

  // reports
  const knownTags = (() => {
    const d = readJson(wFile)
    return new Set((d?.workspaces ?? []).map((w) => w.moduleTag))
  })()

  for (const type of ['daily', 'weekly']) {
    const dir = reportsDir(type)
    if (!fs.existsSync(dir)) continue
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('.tmp'))
    for (const f of files.sort()) {
      const label = `reports/${type}/${f}`
      const id = f.replace(/\.json$/, '')
      if (!ID_PATTERN[type].test(id)) {
        report(label, false, [`  ${c.dim('->')} 文件名不符合 ${type === 'daily' ? 'YYYY-MM-DD' : 'YYYY-Www'} 规范`])
        continue
      }
      let raw
      try {
        raw = readJson(path.join(dir, f))
      } catch (e) {
        report(label, false, [`  ${c.dim('->')} JSON 解析失败: ${e.message}`])
        continue
      }
      const parsed = reportSchema.safeParse(raw)
      if (!parsed.success) {
        report(label, false, formatIssues(parsed.error))
        continue
      }
      // 文件名必须与内容里的日期/周编号一致，否则网页会按文件名找不到
      const contentId = parsed.data.type === 'daily' ? parsed.data.date : parsed.data.week
      if (contentId !== id) {
        report(label, false, [`  ${c.dim('->')} 文件名 ${id} 与内容里的 ${contentId} 不一致`])
        continue
      }
      report(label, true)
      if (knownTags.size) {
        const unknown = shared.extractTags(parsed.data).filter((t) => !knownTags.has(t))
        if (unknown.length) {
          console.log(`  ${c.yellow('!')}  ${label}: 未登记的模块标签 ${unknown.join('、')}`)
        }
      }
    }
  }

  console.log('')
  if (bad === 0) {
    console.log(`${c.green('全部通过')}  共校验 ${checked} 个文件`)
    console.log('')
    return 0
  }
  console.log(`${c.red(`${bad} 个文件不合规`)}  共校验 ${checked} 个文件`)
  console.log(c.dim('修复后重新执行 node scripts/report.mjs validate'))
  console.log('')
  return 1
}

function cmdShow(args, shared) {
  const { type, id } = resolveTarget(args, shared)
  const raw = readJson(reportFile(type, id))
  if (!raw) die(`报告不存在: reports/${type}/${id}.json`)
  const parsed = shared.reportSchema.safeParse(raw)
  if (!parsed.success) {
    console.error(`${c.red('x')} 报告不符合 schema:`)
    formatIssues(parsed.error).forEach((l) => console.error(l))
    return 1
  }
  process.stdout.write(shared.toDingTalkText(parsed.data))
  return 0
}

function cmdList(args, shared) {
  const types = args.type ? [String(args.type)] : ['daily', 'weekly']
  console.log('')
  for (const type of types) {
    const dir = reportsDir(type)
    if (!fs.existsSync(dir)) continue
    const files = fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.json') && !f.includes('.tmp'))
      .sort()
      .reverse()
    console.log(c.bold(type === 'daily' ? '日报' : '周报') + c.dim(`  ${files.length} 份`))
    for (const f of files) {
      const id = f.replace(/\.json$/, '')
      const raw = readJson(path.join(dir, f))
      const parsed = shared.reportSchema.safeParse(raw)
      if (!parsed.success) {
        console.log(`  ${c.red('x')} ${id}  ${c.dim('数据异常')}`)
        continue
      }
      const r = parsed.data
      const stats = shared.fillStats(r)
      console.log(
        `  ${r.status === 'final' ? c.green('*') : c.dim('.')} ${id}  ` +
          c.dim(`${stats.filled}/${stats.total} 区块`) +
          (r.source.commits.length ? c.dim(`  ${r.source.commits.length} 提交`) : '') +
          (r.tags.length ? `  ${c.cyan(r.tags.join('、'))}` : ''),
      )
    }
    console.log('')
  }
  return 0
}

function cmdBackups(args) {
  const target = args.file && args.file !== true ? String(args.file) : undefined
  const snaps = listSnapshots(DATA_DIR, target)
  console.log('')
  if (!snaps.length) {
    console.log(c.dim(target ? `${target} 还没有快照` : '还没有任何快照'))
    console.log(c.dim('快照会在数据被覆盖或删除时自动产生'))
    console.log('')
    return 0
  }
  console.log(c.bold(`快照  ${snaps.length} 份`) + c.dim(`  ${DATA_DIR}/.backups`))
  const byTarget = new Map()
  for (const s of snaps) {
    const arr = byTarget.get(s.target)
    if (arr) arr.push(s)
    else byTarget.set(s.target, [s])
  }
  for (const [t, list] of byTarget) {
    console.log('')
    console.log(`  ${c.cyan(t)}  ${c.dim(`${list.length} 份`)}`)
    for (const s of list.slice(0, 10)) {
      const d = s.stamp
      const pretty = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)} ${d.slice(9, 11)}:${d.slice(11, 13)}:${d.slice(13, 15)}`
      console.log(`    ${pretty}  ${c.dim(`${s.size}B`)}  ${c.dim(s.file)}`)
    }
    if (list.length > 10) console.log(c.dim(`    … 另有 ${list.length - 10} 份`))
  }
  console.log('')
  console.log(c.dim('恢复: node scripts/report.mjs restore --snapshot <快照文件名>'))
  console.log('')
  return 0
}

function cmdRestore(args) {
  const name = args.snapshot ?? args.file
  if (!name || name === true) {
    die(`请用 --snapshot 指定快照文件名\n\n先执行 node scripts/report.mjs backups 查看可用快照`)
  }
  const target = restoreSnapshot(DATA_DIR, String(name))
  console.log(`${c.green('+')} 已恢复 ${c.bold(path.relative(DATA_DIR, target))}`)
  console.log(c.dim('  恢复前的内容也已存为新快照，可再次回滚'))
  return 0
}

// ------------------------------------------------------------------ 入口

async function main() {
  const argv = process.argv.slice(2)
  const cmd = argv[0] && !argv[0].startsWith('--') ? argv[0] : 'write'
  const args = parseArgs(argv[0] && !argv[0].startsWith('--') ? argv.slice(1) : argv)

  if (args.help || args.h || cmd === 'help') {
    console.log(USAGE)
    process.exit(0)
  }

  if (IS_SANDBOX) {
    console.error(c.yellow(`! 沙箱模式：数据目录为 ${DATA_DIR}（WR_DATA_DIR），不会影响真实数据`))
  }

  fs.mkdirSync(reportsDir('daily'), { recursive: true })
  fs.mkdirSync(reportsDir('weekly'), { recursive: true })

  const shared = await loadShared()

  let code
  switch (cmd) {
    case 'new':
      code = cmdNew(args, shared)
      break
    case 'write':
      code = await cmdWrite(args, shared)
      break
    case 'validate':
      code = cmdValidate(args, shared)
      break
    case 'show':
      code = cmdShow(args, shared)
      break
    case 'list':
      code = cmdList(args, shared)
      break
    case 'backups':
      code = cmdBackups(args)
      break
    case 'restore':
      code = cmdRestore(args)
      break
    default:
      die(`未知子命令「${cmd}」\n\n${USAGE}`)
  }
  process.exit(code)
}

main().catch((e) => die(e?.stack ?? String(e)))
