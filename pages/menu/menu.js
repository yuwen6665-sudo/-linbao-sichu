const app = getApp();
const CONST = require('../../utils/const.js');

Page({
  data: {
    search: '',
    results: [],
    categories: [],
    loading: true
  },

  async onLoad() {
    await app.ensureAuth();
    await this.loadDishes();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    // 清单可能变化，刷新按钮状态
    this.decorateAll();
  },

  async loadDishes() {
    const res = await app.callCloud('manageDish', { action: 'list' });
    this.allDishes = ((res && res.dishes) || []).map((d) => app.normalizeDish(d));
    this.setData({ loading: false });
    this.buildCategories();
  },

  buildCategories() {
    const categories = CONST.CATEGORIES.filter((c) => c.key !== 'all').map((c) => ({
      key: c.key,
      name: c.name,
      emoji: c.emoji,
      count: (this.allDishes || []).filter((d) => d.category === c.key).length
    }));
    const total = (this.allDishes || []).length;
    this.setData({ categories, allCount: total });
  },

  decorateAll() {
    this.setData({
      results: this.data.results.map((d) => this.decorate(d))
    });
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

  onSearch(e) {
    const kw = e.detail.value.trim().toLowerCase();
    const results = kw
      ? (this.allDishes || []).filter((d) => {
          return (
            d.name.toLowerCase().indexOf(kw) >= 0 ||
            (d.tags || []).some((t) => String(t).toLowerCase().indexOf(kw) >= 0) ||
            (d.ingredients || []).some((i) => String(i.name || '').toLowerCase().indexOf(kw) >= 0)
          );
        })
      : [];
    this.setData({ search: e.detail.value, results: results.map((d) => this.decorate(d)) });
  },

  clearSearch() {
    this.setData({ search: '', results: [] });
  },

  goCategory(e) {
    const key = e.currentTarget.dataset.key;
    wx.navigateTo({ url: '/pages/menuList/menuList?category=' + (key || 'all') });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/edit/edit' });
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
      this.decorateAll();
    } catch (err) {
      console.error('onAdd error', err);
      wx.showModal({ title: '加菜出错', content: String((err && err.message) || err), showCancel: false });
    }
  },

  async onFav(e) {
    const id = e.detail.id;
    const faved = await app.toggleFav(id);
    wx.showToast({ title: faved ? '已收藏 ❤' : '已取消收藏', icon: 'none' });
    this.decorateAll();
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.detail.id });
  }
});
