const app = getApp();
const CONST = require('../../utils/const.js');

Page({
  data: {
    items: [],
    groups: [],
    total: '0.00',
    totalCount: 0,
    remark: '',
    submitting: false,
    phrase: '',
    showSuccess: false,
    identityText: '客人'
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2 });
    }
    this.applyIdentity();
    this.refreshCart();
    this.startPolling();
  },

  onHide() {
    this.stopPolling();
  },

  onUnload() {
    this.stopPolling();
  },

  applyIdentity() {
    this.setData({ identityText: app.isChef() ? '厨师' : '客人' });
  },

  async refreshCart() {
    const cart = await app.fetchCart({ force: true });
    this.applyCart(cart);
  },

  applyCart(cart) {
    const totalCount = cart.reduce((sum, item) => sum + Number(item.count || 0), 0);
    const groupMap = {};
    cart.forEach((item) => {
      const category = item.category || '其他';
      if (!groupMap[category]) groupMap[category] = [];
      groupMap[category].push(item);
    });
    const groups = Object.keys(groupMap).map((category) => ({ category, items: groupMap[category] }));
    this.setData({
      items: cart,
      groups,
      totalCount
    });
  },

  startPolling() {
    this.stopPolling();
    this.pollTimer = setInterval(() => {
      this.refreshCart();
    }, 8000);
  },

  stopPolling() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },

  increase(e) {
    const cart = app.updateCartCount(e.currentTarget.dataset.id, 1);
    wx.vibrateShort({ type: 'light' });
    this.applyCart(cart);
  },

  decrease(e) {
    const cart = app.updateCartCount(e.currentTarget.dataset.id, -1);
    this.applyCart(cart);
  },

  clearCart() {
    if (!this.data.items.length) return;
    wx.showModal({
      title: '清空清单',
      content: '确定清空这份待做饭清单吗？',
      confirmText: '清空',
      confirmColor: '#9B59B6',
      success: async (res) => {
        if (res.confirm) {
          const cart = await app.clearCart();
          this.applyCart(cart);
        }
      }
    });
  },

  onRemark(e) {
    this.setData({ remark: e.detail.value });
  },

  goMenu() {
    wx.switchTab({ url: '/pages/index/index' });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  async submitOrder() {
    if (!this.data.items.length || this.data.submitting) return;
    this.setData({ submitting: true });
    try {
      const user = app.globalData.user || { name: '琳宝' };
      const items = this.data.items.map((item) => ({
        dishId: item._id,
        name: item.name,
        emoji: item.emoji || '',
        price: Number(item.price || 0),
        image: item.image || '',
        category: item.category || '',
        count: Number(item.count || 0)
      }));
      const res = await app.callCloud('order', {
        action: 'create',
        items,
        remark: this.data.remark,
        placedByName: user.name || '琳宝'
      });
      if (!res || !res.ok) {
        wx.showToast({ title: '下单失败', icon: 'none' });
        return;
      }
      await app.clearCart();
      this.setData({ remark: '' });
      const phrase = CONST.SWEET_PHRASES[Math.floor(Math.random() * CONST.SWEET_PHRASES.length)];
      this.setData({ phrase, showSuccess: true });
      wx.vibrateShort({ type: 'light' });
    } catch (err) {
      wx.showToast({ title: '下单失败', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },

  closeSuccess() {
    this.setData({ showSuccess: false });
    this.refreshCart();
    wx.switchTab({ url: '/pages/orders/orders' });
  }
});
