const app = getApp();

Page({
  data: {
    plan: [],
    loading: true,
    emptyReason: ''
  },

  async onLoad() {
    await app.ensureAuth();
    await this.loadDishes();
  },

  onShow() {
    this.decorateAll();
  },

  async loadDishes() {
    const res = await app.callCloud('manageDish', { action: 'list' });
    this.allDishes = ((res && res.dishes) || []).map((d) => app.normalizeDish(d));
    this.setData({ loading: false });
    this.generate();
  },

  generate() {
    const all = this.allDishes || [];
    if (!all.length) {
      this.setData({ emptyReason: '菜单还是空的，先去上传几道菜吧～' });
      return;
    }
    const pools = {
      main: all.filter((d) => d.category === '荤菜' || d.category === '热菜'),
      veg: all.filter((d) => d.category === '素菜' || d.category === '凉菜'),
      soup: all.filter((d) => d.category === '汤品'),
      staple: all.filter((d) => d.category === '主食')
    };
    const pick = (arr) => {
      if (!arr.length) return null;
      return arr[Math.floor(Math.random() * arr.length)];
    };
    const plan = [];
    const push = (role, roleEmoji, dish) => {
      if (!dish) return;
      if (plan.some((item) => item._id === dish._id)) return;
      plan.push(Object.assign({}, dish, { role, roleEmoji }));
    };
    push('主菜', '🍖', pick(pools.main));
    push('素菜', '🥬', pick(pools.veg));
    push('汤', '🥣', pick(pools.soup));
    push('主食', '🍚', pick(pools.staple));
    this.plan = plan;
    this.decorateAll();
  },

  decorateAll() {
    const plan = (this.plan || []).map((d) =>
      Object.assign({}, d, { _inCart: this.inCart(d._id) })
    );
    this.setData({ plan });
  },

  inCart(id) {
    return (app.getCart() || []).some((item) => item._id === id);
  },

  onAdd(e) {
    const id = e.currentTarget.dataset.id;
    const dish = (this.plan || []).find((d) => d._id === id);
    if (!dish) return;
    const before = this.inCart(id);
    if (before) {
      app.removeFromCart(id);
      wx.showToast({ title: '已从清单移除', icon: 'none' });
    } else {
      app.addToCart(dish);
      wx.showToast({ title: '加好啦 ❤', icon: 'none' });
    }
    this.decorateAll();
  },

  addAll() {
    const plan = this.plan || [];
    if (!plan.length) return;
    let added = 0;
    plan.forEach((dish) => {
      if (!this.inCart(dish._id)) {
        app.addToCart(dish);
        added += 1;
      }
    });
    wx.showToast({ title: added ? `整桌已加入清单（${added} 道）❤` : '全都在清单里啦 🛒', icon: 'none' });
    this.decorateAll();
  },

  goCart() {
    wx.switchTab({ url: '/pages/cart/cart' });
  },

  onDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  }
});
