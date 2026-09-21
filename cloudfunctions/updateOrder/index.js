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

    /* ---- 谁有资格做哪个动作 ----
     *
     * 【2026-09-21 补】
     * 以前这里只检查「是不是这一对的人」，没检查「是不是该由他做」。
     * 也就是说：点菜的人自己也能把自己的单「接单」「做完」「拒掉」——
     * 页面上是靠 `isChef` 把按钮藏起来挡住的，但那是**前端挡**。
     *
     * 前端的角色是本地缓存，跟服务端不一致过（踩过两次）。一旦不一致，
     * 按钮冒出来 → 点一下 → 订单状态就乱了（厨神那边会莫名看到「已在制作中」），
     * 还会给自己发一条「TA 接单了」的提醒。
     *
     * 判据用订单自己的 `toOpenid` —— 下单时就记好了「这一单做给谁」，
     * 不用多查一次数据库，和下面 cancel 那句 `fromOpenid !== openid` 正好对称。
     */
    const CHEF_ONLY = { accept: 1, finish: 1, reject: 1 }
    if (CHEF_ONLY[action] && order.toOpenid && order.toOpenid !== openid) {
      return { success: false, error: '这一单是点给 TA 做的，要 TA 自己来接' }
    }

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
    const raw = err.errMsg || err.message || String(err)
    // ⚠️ 上面那句 `if (!order) return { error: '订单不存在' }` 其实**永远执行不到** ——
    //    doc().get() 取不到东西是【抛错】，不是返回空，所以会直接掉进这里，
    //    用户看到的就是 `document.get:fail document does not exist` 这种英文。
    //    换成一句人话（"订单不存在" 这个场景真的会发生：订单被删掉、或者页面拿着旧 id）。
    if (/not exist|does not exist/i.test(raw)) {
      return { success: false, error: '这个订单不在了（可能已经被删掉）' }
    }
    return { success: false, error: raw }
  }
}
