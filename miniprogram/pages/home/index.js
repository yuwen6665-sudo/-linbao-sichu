// 首页 —— 家
const app = getApp()
const api = require('../../utils/api.js')
const moodUtil = require('../../utils/mood.js')

// 转盘分成几格（偶数，两个人均分才公平）
const SECTORS = 6

Page({
  data: {
    loading: true,
    today: '',
    weekDay: '',
    daysTogether: 0,
    hasAnniversary: false,
    checked: false,
    loveValue: 0,
    pendingCount: 0,

    // 灵感转盘
    showInspire: false,
    inspireLocked: false,
    inspireDish: {},
    inspireTimer: null,
    dishPool: [],

    // 谁吃这口转盘
    showWhoWheel: false,
    whoSectors: [],
    whoRotation: 0,
    whoResult: '',
    whoSpinning: false
  },

  onLoad() {
    this.initDate()
  },

  async onShow() {
    if (!app.globalData.ready) await app.ensureLogin()
    this.loadData()
  },

  onUnload() {
    if (this.data.inspireTimer) clearInterval(this.data.inspireTimer)
  },

  initDate() {
    const now = new Date()
    const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][now.getDay()]
    this.setData({
      today: now.getFullYear() + ' / ' + (now.getMonth() + 1) + ' / ' + now.getDate(),
      weekDay: week
    })
  },

  async loadData() {
    // 打卡状态（本地就够了，这是私人小事）
    const todayKey = moodUtil.todayStr()
    this.setData({
      checked: wx.getStorageSync('lastCheckin') === todayKey,
      loveValue: wx.getStorageSync('loveValue') || 0
    })

    // 纪念日 → 在一起多少天
    const res = await api.getCoupleInfo()
    if (res.ok && res.data && res.data.couple) {
      const anniversary = res.data.couple.anniversary
      let days = 0
      if (anniversary) {
        const start = new Date(anniversary + 'T00:00:00')
        if (!isNaN(start.getTime())) {
          days = Math.floor((Date.now() - start.getTime()) / 86400000)
          wx.setStorageSync('anniversary', anniversary)
        }
      }
      this.setData({
        hasAnniversary: !!anniversary,
        daysTogether: days > 0 ? days : 0
      })
    }

    // 待接单据量
    const orders = await api.getOrders()
    if (orders.ok) {
      const pending = (orders.data || []).filter(function (o) {
        return o.status === 'pending'
      })
      this.setData({ pendingCount: pending.length })
    }

    this.setData({ loading: false })
  },

  /* ---------------- 打卡 ---------------- */

  onCheckin() {
    if (this.data.checked) {
      wx.showToast({ title: '今天已经打过卡啦', icon: 'none' })
      return
    }
    wx.setStorageSync('lastCheckin', moodUtil.todayStr())
    const loveValue = (wx.getStorageSync('loveValue') || 0) + 10
    wx.setStorageSync('loveValue', loveValue)
    this.setData({ checked: true, loveValue: loveValue })
    wx.showToast({ title: '打卡成功 +10 恩爱值', icon: 'none' })
  },

  /* ---------------- 灵感菜单 ---------------- */

  async onInspiration() {
    // 用真实菜单里的菜，不再写死一份（老代码里甚至有菜单中没有的「红烧肉」）
    let pool = app.globalData.dishCache || []
    if (pool.length === 0) {
      const res = await api.getDishes()
      if (!res.ok) {
        wx.showToast({ title: '菜单还没加载出来', icon: 'none' })
        return
      }
      pool = res.data || []
    }

    this.setData({
      dishPool: pool,
      showInspire: true,
      inspireLocked: false,
      inspireDish: pool[Math.floor(Math.random() * pool.length)] || {}
    })

    if (this.data.inspireTimer) clearInterval(this.data.inspireTimer)

    const timer = setInterval(() => {
      const next = this.data.dishPool[Math.floor(Math.random() * this.data.dishPool.length)]
      this.setData({ inspireDish: next || {} })
    }, 60)
    this.setData({ inspireTimer: timer })
  },

  stopInspire() {
    clearInterval(this.data.inspireTimer)
    this.setData({ inspireLocked: true, inspireTimer: null })
  },

  resumeInspire() {
    this.setData({ inspireLocked: false })
    const timer = setInterval(() => {
      const next = this.data.dishPool[Math.floor(Math.random() * this.data.dishPool.length)]
      this.setData({ inspireDish: next || {} })
    }, 60)
    this.setData({ inspireTimer: timer })
  },

  closeInspire() {
    clearInterval(this.data.inspireTimer)
    this.setData({ showInspire: false, inspireTimer: null, inspireLocked: false })
  },

  addInspireToOrder() {
    clearInterval(this.data.inspireTimer)
    const dish = this.data.inspireDish
    if (!app.globalData.cart) app.globalData.cart = []
    app.globalData.cart.push({
      _id: dish._id,
      dishId: dish.dishId || '',
      name: dish.name,
      image: dish.image || '',
      count: 1,
      calories: dish.calories || 0
    })
    this.setData({ showInspire: false, inspireTimer: null })
    wx.showToast({ title: '已加入清单', icon: 'success' })
    setTimeout(() => wx.switchTab({ url: '/pages/menu/index' }), 900)
  },

  /* ---------------- 谁吃这一口 ---------------- */

  async onSpinWheel() {
    // 转盘上写两个人的名字/称号，从绑定信息里取
    const sectorData = this.data.whoSectors
    if (sectorData.length === 0) {
      await this.buildSectors()
    }
    this.setData({ showWhoWheel: true, whoResult: '', whoSpinning: false })
  },

  async buildSectors() {
    let names = ['厨神', '吃货']

    const res = await api.getCoupleInfo()
    if (res.ok && res.data && res.data.couple && res.data.couple.members.length === 2) {
      const members = res.data.couple.members
      names = members.map(function (m) {
        return (m.nickName && m.nickName.slice(0, 4)) || (m.role === 'chef' ? '厨神' : '吃货')
      })
    }

    // 6 格轮流放两个人的名字 → 每人 3 格，概率天然五五开
    const sectors = []
    for (let i = 0; i < SECTORS; i++) {
      sectors.push({
        label: names[i % 2],
        color: i % 2 === 0 ? '#EDE9FF' : '#FFFFFF'
      })
    }
    this.setData({ whoSectors: sectors })
    return sectors
  },

  spinWho() {
    // 转的过程中再点没用，防止连点导致结果和指针不一致
    if (this.data.whoSpinning) return

    const sectors = this.data.whoSectors
    if (!sectors.length) return

    // 先定结果，再反推要转多少度 —— 指针指到哪就一定是这个人
    const target = Math.floor(Math.random() * SECTORS)
    const winner = sectors[target].label

    // 第 target 格原本在顶部顺时针 target*(360/SECTORS) 度，
    // 顺时针转 (360 - 这个角度) 它才会到正上方。再叠几圈做动画。
    const per = 360 / SECTORS
    const base = this.data.whoRotation
    const step = 360 - (target * per)
    const rotation = base + 360 * 5 + step

    this.setData({ whoRotation: rotation, whoSpinning: true, whoResult: '' })

    setTimeout(() => {
      this.setData({ whoSpinning: false, whoResult: winner })
    }, 4100)
  },

  againSpinWho() {
    if (this.data.whoSpinning) return
    this.setData({ whoResult: '' })
    this.spinWho()
  },

  closeWhoWheel() {
    this.setData({ showWhoWheel: false, whoResult: '', whoSpinning: false })
  },

  /* ---------------- 跳转 ---------------- */

  goToMenu() {
    wx.switchTab({ url: '/pages/menu/index' })
  },

  goToOrder() {
    wx.switchTab({ url: '/pages/order/index' })
  },

  goToDiscover() {
    wx.switchTab({ url: '/pages/discover/index' })
  },

  goToProfile() {
    wx.switchTab({ url: '/pages/profile/index' })
  }
})
