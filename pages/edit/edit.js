const app = getApp();
const CONST = require('../../utils/const.js');

Page({
  data: {
    id: '',
    name: '',
    emoji: '🍳',
    emojis: CONST.EMOJI_CHOICES,
    cuisines: CONST.CUISINES.filter((c) => c.key !== 'all'),
    categories: CONST.CATEGORIES.filter((c) => c.key !== 'all'),
    difficulties: CONST.DIFFICULTIES,
    cuisineIndex: 0,
    categoryIndex: 0,
    difficultyIndex: 0,
    time: '20',
    desc: '',
    tagsText: '',
    kcalText: '',
    benefit: '',
    nutritionTagsText: '',
    ingredients: [],
    steps: [],
    tips: '',
    imageLocal: '',
    imageCloud: '',
    saving: false,
    isEdit: false
  },

  async onLoad(options) {
    await app.ensureAuth();
    if (options.id) {
      this.setData({ id: options.id, isEdit: true });
      wx.setNavigationBarTitle({ title: '编辑菜品' });
      await this.loadDish(options.id);
    } else {
      this.addIngredient();
      this.addStep();
    }
  },

  async loadDish(id) {
    const res = await app.callCloud('manageDish', { action: 'list' });
    const all = ((res && res.dishes) || []).map((d) => app.normalizeDish(d));
    const dish = all.find((d) => d._id === id);
    if (!dish) return;
    const cuisines = this.data.cuisines;
    const categories = this.data.categories;
    const cuisineIndex = Math.max(0, cuisines.findIndex((c) => c.key === dish.cuisine));
    const categoryIndex = Math.max(0, categories.findIndex((c) => c.key === dish.category));
    const difficultyIndex = Math.max(0, CONST.DIFFICULTIES.indexOf(dish.difficulty));
    this.setData({
      name: dish.name || '',
      emoji: dish.emoji || '🍳',
      cuisineIndex,
      categoryIndex,
      difficultyIndex,
      time: dish.time ? String(dish.time) : '20',
      desc: dish.desc || '',
      tagsText: (dish.tags || []).join('，'),
      kcalText: dish.kcal ? String(dish.kcal) : '',
      benefit: dish.benefit || '',
      nutritionTagsText: (dish.nutritionTags || []).join('，'),
      ingredients: (dish.ingredients || []).map((ing, index) =>
        typeof ing === 'string' ? { name: ing, amount: '', index } : Object.assign({}, ing, { index })
      ),
      steps: (dish.steps || []).map((step, index) =>
        typeof step === 'string' ? { text: step, index } : Object.assign({}, step, { index })
      ),
      tips: dish.tips || '',
      imageCloud: dish.image || ''
    });
    if (!this.data.ingredients.length) this.addIngredient();
    if (!this.data.steps.length) this.addStep();
  },

  onName(e) { this.setData({ name: e.detail.value }); },
  onEmoji(e) { this.setData({ emoji: e.currentTarget.dataset.emoji }); },
  onCuisine(e) { this.setData({ cuisineIndex: Number(e.detail.value) }); },
  onCategory(e) { this.setData({ categoryIndex: Number(e.detail.value) }); },
  onDifficulty(e) { this.setData({ difficultyIndex: Number(e.detail.value) }); },
  onTime(e) { this.setData({ time: e.detail.value }); },
  onDesc(e) { this.setData({ desc: e.detail.value }); },
  onTags(e) { this.setData({ tagsText: e.detail.value }); },
  onKcal(e) { this.setData({ kcalText: e.detail.value }); },
  onBenefit(e) { this.setData({ benefit: e.detail.value }); },
  onNutritionTags(e) { this.setData({ nutritionTagsText: e.detail.value }); },
  onTips(e) { this.setData({ tips: e.detail.value }); },

  addIngredient() {
    const ingredients = this.data.ingredients.slice();
    ingredients.push({ name: '', amount: '', index: Date.now() });
    this.setData({ ingredients });
  },

  removeIngredient(e) {
    const key = Number(e.currentTarget.dataset.key);
    const ingredients = this.data.ingredients.filter((item) => item.index !== key);
    this.setData({ ingredients });
  },

  onIngName(e) {
    const key = Number(e.currentTarget.dataset.key);
    this.patchItem('ingredients', key, { name: e.detail.value });
  },

  onIngAmount(e) {
    const key = Number(e.currentTarget.dataset.key);
    this.patchItem('ingredients', key, { amount: e.detail.value });
  },

  addStep() {
    const steps = this.data.steps.slice();
    steps.push({ text: '', index: Date.now() });
    this.setData({ steps });
  },

  removeStep(e) {
    const key = Number(e.currentTarget.dataset.key);
    const steps = this.data.steps.filter((item) => item.index !== key);
    this.setData({ steps });
  },

  onStepText(e) {
    const key = Number(e.currentTarget.dataset.key);
    this.patchItem('steps', key, { text: e.detail.value });
  },

  patchItem(listName, key, patch) {
    const list = this.data[listName].map((item) =>
      item.index === key ? Object.assign({}, item, patch) : item
    );
    this.setData({ [listName]: list });
  },

  chooseImage() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: (res) => {
        const file = res.tempFiles && res.tempFiles[0];
        if (!file) return;
        this.setData({ imageLocal: file.tempFilePath, imageCloud: '' });
      }
    });
  },

  removeImage() {
    this.setData({ imageLocal: '', imageCloud: '' });
  },

  async save() {
    if (this.data.saving) return;
    const name = this.data.name.trim();
    if (!name) {
      wx.showToast({ title: '请填菜名', icon: 'none' });
      return;
    }
    const ingredients = this.data.ingredients
      .map((item) => ({ name: item.name.trim(), amount: item.amount.trim() }))
      .filter((item) => item.name);
    const steps = this.data.steps
      .map((item) => item.text.trim())
      .filter(Boolean);
    const tags = this.data.tagsText
      .split(/[，,、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);
    const nutritionTags = this.data.nutritionTagsText
      .split(/[，,、\s]+/)
      .map((t) => t.trim())
      .filter(Boolean);

    this.setData({ saving: true });
    wx.showLoading({ title: '保存中' });
    try {
      let image = this.data.imageCloud || '';
      if (this.data.imageLocal) {
        image = await this.uploadImage(this.data.imageLocal);
      }
      const dish = {
        name,
        emoji: this.data.emoji,
        cuisine: this.data.cuisines[this.data.cuisineIndex].key,
        category: this.data.categories[this.data.categoryIndex].key,
        difficulty: this.data.difficulties[this.data.difficultyIndex],
        time: Number(this.data.time) || 20,
        desc: this.data.desc.trim(),
        tags,
        kcal: Math.max(0, Number(this.data.kcalText) || 0),
        benefit: this.data.benefit.trim(),
        nutritionTags,
        ingredients,
        steps,
        tips: this.data.tips.trim(),
        image
      };
      const res = await app.callCloud('manageDish', {
        action: this.data.isEdit ? 'update' : 'add',
        id: this.data.id,
        dish
      });
      if (res && res.ok) {
        wx.showToast({ title: this.data.isEdit ? '已更新' : '已上传 🎉', icon: 'none' });
        setTimeout(() => wx.navigateBack(), 600);
      } else {
        wx.showToast({ title: '保存失败', icon: 'none' });
      }
    } catch (err) {
      wx.showToast({ title: '保存失败', icon: 'none' });
    } finally {
      wx.hideLoading();
      this.setData({ saving: false });
    }
  },

  uploadImage(path) {
    const extMatch = path.match(/\.[a-zA-Z0-9]+$/);
    const ext = extMatch ? extMatch[0] : '.jpg';
    const cloudPath = `dishes/${Date.now()}-${Math.floor(Math.random() * 10000)}${ext}`;
    return wx.cloud
      .uploadFile({ cloudPath, filePath: path })
      .then((res) => res.fileID);
  }
});
