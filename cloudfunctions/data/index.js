// 云函数：所有「读数据」都走这里
//
// 为什么这么做：数据库权限设成了「所有用户不可读写」，前端直接读会被拒。
// 云函数不受这个限制，所以由它代读，顺便做一层校验（只能读自己这一对的）。
//
// action:
//   getDishes      取菜品（内置公共菜库 + 你们自己加的）
//   addDish        加一道菜
//   removeDish     删一道菜
//   getOrders      取订单列表
//   getOrderDetail 取单个订单
//   getPosts       取恋爱日志
//   getMoods       取某个月的心情

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const MAX = 100 // 云函数里一次最多取 100 条

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action

  if (!openid) return { success: false, error: '拿不到用户身份' }

  try {
    // 查一下这个人属于哪一对（还没建号也不影响看公共菜库）
    let user = null
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    if (userRes.data.length > 0) user = userRes.data[0]
    const coupleId = user && user.coupleId ? user.coupleId : null

    /* ---------- 菜品 ---------- */

    if (action === 'getDishes') {
      const category = event.category

      // 内置公共菜库（coupleId = 'default'）
      let builtin = []
      let skip = 0
      while (true) {
        const res = await db.collection('dishes')
          .where({ coupleId: 'default' })
          .orderBy('dishId', 'asc')
          .skip(skip)
          .limit(20)
          .get()
        builtin = builtin.concat(res.data)
        if (res.data.length < 20) break
        skip += 20
        if (skip >= MAX) break
      }

      // 你们自己加的菜
      let mine = []
      if (coupleId) {
        const mineRes = await db.collection('dishes')
          .where({ coupleId: coupleId })
          .orderBy('createTime', 'desc')
          .limit(50)
          .get()
        mine = mineRes.data
      }

      let all = builtin.concat(mine)
      // 分类过滤放在云函数里做，前端拿到的就是要显示的
      if (category && category !== '全部') {
        all = all.filter(function (d) { return d.category === category })
      }
      return { success: true, dishes: all }
    }

    // 按 _id 批量取菜。
    // 订单页要用：拿到这一单涉及的几道菜的食材，别把整个菜库都拉下来。
    if (action === 'getDishesByIds') {
      const ids = (event.ids || []).filter(function (id) { return !!id })
      if (ids.length === 0) return { success: true, dishes: [] }

      const res = await db.collection('dishes')
        .where({ _id: _.in(ids) })
        .limit(100)
        .get()
      return { success: true, dishes: res.data }
    }

    if (action === 'addDish') {
      if (!coupleId) return { success: false, error: '先绑定对象才能加菜哦' }

      const name = (event.name || '').trim()
      if (!name) return { success: false, error: '菜名不能为空' }

      // 分类顺序要和前端 api.js 的 CATEGORY_ORDER 保持一致，别写岔
      const ORDER = ['凉菜', '主食', '荤菜', '汤品', '素菜', '甜品', '饮品']
      const addRes = await db.collection('dishes').add({
        data: {
          name: name,
          category: event.category || '荤菜',
          categoryOrder: ORDER.indexOf(event.category || '荤菜'),
          description: event.description || '',
          image: event.image || '',
          imageUrl: event.imageUrl || event.image || '',
          tasteTags: event.tasteTags || [],
          calories: Number(event.calories) || 0,
          cookTime: event.cookTime || '',
          ingredients: event.ingredients || [],
          steps: event.steps || [],
          benefits: event.benefits || [],
          coupleId: coupleId,
          isBuiltin: false,
          isAvailable: true,
          orderCount: 0,
          ratingSum: 0,
          ratingCount: 0,
          createTime: new Date()
        }
      })
      return { success: true, id: addRes._id }
    }

    if (action === 'removeDish') {
      if (!event.id) return { success: false, error: '缺菜品 ID' }
      const dish = await db.collection('dishes').doc(event.id).get()
      if (!dish.data) return { success: false, error: '菜不存在' }
      // 内置菜不许删
      if (dish.data.isBuiltin || dish.data.coupleId === 'default') {
        return { success: false, error: '内置菜删不掉哦' }
      }
      if (!coupleId || dish.data.coupleId !== coupleId) {
        return { success: false, error: '只能删自己家的菜' }
      }
      await db.collection('dishes').doc(event.id).remove()
      return { success: true }
    }

    /* ---------- 订单 ---------- */

    if (action === 'getOrders') {
      if (!coupleId) return { success: true, orders: [] }
      const res = await db.collection('orders')
        .where({ coupleId: coupleId })
        .orderBy('createTime', 'desc')
        .limit(50)
        .get()
      return { success: true, orders: res.data }
    }

    if (action === 'getOrderDetail') {
      if (!event.id) return { success: false, error: '缺订单 ID' }
      const res = await db.collection('orders').doc(event.id).get()
      if (!res.data) return { success: false, error: '订单不存在' }
      // 不是自己这一对的订单，不给他看
      if (!coupleId || res.data.coupleId !== coupleId) {
        return { success: false, error: '看不到这个订单' }
      }
      return { success: true, order: res.data }
    }

    /* ---------- 恋爱日志 ---------- */

    if (action === 'getPosts') {
      if (!coupleId) return { success: true, posts: [] }
      const limit = Math.min(Number(event.limit) || 30, MAX)
      const res = await db.collection('posts')
        .where({ coupleId: coupleId })
        .orderBy('createTime', 'desc')
        .limit(limit)
        .get()
      return { success: true, posts: res.data }
    }

    /* ---------- 心情日历 ---------- */

    if (action === 'getMoods') {
      if (!coupleId) return { success: true, moods: [] }
      const month = event.month // '2026-09'
      if (!month) return { success: false, error: '缺月份' }
      const res = await db.collection('moods')
        .where({ coupleId: coupleId, month: month })
        .limit(MAX)
        .get()
      return { success: true, moods: res.data }
    }

    return { success: false, error: '不支持的操作：' + action }
  } catch (err) {
    console.error('data 云函数出错', action, err)
    return { success: false, error: err.errMsg || err.message || String(err) }
  }
}
