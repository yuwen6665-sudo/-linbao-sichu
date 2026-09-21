const app = getApp();
const CONST = require('../../utils/const.js');

Page({
  data: {
    orders: [],
    loading: true,
    identityText: '客人',
    isChef: false,
    myOpenid: '',
    // 完成弹层
    completeOrder: null,
    mood: '开心',
    moods: CONST.MOODS,
    mealImageLocal: '',
    mealImageCloud: '',
    submitting: false
  },

  async onLoad() {
    await app.ensureAuth();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 3 });
    }
    this.applyIdentity();
    this.loadOrders();
  },

  applyIdentity() {
    this.setData({
      isChef: app.isChef(),
      identityText: app.identityLabel(),
      myOpenid: app.globalData.openid || ''
    });
  },

  async loadOrders() {
    const res = await app.callCloud('order', { action: 'list' });
    const rawOrders = (res && res.orders) || [];
    const orders = rawOrders.map((order) => this.normalizeOrder(order));
    this.setData({ orders, loading: false });
  },

  normalizeOrder(order) {
    const items = (order.items || []).map((item) => Object.assign({}, item));
    const names = items.map((item) => item.name).slice(0, 2).join('、');
    return Object.assign({}, order, {
      dateText: app.formatTime(order.createTime),
      summary: names + (items.length > 2 ? ' 等' : ''),
      items,
      expanded: false
    });
  },

  toggleExpand(e) {
    const id = e.currentTarget.dataset.id;
    const orders = this.data.orders.map((order) =>
      order._id === id ? Object.assign({}, order, { expanded: !order.expanded }) : order
    );
    this.setData({ orders });
  },

  canCancel(order) {
    // 客人取消（仅订单创建者），厨师拒单（任意厨师身份）
    if (order.status !== 'pending') return false;
    if (this.data.isChef) return true; // 拒单
    return order.openid === this.data.myOpenid; // 客人取消自己的单
  },

  async acceptOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showLoading({ title: '接单中' });
    const res = await app.callCloud('order', { action: 'accept', id });
    wx.hideLoading();
    if (res && res.ok) {
      wx.showToast({ title: '接单啦，开始制作 👨‍🍳', icon: 'none' });
      this.loadOrders();
    } else {
      wx.showToast({ title: '操作失败', icon: 'none' });
    }
  },

  async cancelOrder(e) {
    const id = e.currentTarget.dataset.id;
    const isChefCancel = this.data.isChef;
    wx.showModal({
      title: isChefCancel ? '拒单' : '取消订单',
      content: isChefCancel ? '确定拒绝接这个单吗？' : '确定取消这单吗？',
      confirmText: isChefCancel ? '拒单' : '取消',
      confirmColor: '#E57373',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中' });
        const result = await app.callCloud('order', {
          action: 'cancel',
          id,
          by: isChefCancel ? 'chef' : 'guest'
        });
        wx.hideLoading();
        if (result && result.ok) {
          wx.showToast({ title: isChefCancel ? '已拒单' : '已取消', icon: 'none' });
          this.loadOrders();
        } else {
          wx.showToast({ title: '操作失败', icon: 'none' });
        }
      }
    });
  },

  openComplete(e) {
    const id = e.currentTarget.dataset.id;
    const order = this.data.orders.find((o) => o._id === id);
    if (!order) return;
    this.setData({
      completeOrder: order,
      mood: '开心',
      mealImageLocal: '',
      mealImageCloud: ''
    });
  },

  closeComplete() {
    this.setData({ completeOrder: null });
  },

  selectMood(e) {
    this.setData({ mood: e.currentTarget.dataset.mood });
  },

  chooseMealImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        this.setData({ mealImageLocal: file.tempFilePath, mealImageCloud: '' });
      }
    });
  },

  removeMealImage() {
    this.setData({ mealImageLocal: '', mealImageCloud: '' });
  },

  async confirmComplete() {
    const order = this.data.completeOrder;
    if (!order || this.data.submitting) return;
    this.setData({ submitting: true });
    wx.showLoading({ title: '完成中' });
    try {
      let mealImage = this.data.mealImageCloud || '';
      if (this.data.mealImageLocal) {
        mealImage = await this.uploadMealImage(this.data.mealImageLocal);
      }
      const res = await app.callCloud('order', {
        action: 'complete',
        id: order._id,
        mood: this.data.mood,
        mealImage
      });
      if (res && res.ok) {
        this.setData({ completeOrder: null });
        wx.showToast({ title: '完成！记进看板啦 🎉', icon: 'none' });
        this.loadOrders();
      } else {
        wx.showToast({ title: '操作失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ submitting: false });
    }
  },

  uploadMealImage(path) {
    const extMatch = path.match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0] : '.jpg';
    const cloudPath = `meals/${Date.now()}-${Math.floor(Math.random() * 10000)}${ext}`;
    return wx.cloud
      .uploadFile({ cloudPath, filePath: path })
      .then((res) => res.fileID);
  },

  deleteOrder(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: '删除记录',
      content: '确定删除这条记录吗？删除后统计会同步变化。',
      confirmText: '删除',
      confirmColor: '#E57373',
      success: async (res) => {
        if (!res.confirm) return;
        const result = await app.callCloud('order', { action: 'remove', id });
        if (result && result.ok) {
          wx.showToast({ title: '已删除', icon: 'none' });
          this.loadOrders();
        } else {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  },

  goDishDetail(e) {
    const dishId = e.currentTarget.dataset.dishid;
    if (dishId) {
      wx.navigateTo({ url: '/pages/detail/detail?id=' + dishId });
    }
  },

  goStats() {
    wx.navigateTo({ url: '/pages/stats/stats' });
  }
});
