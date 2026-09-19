// 云函数：下单
//
// 这一步是整个产品的命门：
//   点菜的人提交 → 数据真正落到 orders 集合 → 做饭的人刷新就能看到
//
// items: [{ dishId, name, count, calories, image }]
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command

function generateOrderNo() {
  const date = new Date()
  const pad2 = function (n) { return n < 10 ? '0' + n : '' + n }
  const stamp = '' + date.getFullYear() + pad2(date.getMonth() + 1) + pad2(date.getDate())
  return stamp + String(Math.floor(Math.random() * 10000)).padStart(4, '0')
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const items = event.items || []

  if (!openid) return { success: false, error: '拿不到用户身份' }
  if (items.length === 0) return { success: false, error: '还没点菜呢' }

  try {
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    if (userRes.data.length === 0) return { success: false, error: '用户不存在' }

    const user = userRes.data[0]
    if (!user.coupleId) {
      return { success: false, error: '先绑定对象，才能把订单发过去' }
    }

    const coupleRes = await db.collection('couples').doc(user.coupleId).get()
    const couple = coupleRes.data

    if (couple.members.length < 2) {
      return { success: false, error: '对方还没加入，把邀请码发给 TA' }
    }

    // 订单发给做饭的那个人
    const chef = couple.members.find(function (m) { return m.role === 'chef' })
    const toOpenid = chef ? chef.openid : couple.members[0].openid

    let totalCalories = 0
    items.forEach(function (item) {
      totalCalories += (Number(item.calories) || 0) * (Number(item.count) || 1)
    })

    const orderData = {
      orderNo: generateOrderNo(),
      coupleId: user.coupleId,
      fromOpenid: openid,
      fromName: user.nickName || '',
      toOpenid: toOpenid,
      items: items.map(function (item) {
        return {
          dishId: item.dishId || '',
          name: item.name || '',
          count: Number(item.count) || 1,
          calories: Number(item.calories) || 0,
          image: item.image || ''
        }
      }),
      remark: event.remark || '',
      totalCalories: totalCalories,
      status: 'pending',           // pending → making → done
      rating: 0,
      ratingComment: '',
      ratingPhotos: [],
      createTime: new Date(),
      acceptTime: null,
      finishTime: null
    }

    const addRes = await db.collection('orders').add({ data: orderData })

    // 每道菜的点单次数 +1，用来算「常吃的菜」
    //
    // 【2026-09-19 改】原来是 for + await 串行，点 3 道菜就要等 3 个来回，
    // 体感就是「提交完卡半天」。改成并行发，一次性发完一起等。
    await Promise.all(items.map(function (item) {
      if (!item.dishId) return null
      return db.collection('dishes').doc(item.dishId)
        .update({ data: { orderCount: _.inc(1) } })
        .catch(function () { return null })   // 菜可能被删了，不影响下单结果
    }))

    return {
      success: true,
      orderId: addRes._id,
      orderNo: orderData.orderNo,
      toOpenid: toOpenid
    }
  } catch (err) {
    console.error('下单失败', err)
    return { success: false, error: err.errMsg || err.message || String(err) }
  }
}
