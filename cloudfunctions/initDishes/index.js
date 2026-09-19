/**
 * 云函数：把 dishes.js 里的菜谱写进数据库
 *
 * 为什么不用控制台「导入」：
 *   控制台导入是「新增」记录，_id 会变。而订单里存的是菜品 _id ——
 *   一导，老订单就找不到对应的菜、做法也就查不出来了。
 *   所以这里按 dishId 匹配：**有就更新内容，没有才新增**，_id 全程不变。
 *
 * 怎么用：
 *   1. 开发者工具左边右键本文件夹 →「上传并部署（云端安装依赖）」
 *   2. 云开发控制台 → 云函数 → initDishes →「云端测试」→ 参数填 {} → 运行
 *   3. 看返回：{ success: true, updated: 36, inserted: 0 }
 *
 * 注意：只更新「内容字段」。图片、点单次数、评分这些一律不碰 ——
 * 免得把你手动设的图和历史统计覆盖掉。
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const dishes = require('./dishes.js')

// 允许更新的字段白名单 —— 只够改菜谱内容，动不了别的
const CONTENT_FIELDS = [
  'name', 'category', 'cookTime', 'calories', 'protein', 'fat', 'carbs',
  'description', 'tasteTags', 'ingredients', 'steps', 'tips', 'benefits'
]

function pickContent(d) {
  const out = {}
  CONTENT_FIELDS.forEach(function (k) {
    if (d[k] !== undefined) out[k] = d[k]
  })
  return out
}

exports.main = async (event, context) => {
  try {
    /* 1. 先把现有的公共菜库拉出来（云函数单次最多 100 条，所以翻页） */
    let existing = []
    let skip = 0
    while (true) {
      const res = await db.collection('dishes')
        .where({ coupleId: 'default' })
        .field({ _id: true, dishId: true })
        .skip(skip)
        .limit(100)
        .get()
      existing = existing.concat(res.data)
      if (res.data.length < 100) break
      skip += 100
      if (skip >= 1000) break
    }

    const idMap = {}
    existing.forEach(function (e) { idMap[e.dishId] = e._id })

    /* 2. 分成两堆：要更新的、要新增的 */
    const toUpdate = []
    const toAdd = []

    dishes.forEach(function (d) {
      const content = pickContent(d)
      if (idMap[d.dishId]) {
        toUpdate.push({ id: idMap[d.dishId], data: content })
      } else {
        toAdd.push(Object.assign({
          dishId: d.dishId,
          coupleId: 'default',
          isBuiltin: true,
          isAvailable: true,
          image: '',
          imageThumb: '',
          orderCount: 0,
          ratingSum: 0,
          ratingCount: 0,
          hotScore: 0,
          createdAt: Date.now()
        }, content))
      }
    })

    /* 3. 并行写。串行的话 36 条要等十几秒，容易超时 */
    await Promise.all(toUpdate.map(function (t) {
      return db.collection('dishes').doc(t.id).update({ data: t.data })
    }))

    await Promise.all(toAdd.map(function (d) {
      return db.collection('dishes').add({ data: d })
    }))

    return {
      success: true,
      updated: toUpdate.length,
      inserted: toAdd.length,
      total: dishes.length
    }
  } catch (err) {
    console.error('同步菜品失败', err)
    return { success: false, error: err.errMsg || err.message || String(err) }
  }
}
