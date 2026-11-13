// 手工浏览器回归：使用本机已有 Playwright，不引入生产依赖。
// PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/performance-browser-check.mjs
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

// 从项目根目录运行，防止 cwd 不同时误用另一份数据目录。
const root = fileURLToPath(new URL('..', import.meta.url))
assert.equal(fs.realpathSync(process.cwd()), fs.realpathSync(root), '请先 cd 到 work-report 项目根目录')

if (!process.env.PLAYWRIGHT_MODULE) throw new Error('请设置 PLAYWRIGHT_MODULE 为本机 Playwright 模块入口路径')
process.env.WR_DATA_DIR = path.resolve('.sandbox/data')
const { createServer } = await import('vite')
const { chromium } = await import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
const server = await createServer({ server: { host: '127.0.0.1', port: 5275, strictPort: true, open: false } })
let browser
try {
  await server.listen()
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}) })
  const context = await browser.newContext({ viewport: { width: 1440, height: 1100 }, permissions: ['clipboard-read', 'clipboard-write'] })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  const url = 'http://127.0.0.1:5275'
  const health = await (await fetch(`${url}/api/health`)).json()
  assert.equal(health.sandbox, true)
  const button = name => page.getByRole('button', { name, exact: true })
  const settings = button('生成设置')
  const saved = () => page.getByRole('status').filter({ hasText: /^已保存$/ }).waitFor()
  const dirty = () => page.getByText('未保存 · 请核对后保存', { exact: true }).waitFor()
  const editor = key => page.locator(`#perf-${key} .cm-content[contenteditable="true"]`)
  const editors = page.locator('[id^="perf-"] .cm-content[contenteditable="true"]')
  // 真实键盘操作触发 CodeMirror transaction，不直接篡改 DOM/React 内部状态。
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control'
  async function readEditor(key) {
    await editor(key).waitFor({ state: 'visible' })
    return editor(key).innerText()
  }
  async function writeEditor(key, value) {
    await editor(key).click()
    await page.keyboard.press(`${mod}+a`)
    await page.keyboard.insertText(value)
    assert.equal(await readEditor(key), value)
    await dirty()
  }
  async function expandSettings() {
    // 无报告时设置恒展开，不显示折叠按钮；等待读取完成后再判断。
    await page.getByRole('status', { name: '正在读取绩效考核' }).waitFor({ state: 'hidden' })
    if (await settings.isVisible() && await settings.getAttribute('aria-expanded') !== 'true') await settings.click()
    await page.locator('#performance-setup').waitFor({ state: 'visible' })
  }
  async function generate() {
    await expandSettings()
    const regenerate = button('重新生成初稿')
    if (await regenerate.isVisible()) {
      await regenerate.click()
      const generated = page.waitForResponse(response => response.url().endsWith('/generate') && response.request().method() === 'POST')
      await page.getByRole('alertdialog').getByRole('button', { name: '确认重新生成', exact: true }).click()
      assert.equal((await generated).status(), 200)
    } else {
      const generated = page.waitForResponse(response => response.url().endsWith('/generate') && response.request().method() === 'POST')
      await button('生成七项初稿').click()
      assert.equal((await generated).status(), 200)
    }
    await page.locator('#performance-setup').waitFor({ state: 'hidden' })
    await dirty()
    assert.equal(await settings.getAttribute('aria-expanded'), 'false', '生成成功应自动收起设置')
  }
  async function menuAction(name) {
    await button('更多操作').click()
    await page.getByRole('menuitem', { name, exact: true }).click()
  }
  async function discardDraft() {
    await menuAction('读取已保存版本')
    await page.getByRole('alertdialog').getByRole('button', { name: '放弃草稿并读取', exact: true }).click()
  }
  async function noOverflow(label) {
    const dimensions = await page.evaluate(() => ({
      viewport: innerWidth, document: document.documentElement.scrollWidth, body: document.body.scrollWidth,
    }))
    assert.ok(dimensions.document <= dimensions.viewport && dimensions.body <= dimensions.viewport,
      `${label} 出现水平溢出：${JSON.stringify(dimensions)}`)
  }
  const layoutEvidence = []
  async function desktopLayout(theme) {
    await page.evaluate(() => {
      window.scrollTo(0, 0)
      for (const element of document.querySelectorAll('*')) if (element.scrollTop) element.scrollTop = 0
    })
    const firstScreen = await page.evaluate(() => {
      const rect = element => {
        const r = element.getBoundingClientRect()
        return { x: r.x, y: r.y, width: r.width, height: r.height, bottom: r.bottom }
      }
      const intersects = element => {
        const r = element.getBoundingClientRect()
        return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth
      }
      return {
        title: rect(document.querySelector('h1')),
        firstSection: rect(document.querySelector('#perf-delivery')),
        visibleEditors: [...document.querySelectorAll('[id^="perf-"] .cm-content')].filter(intersects).length,
        labels: [...document.querySelectorAll('[id^="perf-"] .cm-content')].map(e => e.getAttribute('aria-label')),
        viewport: { width: innerWidth, height: innerHeight },
      }
    })
    assert.ok(firstScreen.title.y >= 0 && firstScreen.title.bottom <= 1100, '首屏标题应完整可见')
    assert.ok(firstScreen.firstSection.y > firstScreen.title.y && firstScreen.firstSection.y < 1100, '首屏应呈现第一项')
    assert.ok(firstScreen.visibleEditors >= 1, '首屏至少有一个可见编辑区')
    assert.equal(firstScreen.labels.length, 7)
    assert.ok(firstScreen.labels.every(label => label?.trim().endsWith('完成情况')), '每个 CodeMirror 必须有可读 aria-label')
    assert.equal(new Set(firstScreen.labels).size, 7, '七项编辑器名称应互不相同')
    await page.locator('section[id^="perf-"]').last().scrollIntoViewIfNeeded()
    const save = await button('保存考核').boundingBox()
    assert.ok(save && save.y >= 0 && save.y + save.height <= 1100, '滚动第七项后保存按钮应仍在 viewport')
    layoutEvidence.push({ theme, firstScreen, saveAtSeventhSection: save })
    await page.locator('#perf-delivery').scrollIntoViewIfNeeded()
  }
  async function innerWidths(theme, mode) {
    const widths = await page.locator('section[id^="perf-"]').evaluateAll((sections, mode) => sections.map(section => {
      const candidates = [...section.querySelectorAll('.cm-editor, .cm-scroller, .cm-content')]
      if (mode === '预览模式') candidates.push(section.lastElementChild, section.lastElementChild.firstElementChild)
      if (mode === '分栏模式') {
        const preview = section.querySelector('.grid.items-stretch')?.lastElementChild
        if (preview) candidates.push(preview, preview.firstElementChild)
      }
      return { section: section.id, nodes: candidates.filter(Boolean).map(node => ({
        kind: node.className, client: node.clientWidth, scroll: node.scrollWidth,
      })) }
    }), mode)
    assert.equal(widths.length, 7)
    for (const item of widths) {
      assert.ok(item.nodes.length > 0, `${item.section} 应有编辑/预览节点`)
      for (const node of item.nodes) assert.ok(node.scroll <= node.client,
        `${theme}820px ${mode} ${item.section} 内部水平溢出：${JSON.stringify(node)}`)
    }
    layoutEvidence.push({ theme, mode, viewportWidth: 820, widths })
  }
  // 仅接收 beforeunload；重生成和放弃草稿必须走应用 ConfirmDialog。
  page.on('dialog', async dialog => {
    if (dialog.type() === 'beforeunload') await dialog.accept()
    else { errors.push(`意外原生弹窗：${dialog.type()} ${dialog.message()}`); await dialog.dismiss() }
  })
  // 每次选一个未使用的沙箱年份，不清空或覆盖以往回归数据。
  const existing = await (await fetch(`${url}/api/performance`)).json()
  let testYear = 2088
  while (existing.reports.some(report => report.month.startsWith(`${testYear}-`))) testYear++
  assert.ok(testYear < 9999, '没有可用的沙箱测试年份')
  const month = `${testYear}-08`
  const previousMonth = `${testYear}-07`
  const emptyMonth = `${testYear}-02`
  await page.goto(`${url}/performance?month=${month}`)
  await page.getByRole('heading', { name: '月度绩效考核', exact: true }).waitFor()
  await page.getByText(`${month} 还没有绩效考核`, { exact: true }).waitFor()
  assert.ok(await page.locator('#performance-setup').isVisible(), '无报告默认展开生成设置')
  await page.getByText('线下工作清单', { exact: true }).click()
  await page.getByLabel('清单正文', { exact: true }).fill(`# ${testYear}年8月测试清单\n- ✅ 完成商城退款接口上线\n- ✅ 完成角色权限测试验证\n- ✅ 完成线上库存问题修复并回归验证通过\n- ✅ 完成接口响应优化\n- ✅ 完成技术分享\n- ⏳ 计划完成设备导出(开发中)`)
  const imported = await page.getByLabel('清单正文', { exact: true }).inputValue()
  await button('上个月').click()
  await page.getByText(`${previousMonth} 还没有绩效考核`, { exact: true }).waitFor()
  assert.equal(await page.getByLabel('考核月份', { exact: true }).inputValue(), previousMonth)
  await button('下个月').click()
  await page.getByLabel('清单正文', { exact: true }).waitFor()
  assert.equal(await page.getByLabel('考核月份', { exact: true }).inputValue(), month)
  assert.ok(await page.locator('#performance-setup').isVisible(), '未生成导入草稿恢复时保持展开')
  assert.equal(await page.getByLabel('清单正文', { exact: true }).inputValue(), imported)
  await generate()
  await button('编辑模式').click()
  assert.equal(await editors.count(), 7)
  const delivery = await readEditor('delivery')
  assert.ok(delivery.includes('商城退款'))
  assert.ok(!delivery.includes('设备导出'))
  // 验证重生成取消不丢草稿，再验证显式确认才替换。
  await writeEditor('delivery', '重生成取消保护的手工草稿')
  await expandSettings()
  await button('重新生成初稿').click()
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await readEditor('delivery'), '重生成取消保护的手工草稿')
  await generate()
  await editor('delivery').filter({ hasText: '商城退款' }).waitFor()
  assert.ok((await readEditor('delivery')).includes('商城退款'))
  const manual = '浏览器测试：手动调整完成情况，不宣称按时率。'
  await writeEditor('delivery', manual)
  // 三种全局模式切换必须保留内容；预览模式不能留下可编辑节点。
  await button('分栏模式').click()
  assert.equal(await editors.count(), 7)
  assert.equal(await readEditor('delivery'), manual)
  await noOverflow('桌面分栏')
  await button('预览模式').click()
  assert.equal(await editors.filter({ visible: true }).count(), 0)
  assert.ok((await page.locator('#perf-delivery').innerText()).includes(manual))
  await button('编辑模式').click()
  assert.equal(await readEditor('delivery'), manual)
  await button('保存考核').click()
  await saved()
  // 编辑器内的 Cmd/Ctrl+S 保存，不弹出浏览器“另存为”。
  await writeEditor('sharing', '通过键盘快捷键保存的分享内容')
  await page.keyboard.press(`${mod}+s`)
  await saved()
  await page.reload()
  await saved()
  assert.equal(await settings.getAttribute('aria-expanded'), 'false', '已保存报告默认折叠生成设置')
  await button('编辑模式').click()
  assert.equal(await readEditor('delivery'), manual)
  assert.equal(await readEditor('sharing'), '通过键盘快捷键保存的分享内容')
  await button('复制全部').click()
  const clipboard = await page.evaluate(() => navigator.clipboard.readText())
  assert.ok(clipboard.includes('项目流程规范类（减分）'))
  assert.ok(!clipboard.includes('原文证据'))
  assert.ok(clipboard.includes(manual))
  const downloadEvent = page.waitForEvent('download')
  await menuAction('下载文本')
  assert.equal((await downloadEvent).suggestedFilename(), `${month}-绩效考核.txt`)
  // 放弃确认取消保护草稿；加载失败后切月份仍可恢复。
  await writeEditor('sharing', '当前标签页保留的分享草稿')
  await menuAction('读取已保存版本')
  await page.getByRole('alertdialog').getByRole('button', { name: '取消', exact: true }).click()
  assert.equal(await readEditor('sharing'), '当前标签页保留的分享草稿')
  await page.route(`**/api/performance/${month}`, route => route.abort())
  await discardDraft()
  await page.getByRole('alert').filter({ hasText: '无法连接' }).waitFor()
  await page.unroute(`**/api/performance/${month}`)
  await page.getByLabel('考核月份', { exact: true }).fill(previousMonth)
  await page.getByText(`${previousMonth} 还没有绩效考核`, { exact: true }).waitFor()
  await page.getByLabel('考核月份', { exact: true }).fill(month)
  await dirty()
  await button('编辑模式').click()
  assert.equal(await readEditor('sharing'), '当前标签页保留的分享草稿')
  await discardDraft()
  await saved()
  // 验证其他客户端更新时不会覆盖本地编辑。
  const disk = await (await fetch(`${url}/api/performance/${month}`)).json()
  const updated = await fetch(`${url}/api/performance/${month}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ report: { ...disk, sections: { ...disk.sections, quality: '其他客户端更新' } }, baseUpdatedAt: disk.updatedAt }) })
  assert.equal(updated.status, 200)
  await writeEditor('delivery', '未保存的冲突草稿')
  await button('保存考核').click()
  await page.getByRole('alert').filter({ hasText: '未覆盖任何内容' }).waitFor()
  assert.equal(await readEditor('delivery'), '未保存的冲突草稿')
  await discardDraft()
  await saved()
  assert.equal(await readEditor('quality'), '其他客户端更新')
  // 长连续单词专门验证局部 break-words，防止 document 无溢出但编辑/预览内部被截断。
  await writeEditor('sharing', '长文本换行验证：' + 'PerformanceLongToken'.repeat(24))
  await button('保存考核').click()
  await saved()
  fs.mkdirSync('.sandbox/artifacts', { recursive: true })
  // 使用真实主题按钮（仅写沙箱设置），不是人工覆盖 CSS 类。
  for (const [theme, suffix] of [['浅色', ''], ['深色', '-dark']]) {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await button(theme).click()
    await page.waitForFunction(dark => document.documentElement.classList.contains('dark') === dark, theme === '深色')
    await button('分栏模式').click()
    await desktopLayout(theme)
    await page.screenshot({ path: `.sandbox/artifacts/performance-desktop${suffix}.png`, fullPage: true })
    await noOverflow(`${theme}桌面分栏`)
    await page.setViewportSize({ width: 820, height: 1000 })
    for (const mode of ['编辑模式', '分栏模式', '预览模式']) {
      await button(mode).click()
      await noOverflow(`${theme}820px ${mode}`)
      await innerWidths(theme, mode)
      if (mode === '分栏模式') await page.screenshot({ path: `.sandbox/artifacts/performance-narrow${suffix}.png`, fullPage: true })
    }
  }
  fs.writeFileSync('.sandbox/artifacts/performance-layout-evidence.json', JSON.stringify(layoutEvidence, null, 2) + '\n')
  console.log('DOM 布局证据：' + JSON.stringify(layoutEvidence.filter(item => item.firstScreen)))
  // 系统日报与无数据错误路径：只读取 sandbox:seed 生成的日报，不保存该月考核。
  const list = await (await fetch(`${url}/api/reports?type=daily`)).json()
  assert.ok(list.reports.length, '请先运行 pnpm sandbox:seed，沙箱至少需要一份日报')
  const dailyMonth = list.reports[0].date.slice(0, 7)
  await page.goto(`${url}/performance?month=${dailyMonth}`)
  await expandSettings()
  await page.getByText('系统日报', { exact: true }).click()
  await generate()
  await page.getByText(/查看生成依据原文与日报日期/).click()
  assert.ok(await page.getByRole('link', { name: list.reports[0].date, exact: true }).count())
  await page.goto(`${url}/performance?month=${emptyMonth}`)
  await expandSettings()
  await button('生成七项初稿').click()
  await page.getByRole('alert').filter({ hasText: /日报|来源/ }).waitFor()
  assert.deepEqual(errors, [])
  console.log(`浏览器回归通过：CodeMirror 七字段、全局模式、生成设置、重生成/放弃确认、按钮/键盘保存、月份导航与草稿恢复、复制下载、409保护、日报/空来源、深浅色桌面/820px截图及无水平溢出。沙箱URL：${url}；测试月份：${month}`)
} finally {
  await browser?.close()
  await server.close()
}
