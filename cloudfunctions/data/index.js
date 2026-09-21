// 云函数：所有「读数据」都走这里
//
// 为什么这么做：数据库权限设成了「所有用户不可读写」，前端直接读会被拒。
// 云函数不受这个限制，所以由它代读，顺便做一层校验（只能读自己这一对的）。
//
// action:
//   getDishes      取菜品列表（内置公共菜库 + 你们自己加的）—— 只带列表字段，不带做法
//   getDishDetail  取单道菜的完整内容（详情页用，含食材/步骤/小窍门）
//   getDishesByIds 按 _id 批量取（订单页拿食材用）
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
const MAX = 400 // 公共菜库上限（云函数单次最多 100 条，所以下面按 100 翻页）

// 列表页（菜单 / 首页灵感卡 / 我的页统计）需要的字段。
// 为什么只给这些：235 道菜全量返回是 555KB，只带这些是 132KB ——
// 一次省 400 多 KB 流量，手机上菜单打开也快得多。
// 详情页要看做法，它自己走 getDishDetail 单独取一道。
const LIST_FIELDS = {
  dishId: true, name: true, category: true, categoryOrder: true,
  cookTime: true, calories: true, description: true, tasteTags: true,
  image: true, imageUrl: true, emoji: true, cuisine: true, difficulty: true,
  isBuiltin: true, isAvailable: true, orderCount: true, coupleId: true
}

const PAGE = 100 // 云函数端单次 get 的上限就是 100，写大写小都一样

/* ------------------------------------------------------------------ *
 * 云存储图片：直连 cloud:// ，还是换临时链接？
 *
 * 【结论：免费套餐只能走「换临时链接」，已实测】
 *   2026-09-21 用户去控制台试了：点「所有用户可读，仅创建者可读写」会弹
 *   「当前套餐处于免费期，无法执行此操作，请升级至付费版使用」。
 *   所以免费版只能保持「仅创建者可读写」，`cloud://` 前端读不到 →
 *   必须由**云函数**（管理员身份，不受该限制）批量换成临时 https 链接。
 *   （头像一直是这么做的：在 bindPartner 里换，真机验证过可行。）
 *
 *   为什么不留着「直连」那条路：不是不能，是**打不通**。
 *   万一以后升级了付费版、或换了别的后端，把下面这个开关改成 false
 *   就能切直连 —— 那时连下面的换链接代码都不跑，菜单能再快 1~2 秒。
 *
 * 【当年为什么要换成云存储，别删这段】
 *   菜谱图原本是豆果网的 `http://` 明文外链：模拟器被「不校验合法域名」放行所以看着正常，
 *   真机强制 HTTPS 直接拦掉且**静默失败** → 「模拟器有图、真机一大块空白」。
 *   改 https 也不行（那张证书域名对不上，SEC_E_WRONG_PRINCIPAL），
 *   所以才用 cacheDishImages 云函数把图转存进自己的云存储。
 * ------------------------------------------------------------------ */

const CONVERT_TO_TEMP_URL = true // ← 免费套餐必须为 true。升级付费版后可改 false 走直连。

const TEMP_TTL = 100 * 60 * 1000
const TEMP_BATCH = 50 // getTempFileURL 单次最多 50 个
const TEMP_CACHE = { map: {}, expireAt: 0 }

/**
 * 把结果里的 cloud:// 换成临时 https 链接。
 *
 * fields 支持两种字段形态：
 *   · 平铺字符串：`getDishes` 的 image / imageUrl
 *   · 字符串数组：`getPosts` 的 images、`getOrderDetail` 的 ratingPhotos
 *
 * ⚠️ 数组那一条是 2026-09-20 补的：以前只认平铺字符串，日志照片和订单晒图
 *    **根本没被处理**。那两张图是**用户自己**上传的，权限「仅创建者可读写」→
 *    本人看得到、对象看不到 —— 情侣应用里这是硬伤，但一直没人发现（没撞上）。
 *    现在两个字段都接上了，两边都能看到。
 */
async function resolveCloudUrls(items, fields) {
  if (!CONVERT_TO_TEMP_URL) return // 权限已公开 → 直连，不用换
  if (!items || !items.length) return

  const now = Date.now()
  if (now > TEMP_CACHE.expireAt) {
    TEMP_CACHE.map = {}
    TEMP_CACHE.expireAt = now + TEMP_TTL
  }

  // 1. 收集还没换过的 cloud:// （去重：image 与 imageUrl 常常是同一个 fileID）
  const need = []
  const seen = {}
  function collect(v) {
    if (typeof v === 'string') {
      if (v.indexOf('cloud://') === 0 && !TEMP_CACHE.map[v] && !seen[v]) {
        seen[v] = true
        need.push(v)
      }
    } else if (Array.isArray(v)) {
      v.forEach(collect)
    }
  }
  items.forEach(function (it) {
    if (!it) return
    fields.forEach(function (f) { collect(it[f]) })
  })

  // 2. 分批换 —— ⚠️ 必须【并行】。
  //    2026-09-20 踩到：原来是串行 for-await，200 张图要 4 个来回，
  //    加上冷启动直接顶爆云函数默认的 3 秒超时 → 前端看到「取菜失败」+「共 0 道菜」。
  //    改成一次性并发发出去，只要最慢那一批的时间。
  const batches = []
  for (let i = 0; i < need.length; i += TEMP_BATCH) {
    batches.push(need.slice(i, i + TEMP_BATCH))
  }
  const results = await Promise.all(
    batches.map(function (slice) {
      return cloud.getTempFileURL({ fileList: slice }).catch(function (err) {
        // 单批失败只丢这一批，别的照样换。**绝不能因为换链接把整个读请求搞挂**
        console.error('换临时链接失败', err && (err.errMsg || err.message))
        return null
      })
    })
  )
  results.forEach(function (res) {
    if (!res) return
    ;(res.fileList || []).forEach(function (f) {
      if (f && f.fileID && f.tempFileURL) TEMP_CACHE.map[f.fileID] = f.tempFileURL
    })
  })

  // 3. 就地替换。原 fileID 留一份在 imageFileID 上 ——
  //    「编辑菜品」页保存时要写回它，**不能把临时链接存进数据库**（2 小时后就失效了）
  items.forEach(function (it) {
    if (!it) return
    fields.forEach(function (f) {
      const v = it[f]
      if (typeof v === 'string' && TEMP_CACHE.map[v]) {
        if (f === 'image') it.imageFileID = v
        it[f] = TEMP_CACHE.map[v]
      } else if (Array.isArray(v)) {
        // 日志的 images / 订单的 ratingPhotos：数组里逐个换，换不到的保留原值
        it[f] = v.map(function (x) { return TEMP_CACHE.map[x] || x })
      }
    })
  })
}

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
      // 以前这里是 limit(20) + MAX=100，菜库一超过 100 道就再也刷不出来后面的 ——
      // 2026-09-20 菜库加到 235 道，一并修掉。
      let builtin = []
      let skip = 0
      while (true) {
        const res = await db.collection('dishes')
          .where({ coupleId: 'default' })
          .field(LIST_FIELDS)
          .orderBy('dishId', 'asc')
          .skip(skip)
          .limit(PAGE)
          .get()
        builtin = builtin.concat(res.data)
        if (res.data.length < PAGE) break
        skip += PAGE
        if (skip >= MAX) break
      }

      // 你们自己加的菜
      let mine = []
      if (coupleId) {
        const mineRes = await db.collection('dishes')
          .where({ coupleId: coupleId })
          .field(LIST_FIELDS)
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
      // 菜谱图统一换成临时链接（模拟器能看 http、真机不行，原因见文件上方注释）
      await resolveCloudUrls(all, ['image', 'imageUrl'])
      return { success: true, dishes: all, truncated: builtin.length >= MAX }
    }

    // 单道菜的完整内容（详情页用）。
    // 列表接口为了省流量把做法裁掉了，所以详情页必须单独来取这一道。
    if (action === 'getDishDetail') {
      const id = event.id
      if (!id) return { success: false, error: '缺菜品 ID' }

      let dish = null

      // 1) 先当云数据库 _id 找（菜单页传过来的就是 _id）
      try {
        const res = await db.collection('dishes').doc(String(id)).get()
        dish = res.data || null
      } catch (err) {
        dish = null // 不存在会 reject，这是正常的，继续往下试
      }

      // 2) 再当数字 dishId 找（老的链接可能传的是「第几道菜」）
      if (!dish && !isNaN(Number(id))) {
        const byId = await db.collection('dishes')
          .where({ dishId: Number(id) })
          .limit(1)
          .get()
        dish = byId.data[0] || null
      }

      if (!dish) return { success: false, error: '找不到这道菜' }

      // 公共菜库人人可看；自己家的菜只有本对能看
      if (dish.coupleId !== 'default' && dish.coupleId !== coupleId) {
        return { success: false, error: '看不到这道菜' }
      }

      // 详情页顶部那张大图，同样要换成临时链接，否则真机上是块空白
      await resolveCloudUrls([dish], ['image', 'imageUrl'])

      return { success: true, dish: dish }
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
      // 订单里那道小缩略图也走同一套换链接
      await resolveCloudUrls(res.data, ['image', 'imageUrl'])
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
      // 评价晒的照片是**用户自己上传**的（数组），同样要过这一道
      await resolveCloudUrls([res.data], ['ratingPhotos'])
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
      // ⚠️ 这一行是 2026-09-20 补的：日志照片是**自己**上传的、权限「仅创建者可读写」，
      //    不换链接的话**本人看得到、对象看不到** —— 情侣应用里这是硬伤。
      //    换链接是在**云函数**里做的（管理员身份，不受那个权限限制），所以两边都能看到。
      await resolveCloudUrls(res.data, ['images'])
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
