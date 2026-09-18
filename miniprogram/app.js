App({
  onLaunch() {
    // 初始化云开发
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力')
    } else {
      wx.cloud.init({
        env: 'cloud1-d9gq6m7n5e57e97c6',
        traceUser: true,
      })
    }

    // 检查登录状态
    this.checkLogin()
  },

  // 全局数据
  globalData: {
    userInfo: null,
    userRole: 'chef', // chef=厨神, foodie=吃货
    coupleId: null,
    coupleInfo: null
  },

  // 检查登录
  async checkLogin() {
    try {
      const res = await wx.cloud.callFunction({
        name: 'login'
      })
      if (res.result && res.result.success) {
        this.globalData.userInfo = res.result.userInfo
        this.globalData.userRole = res.result.userInfo.role || 'chef'
        this.globalData.coupleId = res.result.userInfo.coupleId
      }
    } catch (err) {
      console.error('登录失败', err)
    }
  },

  // 切换身份
  switchRole(role) {
    this.globalData.userRole = role
    wx.showToast({
      title: `已切换到${role === 'chef' ? '厨神' : '吃货'}`,
      icon: 'success'
    })
  }
})
