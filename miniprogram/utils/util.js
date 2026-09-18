// 工具函数

// 计算两个日期相差的天数
function daysBetween(date1, date2) {
  const oneDay = 24 * 60 * 60 * 1000
  const firstDate = new Date(date1)
  const secondDate = new Date(date2)
  return Math.round(Math.abs((firstDate - secondDate) / oneDay))
}

// 格式化日期
function formatDate(date) {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}/${month}/${day}`
}

// 获取星期几
function getWeekDay(date) {
  const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return days[new Date(date).getDay()]
}

// 计算距离节日的天数
function daysToFestival() {
  const today = new Date()
  const year = today.getFullYear()
  
  // 节日列表：中秋节、圣诞节、情人节、除夕、春节
  const festivals = [
    { name: '中秋节', date: `${year}-09-17` }, // 示例日期
    { name: '圣诞节', date: `${year}-12-25` },
    { name: '情人节', date: `${year}-02-14` },
    { name: '除夕', date: `${year}-01-28` },
  ]
  
  // 找最近的节日
  let nearest = null
  let minDays = Infinity
  
  festivals.forEach(festival => {
    const festivalDate = new Date(festival.date)
    const diff = Math.ceil((festivalDate - today) / (24 * 60 * 60 * 1000))
    if (diff > 0 && diff < minDays) {
      minDays = diff
      nearest = festival
    }
  })
  
  return {
    name: nearest ? nearest.name : '下一个节日',
    days: minDays === Infinity ? 365 : minDays
  }
}

// 生成订单号
function generateOrderNo() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `${year}${month}${day}${random}`
}

module.exports = {
  daysBetween,
  formatDate,
  getWeekDay,
  daysToFestival,
  generateOrderNo
}
