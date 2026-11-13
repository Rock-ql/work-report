import { monthStr, performanceSchema, performanceSourceSchema, type DailyReport, type PerformanceKey, type PerformanceReport, type PerformanceSource } from './schema'

export const PERFORMANCE_ITEMS = [
  { key: 'delivery', title: '项目交付及时率（25%）' },
  { key: 'quality', title: '代码交付质量合格率（20%）' },
  { key: 'closure', title: '线上问题修复闭环率（20%）' },
  { key: 'performance', title: '产品性能达标率（15%）' },
  { key: 'patents', title: '专利类（加分）' },
  { key: 'sharing', title: '技术经验分享（加分）' },
  { key: 'process', title: '项目流程规范类（减分）' },
] as const satisfies readonly { key: PerformanceKey; title: string }[]

export const PERFORMANCE_RULE_WARNING = '本初稿由本地关键词和状态规则抽取，不是 AI 语义生成；请核对原文，人工确认归类与考核结论。'

export function dailyPerformanceSource(month: string, reports: DailyReport[]): PerformanceSource {
  monthStr.parse(month)
  const selected = reports.filter((r) => r.type === 'daily' && r.date.startsWith(`${month}-`) && r.sections.todayCompleted.trim())
    .sort((a, b) => a.date.localeCompare(b.date))
  return performanceSourceSchema.parse({
    type: 'daily', label: `${month} 日报 · 今日工作完成情况`,
    text: selected.map((r) => `【来源：${r.date}】\n${r.sections.todayCompleted}`).join('\n\n'),
    dates: [...new Set(selected.map((r) => r.date))],
  })
}

const EMPTY: Record<PerformanceKey, string> = {
  delivery: '来源未提供可确认的完成交付证据。',
  quality: '来源未提供可确认的质量验证证据。',
  closure: '来源未提供可确认的线上问题闭环证据。',
  performance: '来源未提供可确认的性能测量或优化证据；不能判定性能达标。',
  patents: '来源未提供可确认的专利产出证据；不等同于本月无产出。',
  sharing: '来源未提供可确认的技术经验分享证据。',
  process: '来源未提供可确认的流程违规证据；不能据此判定无违规或扣分。',
}
const LIMITS: Partial<Record<PerformanceKey, string>> = {
  delivery: '未计算及时率：缺少约定交付日期与实际交付日期的完整台账，不能判定是否达到 ≥95%。',
  quality: '未计算质量合格率、缺陷数：缺少完整验收与缺陷台账。',
  closure: '未计算闭环率：缺少线上问题总量及逐项验证记录，不能判定是否达到 ≥95%。',
  performance: '关键词证据不代表性能达标；需补充指标、基线、实测值和验收标准。',
}

/** 保守规则：未完成/计划优先于 ✅ 与“完成”；引用原句，不扩写成果，不推导比例。 */
export function generatePerformance(month: string, rawSource: PerformanceSource, now = new Date().toISOString()): PerformanceReport {
  monthStr.parse(month)
  const source = performanceSourceSchema.parse(rawSource)
  const buckets: Record<PerformanceKey, string[]> = { delivery: [], quality: [], closure: [], performance: [], patents: [], sharing: [], process: [] }
  const seen = new Set<string>()
  let duplicate = 0
  let excluded = 0
  let evidence = 0
  let planSection = false
  let planHeadingLevel = 0
  const incomplete = /⏳|\[ \]|未完成|未上线|未修复|未解决|未闭环|未通过|未达标|未达成|未产出|无产出|无专利|没有专利|尚未|没有完成|没有上线|无法完成|不能完成|待(?:完成|开始|开发|测试|上线|确认|处理|验证)|开发中|进行中|联调中|测试中|自测中|处理中|规划中|(?<!按)计划|拟|将要|准备|开始开发|跟进|推进|继续/
  for (const raw of source.text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) continue
    if (/^【来源：/.test(line)) { planSection = false; planHeadingLevel = 0; continue }
    const heading = /^(#{1,6})\s/.exec(line)
    if (heading) {
      const level = heading[1].length
      if (planHeadingLevel && level <= planHeadingLevel) { planSection = false; planHeadingLevel = 0 }
      if (/明日|明天|下周|下月|计划|待完成/.test(line)) { planSection = true; planHeadingLevel = level }
      continue
    }
    if (/^(?:【)?(?:明日|明天|下周|下月|接下来|待完成)/.test(line)) { planSection = true; planHeadingLevel = 1; continue }
    if (planSection || /^\||^[-=*]{3,}$/.test(line)) continue
    const normalized = line.replace(/^\s*(?:[-*+]\s*|\d+[.)、]\s*)/, '').replace(/✅|☑️?|\[[xX]\]/g, '').replace(/\s+/g, '').replace(/[，,。；;！!：:]/g, '')
    if (!normalized) continue
    if (seen.has(normalized)) { duplicate++; continue }
    seen.add(normalized)
    if (incomplete.test(line)) { excluded++; continue }
    const finished = /✅|☑|\[[xX]\]|已完成|已上线|完成|上线|已发布|已修复|已解决|已闭环|已验收|通过|测完|开发完毕/.test(line)
    if (!finished) { excluded++; continue }
    evidence++
    // 摘录只剥去列表标记，保留原文状态；完整来源上下文保存在 source.text。
    const excerpt = line.replace(/^\s*(?:[-*+]\s*|\d+[.)、]\s*)/, '').replace(/^(?:✅|☑️?|\[[xX]\])\s*/, '')
    if (/上线|发版|发布|部署|交付|功能|需求|接口|修复|迁移|导入|改造|开发/.test(line)
      && !/评审|讨论|会议|宣讲|分享|专利|著作权|方案|规划/.test(line)) buckets.delivery.push(excerpt)
    if (/测试|验收|校验|验证|修复|bug|缺陷|质量/i.test(line)) buckets.quality.push(excerpt)
    if (/线上|生产|prod/i.test(line) && /修复|解决|闭环|验证|恢复/.test(line)) buckets.closure.push(excerpt)
    if (/性能|响应时间|响应耗时|接口响应|轻量分页|延迟|吞吐|QPS|TPS|压测|慢查询|内存|CPU/i.test(line)) buckets.performance.push(excerpt)
    if (/专利|软件著作权|软著/.test(line) && /申请|提交|受理|授权|产出|登记/.test(line)) buckets.patents.push(excerpt)
    if (/分享|宣讲|培训|知识库|技术文档|经验总结/.test(line)) buckets.sharing.push(excerpt)
    if (/违规|违反|漏评审|未遵守|流程问题|评审|提测材料|提测|审计|规范|开发文档|测试用例/.test(line)) buckets.process.push(excerpt)
  }
  const warnings = [PERFORMANCE_RULE_WARNING, '仅使用所选来源中的已完成证据；原文完整保留在 source.text。未计算评分、按时率、缺陷数、闭环率或性能达标率。']
  const sections = Object.fromEntries(PERFORMANCE_ITEMS.map(({ key, title }) => {
    if (buckets[key].length > 4) warnings.push(`${title}匹配 ${buckets[key].length} 条，简要初稿按来源顺序摘录前 4 条；其余证据仍保留在 source.text，未做语义重要性排序。`)
    // 正文面向提交对象；来源不足和审核口径只进入内部 warnings。
    if (!buckets[key].length) warnings.push(`${title}：${EMPTY[key]}`)
    if (LIMITS[key]) warnings.push(`${title}：${LIMITS[key]}`)
    if (key === 'process') warnings.push('流程记录不代表无违规，是否扣分需人工核实。')
    const paragraph = buckets[key].length
      ? `${Number(month.slice(5))} 月，${buckets[key].slice(0, 4).map(s => s.replace(/[。；;]+$/, '')).join('；')}。`
      : key === 'patents' ? '本月不申报专利及软件著作权加分。'
      : key === 'sharing' ? '本月不申报技术经验分享加分。' : ''
    return [key, paragraph]
  })) as PerformanceReport['sections']
  if (source.type === 'offline') warnings.push('离线文本的月份由用户选择，未自动核实其日期归属；标题、表格和计划段不作为成果。')
  if (duplicate) warnings.push(`按去除序号、标记、空白和标点后的原文去重 ${duplicate} 条；原始重复证据仍保留在来源中。`)
  if (excluded) warnings.push(`排除 ${excluded} 条未完成、计划或完成状态不明确的条目；✅ 不覆盖文字中的未完成状态。`)
  if (!evidence) warnings.push('来源非空，但未找到规则可确认的完成证据，请人工补充或核对。')
  return performanceSchema.parse({ schemaVersion: 1, month, title: `${month} 月度绩效`, sections, source, warnings, createdAt: now, updatedAt: now })
}

/** 提交用纯文本只包含标题和七项正文；完整来源、警告留在报告对象供审核。 */
export function performanceText(report: PerformanceReport): string {
  return [report.title, ...PERFORMANCE_ITEMS.map(({ key, title }) => `${title}\n${report.sections[key]}`)].join('\n\n') + '\n'
}
