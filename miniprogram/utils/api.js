/**
 * 数据访问层 —— 所有跟云端的交互都收在这里
 *
 * 用法：const api = require('../../utils/api.js')
 *
 * 设计原则：
 * 1. 页面不直接碰数据库 —— 数据库权限是「所有用户不可读写」，
 *    前端一读就被拒，所以全部读写都交给云函数代做（云函数不受权限限制）。
 * 2. 每个函数失败都不抛异常，返回 { ok, data, msg }，页面按情况提示
 * 3. 隔离交给云函数：它用 openid 查出你属于哪一对，只返回那一对的数据
 */

const CLOUD_ENV = 'cloud1-d9gq6m7n5e57e97c6'

/* ---------------- 基础工具 ---------------- */

// 拿 app 实例。注意：绝对不能写成模块顶层变量，
// 因为 api.js 被 require 的时候 app 可能还没初始化好，getApp() 会返回 undefined。
function app() {
  return getApp() || {}
}

// 拿当前 app 里缓存的 globalData（同样不能提前取）
function globalData() {
  const a = app()
  return a.globalData || {}
}

// 云函数调用失败的常见原因 → 说人话
const ERR_HINT = {
  '-501000': '找不到这个云函数，在开发者工具里右键它 →「上传并部署」',
  '-501001': '云函数跑超时了，网络好的时候再试一次',
  '-501002': '云函数里面报错了，去云开发控制台 → 云函数 → 日志 看看',
  '-601002': '云环境 ID 不对，检查 utils/api.js 里的 CLOUD_ENV',
  '-601033': '这个项目还没绑定云环境，点开发者工具左上角「云开发」选一个',
  '103006': '调不到这个云函数。先看它有没有「上传并部署」，再检查电脑/手机的时间准不准（差几分钟就会这样）'
}

/**
 * 统一包一层错误处理。
 *
 * ⚠️ 关键：wx.cloud.callFunction 的返回值是 { result, errMsg, requestID }，
 * 云函数里 return 的内容在 res.result 里 —— 不是 res.data！
 * 这里统一把它提到 data 上，页面就只要读 res.data 就行。
 */
async function wrap(promise) {
  try {
    const res = await promise
    let payload = res
    if (res && res.result !== undefined) payload = res.result
    else if (res && res.data !== undefined) payload = res.data
    return { ok: true, data: payload }
  } catch (err) {
    console.error('[api] 调用失败', err)
    const code = err && err.errCode !== undefined ? String(err.errCode) : ''
    const raw = (err && (err.errMsg || err.message)) || '网络开小差了'
    return {
      ok: false,
      msg: ERR_HINT[code] || raw,
      detail: code ? code + ' | ' + raw : raw
    }
  }
}

/**
 * 云函数调用（返回云函数的 result，即 { success, ... } 那一层）
 *
 * 这里多做一件事：云函数统一返回 { success: true/false, error }。
 * 如果 success 是 false，就在这里直接转成 ok:false，
 * 这样页面上「if (!res.ok) 提示错误」的写法就能自动生效 ——
 * 不会出现「云函数说失败了，页面还提示成功」这种鬼事。
 */
async function call(name, data) {
  const res = await wrap(
    wx.cloud.callFunction({
      name: name,
      data: Object.assign({}, data)
    })
  )
  if (!res.ok) return res

  const body = res.data
  if (body && body.success === false) {
    return { ok: false, msg: body.error || '操作失败', detail: '' }
  }
  // 云函数没 return 东西 / 返回的不是对象 —— 提前拦住，不然页面读 res.data.xxx 会直接崩
  if (!body || typeof body !== 'object') {
    let raw = ''
    try { raw = JSON.stringify(body) } catch (e) { raw = String(body) }
    return { ok: false, msg: '云函数 ' + name + ' 没返回内容', detail: raw || '(空)' }
  }
  return res
}

/**
 * 调用云函数并拆掉 { success } 外壳，
 * payloadKey 是要交给页面的那个字段（比如 'dishes'）
 */
async function callData(name, payload, payloadKey) {
  const res = await call(name, payload)
  if (!res.ok) return res
  const body = res.data
  if (body && body.success) {
    return { ok: true, data: body[payloadKey] }
  }
  if (body && body.error) return { ok: false, msg: body.error }
  // 走到这里说明云函数返回的结构不是预期的 —— 把原始返回原样带出来，方便一眼看出问题
  let raw = ''
  try { raw = JSON.stringify(body) } catch (e) { raw = String(body) }
  return {
    ok: false,
    msg: '云函数 ' + name + ' 返回了意外内容',
    detail: (raw || '(空)').slice(0, 200)
  }
}

/**
 * 统一的失败提示。
 *
 * 为什么不用 wx.showToast：toast 一闪就没，用户根本看不清写的啥，
 * 只能反复截图问人。改用弹窗，停下来能看完、能截图。
 */
function alertError(res, title) {
  const msg = (res && res.msg) || '未知原因'
  let detail = (res && res.detail) || ''
  if (detail.length > 140) detail = detail.slice(0, 140) + '…'
  wx.showModal({
    title: title || '没成功',
    content: detail ? msg + '\n\n（技术详情：' + detail + '）' : msg,
    showCancel: false,
    confirmText: '知道了'
  })
}

/* ---------------- 登录 / 用户 ---------------- */

// 登录（云函数里会自动建号 / 更新登录时间）
async function login() {
  const res = await call('login', {})
  if (res.ok && res.data && res.data.success) {
    return { ok: true, data: res.data }
  }
  return { ok: false, msg: (res.data && res.data.error) || res.msg }
}

async function updateProfile(fields) {
  return call('updateProfile', fields)
}

/* ---------------- 情侣绑定 ---------------- */

// 生成邀请码（返回最新 coupleId）
async function createInvite() {
  return call('bindPartner', { action: 'createInvite' })
}

// 用邀请码绑定
async function acceptInvite(inviteCode) {
  return call('bindPartner', { action: 'acceptInvite', inviteCode: inviteCode })
}

// 解除绑定
async function unbind() {
  return call('bindPartner', { action: 'unbind' })
}

// 取情侣信息（含纪念日、两人昵称）
async function getCoupleInfo() {
  return call('bindPartner', { action: 'info' })
}

// 设置在一起的日子
async function setAnniversary(dateStr) {
  return call('bindPartner', { action: 'setAnniversary', anniversary: dateStr })
}

/* ---------------- 菜品 ---------------- */

// 分类顺序 —— 就按上菜顺序排：先开胃凉菜，再热菜/汤/主食，最后甜品饮品。
// 注意：菜单页的分类是「按实际有哪些菜」动态生成的，
// 这里只决定排序。想看见「凉菜」，得真有 category = '凉菜' 的菜。
const CATEGORY_ORDER = ['凉菜', '主食', '荤菜', '汤品', '素菜', '甜品', '饮品']

/**
 * 取菜品：内置公共菜库（coupleId='default'）+ 我们自己加的
 * @param {string} category 可选，'全部' 或具体分类
 */
// 菜品缓存的有效期。
// ⚠️ 现在图片走直连（云存储权限已公开，地址永久有效），严格说这个 TTL 不是必须的。
//    留着它有两个理由：
//      ① 【安全网】万一哪天退回「换临时链接」模式（data 里的 CONVERT_TO_TEMP_URL = true），
//         临时链接约 2 小时过期；缓存要是不设有效期，挂后台久了图会整片变空白 —— 很难查。
//      ② 菜品偶尔会变（加菜、改做法），定期重拉一次总没坏处。
//    100 分钟比临时链接的 2 小时留了余量。
const DISH_CACHE_TTL = 100 * 60 * 1000

async function getDishes(category) {
  const g = globalData()
  const cached = g.dishCache || []
  const fresh = cached.length > 0 && Date.now() - (g.dishCacheAt || 0) < DISH_CACHE_TTL

  // 缓存里有、且没过期就直接过（菜品变动不频繁）
  if (fresh) {
    return { ok: true, data: filterDishes(cached, category) }
  }

  // 注意：这里【故意不把 category 传给云函数】。
  // 传了的话，第一次要是按分类取（比如只取「凉菜」），返回的十几道会被当成「整个菜库」
  // 存进缓存 —— 之后所有页面都只能看到那一个分类。
  // 所以永远整库拉一次，分类在本地筛。
  const res = await callData('data', { action: 'getDishes' }, 'dishes')
  if (!res.ok) return res

  const all = res.data || []
  g.dishCache = all
  g.dishCacheAt = Date.now()
  return { ok: true, data: filterDishes(all, category) }
}

/**
 * 取单道菜的完整内容（含食材 / 步骤 / 小窍门 / 营养）
 *
 * 为什么不从缓存里翻：列表接口为了省流量把做法裁掉了（235 道全量 555KB，
 * 只带列表字段 132KB）。详情页必须单独来取这一道。
 */
async function getDishDetail(id) {
  if (!id) return { ok: false, msg: '没有这道菜' }
  return callData('data', { action: 'getDishDetail', id: id }, 'dish')
}

function filterDishes(list, category) {
  if (!category || category === '全部') return list
  return list.filter(function (d) { return d.category === category })
}

// 清缓存（加菜 / 删菜后调用）
function clearDishCache() {
  const g = globalData()
  g.dishCache = null
  g.dishCacheAt = 0 // 时间戳也归零，下回一定重新拉
}

/**
 * 按菜品 _id 批量取（订单页拿食材用）
 * 只取订单里用到的几道，比把整个菜库拉一遍快得多
 */
async function getDishesByIds(ids) {
  if (!ids || ids.length === 0) return { ok: true, data: [] }
  return callData('data', { action: 'getDishesByIds', ids: ids }, 'dishes')
}

// 新增菜品（走云函数，前端没有写权限）
async function addDish(form) {
  const res = await call('data', {
    action: 'addDish',
    name: form.name,
    category: form.category,
    description: form.description,
    image: form.image,
    imageUrl: form.image,
    tasteTags: form.tasteTags,
    calories: form.calories,
    cookTime: form.cookTime,
    ingredients: form.ingredients,
    steps: form.steps,
    benefits: form.benefits
  })
  if (res.ok && res.data && res.data.success) {
    clearDishCache()
    return { ok: true, data: res.data }
  }
  clearDishCache()
  return { ok: false, msg: (res.data && res.data.error) || res.msg || '保存失败' }
}

// 删除菜品（只能删自己家的）
async function removeDish(id) {
  const res = await call('data', { action: 'removeDish', id: id })
  clearDishCache()
  if (res.ok && res.data && res.data.success) return { ok: true, data: res.data }
  return { ok: false, msg: (res.data && res.data.error) || res.msg || '删除失败' }
}

/* ---------------- 订单 ---------------- */

// 下单
async function createOrder(items, remark) {
  const res = await call('createOrder', { items: items, remark: remark || '' })
  if (res.ok && res.data && res.data.success) {
    return { ok: true, data: res.data }
  }
  return { ok: false, msg: (res.data && res.data.error) || res.msg || '下单失败' }
}

// 我这边能看到的所有订单（下的 + 要做的）
async function getOrders() {
  return callData('data', { action: 'getOrders' }, 'orders')
}

async function getOrderDetail(id) {
  return callData('data', { action: 'getOrderDetail', id: id }, 'order')
}

// 更新订单状态：accept / finish / reject / cancel
async function updateOrderStatus(orderId, action, extra) {
  return call('updateOrder', Object.assign({ orderId: orderId, action: action }, extra || {}))
}

// 评价订单
async function rateOrder(orderId, rating, comment, photos) {
  return call('updateOrder', {
    orderId: orderId,
    action: 'rate',
    rating: rating,
    comment: comment || '',
    photos: photos || []
  })
}

/* ---------------- 恋爱日志 ---------------- */

async function addPost(content, images, mood) {
  return call('post', {
    action: 'add',
    content: content,
    images: images || [],
    mood: mood || ''
  })
}

async function getPosts(limit) {
  return callData('data', { action: 'getPosts', limit: limit || 30 }, 'posts')
}

async function likePost(postId) {
  return call('post', { action: 'like', postId: postId })
}

async function removePost(postId) {
  return call('post', { action: 'remove', postId: postId })
}

/* ---------------- 心情日历 ---------------- */

// 取某个月的心情（month 形如 '2026-09'）
async function getMoods(month) {
  return callData('data', { action: 'getMoods', month: month }, 'moods')
}

// 设置今天的心情（同一天重复设置会覆盖）
async function setMood(dateStr, mood, note) {
  return call('post', {
    action: 'setMood',
    date: dateStr,
    mood: mood,
    note: note || ''
  })
}

/* ---------------- 订阅消息（买菜提醒） ---------------- */

// mode = 'me'     只发给自己（测试用）
// mode = 'couple' 给这一对情侣的双方各发一条
// data 形如 { name3: { value: '小琳' }, date2: { value: '2026-09-19' }, ... }
// 关键词名和格式由 utils/notify.js 的 buildData 负责组装
async function sendNotify(mode, data) {
  return call('sendNotify', { mode: mode, data: data })
}

/* ---------------- 导出 ---------------- */

module.exports = {
  CLOUD_ENV: CLOUD_ENV,
  CATEGORY_ORDER: CATEGORY_ORDER,
  alertError: alertError,

  login: login,
  updateProfile: updateProfile,

  createInvite: createInvite,
  acceptInvite: acceptInvite,
  unbind: unbind,
  getCoupleInfo: getCoupleInfo,
  setAnniversary: setAnniversary,

  getDishes: getDishes,
  getDishDetail: getDishDetail,
  getDishesByIds: getDishesByIds,
  clearDishCache: clearDishCache,
  addDish: addDish,
  removeDish: removeDish,

  createOrder: createOrder,
  getOrders: getOrders,
  getOrderDetail: getOrderDetail,
  updateOrderStatus: updateOrderStatus,
  rateOrder: rateOrder,

  addPost: addPost,
  getPosts: getPosts,
  likePost: likePost,
  removePost: removePost,

  getMoods: getMoods,
  setMood: setMood,

  sendNotify: sendNotify
}
