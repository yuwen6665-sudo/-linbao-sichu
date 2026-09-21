const app = getApp();

Page({
  data: {
    identityText: '客人',
    identityEmoji: '🍽️',
    isChef: false,
    userName: '琳宝',
    dishCount: 0,
    pendingCount: 0,
    doneCount: 0,
    kitchenName: '',
    avatar: ''
  },

  async onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 4 });
    }
    const user = await app.ensureAuth();
    this.applyUser(user);
    this.loadDishCount();
    this.loadOrderStats();
  },

  applyUser(user) {
    this.setData({
      isChef: app.isChef(),
      identityText: app.identityLabel(),
      identityEmoji: app.isChef() ? '👨‍🍳' : '🍽️',
      userName: (user && user.name) || '琳宝',
      kitchenName: app.getKitchenName(),
      avatar: app.getAvatar()
    });
  },

  chooseAvatar() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        wx.showLoading({ title: '上传中' });
        try {
          const extMatch = file.tempFilePath.match(/\.[a-zA-Z0-9]+$/);
          const ext = extMatch ? extMatch[0] : '.jpg';
          const cloudPath = `avatars/${app.globalData.openid || Date.now()}-${Date.now()}${ext}`;
          const upRes = await wx.cloud.uploadFile({ cloudPath, filePath: file.tempFilePath });
          const avatar = await app.setAvatar(upRes.fileID);
          this.setData({ avatar });
          wx.showToast({ title: '头像已更新 ✨', icon: 'none' });
        } catch (err) {
          console.error('upload avatar error', err);
          wx.showToast({ title: '上传失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      }
    });
  },

  async loadDishCount() {
    const res = await app.callCloud('manageDish', { action: 'list' });
    this.setData({ dishCount: ((res && res.dishes) || []).length });
  },

  async loadOrderStats() {
    const res = await app.callCloud('order', { action: 'list' });
    const orders = (res && res.orders) || [];
    this.setData({
      pendingCount: orders.filter((o) => o.status === 'pending').length,
      doneCount: orders.filter((o) => o.status === 'done').length
    });
  },

  switchIdentity() {
    wx.navigateTo({ url: '/pages/identity/identity?force=1' });
  },

  editKitchenName() {
    wx.showModal({
      title: '厨房名称',
      editable: true,
      placeholderText: '如：琳宝的小厨房',
      content: this.data.kitchenName,
      confirmColor: '#9B59B6',
      success: async (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          const name = await app.setKitchenName(res.content.trim());
          this.setData({ kitchenName: name });
          wx.showToast({ title: '已更新', icon: 'none' });
        }
      }
    });
  },

  editName() {
    wx.showModal({
      title: '改个昵称',
      editable: true,
      placeholderText: '输入你的昵称',
      confirmColor: '#9B59B6',
      success: async (res) => {
        if (res.confirm && res.content && res.content.trim()) {
          const name = await app.setName(res.content.trim());
          this.setData({ userName: name });
          wx.showToast({ title: '已更新', icon: 'none' });
        }
      }
    });
  },

  goDishAdmin() {
    wx.navigateTo({ url: '/pages/dishAdmin/dishAdmin' });
  },

  goFav() {
    wx.navigateTo({ url: '/pages/myFav/myFav' });
  },

  goMemory() {
    wx.navigateTo({ url: '/pages/memory/memory' });
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  },

  goCalorieReport() {
    wx.navigateTo({ url: '/pages/calorieReport/calorieReport' });
  },

  goFridge() {
    wx.navigateTo({ url: '/pages/fridge/fridge' });
  },

  goOrders() {
    wx.switchTab({ url: '/pages/orders/orders' });
  },

  goCart() {
    wx.switchTab({ url: '/pages/cart/cart' });
  },

  goCalorie() {
    wx.navigateTo({
      url: '/pages/webview/webview?url=' + encodeURIComponent('https://www.kalulijisuan.com/')
    });
  },

  goRecipe() {
    wx.navigateTo({
      url: '/pages/webview/webview?url=' + encodeURIComponent('https://m.xiangha.com/')
    });
  }
});
