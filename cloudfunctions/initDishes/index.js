/**
 * 云函数：把 dishes.js 里的菜谱写进数据库（一键灌库）
 *
 * 为什么不用控制台「导入」：
 *   控制台导入是「新增」记录，_id 会变；而且漏一个字段（比如 coupleId）就一条都查不到 ——
 *   2026-09-20 那次「共 0 道菜」就是这么来的：200 道菜导进去了，但没有 coupleId，
 *   代码按 coupleId='default' 找菜，一条都认不出来。
 *   所以这里按 dishId 匹配：**有就更新内容，没有才新增**，_id 全程不变，字段也一定补齐。
 *
 * 怎么用：
 *   1. 部署本云函数
 *   2. 云开发控制台 → 云函数 → initDishes →「云端测试」→ 参数填 {} → 运行
 *      → { success: true, updated: 0, inserted: 235, total: 235 }
 *   3. 如果库里还留着「没 coupleId」的脏记录（导入漏字段留下的），
 *      再跑一次，参数填 { "cleanup": true }，它会把这些孤儿记录删掉
 *
 * 注意：
 *   - 只更新「内容字段」。图片、点单次数、评分这些一律不碰 —— 免得把你手动设的图覆盖掉。
 *   - 幂等：重复跑不会产生重复数据，随便跑几次都行。
 *   - 可中断续跑：万一超时了，直接再跑一次接着补（已写进去的会被 update，不会重复）。
 */

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()
const _ = db.command
const dishes = require('./dishes.js')

// 允许更新的字段白名单 —— 只够改菜谱内容，动不了别的（image / orderCount / rating 都不在里面）
const CONTENT_FIELDS = [
  'name', 'category', 'categoryOrder', 'cookTime', 'calories', 'protein', 'fat', 'carbs',
  'description', 'tasteTags', 'nutritionTags', 'ingredients', 'steps', 'tips', 'benefits',
  'emoji', 'cuisine', 'difficulty'
]

const WRITE_CHUNK = 25 // 一次并行写多少条。235 条全并行压力太大，分批稳一点

function pickContent(d) {
  const out = {}
  CONTENT_FIELDS.forEach(function (k) {
    if (d[k] !== undefined) out[k] = d[k]
  })
  return out
}

/** 分批并行执行，返回每批结果 */
async function runChunked(items, worker) {
  const results = []
  for (let i = 0; i < items.length; i += WRITE_CHUNK) {
    const slice = items.slice(i, i + WRITE_CHUNK)
    const r = await Promise.all(slice.map(worker))
    results.push(r)
  }
  return results
}

/** 找出「连 coupleId 字段都没有」的孤儿记录 —— 多半是控制台导入时漏字段留下的 */
async function findOrphans() {
  const found = []
  let skip = 0
  while (true) {
    const res = await db.collection('dishes')
      .where({ coupleId: _.exists(false) })
      .field({ _id: true, name: true })
      .skip(skip)
      .limit(100)
      .get()
    found.push.apply(found, res.data)
    if (res.data.length < 100) break
    skip += 100
    if (skip >= 1000) break // 单次最多处理 1000 条，够用了
  }
  return found
}

exports.main = async (event, context) => {
  const e = event || {}
  const report = {}

  try {
    /* ---------- 可选：清掉没 coupleId 的孤儿记录 ---------- */
    if (e.cleanup === true) {
      const orphans = await findOrphans()
      report.orphanFound = orphans.length
      report.orphanSample = orphans.slice(0, 5).map(function (o) { return o.name || '(没名字)' })

      let removed = 0
      await runChunked(orphans, async function (o) {
        try {
          await db.collection('dishes').doc(o._id).remove()
          removed += 1
        } catch (err) {
          // 已经不在了就算了
          console.error('删孤儿记录失败', o._id, err.errMsg || err.message)
        }
        return true
      })
      report.orphanRemoved = removed
    }

    /* ---------- 1. 先把现有的公共菜库拉出来（云函数单次最多 100 条，所以翻页） ---------- */
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
    existing.forEach(function (e2) { idMap[e2.dishId] = e2._id })

    /* ---------- 可选：只更新指定 dishId 的图（换图专用，2026-09-23 加） ----------
     *
     * 为什么需要它：正常同步走 CONTENT_FIELDS 白名单，而 image 故意不在里面 ——
     *   因为前 200 道的图已经被 cacheDishImages 转存成 cloud:// 了，
     *   白名单一旦放开，会把它们打回 http 外链，真机上又变成一片空白。
     *   所以「换图」只能点名更新：只动这几道，其余一道都不碰。
     *
     * 用法：控制台调 initDishes，参数 {"fixImageIds":[201,202,...,224]}
     */
    if (Array.isArray(e.fixImageIds) && e.fixImageIds.length) {
      const ids = e.fixImageIds.map(function (x) { return Number(x) })
      const targets = dishes.filter(function (d) { return ids.indexOf(d.dishId) > -1 })
      const notInSource = ids.filter(function (x) {
        return !dishes.some(function (d) { return d.dishId === x })
      })

      const okIds = []
      const notInDb = []
      await runChunked(targets, async function (d) {
        const _id = idMap[d.dishId]
        if (!_id) { notInDb.push(d.dishId); return true }
        await db.collection('dishes').doc(_id).update({
          data: {
            image: d.image || '',
            imageUrl: d.image || '',
            imageThumb: d.image || '',
            originImage: d.image || ''
          }
        })
        okIds.push(d.dishId)
        return true
      })

      return {
        success: true,
        mode: 'fixImage',
        asked: ids.length,
        updated: okIds.length,
        updatedIds: okIds.sort(function (a, b) { return a - b }),
        notInDb: notInDb,
        notInSource: notInSource,
        message: '只更新图：改了 ' + okIds.length + ' 道'
          + (notInDb.length ? ('；' + notInDb.length + ' 道数据库里还没有，先跑一次完整同步') : '')
          + (notInSource.length ? ('；' + notInSource.length + ' 个编号菜库里没有') : '')
      }
    }

    /* ---------- 2. 分成两堆：要更新的、要新增的 ---------- */
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
          image: d.image || '',
          imageUrl: d.image || '',
          imageThumb: d.image || '',
          originImage: d.image || '',
          orderCount: 0,
          ratingSum: 0,
          ratingCount: 0,
          hotScore: 0,
          createdAt: Date.now()
        }, content))
      }
    })

    /* ---------- 3. 分批并行写（235 条全并行会被限流，分批稳） ---------- */
    let updated = 0
    let inserted = 0

    await runChunked(toUpdate, async function (t) {
      await db.collection('dishes').doc(t.id).update({ data: t.data })
      updated += 1
      return true
    })

    await runChunked(toAdd, async function (d) {
      await db.collection('dishes').add({ data: d })
      inserted += 1
      return true
    })

    return Object.assign({
      success: true,
      total: dishes.length,
      existedBefore: existing.length,
      updated: updated,
      inserted: inserted,
      message: '菜库共 ' + dishes.length + ' 道，本次新增 ' + inserted + ' 道、更新 ' + updated + ' 道'
    }, report)
  } catch (err) {
    console.error('同步菜品失败', err)
    return Object.assign({
      success: false,
      error: err.errMsg || err.message || String(err),
      tip: '超时了就再点一次「运行」，本函数是幂等的，不会写重复数据'
    }, report)
  }
}
