Component({
  data: {
    selected: 0,
    cartCount: 0,
    tabs: [
      { pagePath: "/pages/index/index", text: "首页", emoji: "🏠" },
      { pagePath: "/pages/menu/menu", text: "菜单", emoji: "📖" },
      { pagePath: "/pages/cart/cart", text: "清单", emoji: "🛒" },
      { pagePath: "/pages/orders/orders", text: "订单", emoji: "📋" },
      { pagePath: "/pages/me/me", text: "我的", emoji: "🐻" }
    ]
  },

  pageLifetimes: {
    show() {
      this.refreshBadge();
    }
  },

  methods: {
    refreshBadge() {
      const app = getApp();
      const cart = (app.globalData && app.globalData.cart) || [];
      const count = cart.reduce((sum, item) => sum + Number(item.count || 0), 0);
      this.setData({ cartCount: count });
    },

    switchTab(e) {
      const index = Number(e.currentTarget.dataset.index);
      const item = this.data.tabs[index];
      if (!item) return;
      wx.switchTab({ url: item.pagePath });
    }
  }
});
