// 云函数：创建订单
const cloud = require('wx-server-sdk')
cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV
})

const db = cloud.database()

// 生成订单号
function generateOrderNo() {
  const date = new Date()
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0')
  return `${year}${month}${day}${random}`
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { items } = event
  
  try {
    // 获取用户信息
    const userRes = await db.collection('users').where({
      _openid: openid
    }).get()
    
    if (userRes.data.length === 0) {
      return {
        success: false,
        error: '用户不存在'
      }
    }
    
    const user = userRes.data[0]
    
    if (!user.coupleId) {
      return {
        success: false,
        error: '请先绑定情侣关系'
      }
    }
    
    // 获取情侣信息，找到厨神
    const coupleRes = await db.collection('couples').doc(user.coupleId).get()
    const couple = coupleRes.data
    
    // 计算总热量
    let totalCalories = 0
    items.forEach(item => {
      totalCalories += (item.calories || 0) * item.count
    })
    
    // 创建订单
    const orderData = {
      orderNo: generateOrderNo(),
      coupleId: user.coupleId,
      fromUserId: openid,
      toUserId: couple.chefId,
      items: items.map(item => ({
        dishId: item._id,
        name: item.name,
        count: item.count,
        calories: item.calories || 0
      })),
      totalCalories,
      status: 'pending', // pending / making / done
      createTime: new Date(),
      finishTime: null
    }
    
    const addRes = await db.collection('orders').add({
      data: orderData
    })
    
    return {
      success: true,
      orderId: addRes._id,
      orderNo: orderData.orderNo
    }
    
  } catch (err) {
    console.error('创建订单失败', err)
    return {
      success: false,
      error: err
    }
  }
}
