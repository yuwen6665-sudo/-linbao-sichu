// 云函数：订单状态流转 + 评价
//
// action:
//   accept  厨神接单       pending  → making
//   finish  厨神做完       making   → done
//   reject  厨神拒单       pending  → rejected
//   cancel  点菜的人取消   pending  → canceled
//   rate    打分评价       done     → done（补上评分）

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const orderId = event.orderId
  const action = event.action

  if (!openid) return { success: false, error: '拿不到用户身份' }
  if (!orderId) return { success: false, error: '缺订单号' }

  try {
    const orderRes = await db.collection('orders').doc(orderId).get()
    const order = orderRes.data
    if (!order) return { success: false, error: '订单不存在' }

    // 只能动自己这一组里的订单
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    if (userRes.data.length === 0) return { success: false, error: '用户不存在' }
    const user = userRes.data[0]
    if (!user.coupleId || user.coupleId !== order.coupleId) {
      return { success: false, error: '这不是你的订单' }
    }

    const now = new Date()

    if (action === 'accept') {
      if (order.status !== 'pending') return { success: false, error: '订单状态不对' }
      await db.collection('orders').doc(orderId).update({
        data: { status: 'making', acceptTime: now }
      })
      return { success: true, status: 'making' }
    }

    if (action === 'finish') {
      if (order.status !== 'making') return { success: false, error: '还没接单呢' }
      await db.collection('orders').doc(orderId).update({
        data: { status: 'done', finishTime: now }
      })
      return { success: true, status: 'done' }
    }

    if (action === 'reject') {
      if (order.status !== 'pending') return { success: false, error: '订单状态不对' }
      await db.collection('orders').doc(orderId).update({
        data: { status: 'rejected', rejectReason: event.reason || '', finishTime: now }
      })
      return { success: true, status: 'rejected' }
    }

    if (action === 'cancel') {
      if (order.status !== 'pending') return { success: false, error: '已经开工了，退不了了' }
      if (order.fromOpenid !== openid) return { success: false, error: '只能取消自己下的单' }
      await db.collection('orders').doc(orderId).update({
        data: { status: 'canceled', finishTime: now }
      })
      return { success: true, status: 'canceled' }
    }

    if (action === 'rate') {
      if (order.status !== 'done') return { success: false, error: '吃完了才能评价' }
      const rating = Number(event.rating) || 0
      if (rating < 1 || rating > 5) return { success: false, error: '评分要在 1 到 5 之间' }

      await db.collection('orders').doc(orderId).update({
        data: {
          rating: rating,
          ratingComment: event.comment || '',
          ratingPhotos: event.photos || [],
          rateTime: now
        }
      })

      // 评分回流到菜品，好吃的菜以后自动排前面
      for (const item of order.items) {
        if (!item.dishId) continue
        try {
          await db.collection('dishes').doc(item.dishId).update({
            data: {
              ratingCount: db.command.inc(1),
              ratingSum: db.command.inc(rating)
            }
          })
        } catch (e) {
          // 菜被删了就算了
        }
      }

      return { success: true }
    }

    return { success: false, error: '不支持的操作：' + action }
  } catch (err) {
    console.error('更新订单失败', err)
    return { success: false, error: err.errMsg || err.message || String(err) }
  }
}
