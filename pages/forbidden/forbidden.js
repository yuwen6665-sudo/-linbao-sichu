const app = getApp();

Page({
  data: {},

  goHome() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goMenu() {
    wx.switchTab({ url: '/pages/menu/menu' });
  }
});
