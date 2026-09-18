// 我的页面
const app = getApp()

Page({
  data: {
    isChef: true,
    userInfo: {},
    userId: '68116739',
    dishCount: 0,
    pendingCount: 0,
    doneCount: 0,
    bindTime: '2026/09/16',
    kitchenName: '恋爱菜单460502的小厨房'
  },

  onLoad() {
    this.setData({
      isChef: app.globalData.userRole === 'chef'
    })
    this.loadUserInfo()
  },

  onShow() {
    this.loadUserInfo()
  },

  // 加载用户信息
  async loadUserInfo() {
    if (app.globalData.userInfo) {
      this.setData({
        userInfo: app.globalData.userInfo
      })
    }
  },

  // 切换身份
  switchRole() {
    const newRole = this.data.isChef ? 'foodie' : 'chef'
    app.switchRole(newRole)
    this.setData({
      isChef: newRole === 'chef'
    })
  },

  // 编辑资料
  editProfile() {
    wx.showToast({
      title: '编辑资料',
      icon: 'none'
    })
  },

  // 进入恋爱空间
  enterLoveSpace() {
    wx.showToast({
      title: '恋爱空间',
      icon: 'none'
    })
  },

  // 情侣会员
  goVip() {
    wx.showToast({
      title: '情侣会员功能开发中',
      icon: 'none'
    })
  },

  // 纪念日
  goAnniversary() {
    wx.showToast({
      title: '纪念日设置',
      icon: 'none'
    })
  },

  // 修改厨房名称
  editKitchenName() {
    wx.showModal({
      title: '修改厨房名称',
      editable: true,
      placeholderText: '请输入新的厨房名称',
      success: (res) => {
        if (res.confirm && res.content) {
          this.setData({
            kitchenName: res.content
          })
          wx.showToast({
            title: '修改成功',
            icon: 'success'
          })
        }
      }
    })
  },

  // 邀请配对
  invitePartner() {
    wx.showShareMenu({
      withShareTicket: true
    })
    wx.showToast({
      title: '点击右上角分享给对象',
      icon: 'none'
    })
  },

  // 分享
  onShareAppMessage() {
    return {
      title: '快来我的小厨房点菜吧！',
      path: '/pages/home/index?invite=' + this.data.userId
    }
  }
})
