const app = getApp();
const CONST = require('../../utils/const.js');

Page({
  data: {
    categories: CONST.CATEGORIES,
    category: 'all',
    title: '全部菜品',
    list: [],
    loading: true
  },

  async onLoad(options) {
    const category = options.category || 'all';
    this.setData({ category });
    this.updateTitle();
    await app.ensureAuth();
    await this.loadDishes();
  },

  updateTitle() {
    const { category, categories } = this.data;
    const c = categories.find((item) => item.key === category);
    this.setData({
      title: c ? c.emoji + ' ' + c.name : '全部菜品'
    });
    wx.setNavigationBarTitle({ title: this.data.title });
  },

  async loadDishes() {
    const res = await app.callCloud('manageDish', { action: 'list' });
    this.allDishes = ((res && res.dishes) || []).map((d) => app.normalizeDish(d));
    this.setData({ loading: false });
    this.applyFilter();
  },

  applyFilter() {
    const { category } = this.data;
    const list = (this.allDishes || [])
      .filter((d) => category === 'all' || d.category === category)
      .map((d) => this.decorate(d));
    this.setData({ list });
  },

  decorate(dish) {
    return Object.assign({}, dish, {
      _inCart: this.inCart(dish._id),
      _fav: app.isFav(dish._id)
    });
  },

  inCart(id) {
    return (app.getCart() || []).some((item) => item._id === id);
  },

  onChip(e) {
    this.setData({ category: e.currentTarget.dataset.key });
    this.updateTitle();
    this.applyFilter();
  },

  onAdd(e) {
    try {
      const id = e.detail.id;
      const dish = (this.allDishes || []).find((d) => d._id === id);
      if (!dish) return;
      const before = this.inCart(id);
      if (before) {
        app.removeFromCart(id);
        wx.showToast({ title: '已从清单移除', icon: 'none' });
      } else {
        app.addToCart(dish);
        wx.showToast({ title: '加好啦 ❤', icon: 'none' });
      }
      // 本地已更新，立即刷新按钮状态，不等云端
      this.applyFilter();
    } catch (err) {
      console.error('onAdd error', err);
      wx.showModal({ title: '加菜出错', content: String((err && err.message) || err), showCancel: false });
    }
  },

  async onFav(e) {
    const id = e.detail.id;
    const faved = await app.toggleFav(id);
    wx.showToast({ title: faved ? '已收藏 ❤' : '已取消收藏', icon: 'none' });
    this.applyFilter();
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.detail.id });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/edit/edit' });
  }
});
