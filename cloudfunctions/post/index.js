// 云函数：恋爱日志 + 心情日历
//
// action:
//   add     写一条日志
//   remove  删掉自己写的
//   like    给对方点赞
//   setMood 标记某天的心情（同一天重复设置会覆盖）

const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const action = event.action

  if (!openid) return { success: false, error: '拿不到用户身份' }

  try {
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    if (userRes.data.length === 0) return { success: false, error: '用户不存在' }
    const user = userRes.data[0]

    if (!user.coupleId) {
      return { success: false, error: '先绑定对象，日记是两个人一起写的' }
    }
    const coupleId = user.coupleId

    /* ---------- 写日志 ---------- */
    if (action === 'add') {
      const content = (event.content || '').trim()
      const images = event.images || []
      if (!content && images.length === 0) {
        return { success: false, error: '写点什么或者发张图吧' }
      }
      if (content.length > 500) {
        return { success: false, error: '太长啦，500 字以内' }
      }

      const addRes = await db.collection('posts').add({
        data: {
          coupleId: coupleId,
          openid: openid,
          nickName: user.nickName || '',
          avatarUrl: user.avatarUrl || '',
          content: content,
          images: images,
          mood: event.mood || '',
          likes: [],             // 存点过赞的 openid，防止重复点
          createTime: new Date()
        }
      })
      return { success: true, postId: addRes._id }
    }

    /* ---------- 删除 ---------- */
    if (action === 'remove') {
      const postId = event.postId
      if (!postId) return { success: false, error: '缺日志 ID' }
      const postRes = await db.collection('posts').doc(postId).get()
      const post = postRes.data
      if (post.openid !== openid) return { success: false, error: '只能删自己写的' }
      await db.collection('posts').doc(postId).remove()
      return { success: true }
    }

    /* ---------- 点赞 ---------- */
    if (action === 'like') {
      const postId = event.postId
      if (!postId) return { success: false, error: '缺日志 ID' }
      const postRes = await db.collection('posts').doc(postId).get()
      const post = postRes.data
      const likes = post.likes || []
      const idx = likes.indexOf(openid)

      let newLikes
      if (idx > -1) {
        newLikes = likes.filter(function (o) { return o !== openid })   // 取消赞
      } else {
        newLikes = likes.concat([openid])
      }
      await db.collection('posts').doc(postId).update({ data: { likes: newLikes } })
      return { success: true, liked: idx === -1, likeCount: newLikes.length }
    }

    /* ---------- 标记心情 ---------- */
    if (action === 'setMood') {
      const date = event.date              // '2026-09-18'
      const mood = event.mood              // happy / love / calm / tired / sad / angry
      if (!date || !mood) return { success: false, error: '缺日期或心情' }

      const month = date.slice(0, 7)       // '2026-09'
      const key = coupleId + '_' + date

      const exist = await db.collection('moods').where({ key: key }).get()
      if (exist.data.length > 0) {
        // 同一天重复设置 → 覆盖
        await db.collection('moods').doc(exist.data[0]._id).update({
          data: { mood: mood, note: event.note || '', updateTime: new Date() }
        })
        return { success: true, moodId: exist.data[0]._id, updated: true }
      }

      const addRes = await db.collection('moods').add({
        data: {
          key: key,
          coupleId: coupleId,
          openid: openid,
          date: date,
          month: month,
          mood: mood,
          note: event.note || '',
          createTime: new Date()
        }
      })
      return { success: true, moodId: addRes._id, updated: false }
    }

    return { success: false, error: '不支持的操作：' + action }
  } catch (err) {
    console.error('日志/心情操作失败', err)
    return { success: false, error: err.errMsg || err.message || String(err) }
  }
}
