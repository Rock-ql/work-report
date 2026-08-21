#!/usr/bin/env node
import fs from 'node:fs'
import path from 'node:path'
import { DATA_DIR, IS_SANDBOX, c, die, writeJsonAtomic } from './_shared.mjs'

/**
 * 往沙箱数据目录灌一批假数据，供开发和自动化测试使用。
 *
 * 拒绝在非沙箱环境下运行 —— 这是一道硬闸门：
 * 忘了设 WR_DATA_DIR 时它会直接退出，而不是把你的真实工作区覆盖掉。
 */

if (!IS_SANDBOX) {
  die(
    '拒绝执行：seed 只能跑在沙箱数据目录下。\n' +
      '  请用  pnpm sandbox:seed  或显式设置 WR_DATA_DIR=<临时目录>\n' +
      `  当前 DATA_DIR = ${DATA_DIR}`,
  )
}

const ts = '2026-08-20T10:00:00+08:00'

const workspaces = {
  version: 1,
  workspaces: [
    {
      id: 'ws_demo1', name: '全局搜索', moduleTag: '全局搜索',
      path: '/tmp/wr-demo/junified_query', authors: [], branches: [],
      enabled: true, color: '#6366f1', note: '沙箱假数据', order: 0,
      createdAt: ts, updatedAt: ts,
    },
    {
      id: 'ws_demo2', name: '商城', moduleTag: '商城',
      path: '/tmp/wr-demo/jshop', authors: [], branches: [],
      enabled: true, color: '#10b981', note: '沙箱假数据', order: 1,
      createdAt: ts, updatedAt: ts,
    },
    {
      id: 'ws_demo3', name: '组织权限', moduleTag: '组织权限',
      path: '/tmp/wr-demo/permission', authors: [], branches: [],
      enabled: false, color: '#f59e0b', note: '沙箱假数据（已停用）', order: 2,
      createdAt: ts, updatedAt: ts,
    },
  ],
}

const settings = {
  version: 1,
  userName: '示例用户',
  dailyTitle: '小鹰-工作日报',
  weeklyTitle: '小鹰-工作周报',
  defaultAuthors: ['demo@example.com'],
  timezone: 'Asia/Shanghai',
  weekStartsOn: 1,
  theme: 'system',
  editorMode: 'split',
}

const daily = {
  schemaVersion: 1,
  type: 'daily',
  date: '2026-08-20',
  title: '小鹰-工作日报 2026-08-20',
  status: 'draft',
  sections: {
    todayCompleted:
      '1. 【全局搜索】联调测试解绑邮箱、解绑手机号、重置密码微服务（待上线）\n' +
      '2. 【商城】多商城开发（开发中）\n' +
      '3. 【组织权限】跟进测试进度，修复 bug（进行中）',
    tomorrowPlan: {
      product: '1. 输出组织权限下放的方案文档',
      dev: '1. 【全局搜索】跟进微服务上线（待上线）\n2. 【商城】继续多商城开发（开发中）',
      backlog: '1. 换货管理新增需求\n2. 商城历史数据处理\n3. 商城细节优化：XYGJ-422',
    },
    needHelp: '需要测试同学配合验证组织权限的边界场景',
  },
  source: {
    workspaceIds: ['ws_demo1', 'ws_demo2'],
    range: { since: '2026-08-20T00:00:00+08:00', until: '2026-08-20T23:59:59+08:00' },
    commits: [],
    generatedBy: 'ai',
    generatedAt: ts,
  },
  tags: ['全局搜索', '商城', '组织权限'],
  createdAt: ts,
  updatedAt: ts,
}

const weekly = {
  schemaVersion: 1,
  type: 'weekly',
  week: '2026-W34',
  weekStart: '2026-08-17',
  weekEnd: '2026-08-23',
  title: '小鹰-工作周报 2026-W34',
  status: 'final',
  sections: {
    weekCompleted:
      '1. 【全局搜索】完成解绑与重置密码三个微服务的开发与联调（待上线）\n' +
      '2. 【商城】多商城改造推进中（开发中）',
    nextWeekPlan: '1. 推动全局搜索微服务上线\n2. 完成多商城主流程',
    needHelp: '无',
  },
  source: {
    workspaceIds: ['ws_demo1', 'ws_demo2'],
    range: { since: '2026-08-17T00:00:00+08:00', until: '2026-08-23T23:59:59+08:00' },
    commits: [],
    generatedBy: 'ai',
    generatedAt: ts,
  },
  tags: ['全局搜索', '商城'],
  createdAt: ts,
  updatedAt: ts,
}

fs.mkdirSync(path.join(DATA_DIR, 'reports', 'daily'), { recursive: true })
fs.mkdirSync(path.join(DATA_DIR, 'reports', 'weekly'), { recursive: true })

writeJsonAtomic(path.join(DATA_DIR, 'workspaces.json'), workspaces)
writeJsonAtomic(path.join(DATA_DIR, 'settings.json'), settings)
writeJsonAtomic(path.join(DATA_DIR, 'reports', 'daily', '2026-08-20.json'), daily)
writeJsonAtomic(path.join(DATA_DIR, 'reports', 'weekly', '2026-W34.json'), weekly)

console.log(`${c.green('+')} 沙箱数据已就绪: ${c.bold(DATA_DIR)}`)
console.log(c.dim('  3 个工作区 · 1 份日报 · 1 份周报'))
console.log(c.dim('  启动: pnpm dev:sandbox'))
