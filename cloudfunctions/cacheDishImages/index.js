/**
 * 云函数：把菜谱里的「外链图」转存到自己的云存储
 *
 * 为什么必须做这件事（2026-09-20 查明）：
 *   原来 200 道菜的图都是 http://cp1.douguo.net/...（明文）。
 *   开发者工具里勾了「不校验合法域名 / TLS / HTTPS 证书」，所以**模拟器看着正常**；
 *   但小程序**真机强制 HTTPS**，http 明文图片会被内核直接拦掉，而且**静默失败**
 *   （连报错都不弹）—— 表现就是「模拟器有图、真机一大块空白」。
 *
 *   想直接改成 https 也不行：那张证书的域名和 cp1.douguo.net 对不上
 *   （curl 报 SEC_E_WRONG_PRINCIPAL / 目标主要名称不正确）。豆果主站 www.douguo.com
 *   的 https 是好的，就图床坏。
 *
 *   所以唯一稳的路：把图**抓下来放进自己的云存储**，前端用 cloud:// 显示。
 *   （头像早就是这么做的，真机验证过可行。）
 *
 * 怎么用：
 *   1. 部署本云函数（右键 initDishes 旁边这个目录 →「上传并部署：云端安装依赖」）
 *   2. 云开发控制台 → 云函数 → cacheDishImages →「云端测试」
 *      · 先探路：参数填 { "probe": true }  → 只看「还有多少张没转」，不干活
 *      · 再干活：参数填 {}                → 一把梭
 *      · 小样试：参数填 { "limit": 5 }     → 只转 5 张，确认能成
 *   3. 反复点「运行」直到返回的 remaining 变成 0（每次约 40 秒，一般 2~4 次）
 *
 * 注意：
 *   - **幂等**：只挑 `image` 字段以 http 开头的记录，转过的（cloud://）自动跳过。
 *     跑到一半超时了，直接再点一次运行接着补。
 *   - 单张失败**不影响其它**：会把失败的 dishId / 原网址 / 错误原因带回来。
 *   - 只改图片相关字段，菜名做法统计一律不碰。
 */

const cloud = require('wx-server-sdk')
const http = require('http')
const https = require('https')
const urlmod = require('url')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

/* ------------------------------------------------------------------ *
 * 三个可调参数
 * ------------------------------------------------------------------ */

// 单次最多干多久就收手。云函数硬上限 60 秒，留 15 秒收尾写回报
const TIME_BUDGET = 45000

// 同一时刻并发处理几张。8 张实测够快又不至于把云存储打限流
const CONCURRENCY = 8

// 下载单张的超时
const FETCH_TIMEOUT = 15000

// 跟太多次跳转就放弃，防止死循环
const MAX_REDIRECT = 3

/* ------------------------------------------------------------------ *
 * 下载一张图，返回 Buffer
 * ------------------------------------------------------------------ */

function fetchBuffer(target, depth) {
  depth = depth || 0
  return new Promise(function (resolve, reject) {
    const mod = target.indexOf('https:') === 0 ? https : http
    let req
    try {
      req = mod.get(
        target,
        {
          timeout: FETCH_TIMEOUT,
          headers: {
            // 带个正常 UA / Referer：有些图床对空 UA 会拒绝
            'User-Agent':
              'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1',
            Referer: 'https://www.douguo.com/',
            Accept: 'image/avif,image/webp,image/*,*/*;q=0.8'
          }
        },
        function (res) {
          const code = res.statusCode
          if ([301, 302, 303, 307, 308].indexOf(code) !== -1 && res.headers.location) {
            res.resume()
            if (depth >= MAX_REDIRECT) {
              return reject(new Error('跳转次数过多'))
            }
            return resolve(fetchBuffer(urlmod.resolve(target, res.headers.location), depth + 1))
          }
          if (code !== 200) {
            res.resume()
            return reject(new Error('HTTP ' + code))
          }
          const chunks = []
          res.on('data', function (c) { chunks.push(c) })
          res.on('end', function () { resolve(Buffer.concat(chunks)) })
          res.on('error', reject)
        }
      )
    } catch (err) {
      return reject(err)
    }
    req.on('timeout', function () { req.destroy(new Error('下载超时')) })
    req.on('error', reject)
  })
}

/* ------------------------------------------------------------------ *
 * 查「还没转存」的菜（按 coupleId + image 以 http 开头）
 * ------------------------------------------------------------------ */

async function findPending() {
  const out = []
  let skip = 0
  const PAGE = 100
  while (true) {
    const res = await db
      .collection('dishes')
      .where({
        coupleId: 'default',
        image: db.RegExp({ regexp: '^https?://', options: 'i' })
      })
      .field({ _id: true, dishId: true, name: true, image: true })
      .skip(skip)
      .limit(PAGE)
      .get()
    out.push.apply(out, res.data)
    if (res.data.length < PAGE) break
    skip += PAGE
    if (skip >= 1000) break // 单次最多看 1000 条，够用
  }
  return out
}

/* ------------------------------------------------------------------ *
 * 数一下「已经在自己云存储里」的菜有几道 —— 用来给用户自证：
 * 「你说转好了，怎么证明？」不用猜，探路模式顺带报这个数。
 * ------------------------------------------------------------------ */

async function countCloud() {
  let n = 0
  let skip = 0
  const PAGE = 100
  while (true) {
    const res = await db
      .collection('dishes')
      .where({
        coupleId: 'default',
        image: db.RegExp({ regexp: '^cloud://', options: 'i' })
      })
      .field({ _id: true })
      .skip(skip)
      .limit(PAGE)
      .get()
    n += res.data.length
    if (res.data.length < PAGE) break
    skip += PAGE
    if (skip >= 1000) break
  }
  return n
}

/* ------------------------------------------------------------------ *
 * 主入口
 * ------------------------------------------------------------------ */

// 这个函数只认这两个参数。别的键一律当「不认识」。
const KNOWN_PARAMS = ['probe', 'limit']

exports.main = async function (event) {
  const e = event || {}
  const started = Date.now()

  /* ⚠️ 防误触：控制台「云端测试」默认会带一段模板参数 ——
   *     { "name": "test", "data": { "key": "value", "number": 123 } }
   *   用户直接点绿色「运行测试」的话，probe 没设，就会被当成「开始转存」，
   *   一上来跑 200 张，在默认 3 秒超时下必然报
   *   「Invoking task timed out after 3 seconds」—— 看着像函数坏了，其实是参数没换。
   *   所以：**参数里出现我不认识的键，就只报数、不动手**，并告诉用户怎么填。
   */
  const unknownKeys = Object.keys(e).filter(function (k) {
    return KNOWN_PARAMS.indexOf(k) === -1
  })
  const looksLikeConsoleTemplate = unknownKeys.length > 0

  try {
    const pending = await findPending()

    /* 只探路：告诉你还有多少张要转，不动数据 */
    if (e.probe === true || looksLikeConsoleTemplate) {
      const cloudCached = await countCloud()
      return {
        success: true,
        mode: 'probe',
        pending: pending.length,      // 还是 http 外链、等着转的
        cloudCached: cloudCached,     // 已经在你自己云存储里的 ← 用这个自证「转存成没成」
        sample: pending.slice(0, 5).map(function (d) { return { name: d.name, image: d.image } }),
        message: pending.length
          ? '还有 ' + pending.length + ' 张图没转存（已在云存储的 ' + cloudCached + ' 张）。参数填 {} 开始转。'
          : '没有待转的了。云存储里已有 ' + cloudCached + ' 张菜品图。',
        tip: looksLikeConsoleTemplate
          ? '⚠️ 参数里有我不认识的东西（' + unknownKeys.join('、') + '），所以我只报数、没动手。' +
            '你现在用的应该是控制台默认的 Hello World 模板 —— 请把参数框里全部内容删掉，换成 {}（开始转存）或 { "probe": true }（只看数）。'
          : undefined
      }
    }

    if (!pending.length) {
      return {
        success: true,
        totalPending: 0,
        done: 0,
        failed: 0,
        remaining: 0,
        message: '全部转存完了，没有需要处理的'
      }
    }

    const limit = Number(e.limit) > 0 ? Number(e.limit) : 0
    const queue = limit ? pending.slice(0, limit) : pending.slice()

    let done = 0
    const failures = []
    let stoppedByTime = false

    async function handleOne(d) {
      const src = d.image
      const buf = await fetchBuffer(src, 0)
      if (!buf || buf.length < 100) {
        throw new Error('下载到空内容（' + (buf ? buf.length : 0) + ' 字节）')
      }

      const clean = String(src).split('?')[0]
      const extMatch = clean.match(/\.(jpe?g|png|gif|webp|bmp)$/i)
      const ext = extMatch ? '.' + extMatch[1].toLowerCase().replace('jpeg', 'jpg') : '.jpg'

      // 路径带 dishId，方便以后排查；豆果的图是公开菜谱图，无所谓保密
      const cloudPath = 'dishes/' + d.dishId + ext
      const up = await cloud.uploadFile({ cloudPath: cloudPath, fileContent: buf })

      await db.collection('dishes').doc(d._id).update({
        data: {
          // 前端 <image src> 直接用 cloud:// 就能显示（同环境），不用再换临时链接
          image: up.fileID,
          imageUrl: up.fileID,
          imageThumb: up.fileID,
          originImage: up.fileID,
          imageCachedAt: Date.now()
        }
      })
      return up.fileID
    }

    for (let i = 0; i < queue.length; i += CONCURRENCY) {
      if (Date.now() - started > TIME_BUDGET) {
        stoppedByTime = true
        break
      }
      const wave = queue.slice(i, i + CONCURRENCY)
      const results = await Promise.all(
        wave.map(function (d) {
          return handleOne(d).then(
            function () { return 'ok' },
            function (err) {
              return {
                dishId: d.dishId,
                name: d.name,
                url: d.image,
                error: (err && (err.message || err.errMsg)) || String(err)
              }
            }
          )
        })
      )
      results.forEach(function (r) {
        if (r === 'ok') done += 1
        else failures.push(r)
      })
    }

    const remaining = pending.length - done - failures.length

    return {
      success: true,
      totalPending: pending.length,
      done: done,
      failed: failures.length,
      remaining: remaining,
      failureSample: failures.slice(0, 8),
      stoppedByTime: stoppedByTime,
      elapsedMs: Date.now() - started,
      message: remaining > 0
        ? '本次转存 ' + done + ' 张，还剩 ' + remaining + ' 张 —— 再点一次「运行」接着跑'
        : '全部转存完成，共 ' + done + ' 张' + (failures.length ? '，' + failures.length + ' 张失败（见 failureSample）' : '')
    }
  } catch (err) {
    console.error('转存菜品图失败', err)
    return {
      success: false,
      error: (err && (err.errMsg || err.message)) || String(err),
      tip: '本函数是幂等的，直接再点一次「运行」接着补就行'
    }
  }
}
