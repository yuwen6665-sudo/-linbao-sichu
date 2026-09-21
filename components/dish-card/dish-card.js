Component({
  properties: {
    dish: { type: Object, value: {} },
    inCart: { type: Boolean, value: false },
    isFav: { type: Boolean, value: false },
    matchCount: { type: Number, value: 0 },
    reason: { type: String, value: '' }
  },
  methods: {
    onTapCard() {
      this.triggerEvent('detail', { id: this.data.dish._id });
    },
    onTapAdd() {
      this.triggerEvent('add', { id: this.data.dish && this.data.dish._id });
    },
    onTapFav() {
      this.triggerEvent('fav', { id: this.data.dish._id });
    }
  }
});
