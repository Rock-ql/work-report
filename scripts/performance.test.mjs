import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import http from 'node:http'
import { pathToFileURL } from 'node:url'
import { spawnSync } from 'node:child_process'
import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { build } from 'esbuild'
import { createPerformanceService } from '../server/performance.mjs'
import { listSnapshots } from '../server/data-fs.mjs'

// 每一次运行均新建 WR_DATA_DIR，不读取或改动真实 data/ 或用户正在使用的 .sandbox/data。
const root = path.resolve(import.meta.dirname, '..')
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'wr-performance-'))
process.env.WR_DATA_DIR = sandbox
const { loadShared } = await import('./_shared.mjs')
const s = await loadShared()
const month = '2026-08'
const source = (text = '1. 【商城】完成需求上线（已上线）') => ({ type: 'offline', label: '工作清单.md', text, dates: [] })
const draft = () => s.generatePerformance(month, source())
const serviceAt = (t) => {
  const dir = fs.mkdtempSync(path.join(sandbox, 'case-'))
  return { dir, service: createPerformanceService(dir, s) }
}
const cli = (dir, ...args) => spawnSync(process.execPath, ['scripts/report.mjs', ...args], { cwd: root, encoding: 'utf8', env: { ...process.env, ELECTRON_RUN_AS_NODE: '1', WR_DATA_DIR: dir } })
const patchFile = (dir, value, name = 'patch.json') => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(value)); return p }
const daily = (dir, date, text, tomorrow = '') => {
  const patch = patchFile(dir, { todayCompleted: text, tomorrowPlanDev: tomorrow }, `${date}-patch.json`)
  const result = cli(dir, 'write', '--type', 'daily', '--date', date, '--patch', patch)
  assert.equal(result.status, 0, result.stderr)
}

test('固定七项标题、独立 Report 联合、纯文本导出', () => {
  assert.deepEqual(s.PERFORMANCE_ITEMS.map((x) => x.title), ['项目交付及时率（25%）', '代码交付质量合格率（20%）', '线上问题修复闭环率（20%）', '产品性能达标率（15%）', '专利类（加分）', '技术经验分享（加分）', '项目流程规范类（减分）'])
  assert.equal(s.PERFORMANCE_ITEMS.length, 7)
  assert.equal(s.reportSchema.safeParse(draft()).success, false)
  const text = s.performanceText(draft())
  for (const item of s.PERFORMANCE_ITEMS) assert.ok(text.includes(item.title))
  assert.ok(!text.includes('原文证据：'))
  assert.ok(!text.includes('警告：'))
  assert.ok(draft().warnings.some((w) => w.includes('不是 AI 语义生成')))
})

test('严格 schema：key/source/月份/日期/时间/嵌套额外字段拒绝', () => {
  const mutations = [
    (r) => { r.type = 'performance' },
    (r) => { r.sections.extra = '' },
    (r) => { delete r.sections.delivery },
    (r) => { r.sections.quality = 20 },
    (r) => { r.source.extra = 'oops' },
    (r) => { r.source.type = 'ai' },
    (r) => { r.source.text = ' \n ' },
    (r) => { r.source.label = '' },
    (r) => { r.source.dates = ['2026-08-01'] },
    (r) => { r.source = { ...r.source, type: 'daily', dates: [] } },
    (r) => { r.source = { ...r.source, type: 'daily', dates: ['2026-02-30'] } },
    (r) => { r.source = { ...r.source, type: 'daily', dates: ['2026-07-01'] } },
    (r) => { r.source = { ...r.source, type: 'daily', dates: ['2026-08-01', '2026-08-01'] } },
    (r) => { r.month = '../../etc' },
    (r) => { r.month = '2026-13' },
    (r) => { r.updatedAt = 'today' },
  ]
  for (const mutate of mutations) { const r = draft(); mutate(r); assert.equal(s.performanceSchema.safeParse(r).success, false, mutate.toString()) }
  for (const bad of [{ title: 'bad' }, { sections: { bad: '' } }, { source: { ...source(), generatedBy: 'ai' } }]) {
    assert.equal(s.performancePatchSchema.safeParse(bad).success, false)
  }
})

test('规则抽取去重、原文保全，未完成状态优先于✅，不虚构量化结果', () => {
  const raw = ['1. 【商城】完成需求上线（已上线）', '2. 【商城】完成需求上线（已上线）',
    '- ✅ 完成售后改造（开发中）', '- ✅ 测试完成（待上线）', '- ✅ 专利申请尚未完成',
    '- ✅ 按计划完成订单模块上线', '- ✅ 计划完成下一版改造',
    '已完成线上问题修复并验证', '已完成响应时间压测', '已完成技术经验分享', '已完成专利申请提交',
    '## 明日工作计划', '- ✅ 完成未来任务上线'].join('\n')
  const r = s.generatePerformance(month, source(raw))
  assert.equal(r.source.text, raw)
  assert.equal((r.sections.delivery.match(/【商城】完成需求上线/g) ?? []).length, 1)
  for (const word of ['售后改造', '测试完成', '尚未完成', '未来任务', '下一版改造']) assert.ok(!r.sections.delivery.includes(word))
  // “按计划完成”是完成证据，不能因为含“计划”就被当成未完成
  assert.ok(r.sections.delivery.includes('按计划完成订单模块上线'))
  assert.ok(r.sections.closure.includes('已完成线上问题修复并验证'))
  assert.ok(r.sections.performance.includes('已完成响应时间压测'))
  assert.ok(r.sections.sharing.includes('已完成技术经验分享'))
  assert.ok(r.sections.patents.includes('已完成专利申请提交'))
  assert.ok(r.warnings.some((w) => w.includes('去重 1')))
  assert.ok(r.warnings.some(w => w.includes('未计算及时率')))
  assert.ok(!/规则摘录|未计算|缺少|待核实|不能判定|人工核实/.test(s.performanceText(r)))
  assert.ok(!/100%|缺陷数[：:]\s*0/.test(s.performanceText(r)))
})

test('简短一段最多四条，交付排除会议/专利，规范/软著/性能相关证据可归类', () => {
  const text = ['✅ 完成商城需求评审会议', '✅ 完成软件著作权登记申请', '✅ 优化接口响应', '✅ 重构轻量分页接口',
    '✅ 完成提测材料', ...Array.from({ length: 8 }, (_, i) => `✅ 完成模块${i}功能上线`)].join('\n')
  const r = s.generatePerformance(month, source(text))
  assert.ok(!r.sections.delivery.includes('评审会议'))
  assert.ok(!r.sections.delivery.includes('软件著作权'))
  assert.ok(r.sections.process.includes('提测材料'))
  assert.ok(r.warnings.some(w => w.includes('是否扣分需人工核实')))
  assert.ok(r.sections.patents.includes('软件著作权'))
  assert.ok(r.sections.performance.includes('优化接口响应'))
  assert.ok(r.sections.performance.includes('轻量分页'))
  assert.ok(r.warnings.some((w) => w.includes('前 4 条')))
  for (const value of Object.values(r.sections)) assert.ok(!value.includes('\n'))
  assert.equal(r.source.text, text)
})

test('计划嵌套标题不重启成果抽取，下一同级成果章节可恢复', () => {
  const text = '## 下月计划\n### 商城\n✅ 完成未来商城上线\n## 本月成果\n✅ 完成本月交付上线'
  const r = s.generatePerformance(month, source(text))
  assert.ok(!r.sections.delivery.includes('未来商城'))
  assert.ok(r.sections.delivery.includes('本月交付'))
})

test('生成的 JSON Schema 严格约束 source 与 key（跨字段月份规则由Zod运行时校验）', () => {
  const ajv = new Ajv({ strict: false })
  addFormats(ajv)
  const schema = JSON.parse(fs.readFileSync(path.join(root, 'schemas/performance.schema.json'), 'utf8'))
  const validate = ajv.compile(schema)
  assert.equal(validate(draft()), true, JSON.stringify(validate.errors))
  for (const r of [ { ...draft(), extra: true }, { ...draft(), sections: { ...draft().sections, extra: '' } },
    { ...draft(), source: { ...source(), type: 'ai' } }, { ...draft(), source: { ...source(), extra: '' } },
    { ...draft(), source: { ...source(), text: '   ' } }, { ...draft(), source: { ...source(), type: 'daily', dates: [] } },
  ]) assert.equal(validate(r), false)
})

test('空来源拒绝、仅未完成来源诚实空证据，不声称无专利产出', () => {
  assert.throws(() => s.generatePerformance(month, source(' \n ')))
  assert.throws(() => s.dailyPerformanceSource(month, []))
  const r = s.generatePerformance(month, source('任务开发中'))
  assert.equal(r.sections.delivery, '')
  assert.equal(r.sections.patents, '本月不申报专利及软件著作权加分。')
  assert.ok(r.warnings.some(w => w.includes('不等同于本月无产出')))
  assert.ok(!/未提供|待核实|不等同于/.test(s.performanceText(r)))
  assert.ok(r.warnings.some((w) => w.includes('未找到')))
})

test('日报仅取本月todayCompleted，不取明日计划；跳过损坏文件显式警告', () => {
  const { dir, service } = serviceAt()
  daily(dir, '2026-08-01', '完成八月功能（已完成）', '完成未来功能（已完成）')
  daily(dir, '2026-07-31', '完成七月功能（已完成）')
  daily(dir, '2026-08-02', '')
  // 损坏样本仅写 WR_DATA_DIR，专门验证容错，绝不触及真实数据。
  fs.writeFileSync(path.join(dir, 'reports/daily/2026-08-03.json'), '{bad')
  const r = service.generate(month, { sourceType: 'daily' })
  assert.deepEqual(r.source.dates, ['2026-08-01'])
  assert.ok(!r.source.text.includes('未来功能'))
  assert.ok(!r.source.text.includes('七月功能'))
  assert.ok(r.warnings.some((w) => w.includes('2026-08-03.json')))
  assert.equal(service.get(month), null)
  assert.throws(() => service.generate('2026-09', { sourceType: 'daily' }), /没有非空/)
})

test('共用服务保存、强制乐观锁、服务器时间、备份、锁竞争与损坏文件', () => {
  const { dir, service } = serviceAt()
  assert.deepEqual(service.list(), [])
  const initial = service.save(month, { report: draft() })
  assert.throws(() => service.save(month, { report: draft() }), (e) => e.status === 409)
  assert.throws(() => service.save(month, { report: draft(), baseUpdatedAt: '2020-01-01T00:00:00Z' }), (e) => e.status === 409)
  const next = service.save(month, { report: { ...initial, createdAt: '2000-01-01T00:00:00Z', sections: { ...initial.sections, delivery: '人工修改' } }, baseUpdatedAt: initial.updatedAt })
  assert.equal(next.createdAt, initial.createdAt)
  assert.ok(next.updatedAt > initial.updatedAt)
  assert.equal(service.list()[0].sections.delivery, '人工修改')
  const backups = listSnapshots(dir)
  assert.equal(backups.length, 1)
  assert.deepEqual(JSON.parse(fs.readFileSync(backups[0].fullPath)), initial)
  assert.throws(() => service.save('2026-09', { report: draft() }), (e) => e.status === 422)
  assert.throws(() => service.save('2026-09', { report: { ...draft(), month: '2026-09' }, baseUpdatedAt: initial.updatedAt }), (e) => e.status === 409)
  const lock = path.join(dir, `performance/${month}.json.lock`)
  fs.writeFileSync(lock, '')
  assert.throws(() => service.writePatch(month, { warnings: [] }, true), (e) => e.status === 409)
  // 进程被杀留下的旧锁不能永久阻塞保存：超过 30s 自动接管
  const old = new Date(Date.now() - 60_000)
  fs.utimesSync(lock, old, old)
  assert.ok(service.writePatch(month, { warnings: ['接管旧锁'] }, true).warnings.includes('接管旧锁'))
  assert.equal(fs.existsSync(lock), false)
  assert.throws(() => service.writePatch('2026-10', { sections: { delivery: '只有正文' } }), (e) => e.status === 422 && /source/.test(e.message))
  fs.writeFileSync(path.join(dir, 'performance/2026-09.json'), '{}')
  assert.throws(() => service.get('2026-09'), (e) => e.status === 500)
})

test('CLI generate只stdout补丁、write覆盖保护/白名单、show、validate包含绩效', () => {
  const { dir } = serviceAt()
  const input = path.join(dir, 'offline.md')
  fs.writeFileSync(input, source().text)
  const generated = cli(dir, 'generate', '--type', 'performance', '--month', month, '--source', input)
  assert.equal(generated.status, 0, generated.stderr)
  const patch = JSON.parse(generated.stdout)
  assert.deepEqual(Object.keys(patch), ['sections', 'source', 'warnings'])
  assert.equal(fs.existsSync(path.join(dir, 'performance')), false)
  const p = patchFile(dir, patch)
  const args = ['write', '--type', 'performance', '--month', month, '--patch', p]
  assert.equal(cli(dir, ...args).status, 0)
  const file = path.join(dir, `performance/${month}.json`)
  const before = fs.readFileSync(file, 'utf8')
  const conflict = cli(dir, ...args)
  assert.equal(conflict.status, 1)
  // 业务错误只输出一行提示，不要把 stack 喷给 AI
  assert.ok(!/\n\s+at /.test(conflict.stderr), conflict.stderr)
  assert.equal(fs.readFileSync(file, 'utf8'), before)
  patchFile(dir, { sections: { delivery: '人工内容' } })
  assert.equal(cli(dir, ...args, '--replace').status, 0)
  assert.ok(cli(dir, 'show', '--type', 'performance', '--month', month).stdout.includes('人工内容'))
  patchFile(dir, { title: '非法覆盖' })
  assert.equal(cli(dir, ...args, '--replace').status, 1)
  assert.equal(cli(dir, ...args, '--replace', 'false').status, 1)
  assert.equal(cli(dir, 'write', '--type', 'performance', '--month', '../escape', '--patch', p).status, 1)
  assert.equal(cli(dir, 'validate').status, 0)
  fs.writeFileSync(file, '{bad')
  assert.equal(cli(dir, 'validate').status, 1)
})

test('HTTP真实中间件契约：列表/404/生成不保存/PUT/409/非法请求', async () => {
  const { dir } = serviceAt()
  process.env.WR_DATA_DIR = dir
  const bundled = await build({ entryPoints: [path.join(root, 'server/data-api-plugin.ts')], bundle: true, format: 'esm', platform: 'node', packages: 'external', write: false, logLevel: 'silent' })
  // 放 node_modules 缓存以继承依赖解析；不启动 Vite 或替换用户服务器。
  const out = path.join(root, 'node_modules/.cache/work-report/performance-api-test.mjs')
  fs.writeFileSync(out, bundled.outputFiles[0].text)
  const { dataApiPlugin } = await import(pathToFileURL(out).href)
  const plugin = dataApiPlugin(root)
  let middleware
  plugin.configureServer({ middlewares: { use(fn) { middleware = fn } } })
  const server = http.createServer((req, res) => middleware(req, res, () => { res.writeHead(404); res.end() }))
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/api/performance`
  const req = async (suffix = '', method = 'GET', body) => {
    const res = await fetch(url + suffix, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
    return { status: res.status, body: await res.json() }
  }
  try {
    assert.deepEqual((await req()).body, { reports: [] })
    assert.equal((await req('/2026-08')).status, 404)
    const generated = await req('/2026-08/generate', 'POST', { sourceType: 'offline', text: source().text, filename: '../清单.md' })
    assert.equal(generated.status, 200)
    assert.equal(generated.body.source.label, '清单.md')
    assert.equal((await req('/2026-08')).status, 404)
    assert.equal((await req('/2026-08/generate', 'POST', { sourceType: 'offline', text: ' ' })).status, 422)
    assert.equal((await req('/2026-08/generate', 'POST', { sourceType: 'offline', text: '完成任务', filename: '/' })).status, 422)
    assert.equal((await req('/2026-08/generate', 'POST', { sourceType: 'daily', text: '禁止偷换来源' })).status, 422)
    assert.equal((await req('/2026-13')).status, 400)
    assert.equal((await req('/2026-08', 'DELETE')).status, 405)
    const saved = await req('/2026-08', 'PUT', { report: generated.body })
    assert.equal(saved.status, 200)
    assert.deepEqual((await req('/2026-08')).body, saved.body)
    assert.equal((await req()).body.reports.length, 1)
    assert.equal((await req('/2026-08', 'PUT', { report: saved.body })).status, 409)
    const parallel = await Promise.all([1, 2].map(() => req('/2026-08', 'PUT', { report: saved.body, baseUpdatedAt: saved.body.updatedAt })))
    assert.deepEqual(parallel.map((r) => r.status).sort(), [200, 409])
    assert.equal((await req('/2026-09', 'PUT', { report: saved.body })).status, 422)
    const badJson = await fetch(url + '/2026-08/generate', { method: 'POST', body: '{' })
    assert.equal(badJson.status, 400)
  } finally {
    await new Promise((resolve) => server.close(resolve))
    plugin.closeBundle()
    fs.unlinkSync(out)
  }
})

test.after(() => { fs.rmSync(sandbox, { recursive: true, force: true }) })
