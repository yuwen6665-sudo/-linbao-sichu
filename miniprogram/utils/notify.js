// 订阅消息（买菜提醒）—— 配置与封装
//
// ⚠️ 换模板、改字段名，**只改这个文件**，不用碰云函数。
//
// 微信的规矩：
//   1. 关键词的【英文名】必须和后台「我的模板 → 模板详情 → 详细内容」里
//      {{ }} 中间那串英文**一字不差**，否则发不出去。
//   2. 一次「允许」只能发一条（一次性订阅）。
//   3. 弹授权框必须由用户点击触发，不能自动弹。
//
// 字段名到底对不对，去「我的」页点一下「买菜提醒」→「发一条」就知道了，
// 错了它会直接把微信的原始报错显示出来。

// 模板 ID —— 后台「我的模板」里那条「订单提交成功通知」（模板编号 2887）
const TEMPLATE_ID = 'NLJbpOO4hL0ymOYlchBL-LOJT7XyhfoEZ3WyE2ev2yI'

// 关键词的英文名 —— 逐字抄自后台「模板详情 → 详细内容」
//
//   订单编号 {{character_string1.DATA}}
//   提交时间 {{date2.DATA}}
//   提交人   {{name3.DATA}}
//   操作备注 {{thing5.DATA}}
//
// 注意两点：
//   · 「提交时间」是 date 类型（不是 time），只能用 `2026-09-19` 这种「到日」的格式
//   · 编号不是 1/2/3/4 连续 —— 它沿用模板原始定义的序号，所以是 1、2、3、5
//
// 为什么这里有 4 行、而你告诉我只勾了 3 个：
//   后台「模板详情」的详细内容列了 4 个（含「订单编号」），这里是照着它抄的。
//   如果点「发一条」时微信报「缺少或多余字段」，就把对应的那行删掉/补上 ——
//   报错信息里会点名是哪个字段。
const FIELDS = {
  orderNo: 'character_string1',  // 「订单编号」
  when: 'date2',                 // 「提交时间」
  who: 'name3',                  // 「提交人」
  note: 'thing5'                 // 「操作备注」
}

// 各类型关键词的长度上限（微信定的）
const MAX = {
  character_string: 32,   // 数字、字母或符号
  name: 10,               // 姓名
  thing: 20               // 事物
}

// date 类型只到「日」：2026-09-19
// ⚠️ 不能带时分 —— 带了会被微信判成格式错误
function formatDate(input) {
  const t = input ? new Date(input) : new Date()
  const pad = function (n) { return n < 10 ? '0' + n : '' + n }
  return t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate())
}

// 去掉换行、制表符和首尾空白，再按该类型的上限截断
function clean(input, max) {
  return String(input === undefined || input === null ? '' : input)
    .replace(/[\r\n\t]/g, ' ')
    .trim()
    .slice(0, max)
}

// 拼出模板要的四个值
//   orderNo —— 订单号，不传就现编一个（测试用）
//   who     —— 点菜的人
//   note    —— 「番茄炒蛋等3道，记得买菜」
//   when    —— 时间，不传就取今天
//
// ⚠️ 微信要求每个关键词都写成 { value: xxx } 这种形式。
//    直接给字符串会报 `data.xxx.value invalid` —— 这个坑踩过（2026-09-19）。
function buildData(orderNo, who, note, when) {
  const data = {}
  data[FIELDS.orderNo] = { value: clean(orderNo || fallbackOrderNo(), MAX.character_string) }
  data[FIELDS.when] = { value: formatDate(when) }
  data[FIELDS.who] = { value: clean(who || 'TA', MAX.name) }
  data[FIELDS.note] = { value: clean(note, MAX.thing) }
  return data
}

// 测试用：现编一个像样的订单号
function fallbackOrderNo() {
  const t = new Date()
  const pad = function (n) { return n < 10 ? '0' + n : '' + n }
  return '' + t.getFullYear() + pad(t.getMonth() + 1) + pad(t.getDate()) +
    pad(t.getHours()) + pad(t.getMinutes()) + pad(t.getSeconds())
}

// 两种提醒的文案，集中放这里 —— 改措辞只改这一处
const NOTE = {
  ordered: '，记得买菜',           // 追加在菜名后面（下单提醒用）
  accepted: 'TA 接单了，准备吃饭'   // 接单提醒用
}

// 从购物车清单拼一句尽量短的话，保证「记得买菜」四个字不被截掉
function buildNote(cartList) {
  const list = cartList || []
  if (list.length === 0) return NOTE.ordered.slice(1)

  const head = list.length === 1
    ? list[0].name
    : (list[0].name + '等' + list.length + '道')

  const room = MAX.thing - NOTE.ordered.length
  return head.slice(0, room) + NOTE.ordered
}

// 接单提醒的数据：提交人 = 下单的那位（who），操作备注 = 状态文案
function acceptedData(orderNo, fromName, when) {
  return buildData(orderNo, fromName, NOTE.accepted, when)
}

// 弹订阅授权框。⚠️ 必须在用户的点击里调，不然弹不出来。
// 返回 { ok, status, msg }
function requestSubscribe() {
  return new Promise(function (resolve) {
    if (!TEMPLATE_ID) {
      resolve({ ok: false, status: 'noconfig', msg: '还没配模板 ID' })
      return
    }
    wx.requestSubscribeMessage({
      tmplIds: [TEMPLATE_ID],
      success: function (res) {
        const status = res[TEMPLATE_ID]
        resolve({ ok: status === 'accept', status: status })
      },
      fail: function (err) {
        resolve({ ok: false, status: 'fail', msg: (err && err.errMsg) || '授权失败' })
      }
    })
  })
}

// 授权状态 → 人话
function statusText(status) {
  if (status === 'accept') return '已允许'
  if (status === 'reject') return '你点了「拒绝」'
  if (status === 'ban') return '这个模板被后台禁用了'
  if (status === 'filter') return '模板标题被过滤了'
  if (status === 'noconfig') return '还没配模板 ID'
  return status || '未知状态'
}

module.exports = {
  TEMPLATE_ID: TEMPLATE_ID,
  FIELDS: FIELDS,
  MAX: MAX,
  NOTE: NOTE,
  formatDate: formatDate,
  buildData: buildData,
  buildNote: buildNote,
  acceptedData: acceptedData,
  requestSubscribe: requestSubscribe,
  statusText: statusText
}
