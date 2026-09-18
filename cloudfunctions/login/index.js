// 云函数：登录
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  
  try {
    // 查找用户是否存在
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()
    
    if (userRes.data.length > 0) {
      // 用户已存在，返回用户信息
      return {
        success: true,
        userInfo: userRes.data[0],
        isNewUser: false
      }
    } else {
      // 新用户，创建用户记录
      const newUser = {
        _openid: openid,
        nickName: '恋爱菜单' + Math.floor(Math.random() * 10000),
        avatarUrl: '',
        role: 'chef', // 默认厨神
        coupleId: null,
        createTime: new Date()
      }
      
      const addRes = await db.collection('users').add({
        data: newUser
      })
      
      return {
        success: true,
        userInfo: {
          _id: addRes._id,
          ...newUser
        },
        isNewUser: true
      }
    }
  } catch (err) {
    console.error('登录失败', err)
    return {
      success: false,
      error: err
    }
  }
}
