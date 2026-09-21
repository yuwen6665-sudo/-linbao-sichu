const app = getApp();

Page({
  data: {
    totalKcal: 0,
    perPersonKcal: 0,
    mealCount: 0,
    dishKindCount: 0,
    topDishes: [],
    loading: true
  },

  async onLoad() {
    await app.ensureAuth();
    this.loadReport();
  },

  async loadReport() {
    wx.showLoading({ title: '算热量中' });
    try {
      const [orderRes, dishRes] = await Promise.all([
        app.callCloud('order', { action: 'list' }),
        app.callCloud('manageDish', { action: 'list' })
      ]);
      const orders = ((orderRes && orderRes.orders) || []).filter((o) => o.status !== 'cancelled');
      const dishMap = {};
      ((dishRes && dishRes.dishes) || []).forEach((d) => {
        dishMap[d._id] = { name: d.name, kcal: Number(d.kcal) || 0, image: d.image || '' };
      });

      const kcalMap = {}; // name -> { kcal, count }
      let totalKcal = 0;
      let dishKindCount = 0;
      orders.forEach((order) => {
        (order.items || []).forEach((item) => {
          const kcal = (dishMap[item.dishId] && dishMap[item.dishId].kcal) || 0;
          const count = Number(item.count || 0);
          const name = item.name || '未知菜';
          if (!kcalMap[name]) {
            kcalMap[name] = { name, kcal: 0, count: 0, image: (dishMap[item.dishId] && dishMap[item.dishId].image) || item.image || '' };
          }
          kcalMap[name].kcal += kcal * count;
          kcalMap[name].count += count;
          totalKcal += kcal * count;
        });
      });

      const topDishes = Object.keys(kcalMap)
        .map((name) => kcalMap[name])
        .filter((item) => item.kcal > 0)
        .sort((a, b) => b.kcal - a.kcal)
        .slice(0, 5);
      const max = topDishes.length ? topDishes[0].kcal : 1;
      this.setData({
        totalKcal: Math.round(totalKcal),
        perPersonKcal: Math.round(totalKcal / 2),
        mealCount: orders.length,
        dishKindCount: Object.keys(kcalMap).length,
        topDishes: topDishes.map((item) =>
          Object.assign({}, item, {
            kcal: Math.round(item.kcal),
            percent: Math.max(12, Math.round((item.kcal / max) * 100))
          })
        ),
        loading: false
      });
    } finally {
      wx.hideLoading();
    }
  },

  goOrders() {
    wx.switchTab({ url: '/pages/orders/orders' });
  }
});
