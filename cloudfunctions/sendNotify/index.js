// 云函数：发订阅消息（买菜提醒）
//
// 为什么单独开一个函数、而不是塞进 createOrder：
//   发消息失败不该影响下单。前脚下单成功后，前端再单独调这个 ——
//   挂了就只是没收到提醒，订单照旧。
//
// event:
//   { mode: 'me' | 'chef' | 'foodie' | 'couple', data: { 关键词名: { value } } }
//     mode = 'me'     → 只发给自己（「我的」页的「买菜提醒」测试用）
//     mode = 'chef'   → 只发这一对里的厨神   ← 下单后提醒他买菜
//     mode = 'foodie' → 只发这一对里的吃货   ← 厨神接单后提醒他准备吃饭
//     mode = 'couple' → 双方都发（暂时没用到，留着备用）
//
// 为什么按角色发、而不是「双方都发」：
//   微信的一次性订阅是「一次同意 = 只能发一条」，额度很紧。
//   下单提醒厨神、接单提醒吃货，每方每次刚好用一条，才送得出去。
//
// 返回里会把微信的**原始错误**带回去 —— 字段名写错时，微信会在这里说清是哪个字段。
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 模板 ID —— 必须和前端 utils/notify.js 里那个一致
const TEMPLATE_ID = 'NLJbpOO4hL0ymOYlchBL-LOJT7XyhfoEZ3WyE2ev2yI'

// 点开消息跳到哪一页
const PAGE = 'pages/order/index'

// 点开消息后打开小程序的哪个版本：
//   developer = 开发版（现在真机调试用这个）
//   trial     = 体验版  ← 等你发了体验版，改成这个
//   formal    = 正式版
const MINIPROGRAM_STATE = 'trial'

// mode → 只发给哪个角色。不在表里的（'me' / 'couple'）走别的分支
const ROLE_BY_MODE = { chef: 'chef', foodie: 'foodie' }

// 给一个人发。返回 { ok, errCode, errMsg }
async function sendToOne(openid, data) {
  if (!openid) return { ok: false, errCode: '', errMsg: '没有 openid' }
  try {
    await cloud.openapi.subscribeMessage.send({
      touser: openid,
      templateId: TEMPLATE_ID,
      page: PAGE,
      miniprogramState: MINIPROGRAM_STATE,
      lang: 'zh_CN',
      data: data
    })
    return { ok: true }
  } catch (err) {
    console.error('发订阅消息失败', openid, err)
    return {
      ok: false,
      errCode: err && err.errCode !== undefined ? err.errCode : '',
      errMsg: (err && (err.errMsg || err.message)) || String(err)
    }
  }
}

// 微信要求 data 写成 { 关键词: { value: 值 } } 这种形式。
// 前端已经按这个格式组装了，这里再做一次**幂等兜底** ——
// 万一哪次又传了裸字符串，包一层就行，不用来回改两端。
function normalizeData(raw) {
  const out = {}
  Object.keys(raw || {}).forEach(function (k) {
    const v = raw[k]
    if (v !== null && typeof v === 'object') {
      out[k] = v
    } else {
      out[k] = { value: String(v === undefined || v === null ? '' : v) }
    }
  })
  return out
}

exports.main = async (event) => {
  const openid = cloud.getWXContext().OPENID
  const data = normalizeData(event.data)

  if (!openid) return { success: false, error: '拿不到用户身份' }
  if (Object.keys(data).length === 0) return { success: false, error: '没有要发的内容' }

  // 测试：只发给自己
  if (event.mode === 'me') {
    const r = await sendToOne(openid, data)
    return {
      success: r.ok,
      sent: r.ok ? 1 : 0,
      error: r.ok ? '' : ('errCode ' + r.errCode + ' | ' + r.errMsg)
    }
  }

  // 正常：给这一对里的某一方（或双方）发
  try {
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    if (userRes.data.length === 0) return { success: false, error: '用户不存在' }

    const user = userRes.data[0]
    if (!user.coupleId) return { success: false, error: '还没绑定对象' }

    const coupleRes = await db.collection('couples').doc(user.coupleId).get()
    let members = (coupleRes.data && coupleRes.data.members) || []

    // 按角色筛。'couple' 时 wantRole 为空 → 不筛，双方都发
    const wantRole = ROLE_BY_MODE[event.mode]
    if (wantRole) {
      members = members.filter(function (m) { return m.role === wantRole })
      if (members.length === 0) {
        return { success: false, error: '这一对里没有「' + wantRole + '」这个人' }
      }
    }

    const targets = members.map(function (m) { return m.openid }).filter(Boolean)
    if (targets.length === 0) return { success: false, error: '这一对里没有成员' }

    const results = await Promise.all(targets.map(function (id) {
      return sendToOne(id, data)
    }))

    const sent = results.filter(function (r) { return r.ok }).length

    return {
      success: true,
      sent: sent,
      total: targets.length,
      // 没发出去多半是「对方没点过同意」或「额度用完了」—— 这属于正常，
      // 不是错误，所以 success 仍然是 true，页面上也不会报警。
      detail: results.map(function (r, i) {
        return (r.ok ? 'OK' : '未发出(errCode ' + r.errCode + ')') + ' @' + (i + 1)
      }).join('; ')
    }
  } catch (err) {
    console.error('sendNotify 失败', err)
    return { success: false, error: (err && (err.errMsg || err.message)) || String(err) }
  }
}
