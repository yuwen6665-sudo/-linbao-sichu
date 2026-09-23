/**
 * 云函数：把菜品外链图转存到微信云存储（重写版）
 *
 * 设计原则：
 *   - 串行一次一张，不用并发，避免内存爆掉（之前并发 8 张导致 [-3] system error）
 *   - 默认每批 25 张，反复跑直到 remaining=0
 *   - 不写死 Referer（写死会被防盗链 CDN 403）
 *   - 单张失败不中断，记录错误继续下一张
 *   - 幂等：cloud:// 开头的自动跳过
 *
 * 用法：
 *   1. 部署：右键本目录 → 上传并部署：云端安装依赖
 *   2. 云开发控制台 → 云函数 → cacheDishImages → 云端测试
 *      - 探路：{ "probe": true }  只看还有几张没转
 *      - 干活：{ "limit": 25 }    转 25 张
 *      - 反复点运行，直到 remaining: 0
 */
const cloud = require('wx-server-sdk')
const http = require('http')
const https = require('https')
const urlmod = require('url')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

const TIME_BUDGET = 50000    // 最多跑 50 秒
const FETCH_TIMEOUT = 10000   // 单张下载 10 秒超时
const DEFAULT_BATCH = 25      // 默认每批 25 张

/* 下载一张图，返回 Buffer */
function fetchBuffer(target) {
  return new Promise(function (resolve, reject) {
    const mod = target.indexOf('https:') === 0 ? https : http
    let settled = false
    const req = mod.get(target, {
      timeout: FETCH_TIMEOUT,
      headers: {
        'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
        Accept: 'image/avif,image/webp,image/*,*/*;q=0.8'
      }
    }, function (res) {
      if (settled) return
      const code = res.statusCode
      if ([301, 302, 303, 307, 308].indexOf(code) !== -1 && res.headers.location) {
        res.resume()
        settled = true
        return resolve(fetchBuffer(urlmod.resolve(target, res.headers.location)))
      }
      if (code !== 200) {
        res.resume()
        settled = true
        return reject(new Error('HTTP ' + code))
      }
      const chunks = []
      res.on('data', function (c) { chunks.push(c) })
      res.on('end', function () {
        settled = true
        resolve(Buffer.concat(chunks))
      })
      res.on('error', function (e) {
        if (!settled) { settled = true; reject(e) }
      })
    })
    req.on('timeout', function () {
      if (!settled) { settled = true; req.destroy(new Error('下载超时')) }
    })
    req.on('error', function (e) {
      if (!settled) { settled = true; reject(e) }
    })
  })
}

/* 查待转存的菜 */
async function findPending() {
  const out = []
  let skip = 0
  const PAGE = 100
  while (true) {
    const res = await db.collection('dishes')
      .where({
        coupleId: 'default',
        image: db.RegExp({ regexp: '^https?://', options: 'i' })
      })
      .field({ _id: true, dishId: true, name: true, image: true })
      .skip(skip).limit(PAGE).get()
    out.push.apply(out, res.data)
    if (res.data.length < PAGE) break
    skip += PAGE
    if (skip >= 500) break
  }
  return out
}

/* 认得的参数。出现别的键 = 大概率是控制台「Hello World」模板没改就点了运行 */
const KNOWN_PARAMS = ['probe', 'limit']

exports.main = async function (event) {
  const e = event || {}
  const started = Date.now()

  try {
    const pending = await findPending()

    /* ⚠️ 防误触（别删）：
       云开发控制台「云端测试」默认就带 { "name": "test", "data": {...} } 这段。
       用户直接点运行的话，probe 没设 → 会被当成「开始转存」，
       一上来就要串行抓几百张图，在默认 3 秒超时下**必然**报
       `Invoking task timed out after 3 seconds` —— 看着像函数坏了，
       其实只是参数没换。所以：参数里出现不认识的键时，**只探路，不干活**。 */
    const unknown = Object.keys(e).filter(function (k) { return KNOWN_PARAMS.indexOf(k) === -1 })
    if (unknown.length && e.probe !== true) {
      const cloudCnt = await db.collection('dishes').where({
        coupleId: 'default',
        image: db.RegExp({ regexp: '^cloud://', options: 'i' })
      }).count()
      return {
        success: true,
        mode: 'probe',
        pending: pending.length,
        cloudCached: cloudCnt.total,
        tip: '检测到参数里有不认识的键（' + unknown.join(', ') + '）—— ' +
          '这多半是控制台里「Hello World」模板没换就点了运行。已只做探路、没有真的开始转存。' +
          '真要转存请把参数改成 {} 或 {"probe":true}。',
        message: '还有 ' + pending.length + ' 张图没转存（已转 ' + cloudCnt.total + ' 张）'
      }
    }

    if (e.probe === true) {
      const cloudRes = await db.collection('dishes').where({
        coupleId: 'default',
        image: db.RegExp({ regexp: '^cloud://', options: 'i' })
      }).count()
      return {
        success: true,
        mode: 'probe',
        pending: pending.length,
        cloudCached: cloudRes.total,
        message: pending.length
          ? '还有 ' + pending.length + ' 张图没转存（已转 ' + cloudRes.total + ' 张）'
          : '全部转存完成，共 ' + cloudRes.total + ' 张'
      }
    }

    if (!pending.length) {
      return { success: true, done: 0, remaining: 0, message: '没有待转存的图了' }
    }

    /* limit 只做「保底默认值」，不做「硬上限」——
       以前写成 Math.min(e.limit, DEFAULT_BATCH) 会把用户明确要的张数也夹到 25，
       想一次多转几张都不行（参数填 100 实际只转 25，很难发现）。
       真正防跑飞的是下面的 TIME_BUDGET：到点就收手并报 remaining，可以接着跑。 */
    const limit = Number(e.limit) > 0 ? Number(e.limit) : DEFAULT_BATCH
    const queue = pending.slice(0, limit)

    let done = 0
    const failures = []
    let stoppedByTime = false

    for (let i = 0; i < queue.length; i++) {
      if (Date.now() - started > TIME_BUDGET) { stoppedByTime = true; break }

      const d = queue[i]
      try {
        const buf = await fetchBuffer(d.image)
        if (!buf || buf.length < 200) throw new Error('图太小（' + (buf ? buf.length : 0) + '字节）')

        const clean = String(d.image).split('?')[0]
        const extM = clean.match(/\.(jpe?g|png|gif|webp|bmp)$/i)
        const ext = extM ? '.' + extM[1].toLowerCase().replace('jpeg', 'jpg') : '.jpg'
        const cloudPath = 'dishes/' + d.dishId + ext

        const up = await cloud.uploadFile({ cloudPath, fileContent: buf })
        /* ⚠️ 四个图片字段要一起换。
           前端 db 读到的菜可能来自 image / imageUrl / imageThumb / originImage 里任意一个
           （api.js 的兜底链是 `d.image || d.imageUrl || d.originImage`），
           只换 image 的话，某条兜底路径仍会拿到 http 明文地址 → 真机照样空白。
           这一点和 initDishes 的 fixImageIds 分支保持一致。 */
        await db.collection('dishes').doc(d._id).update({
          data: {
            image: up.fileID,
            imageUrl: up.fileID,
            imageThumb: up.fileID,
            originImage: up.fileID,
            imageCachedAt: Date.now()
          }
        })
        done++
        console.log('[' + (i+1) + '/' + queue.length + '] ✓ ' + d.name)
      } catch (err) {
        failures.push({
          name: d.name,
          url: d.image,
          error: (err && err.message) || String(err)
        })
        console.log('[' + (i+1) + '/' + queue.length + '] ✗ ' + d.name + ' — ' + (err && err.message))
      }
    }

    const remaining = pending.length - done - failures.length
    return {
      success: true,
      done: done,
      failed: failures.length,
      remaining: Math.max(0, remaining),
      stoppedByTime: stoppedByTime,
      elapsedMs: Date.now() - started,
      failures: failures.slice(0, 10),
      message: '本批转 ' + done + ' 张，失败 ' + failures.length + ' 张，还剩 ' + Math.max(0, remaining) + ' 张'
    }
  } catch (err) {
    console.error('cacheDishImages 崩溃', err)
    return {
      success: false,
      error: (err && err.message) || String(err),
      tip: '直接再点一次运行接着补（幂等）'
    }
  }
}
