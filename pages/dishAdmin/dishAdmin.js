const app = getApp();

Page({
  data: {
    dishes: [],
    loading: true
  },

  async onLoad() {
    await app.ensureAuth();
    this.loadDishes();
  },

  async loadDishes() {
    const res = await app.callCloud('manageDish', { action: 'list' });
    this.setData({
      dishes: ((res && res.dishes) || []).map((d) => app.normalizeDish(d)),
      loading: false
    });
  },

  goAdd() {
    wx.navigateTo({ url: '/pages/edit/edit' });
  },

  goEdit(e) {
    wx.navigateTo({ url: '/pages/edit/edit?id=' + e.currentTarget.dataset.id });
  },

  goDetail(e) {
    wx.navigateTo({ url: '/pages/detail/detail?id=' + e.currentTarget.dataset.id });
  },

  deleteDish(e) {
    const id = e.currentTarget.dataset.id;
    const dish = this.data.dishes.find((d) => d._id === id);
    wx.showModal({
      title: '删除菜品',
      content: `确定删除「${dish ? dish.name : '这道菜'}」吗？`,
      confirmText: '删除',
      confirmColor: '#E57373',
      success: async (res) => {
        if (!res.confirm) return;
        const result = await app.callCloud('manageDish', { action: 'delete', id });
        if (result && result.ok) {
          wx.showToast({ title: '已删除', icon: 'none' });
          this.loadDishes();
        } else {
          wx.showToast({ title: '删除失败', icon: 'none' });
        }
      }
    });
  }
});
