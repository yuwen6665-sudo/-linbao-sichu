// store.js - 菜谱仓库
// 内置菜谱 + 用户的「修改/新增/删除」叠加在一起，统一对外提供数据。
// 用户数据存在 storage：
//   ql_recipe_edits : { [id]: 修改后的完整菜谱对象 }  (覆盖内置或新增)
//   ql_recipe_deletes : [ id, ... ]  (被删除的内置菜谱 id)

const base = require('./data.js');

const EDITS_KEY = 'ql_recipe_edits';
const DELETES_KEY = 'ql_recipe_deletes';

function loadEdits() {
  const v = wx.getStorageSync(EDITS_KEY);
  return v && typeof v === 'object' ? v : {};
}
function saveEdits(edits) {
  wx.setStorageSync(EDITS_KEY, edits);
}
function loadDeletes() {
  const v = wx.getStorageSync(DELETES_KEY);
  return Array.isArray(v) ? v : [];
}
function saveDeletes(arr) {
  wx.setStorageSync(DELETES_KEY, arr);
}

// 获取全部菜谱（合并内置 + 用户数据）
function getAllRecipes() {
  const edits = loadEdits();
  const deletes = loadDeletes();
  const map = {};

  // 1. 内置菜谱
  base.RECIPES.forEach((r) => {
    if (deletes.indexOf(r.id) < 0) {
      map[r.id] = r;
    }
  });
  // 2. 用户修改/新增覆盖
  Object.keys(edits).forEach((id) => {
    map[id] = edits[id];
  });

  // 新增的排前面，方便看到
  const list = Object.keys(map).map((id) => map[id]);
  list.sort((a, b) => (b._createdAt || 0) - (a._createdAt || 0));
  return list;
}

function getRecipe(id) {
  return getAllRecipes().find((r) => r.id === id) || null;
}

// 保存一个菜谱（新增或修改）
function saveRecipe(recipe) {
  const edits = loadEdits();
  edits[recipe.id] = recipe;
  saveEdits(edits);
}

// 删除一个菜谱
function deleteRecipe(id) {
  const edits = loadEdits();
  if (edits[id]) {
    delete edits[id];
    saveEdits(edits);
  }
  // 如果是内置菜谱，记入删除名单
  if (base.RECIPES.some((r) => r.id === id)) {
    const deletes = loadDeletes();
    if (deletes.indexOf(id) < 0) {
      deletes.push(id);
      saveDeletes(deletes);
    }
  }
}

// 判断是否是用户新增的（非内置）
function isCustom(id) {
  return !base.RECIPES.some((r) => r.id === id);
}

// 生成新菜谱 id
function genId() {
  return 'custom-' + Date.now() + '-' + Math.floor(Math.random() * 1000);
}

// 全部食材标签
function getAllIngredientTags() {
  const set = new Set();
  getAllRecipes().forEach((r) => (r.tags || []).forEach((t) => set.add(t)));
  return [...set];
}

module.exports = {
  CUISINES: base.CUISINES,
  CATEGORIES: base.CATEGORIES,
  SWEET_PHRASES: base.SWEET_PHRASES,
  randomPhrase: base.randomPhrase,
  EMOJI_CHOICES: base.EMOJI_CHOICES,
  getAllRecipes,
  getRecipe,
  saveRecipe,
  deleteRecipe,
  isCustom,
  genId,
  getAllIngredientTags,
};
