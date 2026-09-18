// 首页
const util = require('../../utils/util.js')
const app = getApp()

Page({
  data: {
    daysTogether: 0,
    today: '',
    weekDay: '',
    festival: {
      name: '中秋节',
      days: 9
    },
    dishCount: 0,
    orderCount: 0
  },

  onLoad() {
    this.initPage()
  },

  onShow() {
    this.loadData()
  },

  // 初始化页面
  initPage() {
    const today = new Date()
    this.setData({
      today: util.formatDate(today),
      weekDay: util.getWeekDay(today),
      festival: util.daysToFestival()
    })
  },

  // 加载数据
  async loadData() {
    // 模拟数据，实际从数据库读取
    this.setData({
      daysTogether: 0,
      dishCount: 0,
      orderCount: 0
    })
  },

  // 跳转菜单页
  goToMenu() {
    wx.switchTab({
      url: '/pages/menu/index'
    })
  },

  // 跳转订单页
  goToOrder() {
    wx.switchTab({
      url: '/pages/order/index'
    })
  },

  // 灵感菜单
  onInspiration() {
    wx.showToast({
      title: '获取做菜灵感中...',
      icon: 'none'
    })
  },

  // 好友点菜
  onInvite() {
    wx.showToast({
      title: '分享给好友',
      icon: 'none'
    })
  },

  // 纪念日
  onAnniversary() {
    wx.showToast({
      title: '纪念日设置',
      icon: 'none'
    })
  },

  // 热量报告
  onHeatReport() {
    wx.showToast({
      title: '热量报告',
      icon: 'none'
    })
  },

  // 转盘抽签
  onSpinWheel() {
    wx.showToast({
      title: '谁吃这一口',
      icon: 'none'
    })
  },

  // 我的冰箱
  onFridge() {
    wx.showToast({
      title: '我的冰箱',
      icon: 'none'
    })
  }
})
