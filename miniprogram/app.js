// 恋爱菜单助手 —— 全局入口
const api = require('./utils/api.js')

App({
  onLaunch(options) {
    if (!wx.cloud) {
      console.error('基础库版本太低，请用 2.2.3 以上')
      return
    }
    wx.cloud.init({
      env: api.CLOUD_ENV,
      traceUser: true
    })

    // 记住邀请码：别人分享进来的，登录后自动绑
    this.pendingInvite = (options && options.query && options.query.invite) || ''

    this.ensureLogin().then(() => {
      if (this.pendingInvite) this.autoAcceptInvite()
    })
  },

  globalData: {
    userInfo: null,
    openid: null,
    userRole: 'chef',       // chef=厨神（做饭的）, foodie=吃货（点菜的）
    coupleId: null,
    coupleInfo: null,
    dishCache: null,        // 菜品缓存，避免每次进菜单都拉一遍
    ready: false            // 登录是否完成
  },

  // 登录（页面里可能比 onLaunch 先跑，所以多个地方都要能安全调用）
  async ensureLogin() {
    if (this.globalData.ready) return this.globalData.userInfo
    if (this._loginPromise) return this._loginPromise

    this._loginPromise = (async () => {
      const res = await api.login()
      if (res.ok) {
        const info = res.data.userInfo
        this.globalData.userInfo = info
        this.globalData.openid = info._openid
        this.globalData.userRole = info.role || 'chef'
        this.globalData.coupleId = info.coupleId || null
        this.globalData.ready = true
      } else {
        this._loginPromise = null
        wx.showToast({ title: res.msg || '登录失败', icon: 'none' })
      }
      return this.globalData.userInfo
    })()

    return this._loginPromise
  },

  // 别人点分享链接进来 → 自动绑定
  async autoAcceptInvite() {
    const res = await api.acceptInvite(this.pendingInvite)
    this.pendingInvite = ''
    if (res.ok && res.data && res.data.success) {
      this.globalData.coupleId = res.data.coupleId
      this.globalData.coupleInfo = res.data.couple
      wx.showToast({ title: '绑定成功，开始一起吃饭吧', icon: 'none' })
    } else if (res.data && res.data.error) {
      wx.showToast({ title: res.data.error, icon: 'none' })
    }
  },

  // 切换身份
  //
  // 这两个身份是互补的（一个做饭一个点菜），所以我换成哪边，
  // 对方会自动补上另一边 —— 云函数会把 partnerRoleChanged 带回来。
  async switchRole(role) {
    const res = await api.updateProfile({ role: role })

    if (!res.ok) {
      // 以前这里不管成没成功都改本地，结果自己显示变了、对方那边没变
      wx.showToast({ title: res.msg || '切换失败', icon: 'none' })
      return res
    }

    this.globalData.userRole = role

    const me = role === 'chef' ? '厨神' : '吃货'
    const changed = res.data && res.data.partnerRoleChanged
    wx.showToast({
      title: changed
        ? ('你是' + me + '了，TA 自动变成' + (changed === 'chef' ? '厨神' : '吃货'))
        : ('现在是' + me),
      icon: 'none',
      duration: 2500
    })
    return res
  },

  // 换绑 / 解绑后刷新身份
  async refreshUser() {
    this.globalData.ready = false
    this._loginPromise = null
    return this.ensureLogin()
  }
})
