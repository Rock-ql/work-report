#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { zodToJsonSchema } from 'zod-to-json-schema'
import { SCHEMA_DIR, c, loadShared } from './_shared.mjs'

/**
 * 从 shared/schema.ts（zod）导出 JSON Schema 到 schemas/。
 * 这些文件是给 AI 读的：它不需要看懂 TypeScript，
 * 只要按 JSON Schema 里的 description 和约束写文件就行。
 *
 * 改过 shared/schema.ts 后执行：pnpm schema:gen
 */

const TARGETS = [
  ['performance', 'performanceSchema', '独立月度绩效 data/performance/YYYY-MM.json'],
  ['performance-patch', 'performancePatchSchema', '绩效 CLI 白名单补丁；已有报告需 --replace'],
  ['performance-generate', 'performanceGenerateSchema', '绩效生成请求，规则抽取且不保存'],
  ['performance-save', 'performanceSaveSchema', '绩效保存请求，已有文档必须带 baseUpdatedAt'],
  ['daily-report', 'dailyReportSchema', '日报文件 data/reports/daily/YYYY-MM-DD.json 的结构'],
  ['weekly-report', 'weeklyReportSchema', '周报文件 data/reports/weekly/YYYY-Www.json 的结构'],
  ['workspaces', 'workspacesFileSchema', 'data/workspaces.json 的结构'],
  ['settings', 'settingsSchema', 'data/settings.json 的结构'],
  ['daily-patch', 'dailyPatchSchema', 'report.mjs write 接受的日报补丁（AI 只能写这些字段）'],
  ['weekly-patch', 'weeklyPatchSchema', 'report.mjs write 接受的周报补丁（AI 只能写这些字段）'],
]

const shared = await loadShared()
fs.mkdirSync(SCHEMA_DIR, { recursive: true })

for (const [file, exportName, title] of TARGETS) {
  const schema = shared[exportName]
  if (!schema) {
    console.error(`${c.red('x')} shared/schema.ts 里找不到导出 ${exportName}`)
    process.exit(1)
  }
  const json = zodToJsonSchema(schema, {
    name: exportName,
    $refStrategy: 'none',
    target: 'jsonSchema7',
  })
  json.title = title
  const out = path.join(SCHEMA_DIR, `${file}.schema.json`)
  fs.writeFileSync(out, JSON.stringify(json, null, 2) + '\n', 'utf-8')
  console.log(`${c.green('+')} schemas/${file}.schema.json`)
}

// 顺带导出一份给 AI 速查的字段归属表，避免它翻两个文件
const ownership = {
  $comment: '字段归属：AI 只能写 owner=ai 的字段；owner=manual 的字段由 report.mjs 从磁盘继承，AI 写不进去。',
  statusEnum: shared.ITEM_STATUS,
  daily: shared.DAILY_SECTIONS.map((s) => ({
    field: `sections.${s.key}`,
    label: s.label,
    owner: s.owner,
    patchKey: s.key === 'todayCompleted' ? 'todayCompleted' : s.key === 'tomorrowPlan.dev' ? 'tomorrowPlanDev' : null,
  })),
  weekly: shared.WEEKLY_SECTIONS.map((s) => ({
    field: `sections.${s.key}`,
    label: s.label,
    owner: s.owner,
    patchKey: s.key === 'weekCompleted' ? 'weekCompleted' : null,
  })),
}
fs.writeFileSync(
  path.join(SCHEMA_DIR, 'field-ownership.json'),
  JSON.stringify(ownership, null, 2) + '\n',
  'utf-8',
)
console.log(`${c.green('+')} schemas/field-ownership.json`)
console.log('')
