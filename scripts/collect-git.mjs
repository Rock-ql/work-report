#!/usr/bin/env node
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, c, die, loadShared, parseArgs, readJson } from './_shared.mjs'

const execFileAsync = promisify(execFile)

/**
 * 按报告范围抓取 git 提交。
 *
 * AI 不应自己拼 git 命令 —— 全部走这里，保证：
 *   - 只扫描 workspaces.json 里 enabled 的仓库
 *   - 作者过滤、分支限定、日期边界的口径全局一致
 *   - 输出结构与 report.mjs 期望的 commits 字段完全对齐
 *
 * 用法：
 *   node scripts/collect-git.mjs --type daily  --date 2026-08-20
 *   node scripts/collect-git.mjs --type weekly --week 2026-W34
 *   node scripts/collect-git.mjs --since 2026-08-01 --until 2026-08-07
 */

const USAGE = `用法:
  node scripts/collect-git.mjs --type daily  --date YYYY-MM-DD
  node scripts/collect-git.mjs --type weekly --week YYYY-Www
  node scripts/collect-git.mjs --since YYYY-MM-DD --until YYYY-MM-DD

选项:
  --workspace <moduleTag|id>  只抓取指定工作区
  --out <file>                将 JSON 结果写入文件
  --json                      仅输出 JSON，不打印摘要`

// 字段/记录分隔符用 ASCII 的 US(31) 与 RS(30)，
// 提交信息里出现 | 或 tab 也不会把解析冲垮
const SEP = String.fromCharCode(31)
const REC = String.fromCharCode(30)

async function git(cwd, args) {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd,
      maxBuffer: 64 * 1024 * 1024,
      timeout: 30000,
      windowsHide: true,
    })
    return stdout
  } catch (e) {
    // 空仓库、无匹配提交属于正常情况
    if (e.stderr && /does not have any commits|unknown revision/i.test(e.stderr)) return ''
    throw e
  }
}

async function collectRepo(ws, range, authorsFallback) {
  const authors = ws.authors.length ? ws.authors : authorsFallback

  const args = ['log']
  if (ws.branches.length) args.push(...ws.branches)
  else args.push('--all')
  args.push(
    `--since=${range.since}`,
    `--until=${range.until}`,
    `--pretty=format:${REC}%h${SEP}%H${SEP}%an${SEP}%ae${SEP}%aI${SEP}%s`,
    '--numstat',
    '--no-merges',
  )
  for (const a of authors) args.push(`--author=${a}`)

  let raw = ''
  try {
    raw = await git(ws.path, args)
  } catch (e) {
    return { commits: [], error: (e.stderr || '').trim() || e.message }
  }

  const commits = []
  for (const chunk of raw.split(REC)) {
    if (!chunk.trim()) continue
    const [head, ...statLines] = chunk.split('\n')
    const parts = head.split(SEP)
    const [short, full, author, email, authoredAt] = parts
    const subject = parts.slice(5).join(SEP)
    if (!short || !authoredAt) continue

    let files = 0
    let insertions = 0
    let deletions = 0
    for (const line of statLines) {
      const m = /^(\d+|-)\t(\d+|-)\t(.+)$/.exec(line.trim())
      if (!m) continue
      files += 1
      if (m[1] !== '-') insertions += Number(m[1])
      if (m[2] !== '-') deletions += Number(m[2])
    }

    commits.push({
      workspaceId: ws.id,
      moduleTag: ws.moduleTag,
      repo: ws.name,
      hash: short,
      fullHash: full,
      subject: (subject || '').trim(),
      author: `${author} <${email}>`,
      authoredAt,
      branch: '',
      files,
      insertions,
      deletions,
    })
  }

  try {
    const current = (await git(ws.path, ['rev-parse', '--abbrev-ref', 'HEAD'])).trim()
    for (const cm of commits) cm.branch = current
  } catch {
    /* 空仓库 */
  }

  commits.sort((a, b) => (a.authoredAt < b.authoredAt ? -1 : 1))
  return { commits, error: null }
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  if (args.help || args.h) {
    console.log(USAGE)
    process.exit(0)
  }

  const shared = await loadShared()
  const { DEFAULT_TIMEZONE, weekRange, ID_PATTERN, dayBoundsInTz, rangeBoundsInTz } = shared

  // 日期边界按配置时区判定，而不是机器本地时区 ——
  // 笔记本设成美西、人在国内时，半夜的提交才不会落到错误的日期上
  const settingsEarly = readJson(path.join(DATA_DIR, 'settings.json')) ?? {}
  const TZ = settingsEarly.timezone || DEFAULT_TIMEZONE

  // ------------------------------------------------------------ 时间范围
  let range
  let scope
  if (args.since && args.until) {
    range = rangeBoundsInTz(String(args.since), String(args.until), TZ)
    scope = { type: 'custom', id: '', start: String(args.since), end: String(args.until) }
  } else if (args.type === 'weekly' || args.week) {
    const week = String(args.week ?? '')
    if (!ID_PATTERN.weekly.test(week)) die(`--week 需要 YYYY-Www 格式，收到「${week}」\n\n${USAGE}`)
    const { start, end } = weekRange(week)
    range = rangeBoundsInTz(start, end, TZ)
    scope = { type: 'weekly', id: week, start, end }
  } else if (args.type === 'daily' || args.date) {
    const date = String(args.date ?? '')
    if (!ID_PATTERN.daily.test(date)) die(`--date 需要 YYYY-MM-DD 格式，收到「${date}」\n\n${USAGE}`)
    range = dayBoundsInTz(date, TZ)
    scope = { type: 'daily', id: date, start: date, end: date }
  } else {
    die(`缺少时间范围参数\n\n${USAGE}`)
  }

  // -------------------------------------------------------------- 工作区
  const wsFile = path.join(DATA_DIR, 'workspaces.json')
  const wsData = readJson(wsFile)
  if (!wsData) die(`找不到 ${wsFile}，请先在网页的「Git 工作区」页面登记仓库`)

  const authorsFallback = settingsEarly.defaultAuthors ?? []

  let workspaces = (wsData.workspaces ?? [])
    .filter((w) => w.enabled)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))

  if (args.workspace) {
    const key = String(args.workspace)
    workspaces = workspaces.filter((w) => w.moduleTag === key || w.id === key || w.name === key)
    if (!workspaces.length) die(`找不到启用中的工作区「${key}」`)
  }
  if (!workspaces.length) {
    die('没有启用中的工作区。请先在网页的「Git 工作区」页面登记至少一个仓库并启用。')
  }

  // ---------------------------------------------------------------- 抓取
  const perRepo = []
  const allCommits = []
  const warnings = []

  for (const ws of workspaces) {
    if (!fs.existsSync(ws.path)) {
      warnings.push(`工作区「${ws.name}」路径不存在，已跳过：${ws.path}`)
      continue
    }
    const { commits, error } = await collectRepo(ws, range, authorsFallback)
    if (error) {
      warnings.push(`工作区「${ws.name}」读取失败：${error}`)
      continue
    }
    perRepo.push({
      workspaceId: ws.id,
      name: ws.name,
      moduleTag: ws.moduleTag,
      path: ws.path,
      authors: ws.authors.length ? ws.authors : authorsFallback,
      commitCount: commits.length,
      insertions: commits.reduce((s, x) => s + x.insertions, 0),
      deletions: commits.reduce((s, x) => s + x.deletions, 0),
    })
    allCommits.push(...commits)
  }

  allCommits.sort((a, b) => (a.authoredAt < b.authoredAt ? -1 : 1))

  const result = {
    scope,
    range,
    timezone: TZ,
    authorsFallback,
    workspaces: perRepo,
    commits: allCommits,
    totals: {
      commits: allCommits.length,
      repos: perRepo.filter((r) => r.commitCount > 0).length,
      insertions: allCommits.reduce((s, x) => s + x.insertions, 0),
      deletions: allCommits.reduce((s, x) => s + x.deletions, 0),
    },
    warnings,
  }

  if (args.out) {
    fs.writeFileSync(String(args.out), JSON.stringify(result, null, 2) + '\n', 'utf-8')
  }

  // JSON 走 stdout，摘要走 stderr，AI 可以直接管道取 JSON
  process.stdout.write(JSON.stringify(result, null, 2) + '\n')

  if (!args.json) {
    const lines = ['']
    lines.push(c.bold(`范围 ${scope.start} ~ ${scope.end}`) + c.dim(`  (${scope.type}, ${TZ})`))
    for (const r of perRepo) {
      lines.push(
        `  ${c.cyan('[' + r.moduleTag + ']')} ${r.name} ${c.dim('->')} ` +
          (r.commitCount
            ? c.green(`${r.commitCount} 条`) + c.dim(`  +${r.insertions}/-${r.deletions}`)
            : c.dim('无提交')),
      )
    }
    lines.push('')
    lines.push(`  合计 ${c.bold(result.totals.commits)} 条提交，涉及 ${result.totals.repos} 个仓库`)
    for (const w of warnings) lines.push(`  ${c.yellow('!')} ${w}`)
    lines.push('', '')
    process.stderr.write(lines.join('\n'))
  }
}

main().catch((e) => die(e?.stack ?? String(e)))
