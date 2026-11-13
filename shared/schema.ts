import { z } from 'zod'

/**
 * 数据契约唯一事实来源。
 * 消费方：Vite 中间件校验 / 前端表单 / scripts/report.mjs（经 gen-schema.mjs 导出的 JSON Schema）。
 * 修改此文件后必须执行 `pnpm schema:gen` 重新生成 schemas/*.schema.json。
 */

export const SCHEMA_VERSION = 1

// ---------------------------------------------------------------- 基础片段

/** ISO 日期：2026-08-20 */
export const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, '日期必须为 YYYY-MM-DD')

/** ISO 周：2026-W34 */
export const weekStr = z
  .string()
  .regex(/^\d{4}-W\d{2}$/, '周必须为 YYYY-Www，如 2026-W34')

/** 带时区偏移的 ISO 时间戳 */
export const isoDateTime = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/,
    '时间必须为带时区的 ISO 8601，如 2026-08-20T19:30:00+08:00',
  )

export const hexColor = z
  .string()
  .regex(/^#[0-9a-fA-F]{6}$/, '颜色必须为 #RRGGBB')

/** 报告正文允许的状态枚举，AI 生成条目时只能使用这些词 */
export const ITEM_STATUS = [
  '已完成',
  '开发中',
  '进行中',
  '联调中',
  '待测试',
  '待上线',
  '已上线',
] as const

// ---------------------------------------------------------------- 工作区

export const workspaceSchema = z.object({
  id: z.string().min(1).describe('工作区唯一 ID，新增时由前端生成，AI 不得修改'),
  name: z.string().min(1).max(40).describe('工作区展示名'),
  moduleTag: z
    .string()
    .min(1)
    .max(20)
    .describe('报告正文中【xxx】使用的模块标签，AI 只能从这里取值'),
  path: z.string().min(1).describe('git 仓库在本机的绝对路径'),
  authors: z
    .array(z.string())
    .default([])
    .describe('git 作者邮箱/姓名过滤，空数组表示回退到 settings.defaultAuthors'),
  branches: z
    .array(z.string())
    .default([])
    .describe('限定统计的分支，空数组表示所有分支'),
  enabled: z.boolean().default(true).describe('关闭后不参与提交提取'),
  color: hexColor.default('#6366f1'),
  note: z.string().max(200).default(''),
  order: z.number().int().default(0).describe('展示与报告中模块出现顺序'),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type Workspace = z.infer<typeof workspaceSchema>

export const workspacesFileSchema = z.object({
  version: z.literal(1),
  workspaces: z.array(workspaceSchema).default([]),
})
export type WorkspacesFile = z.infer<typeof workspacesFileSchema>

// ---------------------------------------------------------------- 设置

export const settingsSchema = z.object({
  version: z.literal(1),
  userName: z.string().default('').describe('用于报告标题的姓名'),
  dailyTitle: z.string().default('小鹰-工作日报'),
  weeklyTitle: z.string().default('小鹰-工作周报'),
  defaultAuthors: z
    .array(z.string())
    .default([])
    .describe('全局 git 作者过滤，工作区未单独指定时使用'),
  timezone: z.string().default('Asia/Shanghai'),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]).default(1).describe('0=周日 1=周一'),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  editorMode: z.enum(['edit', 'split', 'preview']).default('split'),
  updatedAt: isoDateTime.optional(),
})
export type Settings = z.infer<typeof settingsSchema>

// ---------------------------------------------------------------- 提交来源

export const commitSchema = z.object({
  workspaceId: z.string(),
  moduleTag: z.string(),
  repo: z.string().describe('工作区展示名'),
  hash: z.string().describe('短 hash'),
  subject: z.string(),
  authoredAt: z.string(),
  author: z.string().default(''),
  branch: z.string().default(''),
  files: z.number().int().nonnegative().default(0),
  insertions: z.number().int().nonnegative().default(0),
  deletions: z.number().int().nonnegative().default(0),
})
export type Commit = z.infer<typeof commitSchema>

export const sourceSchema = z.object({
  workspaceIds: z.array(z.string()).default([]),
  range: z
    .object({ since: z.string(), until: z.string() })
    .default({ since: '', until: '' }),
  commits: z.array(commitSchema).default([]),
  generatedBy: z.enum(['ai', 'manual']).default('manual'),
  generatedAt: isoDateTime.optional(),
})
export type ReportSource = z.infer<typeof sourceSchema>

// ---------------------------------------------------------------- 日报

/**
 * 字段归属：
 *   【AI】  todayCompleted、tomorrowPlan.dev  —— 可由 AI 从 git 推导并覆盖
 *   【人工】tomorrowPlan.product、tomorrowPlan.backlog、needHelp —— AI 永不覆盖
 */
export const dailySectionsSchema = z.object({
  todayCompleted: z.string().default('').describe('【AI】今日工作完成情况'),
  tomorrowPlan: z
    .object({
      product: z.string().default('').describe('【人工】接下来一天的产品规划工作'),
      dev: z.string().default('').describe('【AI】接下来一天的开发工作'),
      backlog: z.string().default('').describe('【人工】待完成的所有工作'),
    })
    .default({ product: '', dev: '', backlog: '' }),
  needHelp: z.string().default('').describe('【人工】需要协助的事项'),
})
export type DailySections = z.infer<typeof dailySectionsSchema>

export const dailyReportSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal('daily'),
  date: dateStr,
  title: z.string().default(''),
  status: z.enum(['draft', 'final']).default('draft'),
  sections: dailySectionsSchema,
  source: sourceSchema.default({
    workspaceIds: [],
    range: { since: '', until: '' },
    commits: [],
    generatedBy: 'manual',
  }),
  tags: z.array(z.string()).default([]),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type DailyReport = z.infer<typeof dailyReportSchema>

// ---------------------------------------------------------------- 周报

/**
 * 字段归属：
 *   【AI】  weekCompleted
 *   【人工】nextWeekPlan、needHelp
 */
export const weeklySectionsSchema = z.object({
  weekCompleted: z.string().default('').describe('【AI】本周工作完成情况'),
  nextWeekPlan: z.string().default('').describe('【人工】下周工作计划'),
  needHelp: z.string().default('').describe('【人工】需要协助的事项'),
})
export type WeeklySections = z.infer<typeof weeklySectionsSchema>

export const weeklyReportSchema = z.object({
  schemaVersion: z.literal(1),
  type: z.literal('weekly'),
  week: weekStr,
  weekStart: dateStr,
  weekEnd: dateStr,
  title: z.string().default(''),
  status: z.enum(['draft', 'final']).default('draft'),
  sections: weeklySectionsSchema,
  source: sourceSchema.default({
    workspaceIds: [],
    range: { since: '', until: '' },
    commits: [],
    generatedBy: 'manual',
  }),
  tags: z.array(z.string()).default([]),
  createdAt: isoDateTime,
  updatedAt: isoDateTime,
})
export type WeeklyReport = z.infer<typeof weeklyReportSchema>

export const reportSchema = z.discriminatedUnion('type', [
  dailyReportSchema,
  weeklyReportSchema,
])
export type Report = z.infer<typeof reportSchema>
export type ReportType = Report['type']

// ---------------------------------------------------------------- 月度绩效（独立于 Report 联合）

export const monthStr = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, '月份必须为 YYYY-MM')
const performanceDateStr = z.string().date('来源日期必须为有效 YYYY-MM-DD')
const nonBlank = z.string().regex(/\S/, '不能为空或纯空白')

export const performanceSectionsSchema = z.object({
  delivery: z.string(),
  quality: z.string(),
  closure: z.string(),
  performance: z.string(),
  patents: z.string(),
  sharing: z.string(),
  process: z.string(),
}).strict()
export type PerformanceSections = z.infer<typeof performanceSectionsSchema>
export type PerformanceKey = keyof PerformanceSections

export const performanceSourceSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('daily'), label: nonBlank, text: nonBlank,
    dates: z.array(performanceDateStr).min(1) }).strict(),
  z.object({ type: z.literal('offline'), label: nonBlank, text: nonBlank,
    dates: z.array(performanceDateStr).max(0) }).strict(),
])
export type PerformanceSource = z.infer<typeof performanceSourceSchema>

export const performanceSchema = z.object({
  schemaVersion: z.literal(1),
  month: monthStr,
  title: nonBlank,
  sections: performanceSectionsSchema,
  source: performanceSourceSchema,
  warnings: z.array(z.string()),
  createdAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
}).strict().superRefine((report, ctx) => {
  if (report.source.dates.some((date) => !date.startsWith(`${report.month}-`))) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source', 'dates'], message: '来源日期必须属于报告月份' })
  }
  if (new Set(report.source.dates).size !== report.source.dates.length) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['source', 'dates'], message: '来源日期不能重复' })
  }
})
export type PerformanceReport = z.infer<typeof performanceSchema>

/** 首次创建须提供完整 source；替换时缺省字段沿用原值。 */
export const performancePatchSchema = z.object({
  sections: performanceSectionsSchema.partial().optional(),
  source: performanceSourceSchema.optional(),
  warnings: z.array(z.string()).optional(),
}).strict()
export type PerformancePatch = z.infer<typeof performancePatchSchema>

export const performanceGenerateSchema = z.discriminatedUnion('sourceType', [
  z.object({ sourceType: z.literal('daily') }).strict(),
  z.object({ sourceType: z.literal('offline'), text: nonBlank, filename: nonBlank.optional() }).strict(),
])
export const performanceSaveSchema = z.object({
  report: performanceSchema,
  baseUpdatedAt: z.string().datetime({ offset: true }).optional(),
}).strict()

// ---------------------------------------------------------------- AI 补丁

/** AI 只能提交这些字段；其余字段由 report.mjs 从磁盘现有文件继承 */
export const dailyPatchSchema = z
  .object({
    todayCompleted: z.string().optional(),
    tomorrowPlanDev: z.string().optional(),
    tags: z.array(z.string()).optional(),
    commits: z.array(commitSchema).optional(),
    workspaceIds: z.array(z.string()).optional(),
    range: z.object({ since: z.string(), until: z.string() }).optional(),
  })
  .strict()
export type DailyPatch = z.infer<typeof dailyPatchSchema>

export const weeklyPatchSchema = z
  .object({
    weekCompleted: z.string().optional(),
    tags: z.array(z.string()).optional(),
    commits: z.array(commitSchema).optional(),
    workspaceIds: z.array(z.string()).optional(),
    range: z.object({ since: z.string(), until: z.string() }).optional(),
  })
  .strict()
export type WeeklyPatch = z.infer<typeof weeklyPatchSchema>

// ---------------------------------------------------------------- 元信息

/** 列表页用的轻量投影，由中间件扫描目录后生成 */
export interface ReportMeta {
  type: ReportType
  id: string
  date: string
  weekStart?: string
  weekEnd?: string
  title: string
  status: 'draft' | 'final'
  tags: string[]
  commitCount: number
  generatedBy: 'ai' | 'manual'
  excerpt: string
  filled: number
  totalSections: number
  createdAt: string
  updatedAt: string
  /** 文件存在但不符合 schema 时为 true，列表展示"数据异常"而非白屏 */
  invalid?: boolean
  error?: string
}

/** 报告在文件系统中的 id：日报为日期，周报为周编号 */
export function reportId(report: Report): string {
  return report.type === 'daily' ? report.date : report.week
}

export const ID_PATTERN: Record<ReportType, RegExp> = {
  daily: /^\d{4}-\d{2}-\d{2}$/,
  weekly: /^\d{4}-W\d{2}$/,
}

/** 各类型报告的区块定义，前端渲染与钉钉导出共用 */
export interface SectionDef {
  key: string
  label: string
  owner: 'ai' | 'manual'
  required: boolean
  placeholder: string
  /** 钉钉纯文本导出时的分组小标题，null 表示直接作为顶层字段 */
  dingHeading: string | null
}

export const DAILY_SECTIONS: SectionDef[] = [
  {
    key: 'todayCompleted',
    label: '今日工作完成情况',
    owner: 'ai',
    required: true,
    placeholder: '1. 【模块】做了什么（状态）',
    dingHeading: null,
  },
  {
    key: 'tomorrowPlan.product',
    label: '接下来一天的产品规划工作',
    owner: 'manual',
    required: false,
    placeholder: '产品侧的规划、评审、方案输出……',
    dingHeading: '【接下来一天的产品规划工作】',
  },
  {
    key: 'tomorrowPlan.dev',
    label: '接下来一天的开发工作',
    owner: 'ai',
    required: false,
    placeholder: '1. 【模块】要做什么（状态）',
    dingHeading: '【接下来一天的开发工作】',
  },
  {
    key: 'tomorrowPlan.backlog',
    label: '待完成的所有工作',
    owner: 'manual',
    required: false,
    placeholder: '1. 需求 / 优化 / 跟进事项',
    dingHeading: '【待完成的所有工作】',
  },
  {
    key: 'needHelp',
    label: '需要协助的事项',
    owner: 'manual',
    required: false,
    placeholder: '需要谁配合、卡在哪里……',
    dingHeading: null,
  },
]

export const WEEKLY_SECTIONS: SectionDef[] = [
  {
    key: 'weekCompleted',
    label: '本周工作完成情况',
    owner: 'ai',
    required: true,
    placeholder: '1. 【模块】本周做了什么（状态）',
    dingHeading: null,
  },
  {
    key: 'nextWeekPlan',
    label: '下周工作计划',
    owner: 'manual',
    required: false,
    placeholder: '1. 下周要推进的事项',
    dingHeading: null,
  },
  {
    key: 'needHelp',
    label: '需要协助的事项',
    owner: 'manual',
    required: false,
    placeholder: '需要谁配合、卡在哪里……',
    dingHeading: null,
  },
]

export function sectionsOf(type: ReportType): SectionDef[] {
  return type === 'daily' ? DAILY_SECTIONS : WEEKLY_SECTIONS
}

/** AI 可写字段白名单，report.mjs 与中间件共用 */
export const AI_OWNED_PATHS: Record<ReportType, string[]> = {
  daily: ['sections.todayCompleted', 'sections.tomorrowPlan.dev'],
  weekly: ['sections.weekCompleted'],
}
