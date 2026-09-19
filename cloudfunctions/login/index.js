// 云函数：登录 / 存用户信息
// 第一次打开自动建号，之后每次更新最后登录时间
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID

  if (!openid) {
    return { success: false, error: '拿不到 openid，检查云函数是否部署成功' }
  }

  let isNewUser = false
  let user = null
  let now = new Date()

  try {
    const userRes = await db.collection('users').where({ _openid: openid }).get()

    if (userRes.data.length > 0) {
      user = userRes.data[0]
      // 更新登录时间
      await db.collection('users').doc(user._id).update({
        data: { lastLoginTime: now }
      })
    } else {
      // 新用户，建号
      const newUser = {
        _openid: openid,
        nickName: '小' + (Math.floor(Math.random() * 2) ? '厨' : '馋') + Math.floor(Math.random() * 9000 + 1000),
        avatarUrl: '',
        role: 'chef',        // 默认厨神，后面在「我的」里能切
        coupleId: null,
        createTime: now,
        lastLoginTime: now
      }
      const addRes = await db.collection('users').add({ data: newUser })
      user = Object.assign({ _id: addRes._id }, newUser)
      isNewUser = true
    }

    return {
      success: true,
      userInfo: user,
      isNewUser: isNewUser
    }
  } catch (err) {
    console.error('登录失败', err)
    return { success: false, error: err.errMsg || err.message || String(err) }
  }
}
