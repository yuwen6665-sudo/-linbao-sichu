// 通用 web-view 容器页：从 url 参数接收外部链接
Page({
  data: {
    url: ''
  },

  onLoad(options) {
    let url = '';
    try {
      url = decodeURIComponent(options.url || '');
    } catch (e) {
      url = options.url || '';
    }
    this.setData({ url });
  }
});
