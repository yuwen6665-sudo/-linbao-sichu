// 琳宝私厨 - 全局常量

const CUISINES = [
  { key: 'all', name: '全部', emoji: '🍽️' },
  { key: '川菜', name: '川菜', emoji: '🌶️' },
  { key: '粤菜', name: '粤菜', emoji: '🦐' },
  { key: '湘菜', name: '湘菜', emoji: '🥵' },
  { key: '东北菜', name: '东北菜', emoji: '🥟' },
  { key: '家常菜', name: '家常菜', emoji: '🏠' },
  { key: '西餐', name: '西餐', emoji: '🍝' },
  { key: '汤羹', name: '汤羹', emoji: '🍲' },
  { key: '甜点', name: '甜点', emoji: '🍰' }
];

const CATEGORIES = [
  { key: 'all', name: '全部', emoji: '🍴' },
  { key: '热菜', name: '热菜', emoji: '🍲' },
  { key: '荤菜', name: '荤菜', emoji: '🍖' },
  { key: '素菜', name: '素菜', emoji: '🥬' },
  { key: '汤品', name: '汤品', emoji: '🥣' },
  { key: '主食', name: '主食', emoji: '🍚' },
  { key: '凉菜', name: '凉菜', emoji: '🥗' },
  { key: '小吃', name: '小吃', emoji: '🍟' },
  { key: '甜品饮品', name: '甜品饮品', emoji: '🧁' },
  { key: '早餐', name: '早餐', emoji: '🥪' }
];

const DIFFICULTIES = ['简单', '中等', '较难'];

const EMOJI_CHOICES = [
  '🍗', '🌶️', '🥢', '🦐', '🐟', '🍅', '🥔', '🥩', '🥬', '🫛',
  '🍆', '🍲', '🥣', '🌽', '🍚', '🍜', '🍝', '🍟', '🌰', '🥭',
  '🍮', '🍯', '🍳', '🍱', '🍛', '🍤', '🥗', '🥘', '🫕', '🍰',
  '🧁', '🍦', '🥟', '🥡', '🍙', '🍢', '🍡', '🧀', '🥓', '🍖',
  '🍕', '🥯', '🦞', '🍔', '🥞', '🍣'
];

const SWEET_PHRASES = [
  '收到啦，汶宝这就为你下厨 ❤',
  '你点的菜，是我最爱做的菜 🥰',
  '今天也要乖乖吃饭，吃饱饱才有力气想我 😘',
  '为你做饭，是我每天最开心的事 🍳',
  '菜马上就好，先亲一个垫垫肚子 💋',
  '你负责美美哒，做饭交给我就好 ❤',
  '这顿饭里，全是我对你的喜欢 🍲',
  '等我把爱意都炒进这道菜里 🔥',
  '能给你做饭的每一天，都很幸福 🌷',
  '点得好，我家宝贝最有眼光啦 ✨',
  '饭做好了第一个端给你，永远的 VIP 🎀',
  '愿这一餐，温暖你的胃也甜了你的心 🍰',
  '已经记下啦，马上开火 🍳',
  '今天也是想把你喂饱饱的一天 🌸'
];

const STATUS_TEXT = {
  pending: '待接单',
  cooking: '制作中',
  done: '已完成',
  cancelled: '已取消'
};

const MOODS = ['开心', '普通', '想吃好的'];

module.exports = {
  CUISINES,
  CATEGORIES,
  DIFFICULTIES,
  EMOJI_CHOICES,
  SWEET_PHRASES,
  STATUS_TEXT,
  MOODS
};
