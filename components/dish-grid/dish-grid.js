Component({
  properties: {
    dish: { type: Object, value: {} },
    inCart: { type: Boolean, value: false },
    isFav: { type: Boolean, value: false }
  },
  methods: {
    onTapCard() {
      this.triggerEvent('detail', { id: this.data.dish._id });
    },
    onTapAdd() {
      this.triggerEvent('add', { id: this.data.dish._id });
    },
    onTapFav() {
      this.triggerEvent('fav', { id: this.data.dish._id });
    }
  }
});
