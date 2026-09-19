// 云函数：更新用户资料（昵称 / 头像 / 身份）
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

// 只允许改这几个字段，防止前端乱塞东西
const ALLOWED = ['nickName', 'avatarUrl', 'role']

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) return { success: false, error: '拿不到用户身份' }

  const updateData = {}
  ALLOWED.forEach(function (k) {
    if (event[k] !== undefined) updateData[k] = event[k]
  })

  if (Object.keys(updateData).length === 0) {
    return { success: false, error: '没有要更新的内容' }
  }

  // 角色只能是这两个，别被人传别的进来
  if (updateData.role && updateData.role !== 'chef' && updateData.role !== 'foodie') {
    return { success: false, error: '身份只能是 chef 或 foodie' }
  }

  try {
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    if (userRes.data.length === 0) {
      return { success: false, error: '用户不存在' }
    }

    let user = userRes.data[0]
    await db.collection('users').doc(user._id).update({ data: updateData })

    // 改了身份，两个人的角色要一起理顺
    //
    // 【2026-09-19 改】这两个身份是互补的：一个人做饭（厨神）、一个人点菜（吃货）。
    // 原来只改自己，结果两个人可能同时是「厨神」—— 那谁点菜？
    // 现在换成：我换成哪边，对方就自动补上另一边（对方本来就是那边的话就不动他），
    // 并且对方的 users.role 也一起改，免得他下次登录还是旧身份、两边显示打架。
    let partnerRoleChanged = ''
    if (updateData.role && user.coupleId) {
      try {
        const coupleRes = await db.collection('couples').doc(user.coupleId).get()
        const couple = coupleRes.data

        if (couple && (couple.members || []).length >= 2) {
          const otherRole = updateData.role === 'chef' ? 'foodie' : 'chef'

          const members = couple.members.map(function (m) {
            if (m.openid === openid) return { openid: m.openid, role: updateData.role }
            return { openid: m.openid, role: otherRole }
          })
          await db.collection('couples').doc(user.coupleId).update({ data: { members: members } })

          // 对方本来就还不是这个身份 → 顺手把他改过来
          const partner = couple.members.find(function (m) { return m.openid !== openid })
          if (partner && partner.role !== otherRole) {
            const pRes = await db.collection('users').where({ _openid: partner.openid }).get()
            if (pRes.data.length > 0) {
              await db.collection('users').doc(pRes.data[0]._id).update({ data: { role: otherRole } })
              partnerRoleChanged = otherRole
            }
          }
        }
      } catch (e) {
        console.error('同步情侣角色失败', e)
      }
    }

    const fresh = await db.collection('users').doc(user._id).get()
    return {
      success: true,
      userInfo: fresh.data,
      partnerRoleChanged: partnerRoleChanged   // 前端好提示「TA 已自动变成吃货」
    }
  } catch (err) {
    console.error('更新资料失败', err)
    return { success: false, error: err.errMsg || err.message || String(err) }
  }
}
