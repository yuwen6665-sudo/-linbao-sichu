const app = getApp();

Page({
  data: {
    loggedIn: false,   // 是否已登录
    logging: false,    // 是否正在登录中
    loginError: '',    // 登录失败提示
    userName: ''       // 登录成功后显示的名字
  },

  onLoad(options) {
    // 不再自动登录，等用户点按钮
    // 如果之前已经登录过（globalData 有 user），直接跳过登录页
    if (app.globalData.user) {
      // force=1：从「我的」页进来切换身份，必须停留在此页让用户重新选
      this.afterLogin(app.globalData.user, { stay: Boolean(options && options.force) });
    }
  },

  // 点击"点击登录"按钮
  async handleLogin() {
    if (this.data.logging) return; // 防止重复点击

    this.setData({ logging: true, loginError: '' });

    try {
      // 调用云函数 login（里面自动拿 openid）
      const user = await app.ensureAuth();

      if (!user) {
        this.setData({
          logging: false,
          loginError: '登录失败，请检查网络后重试'
        });
        return;
      }

      // 登录成功，进入下一步
      this.afterLogin(user);
    } catch (err) {
      this.setData({
        logging: false,
        loginError: '登录出错：' + (err.errMsg || '未知错误')
      });
    }
  },

  // 登录成功后的处理
  afterLogin(user, opts) {
    this.setData({
      loggedIn: true,
      logging: false,
      userName: user.name || '琳宝'
    });

    // 从「我的」页切换身份时（stay=true）：停留在此页显示选择卡片
    if (opts && opts.stay) return;

    // 否则如果之前选过身份，直接进首页
    const lastIdentity = user.lastIdentity || wx.getStorageSync('lb_identity');
    if (lastIdentity) {
      wx.vibrateShort && wx.vibrateShort({ type: 'light' });
      wx.switchTab({ url: '/pages/index/index' });
    }
  },

  chooseGuest() {
    this.choose('guest');
  },

  chooseChef() {
    this.choose('chef');
  },

  async choose(identity) {
    if (this.data.logging) return; // 防连点
    this.setData({ logging: true });
    await app.setIdentity(identity);
    wx.vibrateShort && wx.vibrateShort({ type: 'light' });
    wx.switchTab({ url: '/pages/index/index' });
  }
});
