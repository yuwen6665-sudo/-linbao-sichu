/**
 * 心情日历 / 日志的公共常量
 */

// 六种心情，key 存数据库，emoji 显示
const MOODS = [
  { key: 'happy', emoji: '😄', label: '开心' },
  { key: 'love', emoji: '🥰', label: '甜蜜' },
  { key: 'calm', emoji: '😌', label: '平淡' },
  { key: 'tired', emoji: '😪', label: '好累' },
  { key: 'sad', emoji: '😢', label: '难过' },
  { key: 'angry', emoji: '😤', label: '生气' }
]

const MOOD_MAP = {}
MOODS.forEach(function (m) {
  MOOD_MAP[m.key] = m
})

/**
 * 生成一个月历的格子
 * @param {number} year
 * @param {number} month 1-12
 * @returns {Array} 每项 { day, dateStr, empty }
 */
function buildMonthGrid(year, month) {
  const first = new Date(year, month - 1, 1)
  const startWeekday = first.getDay()        // 0=周日
  const daysInMonth = new Date(year, month, 0).getDate()

  const cells = []
  // 月初占位
  for (let i = 0; i < startWeekday; i++) {
    cells.push({ day: 0, dateStr: '', empty: true })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({
      day: d,
      dateStr: year + '-' + pad(month) + '-' + pad(d),
      empty: false
    })
  }
  return cells
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n
}

// 日期 → '2026-09-18'
function todayStr(d) {
  const t = d || new Date()
  return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate())
}

// 日期 → '9月18日 周五'
function prettyDate(dateStr) {
  const parts = dateStr.split('-')
  const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][d.getDay()]
  return Number(parts[1]) + '月' + Number(parts[2]) + '日 ' + week
}

module.exports = {
  MOODS: MOODS,
  MOOD_MAP: MOOD_MAP,
  buildMonthGrid: buildMonthGrid,
  todayStr: todayStr,
  prettyDate: prettyDate,
  pad: pad
}
