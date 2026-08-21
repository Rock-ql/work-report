/**
 * ISO 周与日期工具。前端、Vite 中间件、node 脚本共用同一套周计算，
 * 避免"网页显示 W34、脚本算出 W33"这类错位。
 * 统一采用 ISO-8601 周（周一为一周之始，含 1 月 4 日的那周为第 1 周）。
 */

/** 系统未显式配置时使用中国标准时间。 */
export const DEFAULT_TIMEZONE = 'Asia/Shanghai'

const DAY = 86400000

function toUTC(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()))
}

/** 返回 [year, week]，遵循 ISO-8601 */
export function isoWeekOf(date: Date): [number, number] {
  const d = toUTC(date)
  // 移到本周周四，ISO 周归属由周四所在年份决定
  const dayNum = (d.getUTCDay() + 6) % 7
  d.setUTCDate(d.getUTCDate() - dayNum + 3)
  const isoYear = d.getUTCFullYear()
  const firstThursday = new Date(Date.UTC(isoYear, 0, 4))
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3)
  const week = 1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * DAY))
  return [isoYear, week]
}

/** 2026-W34 */
export function weekKey(date: Date): string {
  const [y, w] = isoWeekOf(date)
  return `${y}-W${String(w).padStart(2, '0')}`
}

/** 2026-W34 -> { start: '2026-08-17', end: '2026-08-23' }（周一至周日） */
export function weekRange(key: string): { start: string; end: string } {
  const m = /^(\d{4})-W(\d{2})$/.exec(key)
  if (!m) throw new Error(`非法周编号: ${key}`)
  const year = Number(m[1])
  const week = Number(m[2])
  // 1 月 4 日必定在第 1 周
  const jan4 = new Date(Date.UTC(year, 0, 4))
  const jan4DayNum = (jan4.getUTCDay() + 6) % 7
  const week1Monday = new Date(jan4.getTime() - jan4DayNum * DAY)
  const monday = new Date(week1Monday.getTime() + (week - 1) * 7 * DAY)
  const sunday = new Date(monday.getTime() + 6 * DAY)
  return { start: fmtUTC(monday), end: fmtUTC(sunday) }
}

function fmtUTC(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(
    d.getUTCDate(),
  ).padStart(2, '0')}`
}

/** 本地日期 -> 2026-08-20 */
export function dateKey(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate(),
  ).padStart(2, '0')}`
}

/** 2026-08-20 -> 本地 Date（当天 00:00） */
export function parseDateKey(key: string): Date {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d, 0, 0, 0, 0)
}

const WEEKDAY_CN = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

export function weekdayCn(key: string): string {
  return WEEKDAY_CN[parseDateKey(key).getDay()]
}

/** 相对今天的人类可读描述：今天 / 昨天 / 3 天前 */
export function relativeDay(key: string, today: Date = new Date()): string {
  const diff = Math.round(
    (parseDateKey(dateKey(today)).getTime() - parseDateKey(key).getTime()) / DAY,
  )
  if (diff === 0) return '今天'
  if (diff === 1) return '昨天'
  if (diff === 2) return '前天'
  if (diff === -1) return '明天'
  if (diff > 0) return `${diff} 天前`
  return `${-diff} 天后`
}

/** 带本地时区偏移的 ISO 时间戳，如 2026-08-20T19:30:00+08:00 */
export function nowIso(date: Date = new Date()): string {
  const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
  const offset = -date.getTimezoneOffset()
  const sign = offset >= 0 ? '+' : '-'
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}` +
    `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}` +
    `${sign}${pad(offset / 60)}:${pad(offset % 60)}`
  )
}

/** 日期区间（含首尾）内的所有日期 key */
export function eachDay(start: string, end: string): string[] {
  const out: string[] = []
  let cur = parseDateKey(start)
  const last = parseDateKey(end)
  while (cur.getTime() <= last.getTime()) {
    out.push(dateKey(cur))
    cur = new Date(cur.getTime() + DAY)
  }
  return out
}

/** git log 用的时间边界：某天 00:00:00 / 23:59:59 本地时间 */
export function dayBounds(key: string): { since: string; until: string } {
  const d = parseDateKey(key)
  const end = new Date(d.getTime())
  end.setHours(23, 59, 59, 0)
  return { since: nowIso(d), until: nowIso(end) }
}

export function rangeBounds(start: string, end: string): { since: string; until: string } {
  return { since: dayBounds(start).since, until: dayBounds(end).until }
}

// ------------------------------------------------------------------ 时区

/**
 * 机器时区常常与你实际工作的时区不同（比如笔记本设成美西，人在国内）。
 * 报告的"哪一天"必须按配置时区判定，否则半夜的提交会落到错误的日期上。
 * 下面这组函数接受 IANA 时区名，是所有日期边界的正解入口。
 */

/** 取某时刻在指定时区的 UTC 偏移，如 "+08:00" */
export function tzOffset(tz: string, at: Date = new Date()): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset',
    }).formatToParts(at)
    const name = parts.find((p) => p.type === 'timeZoneName')?.value ?? ''
    // longOffset 形如 "GMT+08:00"，UTC 本身返回 "GMT"
    const m = /GMT([+-]\d{2}:\d{2})/.exec(name)
    return m ? m[1] : '+00:00'
  } catch {
    // 时区名非法时退回机器本地偏移，至少不崩
    const off = -at.getTimezoneOffset()
    const sign = off >= 0 ? '+' : '-'
    const pad = (n: number) => String(Math.floor(Math.abs(n))).padStart(2, '0')
    return `${sign}${pad(off / 60)}:${pad(off % 60)}`
  }
}

/** 指定时区的"今天"，如 2026-08-20 */
export function dateKeyInTz(tz: string, at: Date = new Date()): string {
  try {
    // en-CA 的短日期格式恰好就是 YYYY-MM-DD
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(at)
  } catch {
    return dateKey(at)
  }
}

/** 指定时区的"本周"，如 2026-W34 */
export function weekKeyInTz(tz: string, at: Date = new Date()): string {
  return weekKey(parseDateKey(dateKeyInTz(tz, at)))
}

/** 指定时区下某一天的起止时刻，可直接喂给 git --since/--until */
export function dayBoundsInTz(key: string, tz: string): { since: string; until: string } {
  // 用当天正午取偏移，避开夏令时切换当天的边界歧义
  const noon = new Date(`${key}T12:00:00Z`)
  const off = tzOffset(tz, noon)
  return { since: `${key}T00:00:00${off}`, until: `${key}T23:59:59${off}` }
}

export function rangeBoundsInTz(
  start: string,
  end: string,
  tz: string,
): { since: string; until: string } {
  return {
    since: dayBoundsInTz(start, tz).since,
    until: dayBoundsInTz(end, tz).until,
  }
}
