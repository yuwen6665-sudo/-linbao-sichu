// 我的页面 —— 头像昵称、身份切换、情侣绑定、纪念日
const app = getApp()
const api = require('../../utils/api.js')
const notify = require('../../utils/notify.js')

Page({
  data: {
    isChef: true,
    userInfo: {},
    openid: '',
    couple: null,          // 只有「真的绑上了（两个人）」才有值
    partner: null,
    meRole: '',            // 我在这一对里的身份，以服务端为准（别用本地缓存，会打架）
    pendingInvite: '',     // 我生成、还没人用的邀请码
    inputCode: '',
    showInvite: false,
    anniversary: '',
    daysTogether: 0,
    stats: { dishCount: 0, doneCount: 0 },
    loading: true
  },

  async onLoad() {
    this.setData({ isChef: app.globalData.userRole === 'chef' })
  },

  async onShow() {
    if (!app.globalData.ready) await app.ensureLogin()
    this.setData({ isChef: app.globalData.userRole === 'chef' })
    this.loadData()
  },

  async loadData() {
    const g = app.globalData
    this.setData({
      userInfo: g.userInfo || {},
      openid: g.openid || ''
    })

    const res = await api.getCoupleInfo()
    if (res.ok && res.data) {
      const couple = res.data.couple || null
      const pending = res.data.pendingInvite || ''

      const me = (couple && couple.members || []).find(function (m) {
        return m.openid === g.openid
      })
      const partner = (couple && couple.members || []).find(function (m) {
        return m.openid !== g.openid
      })

      let days = 0
      if (couple && couple.anniversary) {
        const start = new Date(couple.anniversary + 'T00:00:00')
        if (!isNaN(start.getTime())) {
          days = Math.floor((Date.now() - start.getTime()) / 86400000)
        }
      }

      // 全局的 coupleId 以服务端返回的为准 —— 未绑定时要清成 null
      g.coupleId = couple ? couple._id : null

      // 身份以服务端为准 —— 对方切换身份时，我这边也要跟着看到正确的
      if (me && me.role) {
        g.userRole = me.role
      }

      this.setData({
        couple: couple,
        partner: partner || null,
        meRole: (me && me.role) || g.userRole || 'chef',
        isChef: ((me && me.role) || g.userRole) === 'chef',
        pendingInvite: pending,
        anniversary: (couple && couple.anniversary) || '',
        daysTogether: days > 0 ? days : 0,
        loading: false
      })
    } else {
      this.setData({ loading: false })
    }

    this.loadStats()
  },

  async loadStats() {
    const dishes = await api.getDishes()
    if (dishes.ok) {
      this.setData({ 'stats.dishCount': (dishes.data || []).length })
    }
    const orders = await api.getOrders()
    if (orders.ok) {
      const done = (orders.data || []).filter(function (o) { return o.status === 'done' })
      this.setData({ 'stats.doneCount': done.length })
    }
  },

  /* ---------------- 头像 / 昵称 ---------------- */

  async onChooseAvatar(e) {
    const avatarUrl = e.detail.avatarUrl
    this.setData({ 'userInfo.avatarUrl': avatarUrl })
    try {
      const up = await wx.cloud.uploadFile({
        cloudPath: 'avatars/' + app.globalData.openid + '.png',
        filePath: avatarUrl
      })
      await api.updateProfile({ avatarUrl: up.fileID })
      if (app.globalData.userInfo) app.globalData.userInfo.avatarUrl = up.fileID
    } catch (err) {
      console.error('头像上传失败', err)
    }
  },

  async onNicknameChange(e) {
    const nickName = (e.detail.value || '').trim()
    if (!nickName) return
    this.setData({ 'userInfo.nickName': nickName })
    const res = await api.updateProfile({ nickName: nickName })
    if (res.ok && app.globalData.userInfo) {
      app.globalData.userInfo.nickName = nickName
    }
  },

  /* ---------------- 身份 ---------------- */

  async switchRole() {
    const newRole = this.data.isChef ? 'foodie' : 'chef'
    await app.switchRole(newRole)
    this.setData({ isChef: newRole === 'chef' })
    this.loadData()
  },

  /* ---------------- 买菜提醒（订阅消息） ---------------- */

  // 点一下 = 请求一次订阅授权。
  // 「一次同意只能发一条」是微信的硬规矩，所以这个按钮本质上是「续期」：
  // 想一直收提醒，就多点几次攒着。
  async openNotify() {
    const r = await notify.requestSubscribe()

    if (!r.ok) {
      wx.showModal({
        title: '没开成提醒',
        content: notify.statusText(r.status) + (r.msg ? ('\n' + r.msg) : '') +
          '\n\n想收到提醒的话，再点一次这个按钮，然后点「允许」。',
        showCancel: false
      })
      return
    }

    wx.showModal({
      title: '提醒已开启',
      content: '下次有人下单时，你和 TA 的微信里都会收到一条提醒。\n\n' +
        '每次「允许」只能收一条，想一直收就多点几次攒着。\n\n' +
        '要不要现在发一条测试消息，看看效果？',
      confirmText: '发一条',
      cancelText: '不用了',
      success: (res) => { if (res.confirm) this.sendTestNotify() }
    })
  },

  // 发一条测试消息给自己。
  // 这个按钮还有个用处：万一「模板字段名」配错了，它会直接把微信的原始报错显示出来。
  async sendTestNotify() {
    wx.showLoading({ title: '发送中', mask: true })

    const me = (this.data.userInfo && this.data.userInfo.nickName) || '我'
    // 订单号留空 → notify 会现编一个（反正是测试消息）
    const res = await api.sendNotify('me', notify.buildData('', me, '番茄炒蛋等3道，记得买菜'))

    wx.hideLoading()

    if (res.ok && res.data && res.data.success) {
      wx.showToast({ title: '发出去了，去微信看看', icon: 'none', duration: 2500 })
      return
    }

    const detail = (res.data && res.data.error) || res.msg || '未知原因'
    wx.showModal({
      title: '测试消息没发出去',
      content: '把这段截图发我，我一眼就能定位：\n\n' + detail,
      showCancel: false
    })
  },

  /* ---------------- 情侣绑定 ---------------- */

  // 点「邀请对象」：已绑 → 提示；已生成过码 → 直接打开弹窗；否则生成
  async invitePartner() {
    if (this.data.couple) {
      wx.showToast({ title: '你已经绑定对象啦', icon: 'none' })
      return
    }

    if (this.data.pendingInvite) {
      this.setData({ showInvite: true })
      return
    }

    wx.showLoading({ title: '生成中', mask: true })
    const res = await api.createInvite()
    wx.hideLoading()

    if (!res.ok) {
      api.alertError(res, '生成邀请码失败')
      return
    }

    this.setData({
      pendingInvite: res.data.inviteCode,
      showInvite: true
    })
  },

  closeInvite() {
    this.setData({ showInvite: false })
  },

  // 复制邀请码 —— 小程序未认证时不能分享给好友，所以只能靠复制粘贴
  copyInvite() {
    const code = this.data.pendingInvite
    if (!code) {
      wx.showToast({ title: '还没有邀请码', icon: 'none' })
      return
    }
    wx.setClipboardData({
      data: code,
      success: () => {
        wx.showToast({ title: '已复制，去微信里发给 TA', icon: 'none', duration: 2000 })
      }
    })
  },

  onInputCode(e) {
    this.setData({ inputCode: (e.detail.value || '').trim().toUpperCase() })
  },

  async acceptInvite() {
    const code = this.data.inputCode
    if (!code) {
      wx.showToast({ title: '先填邀请码', icon: 'none' })
      return
    }
    if (code === this.data.pendingInvite) {
      wx.showToast({ title: '这是你自己生成的邀请码', icon: 'none' })
      return
    }

    wx.showLoading({ title: '绑定中', mask: true })
    const res = await api.acceptInvite(code)
    wx.hideLoading()

    if (!res.ok) {
      api.alertError(res, '绑定失败')
      return
    }

    app.globalData.coupleId = res.data.coupleId
    app.globalData.userRole = res.data.role
    this.setData({
      inputCode: '',
      showInvite: false,
      pendingInvite: '',
      isChef: res.data.role === 'chef'
    })
    wx.showModal({
      title: '绑定成功 🎉',
      content: '现在你俩能看到同一份菜单、订单和恋爱日志了',
      showCancel: false
    })
    this.loadData()
  },

  async unbind() {
    wx.showModal({
      title: '解除绑定？',
      content: '解绑后订单、日志、日历都还在，但两个人互相看不到了。想再绑要重新生成邀请码。',
      success: async (r) => {
        if (!r.confirm) return
        const res = await api.unbind()
        if (!res.ok) {
          api.alertError(res, '解绑失败')
          return
        }
        app.globalData.coupleId = null
        app.globalData.coupleInfo = null
        this.setData({
          couple: null,
          partner: null,
          pendingInvite: '',
          anniversary: '',
          daysTogether: 0
        })
        wx.showToast({ title: '已解绑', icon: 'none' })
        this.loadData()
      }
    })
  },

  /* ---------------- 纪念日 ---------------- */

  async goAnniversary() {
    if (!this.data.couple) {
      wx.showToast({ title: '先绑定对象再设纪念日', icon: 'none' })
      return
    }
    wx.showModal({
      title: '在一起的日期',
      editable: true,
      placeholderText: '例如：2024-05-20',
      content: this.data.anniversary || '',
      success: async (r) => {
        if (!r.confirm) return
        const value = (r.content || '').trim()
        if (value && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
          wx.showToast({ title: '格式要写成 2024-05-20', icon: 'none' })
          return
        }
        const res = await api.setAnniversary(value)
        if (!res.ok) {
          api.alertError(res, '设置失败')
          return
        }
        wx.setStorageSync('anniversary', value)
        wx.showToast({ title: '记住了 ♥', icon: 'success' })
        this.loadData()
      }
    })
  }
})
