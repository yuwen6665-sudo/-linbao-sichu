const app = getApp();

Page({
  data: {
    dish: null,
    inCart: false,
    fav: false,
    loading: true,
    showSteps: true
  },

  async onLoad(options) {
    this.id = options.id;
    await app.ensureAuth();
    const res = await app.callCloud('manageDish', { action: 'list' });
    const all = ((res && res.dishes) || []).map((d) => app.normalizeDish(d));
    const dish = all.find((d) => d._id === this.id);
    if (!dish) {
      this.setData({ loading: false });
      wx.showToast({ title: '这道菜已下架', icon: 'none' });
      return;
    }
    dish.ingredients = (dish.ingredients || []).map((ing, index) =>
      typeof ing === 'string' ? { name: ing, amount: '', index } : Object.assign({}, ing, { index })
    );
    dish.steps = (dish.steps || []).map((step, index) =>
      typeof step === 'string' ? { text: step, index } : Object.assign({}, step, { index })
    );
    dish.kcal = Number(dish.kcal) || 0;
    dish.benefit = dish.benefit || '';
    dish.nutritionTags = Array.isArray(dish.nutritionTags) ? dish.nutritionTags : [];
    this.setData({
      dish,
      inCart: this.inCart(dish._id),
      fav: app.isFav(dish._id),
      loading: false
    });
  },

  inCart(id) {
    return (app.getCart() || []).some((item) => item._id === id);
  },

  toggleSteps() {
    this.setData({ showSteps: !this.data.showSteps });
  },

  onAdd() {
    if (!this.data.dish) return;
    const before = this.data.inCart;
    if (before) {
      app.removeFromCart(this.data.dish._id);
      this.setData({ inCart: false });
      wx.showToast({ title: '已从清单移除', icon: 'none' });
    } else {
      app.addToCart(this.data.dish);
      this.setData({ inCart: true });
      wx.showToast({ title: '加好啦 ❤', icon: 'none' });
    }
  },

  async onFav() {
    if (!this.data.dish) return;
    const faved = await app.toggleFav(this.data.dish._id);
    this.setData({ fav: faved });
    wx.showToast({ title: faved ? '已收藏 ❤' : '已取消收藏', icon: 'none' });
  },

  goMenu() {
    wx.switchTab({ url: '/pages/menu/menu' });
  },

  goCart() {
    wx.switchTab({ url: '/pages/cart/cart' });
  }
});
