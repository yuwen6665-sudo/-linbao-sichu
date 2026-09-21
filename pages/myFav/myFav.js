const app = getApp();

Page({
  data: {
    list: [],
    loading: true
  },

  async onLoad() {
    await app.ensureAuth();
    await this.loadFavs();
  },

  onShow() {
    // 取消收藏后回来刷新
    if (this.loaded) this.loadFavs();
  },

  async loadFavs() {
    const res = await app.callCloud('manageDish', { action: 'list' });
    const all = ((res && res.dishes) || []).map((d) => app.normalizeDish(d));
    const favIds = (app.globalData.user && app.globalData.user.favoriteIds) || [];
    const list = all
      .filter((d) => favIds.indexOf(d._id) >= 0)
      .map((d) => this.decorate(d));
    this.setData({ list, loading: false });
    this.loaded = true;
  },

  decorate(dish) {
    return Object.assign({}, dish, {
      _inCart: this.inCart(dish._id),
      _fav: true
    });
  },

  inCart(id) {
    return (app.getCart() || []).some((item) => item._id === id);
  },

  async onAdd(e) {
    try {
      const id = e.detail.id;
      const dish = (this.data.list || []).find((d) => d._id === id);
      if (!dish) return;
      const before = this.inCart(id);
      app.addToCart(dish);
      wx.showToast({ title: before ? '已从清单移除' : '加好啦 ❤', icon: 'none' });
      setTimeout(() => this.loadFavs(), 300);
    } catch (err) {
      console.error('onAdd error', err);
      wx.showModal({ title: '加菜出错', content: String((err && err.message) || err), showCancel: false });
    }
  },

  async onFav(e) {
    const id = e.detail.id;
    await app.toggleFav(id);
    wx.showToast({ title: '已取消收藏', icon: 'none' });
    this.loadFavs();
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.detail.id });
  },

  goMenu() {
    wx.switchTab({ url: '/pages/menu/menu' });
  }
});
