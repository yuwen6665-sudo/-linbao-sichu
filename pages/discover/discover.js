const app = getApp();
const CONST = require('../../utils/const.js');

Page({
  data: {
    tab: 'dish',
    cuisines: CONST.CUISINES.filter((c) => c.key !== 'all'),
    activeCuisine: 'all',
    dishes: [],
    loading: true,
    days: null,
    quotes: [],
    kitchenName: ''
  },

  async onLoad() {
    await app.ensureAuth();
    this.setData({
      days: app.daysTogether(),
      kitchenName: app.getKitchenName() || '琳宝私厨'
    });
    this.makeQuotes();
    const res = await app.callCloud('manageDish', { action: 'list' });
    this.allDishes = ((res && res.dishes) || []).map((d) => app.normalizeDish(d));
    this.setData({ loading: false });
    this.applyFilter();
  },

  makeQuotes() {
    const pool = CONST.SWEET_PHRASES.slice();
    const quotes = [];
    while (quotes.length < 6 && pool.length) {
      const idx = Math.floor(Math.random() * pool.length);
      quotes.push(pool.splice(idx, 1)[0]);
    }
    this.setData({ quotes });
  },

  switchTab(e) {
    this.setData({ tab: e.currentTarget.dataset.tab });
  },

  filterCuisine(e) {
    const key = e.currentTarget.dataset.key;
    this.setData({ activeCuisine: key });
    this.applyFilter();
  },

  applyFilter() {
    const key = this.data.activeCuisine;
    const dishes = key === 'all' ? (this.allDishes || []) : (this.allDishes || []).filter((d) => d.cuisine === key);
    this.setData({
      dishes: dishes.map((d) =>
        Object.assign({}, d, { _inCart: this.inCart(d._id), _fav: app.isFav(d._id) })
      )
    });
  },

  inCart(id) {
    return (app.getCart() || []).some((item) => item._id === id);
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  // 偷菜上架 = 加入清单
  steal(e) {
    const id = e.currentTarget.dataset.id;
    const dish = (this.allDishes || []).find((d) => d._id === id);
    if (!dish) return;
    const before = this.inCart(id);
    if (before) {
      app.removeFromCart(id);
      wx.showToast({ title: '已从清单拿掉', icon: 'none' });
    } else {
      app.addToCart(dish);
      wx.showToast({ title: '偷到手啦，已上架清单 🍽️', icon: 'none' });
    }
    this.applyFilter();
  },

  async onFav(e) {
    const id = e.currentTarget.dataset.id;
    const faved = await app.toggleFav(id);
    wx.showToast({ title: faved ? '已收藏 ❤' : '已取消收藏', icon: 'none' });
    this.applyFilter();
  },

  goMemory() {
    wx.navigateTo({ url: '/pages/memory/memory' });
  },

  goMenu() {
    wx.switchTab({ url: '/pages/menu/menu' });
  }
});
