import type { ReportType } from '@shared/schema'
import { weekRange } from '@shared/date'

/**
 * 页面上一键复制的提示词。
 * 措辞与 docs/AI_SPEC.md 保持一致：只描述目标，具体步骤由 skill 约束，
 * 避免这里和规范文件出现两套说法。
 */

export function generatePrompt(type: ReportType, id: string): string {
  if (type === 'daily') {
    return `请按 docs/AI_SPEC.md 的规范，生成 ${id} 的工作日报。\n严格走四步流程（collect-git → 归纳 → report.mjs write → report.mjs validate），只写 AI 字段，不要碰人工字段。`
  }
  const { start, end } = weekRange(id)
  return `请按 docs/AI_SPEC.md 的规范，生成 ${id}（${start} ~ ${end}）的工作周报。\n严格走四步流程（collect-git → 归纳 → report.mjs write → report.mjs validate），只写 AI 字段，不要碰人工字段。`
}

export function regeneratePrompt(type: ReportType, id: string, sectionKey: string): string {
  const field = FIELD_NAME[sectionKey] ?? sectionKey
  return `请按 docs/AI_SPEC.md 的规范，重新生成 ${id} ${type === 'daily' ? '日报' : '周报'}的「${field}」这一段。\n只更新该字段，其余字段保持原样，完成后执行 node scripts/report.mjs validate。`
}

const FIELD_NAME: Record<string, string> = {
  todayCompleted: '今日工作完成情况',
  'tomorrowPlan.dev': '接下来一天的开发工作',
  weekCompleted: '本周工作完成情况',
}

/** AI 使用说明页展示的成套提示词 */
export interface PromptCard {
  id: string
  title: string
  description: string
  body: string
}

export function promptLibrary(today: string, thisWeek: string): PromptCard[] {
  const { start, end } = weekRange(thisWeek)
  return [
    {
      id: 'daily',
      title: '生成今天的日报',
      description: '抓取今天各工作区的提交，归纳成「今日工作完成情况」和「明日开发工作」。',
      body: `请按 docs/AI_SPEC.md 的规范，生成 ${today} 的工作日报。\n严格走四步流程（collect-git → 归纳 → report.mjs write → report.mjs validate），只写 AI 字段，不要碰人工字段。`,
    },
    {
      id: 'weekly',
      title: '生成本周的周报',
      description: `汇总 ${start} ~ ${end} 的提交，按模块聚合成「本周工作完成情况」。`,
      body: `请按 docs/AI_SPEC.md 的规范，生成 ${thisWeek}（${start} ~ ${end}）的工作周报。\n严格走四步流程，只写 weekCompleted，不要碰 nextWeekPlan 和 needHelp。`,
    },
    {
      id: 'backfill',
      title: '补齐最近一周的日报',
      description: '批量补做过去几天漏掉的日报，已存在的人工字段会原样保留。',
      body: `请按 docs/AI_SPEC.md 的规范，逐天补齐最近 7 天（含今天）的工作日报。\n每天单独走一遍四步流程；某天没有提交就写"当日无代码提交"，不要编造内容。全部完成后执行一次 node scripts/report.mjs validate。`,
    },
    {
      id: 'dev-only',
      title: '只补明日开发计划',
      description: '日报正文已写好，只想让 AI 依据未完成的工作补出明日开发计划。',
      body: `请按 docs/AI_SPEC.md 的规范，只重新生成 ${today} 日报的「接下来一天的开发工作」字段。\n参考当天提交里状态为"开发中/进行中/联调中"的条目，其余字段保持原样。`,
    },
    {
      id: 'validate',
      title: '校验全部数据',
      description: '手改过 JSON 后跑一遍，确认所有文件都符合 schema、网页不会报错。',
      body: `请执行 node scripts/report.mjs validate，把校验结果告诉我。\n如果有文件不合规，按 docs/AI_SPEC.md 的数据契约修复它们，然后重新校验直到全部通过。`,
    },
  ]
}
