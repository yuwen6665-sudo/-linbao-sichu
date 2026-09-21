/**
 * 订单动作 —— 订单列表页和订单详情页共用的那一份
 *
 * 为什么单独抽成一个文件：
 *   「接单 / 做完 / 拒绝 / 取消」这四件事，两个页面各写了一遍。
 *   连「接单成功后提醒吃货」那段 try/catch 都是抄的两份。
 *
 *   抄两份的真正代价不是代码难看，而是**改一处忘一处**：
 *   比如「提醒失败不能影响接单」，就得记得改两个地方才不白干。
 *   状态文案同理 —— 列表页写短版、详情页写长版，两份很容易改歪。
 *
 * 页面里仍然保留同名方法（wxml 绑的是页面方法，不能直接删），
 * 但方法体变成一行：调用这里。这样绑定不断，逻辑只有一份。
 *
 * ⚠️ 这个文件只负责「动作」，不负责刷新页面 —— 刷新方式两个页面不一样
 *    （列表页重拉整列、详情页重拉这一单），由页面自己决定。
 */
const api = require('./api.js')
const notify = require('./notify.js')

/* ---------------- 状态文案 ---------------- */

// 列表页用的短文案（卡片上空间小）
const STATUS_TEXT = {
  pending: '待接单',
  making: '制作中',
  done: '已完成',
  rejected: '被拒绝了',
  canceled: '已取消'
}

// 详情页用的文案 + 一句说明（详情页空间大，能多解释一句）
const STATUS_INFO = {
  pending: { text: '等 TA 接单', desc: '订单刚发出去，做饭的人还没看到 / 还没点头' },
  making: { text: '正在做', desc: '已经接单啦，厨房里忙活中' },
  done: { text: '做好了', desc: '这顿饭完成了' },
  rejected: { text: '被拒绝', desc: '对方今天做不了' },
  canceled: { text: '已取消', desc: '这一单不算数' }
}

// 列表页的三个标签分别放哪些状态
const TAB_FILTER = {
  pending: ['pending', 'making'],
  done: ['done'],
  closed: ['rejected', 'canceled']
}

const ACTION_TOAST = {
  accept: '开始做啦',
  finish: '做好了！'
}

/* ---------------- 动作 ---------------- */

/**
 * 接单 / 做完
 *
 * @param {string} orderId
 * @param {'accept'|'finish'} action
 * @param {object} orderInfo 这一单的对象（接单提醒要用里面的订单号和下单人昵称）
 * @returns {Promise<{ok:boolean, msg?:string}>}
 */
async function changeStatus(orderId, action, orderInfo) {
  if (!orderId) return { ok: false, msg: '订单不存在' }

  wx.showLoading({ title: action === 'accept' ? '接单中' : '提交中', mask: true })
  const res = await api.updateOrderStatus(orderId, action)
  wx.hideLoading()

  if (!res.ok) {
    wx.showToast({ title: res.msg, icon: 'none' })
    return res
  }

  wx.showToast({ title: ACTION_TOAST[action] || '好了', icon: 'success' })

  // 接单成功 → 提醒吃货准备吃饭
  if (action === 'accept') notifyFoodie(orderInfo)

  return res
}

/**
 * 接单后提醒吃货。
 *
 * 这是【附带动作】：不等结果、失败也不报警 ——
 * 提醒发不出去是小事，绝不能因为提醒失败让「接单」看起来像失败了。
 * 找不到订单信息就静默跳过。
 */
function notifyFoodie(orderInfo) {
  try {
    const o = orderInfo || {}
    api.sendNotify('foodie', notify.acceptedData(o.orderNo, o.fromName))
      .catch(function (e) { console.error('[提醒] 接单提醒发送失败（不影响接单）', e) })
  } catch (e) {
    console.error('[提醒] 接单提醒发送失败（不影响接单）', e)
  }
}

/**
 * 厨神拒单（可以写一句原因，也可以不写）
 *
 * 注意返回值三态，页面要靠它决定要不要刷新：
 *   { ok:true }                 → 真的拒了
 *   { ok:true, skipped:true }   → 用户点了「取消」，什么都没做
 *   { ok:false, msg }           → 操作失败
 */
function rejectOrder(orderId, opts) {
  const o = opts || {}
  return new Promise(function (resolve) {
    wx.showModal({
      title: o.title || '拒绝这一单？',
      content: o.content || '对方会看到「被拒绝了」，可以顺便说一句为什么',
      editable: true,
      placeholderText: o.placeholder || '比如：今天不在家（可以不填）',
      success: async function (r) {
        if (!r.confirm) {
          resolve({ ok: true, skipped: true })
          return
        }
        wx.showLoading({ title: '处理中', mask: true })
        const res = await api.updateOrderStatus(orderId, 'reject', { reason: r.content || '' })
        wx.hideLoading()
        if (!res.ok) {
          wx.showToast({ title: res.msg, icon: 'none' })
          resolve(res)
          return
        }
        wx.showToast({ title: '已拒绝', icon: 'none' })
        resolve({ ok: true })
      }
    })
  })
}

/**
 * 点菜的人取消这一单（只在对方还没接单时能取消）
 */
function cancelOrder(orderId, opts) {
  const o = opts || {}
  return new Promise(function (resolve) {
    wx.showModal({
      title: o.title || '取消这一单？',
      content: o.content || '只在对方还没接单时能取消',
      success: async function (r) {
        if (!r.confirm) {
          resolve({ ok: true, skipped: true })
          return
        }
        wx.showLoading({ title: '处理中', mask: true })
        const res = await api.updateOrderStatus(orderId, 'cancel')
        wx.hideLoading()
        if (!res.ok) {
          wx.showToast({ title: res.msg, icon: 'none' })
          resolve(res)
          return
        }
        wx.showToast({ title: '已取消', icon: 'none' })
        resolve({ ok: true })
      }
    })
  })
}

/* ---------------- 小工具 ---------------- */

/**
 * 订单时间 → 人话
 * @param {*} input 时间戳 / 日期字符串 / Date
 * @param {boolean} withYear 详情页要带上年份，列表页不用
 */
function formatTime(input, withYear) {
  // ⚠️ 必须先挡 null / undefined。
  //    JS 里 `new Date(null)` 不是「非法日期」，而是 **1970-01-01**（当 0 处理）——
  //    数据缺了 createTime 时，页面上会安安静静显示「1月1日 08:00」这种假时间，
  //    比直接空着难查得多。这条是仿真跑出来的（sim_orderaction ⑨）。
  if (input === null || input === undefined || input === '') return ''

  const t = input instanceof Date ? input : new Date(input)
  if (isNaN(t.getTime())) return ''
  const p = function (n) { return n < 10 ? '0' + n : '' + n }
  const head = (withYear ? t.getFullYear() + '年' : '') +
    (t.getMonth() + 1) + '月' + t.getDate() + '日 '
  return head + p(t.getHours()) + ':' + p(t.getMinutes())
}

module.exports = {
  STATUS_TEXT: STATUS_TEXT,
  STATUS_INFO: STATUS_INFO,
  TAB_FILTER: TAB_FILTER,
  ACTION_TOAST: ACTION_TOAST,
  changeStatus: changeStatus,
  rejectOrder: rejectOrder,
  cancelOrder: cancelOrder,
  notifyFoodie: notifyFoodie,
  formatTime: formatTime
}
