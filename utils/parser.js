// parser.js - 文字/图片识别成菜谱
// 1) parseRecipeText: 把一大段菜谱文字，智能拆成 食材 + 步骤 + 贴士
// 2) ocrImage: 调用图片 OCR 把图片转成文字（再交给 parseRecipeText）

// 把一行里的序号、符号去掉
function stripBullet(line) {
  return line
    .replace(/^\s*第?\s*[0-9一二三四五六七八九十]+\s*[、.．:：步)）]\s*/, '')
    .replace(/^\s*[-*·•・>《\[\]]+\s*/, '')
    .trim();
}

// 判断这一行像不像"食材"行（短、可能带数量）
function looksLikeIngredient(line) {
  if (line.length > 22) return false;
  // 含数量单位
  if (/[0-9一二三四五六七八九十两半]\s*(g|克|斤|两|个|根|片|勺|匙|杯|颗|条|只|ml|毫升|大勺|小勺|把|块|瓣|罐|盒)/.test(line)) {
    return true;
  }
  // 含"适量/少许"等
  if (/(适量|少许)/.test(line)) {
    return true;
  }
  return false;
}

// 把一行食材拆成 {name, amount}
function splitIngredient(line) {
  // 常见分隔："鸡蛋 2个" / "鸡蛋：2个" / "鸡蛋2个"
  let m = line.match(/^(.+?)[\s:：,，]+(.+)$/);
  if (m && m[2]) {
    return { name: m[1].trim(), amount: m[2].trim() };
  }
  // 名称紧贴数量： 盐适量 / 牛奶180ml
  m = line.match(/^([^\d0-9]+?)([0-9一二三四五六七八九十两半].*|适量|少许)$/);
  if (m) {
    return { name: m[1].trim(), amount: m[2].trim() };
  }
  return { name: line.trim(), amount: '适量' };
}

// 主函数：把整段文字解析成菜谱片段
function parseRecipeText(text) {
  const result = { name: '', ingredients: [], steps: [], tips: '' };
  if (!text || !text.trim()) return result;

  // 先按行拆
  let rawLines = text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  // 区段标记
  let section = 'auto'; // auto | ingredient | step | tip
  const ingredientHints = /(用料|食材|配料|材料|主料|辅料|准备)/;
  const stepHints = /(做法|步骤|教程|制作|流程)/;
  const tipHints = /(小贴士|贴士|tips|提示|注意|窍门|心得)/i;

  rawLines.forEach((line, idx) => {
    // 第一行如果很短且不含数量，当作菜名
    if (idx === 0 && line.length <= 16 && !looksLikeIngredient(line) && !/[，。；]/.test(line)) {
      result.name = stripBullet(line).replace(/[的]?(做法|食谱|菜谱|教程)$/, '').trim() || line;
      return;
    }

    // 区段标题行
    if (tipHints.test(line) && line.length <= 12) { section = 'tip'; return; }
    if (stepHints.test(line) && line.length <= 12) { section = 'step'; return; }
    if (ingredientHints.test(line) && line.length <= 12) { section = 'ingredient'; return; }

    const clean = stripBullet(line);
    if (!clean) return;

    if (section === 'ingredient') {
      result.ingredients.push(splitIngredient(clean));
    } else if (section === 'step') {
      result.steps.push(clean);
    } else if (section === 'tip') {
      result.tips += (result.tips ? ' ' : '') + clean;
    } else {
      // auto 模式：猜
      if (looksLikeIngredient(clean)) {
        result.ingredients.push(splitIngredient(clean));
      } else {
        result.steps.push(clean);
      }
    }
  });

  // 如果完全没识别出步骤，但有多句话，按句号拆成步骤
  if (result.steps.length === 0 && result.ingredients.length === 0) {
    const sentences = text.split(/[。\n]/).map((s) => s.trim()).filter(Boolean);
    result.steps = sentences;
  }

  return result;
}

// 图片 OCR -> 文字
// 优先用微信插件「微信OCR」，失败则提示
function ocrImage(filePath) {
  return new Promise((resolve, reject) => {
    // 微信基础库提供的本地 OCR（需在 app.json 引入插件时可用）
    // 这里用通用方案：requirePlugin('ocr-plugin')
    let plugin = null;
    try {
      plugin = requirePlugin('ocr-plugin');
    } catch (e) {
      plugin = null;
    }

    if (plugin && plugin.ocr) {
      plugin.ocr({
        path: filePath,
        success: (res) => resolve(extractText(res)),
        fail: reject,
      });
      return;
    }

    // 没有插件时，尝试 wx.serviceMarket（部分基础库支持）
    if (wx.serviceMarket && wx.serviceMarket.invokeService) {
      wx.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success: (r) => {
          wx.serviceMarket.invokeService({
            service: 'wx79ac3de8be320b71',
            api: 'OcrAllInOne',
            data: { img_data: r.data, data_type: 2, ocr_type: 1 },
            success: (resp) => resolve(extractServiceText(resp)),
            fail: reject,
          });
        },
        fail: reject,
      });
      return;
    }

    reject(new Error('NO_OCR'));
  });
}

function extractText(res) {
  if (!res) return '';
  if (typeof res.text === 'string') return res.text;
  if (Array.isArray(res.items)) return res.items.map((i) => i.text).join('\n');
  if (Array.isArray(res.lines)) return res.lines.map((i) => i.text || i).join('\n');
  return '';
}

function extractServiceText(resp) {
  try {
    const d = resp.data || resp;
    if (d.ocr_comm && Array.isArray(d.ocr_comm.items)) {
      return d.ocr_comm.items.map((i) => i.text).join('\n');
    }
  } catch (e) {}
  return '';
}

module.exports = {
  parseRecipeText,
  ocrImage,
};
