const PAPER_WIDTH = 800;
const PAPER_HEIGHT = 1040;
const PAPER_SERIF = '"Songti SC", "Noto Serif SC", "STSong", "SimSun", serif';
const PAPER_SANS = '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
const PRESS_RED = '#972a21';
const PRESS_INK = '#242018';

const photoPromises = new Map();
const proofVersions = new WeakMap();

function loadPaperImage(source) {
  return new Promise(resolve => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = source;
  });
}

function photoAsset(name) {
  if (!photoPromises.has(name)) photoPromises.set(name, loadPaperImage(PAPER_ASSET_URLS[name] || name));
  return photoPromises.get(name);
}

async function prepareCoverPhoto(file) {
  if (!/\.(jpe?g|png|webp)$/i.test(file.name) && !['image/jpeg','image/png','image/webp'].includes(file.type)) return null;
  if (!file.size || file.size > 20 * 1024 * 1024) return null;
  const url = URL.createObjectURL(file);
  let image;
  try {
    image = await loadPaperImage(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  if (!image || image.naturalWidth * image.naturalHeight > 50000000) return null;

  // Keep the area used by the widest and narrowest crops on the front page.
  const {naturalWidth:width, naturalHeight:height} = image;
  const cropWidth = Math.min(width, height * 505 / 213);
  const cropHeight = Math.min(height, width * 340 / 505);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d', {alpha:false});
  for (const [maxWidth, quality] of [[1150,.9], [1150,.77], [1150,.62], [900,.64], [700,.59], [540,.52]]) {
    const scale = Math.min(1, maxWidth / cropWidth);
    canvas.width = Math.max(1, Math.round(cropWidth * scale));
    canvas.height = Math.max(1, Math.round(cropHeight * scale));
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, (width - cropWidth) / 2, (height - cropHeight) / 2,
      cropWidth, cropHeight, 0, 0, canvas.width, canvas.height);
    const data = canvas.toDataURL('image/jpeg', quality);
    if (validCover(data)) return data;
  }
  return null;
}

function paperFont(ctx, size, weight = 500, family = PAPER_SERIF) {
  ctx.font = weight + ' ' + size + 'px ' + family;
}

function paperText(ctx, text, x, top, size, weight = 500, color = PRESS_INK, family = PAPER_SERIF, maxWidth) {
  paperFont(ctx, size, weight, family);
  ctx.fillStyle = color;
  if (maxWidth === undefined) ctx.fillText(text, x, top);
  else ctx.fillText(text, x, top, maxWidth);
}

function paperTextRight(ctx, text, right, top, size, weight = 500, color = PRESS_INK) {
  paperFont(ctx, size, weight);
  paperText(ctx, text, right - ctx.measureText(text).width, top, size, weight, color);
}

function paperRule(ctx, x1, y1, x2, y2, color, width = 1) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function wrapPaperText(ctx, text, width) {
  const lines = [];
  let line = '';
  for (const char of text) {
    if (line && ctx.measureText(line + char).width > width) {
      const cannotStart = '，。！？、；：）】》」』'.includes(char);
      if (cannotStart && line.length > 1) {
        lines.push(line.slice(0, -1));
        line = line.slice(-1);
      } else {
        lines.push(line.trimEnd());
        line = '';
      }
    }
    line += char;
  }
  if (line) lines.push(line);
  return lines;
}

function paperParagraph(ctx, text, x, y, width, style) {
  const {size, leading, maxLines, weight = 500} = style;
  paperFont(ctx, size, weight);
  const lines = wrapPaperText(ctx, text, width);
  const visible = lines.slice(0, maxLines);
  if (lines.length > maxLines) visible[visible.length - 1] = visible.at(-1).slice(0, -1) + '…';
  visible.forEach((line, i) => paperText(ctx, line, x, y + leading * i, size, weight));
  return y + visible.length * leading;
}

function chinesePaperDate(date) {
  const digits = '〇一二三四五六七八九';
  const [year, month, day] = date.split('-');
  const chinese = n => n < 10 ? digits[n] : (n >= 20 ? digits[Math.floor(n / 10)] : '') + '十' + (n % 10 ? digits[n % 10] : '');
  return Array.from(year, n => digits[Number(n)]).join('') + '年' + chinese(Number(month)) +
    '月' + chinese(Number(day)) + '日　星期六';
}

function drawPaperPhoto(ctx, image, photo, x, y, width, height) {
  if (!image) {
    ctx.fillStyle = '#ddd6c8';
    ctx.fillRect(x, y, width, height);
    paperText(ctx, photo.name + '　资料图暂缺', x + 18, y + 24, 15);
    return;
  }
  const tiled = Number.isInteger(photo.tile);
  const regionWidth = tiled ? image.naturalWidth / 3 : image.naturalWidth;
  const regionHeight = tiled ? image.naturalHeight / 3 : image.naturalHeight;
  const regionX = tiled ? regionWidth * (photo.tile % 3) : 0;
  const regionY = tiled ? regionHeight * Math.floor(photo.tile / 3) : 0;
  const safeBorder = tiled ? 2 : 0;
  const areaWidth = regionWidth - 2 * safeBorder;
  const areaHeight = regionHeight - 2 * safeBorder;
  const ratio = width / height;
  const cropWidth = Math.min(areaWidth, areaHeight * ratio);
  const cropHeight = cropWidth / ratio;
  const topBias = tiled || photo.custom ? .5 : .44;
  ctx.drawImage(
    image,
    regionX + safeBorder + (areaWidth - cropWidth) / 2,
    regionY + safeBorder + (areaHeight - cropHeight) * topBias,
    cropWidth, cropHeight, x, y, width, height
  );
}

function fitPaperParagraph(ctx, text, x, top, width, height, preferred = 14, minimum = 11) {
  let size = preferred;
  let leading;
  let rows;
  for (; size >= minimum; size -= .5) {
    leading = Math.ceil(size * 1.38);
    paperFont(ctx, size);
    rows = wrapPaperText(ctx, text, width);
    if (rows.length * leading <= height || size === minimum) break;
  }
  return paperParagraph(ctx, text, x, top, width, {
    size, leading, maxLines:Math.max(1, Math.floor(height / leading))
  });
}

function fullBody(ctx, paragraphs, left, right, top, bottom, count = 3) {
  const gap = 16;
  const width = (right - left - gap * (count - 1)) / count;
  let size = count === 2 ? 23 : 17;
  let leading;
  let lines;
  for (; size >= 12; size -= .5) {
    leading = Math.ceil(size * 1.42);
    paperFont(ctx, size);
    lines = paragraphs.flatMap((paragraph, index) =>
      wrapPaperText(ctx, (index ? '　　' : '本报讯　') + paragraph, width));
    if (Math.ceil(lines.length / count) * leading <= bottom - top || size === 12) break;
  }
  const rows = Math.ceil(lines.length / count);
  for (let col = 0; col < count; col++) {
    const x = left + col * (width + gap);
    if (col) paperRule(ctx, x - 8, top - 4, x - 8, bottom, '#bdb19b');
    const offset = col * rows;
    lines.slice(offset, offset + rows).forEach((line, row) => paperText(ctx, line, x, top + row * leading, size));
  }
}

function paperFlashes(draft) {
  return (draft.flashes || []).slice(0, draft.adInfo?.placement === 'front' ? 2 : 3);
}

function paperFlashHeight(draft) {
  const count = paperFlashes(draft).length;
  return (count ? 32 + count * 20 : 0) + (draft.replies?.length || 0) * 45;
}

function drawPaperFlashes(ctx, draft, left, right) {
  const flashes = paperFlashes(draft);
  if (!flashes.length) return;
  paperRule(ctx, left, 830, right, 830, '#3b3327', 2);
  paperText(ctx, '城中简讯', left, 840, 13, 800, PRESS_RED);
  flashes.forEach((item, index) => {
    const top = 862 + index * 20;
    paperText(ctx, item.section + (item.stored ? '·存稿' : ''), left, top + 1, 12, 700, '#564b3a');
    paperParagraph(ctx, item.text, left + 74, top, right - left - 74,
      {size:14, leading:19, maxLines:1});
  });
}

function drawPaperReplies(ctx, draft, left, right) {
  const flashes = paperFlashes(draft).length;
  const top = flashes ? 862 + flashes * 20 : 830;
  (draft.replies || []).forEach((reply, index) => {
    const y = top + index * 45;
    paperRule(ctx, left, y, right, y, '#897b64');
    paperText(ctx, reply.label, left, y + 8, 14, 800, PRESS_RED);
    paperParagraph(ctx, reply.text, left + 77, y + 7, right - left - 77, {size:14, leading:17, maxLines:2});
  });
}

function drawFullPaper(ctx, draft, image, photo, photoTop, left, right, line) {
  const sidebar = draft.side.items.length > 0;
  const characters = draft.body.join('').length;
  const photoHeight = Math.max(213, Math.min(340, Math.round(417 - characters * .48)));
  const photoBottom = photoTop + photoHeight;
  if (photo) {
    const photoRight = sidebar ? 539 : right;
    drawPaperPhoto(ctx, image, photo, left, photoTop, photoRight - left, photoHeight);
    paperText(ctx, cityText(photo.name, draft.city), left, photoBottom + 9, 12, 500, '#564b3a', PAPER_SANS);
    paperTextRight(ctx, photo.custom ? '玩家供图' : photo.location ? '地点资料图' : '资料图',
      photoRight, photoBottom + 9, 12, 500, '#564b3a');
  }
  if (photo && sidebar) {
    paperRule(ctx, 554, photoTop + 1, right, photoTop + 1, PRESS_INK, 3);
    paperRule(ctx, 554, photoTop, 554, photoBottom + 22, line);
    paperText(ctx, draft.side.title, 566, photoTop + 12, 23, 850);
    paperRule(ctx, 566, photoTop + 45, right, photoTop + 45, line);
    const sideTop = photoTop + 55;
    const sideHeight = (photoHeight - 39) / draft.side.items.length;
    draft.side.items.forEach((item, index) => {
      const y = sideTop + index * sideHeight;
      const content = paperParagraph(ctx, item.title, 566, y, 200, {size:16, leading:19, maxLines:2, weight:750});
      fitPaperParagraph(ctx, item.text, 566, content + 3, 200, y + sideHeight - content - 8, 13);
      if (index < draft.side.items.length - 1) paperRule(ctx, 566, y + sideHeight - 4, right, y + sideHeight - 4, line);
    });
  }

  fullBody(ctx, draft.body, left, right, photo ? photoBottom + 33 : photoTop, 819, photo ? 3 : 2);

  drawPaperFlashes(ctx, draft, left, right);
  drawPaperReplies(ctx, draft, left, right);
  ctx.save();
  ctx.translate(0, paperFlashHeight(draft));
  paperRule(ctx, left, 830, right, 830, '#3b3327', 2);
  if (sidebar || draft.secondary.length) {
    paperText(ctx, sidebar ? cityText('临渡街巷', draft.city) : '副稿', left, 840, 13, 800, PRESS_RED);
  }
  paperRule(ctx, left, 858, right, 858, line);
  paperRule(ctx, 400, 869, 400, 977, '#b7aa92');
  const frontAd = draft.adInfo?.placement === 'front' ? draft.adInfo : null;
  if (draft.supportPending) {
    const pendingWidth = frontAd ? 351 : right - left;
    ctx.fillStyle = '#e5e0d7';
    ctx.fillRect(left, 869, pendingWidth, 110);
    paperText(ctx, '副稿待定', left + 16, 913, 20, 650, '#68625a');
  }
  const secondary = frontAd ? draft.secondary.slice(0, 1) : draft.secondary;
  secondary.forEach((item, i) => {
    const x = i ? 415 : left;
    let size = 22;
    paperFont(ctx, size, 850);
    const minTitleSize = item.original ? 16 : 18;
    while (size > minTitleSize && ctx.measureText(item.title).width > 351) {
      size--;
      paperFont(ctx, size, 850);
    }
    if (item.original) paperText(ctx, item.title, x, 870, size, 850, PRESS_INK, PAPER_SERIF, 351);
    const y = item.original ? 874 + size :
      paperParagraph(ctx, item.title, x, 870, 351, {size, leading:size + 4, maxLines:2, weight:850});
    fitPaperParagraph(ctx, item.text, x, y + 6, 351, 977 - y - 5);
  });
  if (frontAd) {
    ctx.fillStyle = '#ede0cd';
    ctx.fillRect(415, 869, 351, 110);
    paperText(ctx, '广告 · ' + frontAd.category, 425, 875, 12, 700, PRESS_RED);
    const y = paperParagraph(ctx, frontAd.name, 425, 894, 330, {size:21, leading:24, maxLines:1, weight:850});
    fitPaperParagraph(ctx, frontAd.lines.join(''), 425, y + 4, 330, 973 - y, 13);
  }
  paperRule(ctx, left, 989, right, 989, '#897b64');
  paperText(ctx, newspaperName(draft) + '编辑部', left, 999, 12, 500, '#5a4b3b', PAPER_SERIF, 420);
  paperTextRight(ctx, draft.corrections?.length ? '《小城头条》游戏样报 · 本期有刊后更正' : '《小城头条》游戏样报',
    right, 999, 12, 500, '#5a4b3b');
  ctx.restore();
}

function editionPhoto(draft) {
  // 稿库头版按稿件编号查配图，兼容尚未记录新版配图的旧合订本。
  if (LIBRARY_PHOTO_IDS.has(draft.storyId)) return LIBRARY_PHOTOS.get(LIBRARY_PHOTO_IDS.get(draft.storyId));
  if (Array.isArray(draft.replies) && /^original-[1-3]$/.test(draft.storyId)) return undefined;
  // 第三轮之前签发的 v5 足球头版仍记着 court，按原稿的配图显示。
  const original = draft.image === 'court' &&
    WEEKS[draft.issue - 1]?.stories.find(story => story.id === draft.storyId);
  return PHOTOS[original?.image || draft.image];
}

async function renderNewspaper(canvas, draft) {
  const version = (proofVersions.get(canvas) || 0) + 1;
  proofVersions.set(canvas, version);
  let photo = editionPhoto(draft);
  let image = draft.cover ? await loadPaperImage(draft.cover) : null;
  if (image) photo = {name:'自选头版照片', custom:true};
  else if (photo) image = await photoAsset(photo.file || photo.image || 'scenes');
  if (version !== proofVersions.get(canvas)) return false;

  canvas.width = PAPER_WIDTH * 2;
  const paperHeight = PAPER_HEIGHT + paperFlashHeight(draft);
  canvas.height = paperHeight * 2;
  const ctx = canvas.getContext('2d', {alpha: false});
  ctx.scale(2, 2);
  ctx.textBaseline = 'top';
  const paper = ctx.createLinearGradient(0, 0, PAPER_WIDTH, paperHeight);
  paper.addColorStop(0, '#fbf6e9');
  paper.addColorStop(1, '#f1ead8');
  ctx.fillStyle = paper;
  ctx.fillRect(0, 0, PAPER_WIDTH, paperHeight);

  const left = 34;
  const right = 766;
  const line = '#a1957f';
  paperRule(ctx, left, 28, right, 28, '#544b3d');
  paperText(ctx, chinesePaperDate(draft.date), left, 36, 14, 600);
  paperTextRight(ctx, '总第 ' + String(draft.issue).padStart(3, '0') + ' 期', right, 37, 13);
  paperRule(ctx, left, 59, right, 59, line);
  const masthead = newspaperName(draft);
  let mastSize = 108;
  paperFont(ctx, mastSize, 900);
  while (mastSize > 22 && ctx.measureText(masthead).width > 505) {
    mastSize--;
    paperFont(ctx, mastSize, 900);
  }
  paperText(ctx, masthead, left + 2, 68 + (108 - mastSize) * .58, mastSize, 900, PRESS_RED, PAPER_SERIF, 505);
  paperFont(ctx, 18, 800);
  const badgeWidth = ctx.measureText(draft.name).width + 20;
  ctx.strokeStyle = '#ad574a';
  ctx.lineWidth = 1;
  ctx.strokeRect(right - badgeWidth, 115, badgeWidth, 34);
  paperTextRight(ctx, draft.name, right - 10, 122, 18, 800, PRESS_RED);
  paperTextRight(ctx, '每周六出版　零售价 0.50 元', right, 155, 12);
  paperRule(ctx, left, 181, right, 181, PRESS_RED, 3);
  paperText(ctx, '第一版　要闻', left, 192, 14, 800, PRESS_RED);
  paperTextRight(ctx, draft.section, right, 192, 14, 800, PRESS_RED);
  paperRule(ctx, left, 214, right, 214, PRESS_RED);

  let titleSize = 58;
  paperFont(ctx, titleSize, 900);
  while (ctx.measureText(draft.title).width > right - left && titleSize > 29) {
    titleSize--;
    paperFont(ctx, titleSize, 900);
  }
  paperText(ctx, draft.title, left, 230 + (58 - titleSize) / 2, titleSize, 900, PRESS_INK, PAPER_SERIF, right - left);
  const subtitle = paperParagraph(ctx, draft.subtitle, left, 305, right - left, {size: 17, leading: 20, maxLines: 1, weight: 650});
  const photoTop = draft.side.items.length ? subtitle + 15 : 309;
  drawFullPaper(ctx, draft, image, photo, photoTop, left, right, line);
  return true;
}
