const PAPER_WIDTH = 800;
const PAPER_HEIGHT = 1040;
const PAPER_SERIF = '"Songti SC", "Noto Serif SC", "STSong", "SimSun", serif';
const PAPER_SANS = '"PingFang SC", "Noto Sans SC", "Microsoft YaHei", sans-serif';
const PRESS_RED = '#972a21';
const PRESS_INK = '#2B2B2B';

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
  const source = PAPER_ASSET_URLS[name] || name;
  const url = source.startsWith('素材/') ? '素材/印刷图/' + source.split('/').pop().replace(/\.[^.]+$/, '.webp') : source;
  const photo = photoPromises.get(name) || loadPaperImage(url);
  photoPromises.delete(name);
  photoPromises.set(name, photo);
  if (photoPromises.size > 8) photoPromises.delete(photoPromises.keys().next().value);
  return photo;
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

function certificateText({year, date, issue, title, paperName, editorName}) {
  return {
    award:year + ' 年度省好新闻奖', recipient:'《' + paperName + '》编辑部', work:'《' + title + '》',
    credit:'总第 ' + String(issue).padStart(3, '0') + ' 期' + (editorName ? ' · 总编辑 ' + editorName : ''),
    issuer:'省好新闻奖评审委员会', date:chinesePaperDate(date).split('　')[0]
  };
}

function renderAwardCertificate(canvas, certificate) {
  const text = certificateText(certificate);
  const center = PAPER_WIDTH / 2;
  const metrics = canvas.getContext('2d', {alpha:false});
  paperFont(metrics, 30, 750);
  const recipient = wrapPaperText(metrics, text.recipient, PAPER_WIDTH - 134);
  paperFont(metrics, 35, 750);
  const textWidth = PAPER_WIDTH - 134;
  let work = wrapPaperText(metrics, text.work, textWidth);
  if (work.length > 1 && metrics.measureText(work.at(-1)).width < textWidth * .4) {
    const balanced = wrapPaperText(metrics, text.work, metrics.measureText(text.work).width / work.length + 42);
    if (balanced.length === work.length) work = balanced;
  }
  const introY = 203 + recipient.length * 38 + 12;
  const workY = introY + 34;
  const awardY = workY + work.length * 46 + 10;
  const creditY = awardY + 39;
  const height = Math.max(560, Math.ceil((creditY + 150) / 20) * 20);
  const ctx = paperCanvas(canvas, height, 'wheat');
  ctx.fillStyle = '#faf3e1';
  ctx.fillRect(0, 0, PAPER_WIDTH, height);
  ctx.strokeStyle = '#96744a';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(23, 23, PAPER_WIDTH - 46, height - 46);
  ctx.lineWidth = 1;
  ctx.strokeRect(31, 31, PAPER_WIDTH - 62, height - 62);

  const ink = '#382b1f';
  const muted = '#6e5440';
  ctx.textAlign = 'center';
  paperText(ctx, text.award, center, 67, 23, 700, '#805e38', PAPER_SANS);
  paperText(ctx, '获奖证书', center, 107, 66, 800, '#913329');
  recipient.forEach((line, index) => paperText(ctx, line, center, 203 + index * 38, 30, 750, ink));
  paperText(ctx, '贵报刊发的报道', center, introY, 21, 500, ink);
  work.forEach((line, index) => paperText(ctx, line, center, workY + index * 46, 35, 750, ink));
  paperText(ctx, '荣获省好新闻奖，特颁此证。', center, awardY, 22, 500, ink);
  paperText(ctx, text.credit, center, creditY, 19, 500, muted);

  ctx.textAlign = 'right';
  paperText(ctx, text.issuer, PAPER_WIDTH - 155, height - 114, 22, 750, muted);
  paperText(ctx, text.date, PAPER_WIDTH - 155, height - 85, 21, 500, muted);
  ctx.save();
  ctx.translate(PAPER_WIDTH - 103, height - 86);
  ctx.rotate(-Math.PI / 30);
  ctx.strokeStyle = '#9d3d32';
  ctx.lineWidth = 3;
  ctx.strokeRect(-35, -35, 70, 70);
  ctx.lineWidth = 1;
  ctx.strokeRect(-30, -30, 60, 60);
  ctx.textAlign = 'center';
  paperText(ctx, '省奖', 0, -24, 21, 750, '#9d3d32');
  paperText(ctx, '评审', 0, 1, 21, 750, '#9d3d32');
  ctx.restore();
}

function drawPaperPhoto(ctx, image, photo, x, y, width, height, equipment) {
  if (!image) {
    ctx.fillStyle = '#ddd6c8';
    ctx.fillRect(x, y, width, height);
    paperText(ctx, photo.name + '　本报资料图暂缺', x + 18, y + 24, 15);
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
  ctx.save();
  if (equipment != null && equipment < 2) ctx.filter = 'grayscale(1)';
  ctx.drawImage(
    image,
    regionX + safeBorder + (areaWidth - cropWidth) / 2,
    regionY + safeBorder + (areaHeight - cropHeight) * topBias,
    cropWidth, cropHeight, x, y, width, height
  );
  ctx.restore();
  if (equipment >= 2) {
    // 资料照片来自黑白底片，套一层青墨；自备彩照直接按原色印刷。
    if (!photo.custom) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = '#163546';
      ctx.fillRect(x,y,width,height);
      ctx.restore();
    }
    ['#16788c','#a53257','#c29a2c','#343434'].forEach((ink,i) => {
      ctx.fillStyle=ink; ctx.fillRect(x+i*12,y+height-4,12,4);
    });
  }
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

function fullBody(ctx, paragraphs, left, right, top, bottom, count = 3, minimum = 12) {
  const gap = 16;
  const width = (right - left - gap * (count - 1)) / count;
  let size = count === 2 ? 23 : 17;
  let leading;
  let lines;
  for (; size >= minimum; size -= .5) {
    leading = Math.ceil(size * 1.42);
    paperFont(ctx, size);
    lines = paragraphs.flatMap((paragraph, index) =>
      wrapPaperText(ctx, (index ? '　　' : '本报讯　') + paragraph, width));
    if (Math.ceil(lines.length / count) * leading <= bottom - top || size === minimum) break;
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

function drawPaperFlashes(ctx, draft, left, right, start = 830) {
  const flashes = paperFlashes(draft);
  if (!flashes.length) return;
  paperRule(ctx, left, start, right, start, '#3b3327', 2);
  paperText(ctx, '城中简讯', left, start + 10, 13, 800, PRESS_RED);
  flashes.forEach((item, index) => {
    const top = start + 32 + index * 20;
    paperText(ctx, item.section + (item.stored ? '·存稿' : ''), left, top + 1, 12, 700, '#564b3a');
    paperParagraph(ctx, item.text, left + 74, top, right - left - 74,
      {size:14, leading:19, maxLines:1});
  });
}

function drawPaperReplies(ctx, draft, left, right, start = 830) {
  const flashes = paperFlashes(draft).length;
  const top = flashes ? start + 32 + flashes * 20 : start;
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
    drawPaperPhoto(ctx, image, photo, left, photoTop, photoRight - left, photoHeight,draft.equipment);
    paperText(ctx, cityText(photo.name, draft.city), left, photoBottom + 9, 12, 500, '#564b3a', PAPER_SANS);
    paperTextRight(ctx, photo.custom ? '供图' : '本报资料图',
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
  if (sidebar) paperText(ctx, cityText('临渡街巷', draft.city), left, 840, 13, 800, PRESS_RED);
  paperRule(ctx, left, 858, right, 858, line);
  const frontAd = draft.adInfo?.placement === 'front' ? draft.adInfo : null;
  const secondary = frontAd ? draft.secondary.slice(0, 1) : draft.secondary;
  if (frontAd || secondary.length > 1) paperRule(ctx, 400, 869, 400, 977, '#b7aa92');
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
    paperParagraph(ctx, item.text, x, y + 6, 351, {size:14, leading:19, maxLines:2});
  });
  if (frontAd) {
    drawEditionAd(ctx, frontAd, 415, 869, 351, 110);
  }
  drawEditionFooter(ctx, draft, left, right, 989);
  ctx.restore();
}

function drawEditionFooter(ctx, draft, left, right, y) {
  paperRule(ctx, left, y, right, y, '#897b64');
  paperText(ctx, newspaperName(draft) + '编辑部', left, y + 10, 12, 500, '#5a4b3b', PAPER_SERIF, 420);
  if (draft.editorName) paperTextRight(ctx, '总编辑：' + draft.editorName, right, y + 10, 12, 600, '#5a4b3b');
}

function drawEditionTitle(ctx, title, x, y, width, preferred, minimum) {
  let size = preferred;
  for (; size > minimum; size--) {
    paperFont(ctx, size, 900);
    if (wrapPaperText(ctx, title, width).length <= (size > preferred * .78 ? 1 : 2)) break;
  }
  return paperParagraph(ctx, title, x, y, width, {size, leading:size + 4, maxLines:2, weight:900});
}

function drawEditionPhoto(ctx, draft, photo, image, x, y, width, height) {
  drawPaperPhoto(ctx, image, photo, x, y, width, height,draft.equipment);
  paperText(ctx, cityText(photo.name, draft.city), x, y + height + 6, 12, 500, '#564b3a', PAPER_SANS, width - 60);
  paperTextRight(ctx, photo.custom ? '供图' : '本报资料图', x + width, y + height + 6, 12, 500, '#564b3a');
  return y + height + 26;
}

function drawEditionAd(ctx, ad, x, y, width, height, banner = false) {
  ctx.fillStyle = 'rgba(173, 125, 65, .17)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#9c8265';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + .5, y + .5, width - 1, height - 1);
  paperTextRight(ctx, '广告', x + width - 10, y + 8, 12, 650, '#684931');
  const bottom = drawEditionTitle(ctx, ad.name, x + 12, y + 24, width - 24, banner ? 34 : 23, 14);
  paperParagraph(ctx, ad.lines.join(' '), x + 12, bottom + 3, width - 24,
    {size:banner ? 17 : 14, leading:banner ? 22 : 18, maxLines:2});
}

function editionSideBlocks(draft) {
  const blocks = SECONDARY_SLOTS.map(slot => {
    const ad = draft.slotAds?.find(offer => offer.placement === slot);
    const news = draft.secondary.find(item => item.slot === slot);
    return ad ? {ad} : news ? {news} : null;
  });
  const legacySlot = blocks.lastIndexOf(null);
  if (draft.adInfo?.placement === 'front' && legacySlot >= 0) blocks[legacySlot] = {ad:draft.adInfo};
  return blocks.map((block, index) =>
    block || (draft.emptySlots?.includes(SECONDARY_SLOTS[index]) ? {empty:true} : null)).filter(Boolean);
}

function drawEmptySlot(ctx, x, y, width, height) {
  ctx.fillStyle = 'rgba(255, 255, 255, .46)';
  ctx.fillRect(x, y, width, height);
  ctx.strokeStyle = '#b6ab96';
  ctx.lineWidth = 1.4;
  ctx.strokeRect(x + .7, y + .7, width - 1.4, height - 1.4);
}

function drawSideBlock(ctx, block, x, y, width, height) {
  if (block.empty) {
    drawEmptySlot(ctx, x, y, width, height);
    return;
  }
  if (block.ad) {
    drawEditionAd(ctx, block.ad, x, y, width, height);
    return;
  }
  paperRule(ctx, x, y, x + width, y, '#a1957f');
  const bottom = drawEditionTitle(ctx, block.news.title, x, y + 9, width, 25, 15);
  paperParagraph(ctx, block.news.text, x, bottom + 5, width, {size:15, leading:21, maxLines:2});
}

function drawSideRow(ctx, blocks, left, right, y, height) {
  const gap = 22;
  const width = Math.min(355, (right - left - gap * (blocks.length - 1)) / (blocks.length || 1));
  blocks.forEach((block, i) => drawSideBlock(ctx, block, left + i * (width + gap), y, width, height));
}

function drawLeadEdition(ctx, draft, photo, image, left, right, blocks) {
  const width = right - left;
  let y = drawEditionTitle(ctx, draft.title, left, 230, width, 74, 38) + 10;
  const bodyBottom = blocks.length ? 846 : 972;
  if (photo) y = drawEditionPhoto(ctx, draft, photo, image, left, y, width, 304);
  fullBody(ctx, draft.body, left, right, y, bodyBottom, 3, 10);
  drawSideRow(ctx, blocks, left, right, 861, 112);
}

function drawBalancedEdition(ctx, draft, photo, image, left, right, blocks) {
  const mainRight = blocks.length ? 508 : right;
  const width = mainRight - left;
  let y = drawEditionTitle(ctx, draft.title, left, 230, width, 54, 28) + 12;
  if (photo) y = drawEditionPhoto(ctx, draft, photo, image, left, y, width, 263);
  fullBody(ctx, draft.body, left, mainRight, y, 972, blocks.length ? 2 : 3, 10);
  if (blocks.length) paperRule(ctx, 523, 232, 523, 973, '#a1957f');
  blocks.forEach((block, i) => drawSideBlock(ctx, block, 539, 233 + i * 188, right - 539, 160));
}

function drawPhotoEdition(ctx, draft, photo, image, left, right, blocks) {
  const width = right - left;
  const titleY = drawEditionPhoto(ctx, draft, photo, image, left, 226, width, 358);
  const y = drawEditionTitle(ctx, draft.title, left, titleY + 3, width, 56, 29) + 8;
  fullBody(ctx, draft.body, left, right, y, blocks.length ? 844 : 972, 3, 10);
  drawSideRow(ctx, blocks, left, right, 861, 112);
}

function drawBannerEdition(ctx, draft, photo, image, left, right, blocks) {
  const fixed = draft.emptySlots != null;
  const side = fixed ? [] : blocks.filter(block => block.news);
  const mainRight = side.length ? 504 : right;
  const mainWidth = mainRight - left;
  let y = drawEditionTitle(ctx, draft.title, left, 229, mainWidth, 52, 25) + 10;
  if (photo) y = drawEditionPhoto(ctx, draft, photo, image, left, y, mainWidth, 173);
  fullBody(ctx, draft.body, left, mainRight, y, 796, side.length ? 2 : 3, 10);
  if (side.length) paperRule(ctx, 518, 232, 518, 797, '#a1957f');
  side.forEach((block, i) => drawSideBlock(ctx, block, 532, 233 + i * 168, right - 532, 145));
  const banner = fixed ? blocks : blocks.filter(block => block.ad);
  const width = (right - left) / (banner.length || 1);
  if (!banner.length) {
    paperRule(ctx, left, 811, right, 811, '#a1957f');
    paperRule(ctx, left, 973, right, 973, '#a1957f');
  }
  banner.forEach((block, i) => {
    const x = left + i * width;
    if (block.ad) drawEditionAd(ctx, block.ad, x, 811, width, 162, true);
    else drawSideBlock(ctx, block, x, 811, width, 162);
  });
}

const EDITION_DRAWERS = {
  lead:drawLeadEdition, balanced:drawBalancedEdition, photo:drawPhotoEdition, banner:drawBannerEdition
};

function editionPhoto(draft) {
  // 稿库头版按稿件编号查配图，兼容尚未记录新版配图的旧合订本。
  if (LIBRARY_PHOTO_IDS.has(draft.storyId)) return LIBRARY_PHOTOS.get(LIBRARY_PHOTO_IDS.get(draft.storyId));
  if (Array.isArray(draft.replies) && /^original-[1-3]$/.test(draft.storyId)) return undefined;
  // 第三轮之前签发的 v5 足球头版仍记着 court，按原稿的配图显示。
  const original = draft.image === 'court' &&
    WEEKS[draft.issue - 1]?.stories.find(story => story.id === draft.storyId);
  return PHOTOS[original?.image || draft.image];
}

function paperCanvas(canvas, height, stock) {
  canvas.width = PAPER_WIDTH * 2;
  canvas.height = height * 2;
  const ctx = canvas.getContext('2d', {alpha: false});
  ctx.scale(2, 2);
  ctx.textBaseline = 'top';
  ctx.fillStyle = paperStock(stock).color;
  ctx.fillRect(0, 0, PAPER_WIDTH, height);
  return ctx;
}

function drawPaperMasthead(ctx, masthead, left, right, {date, issue, badge, note, section, column, mastInk = PRESS_RED}) {
  paperRule(ctx, left, 28, right, 28, '#544b3d');
  paperText(ctx, date, left, 36, 14, 600);
  paperTextRight(ctx, issue, right, 37, 13);
  paperRule(ctx, left, 59, right, 59, '#a1957f');
  const mastheadRule = 181;
  const ruleWidth = 3;
  const ruleTop = mastheadRule - ruleWidth / 2;
  ctx.textBaseline = 'alphabetic';
  let mastSize = 108;
  let mastDescent;
  for (; mastSize >= 22; mastSize--) {
    paperFont(ctx, mastSize, 900);
    const metrics = ctx.measureText(masthead);
    mastDescent = metrics.actualBoundingBoxDescent ?? mastSize * .12;
    const ascent = metrics.actualBoundingBoxAscent ?? mastSize * .88;
    if (mastSize === 22 || (metrics.width <= 505 && ascent + mastDescent <= ruleTop - mastSize * .15 - 65)) break;
  }
  paperText(ctx, masthead, left + 2, ruleTop - mastSize * .15 - mastDescent, mastSize, 900, mastInk, PAPER_SERIF, 505);
  ctx.textBaseline = 'top';
  paperFont(ctx, 18, 800);
  const badgeWidth = ctx.measureText(badge).width + 20;
  ctx.strokeStyle = '#ad574a';
  ctx.lineWidth = 1;
  ctx.strokeRect(right - badgeWidth, 115, badgeWidth, 34);
  paperTextRight(ctx, badge, right - 10, 122, 18, 800, PRESS_RED);
  paperTextRight(ctx, note, right, 155, 12);
  paperRule(ctx, left, mastheadRule, right, mastheadRule, PRESS_RED, ruleWidth);
  paperText(ctx, section, left, 192, 14, 800, PRESS_RED);
  paperTextRight(ctx, column, right, 192, 14, 800, PRESS_RED);
  paperRule(ctx, left, 214, right, 214, PRESS_RED);
}

async function renderNewspaper(canvas, draft, stock) {
  const version = (proofVersions.get(canvas) || 0) + 1;
  proofVersions.set(canvas, version);
  let photo = editionPhoto(draft);
  let image = draft.cover ? await loadPaperImage(draft.cover) : null;
  if (image) photo = {name:'自选头版照片', custom:true};
  else if (photo) image = await photoAsset(photo.file || photo.image || 'scenes');
  if (version !== proofVersions.get(canvas)) return false;

  const ctx = paperCanvas(canvas, PAPER_HEIGHT + paperFlashHeight(draft), stock);
  const left = 34;
  const right = 766;
  drawPaperMasthead(ctx, newspaperName(draft), left, right, {
    mastInk:draft.equipment === 0 ? PRESS_INK : PRESS_RED, date:chinesePaperDate(draft.date), issue:'总第 ' + String(draft.issue).padStart(3, '0') + ' 期',
    badge:draft.name, note:'每周六出版　零售价 0.50 元', section:'第一版　要闻', column:draft.section
  });

  if (draft.layout) {
    const draw = draft.layout === 'photo' && !photo ? drawBalancedEdition : EDITION_DRAWERS[draft.layout];
    draw(ctx, draft, photo, image, left, right, editionSideBlocks(draft));
    drawPaperFlashes(ctx, draft, left, right, 985);
    drawPaperReplies(ctx, draft, left, right, 985);
    drawEditionFooter(ctx, draft, left, right, 989 + paperFlashHeight(draft));
    return true;
  }

  let titleSize = 58;
  paperFont(ctx, titleSize, 900);
  while (ctx.measureText(draft.title).width > right - left && titleSize > 29) {
    titleSize--;
    paperFont(ctx, titleSize, 900);
  }
  paperText(ctx, draft.title, left, 230 + (58 - titleSize) / 2, titleSize, 900, PRESS_INK, PAPER_SERIF, right - left);
  const subtitle = paperParagraph(ctx, draft.subtitle, left, 305, right - left, {size: 17, leading: 20, maxLines: 1, weight: 650});
  const photoTop = draft.side.items.length ? subtitle + 15 : 309;
  drawFullPaper(ctx, draft, image, photo, photoTop, left, right, '#a1957f');
  return true;
}

function renderAnnualPaper(canvas, data, stock, bestCanvas) {
  const extra = data.annualFeedback;
  const firstPageHeight = extra ? Math.max(1150, 1064 + 25 * Math.ceil(data.achievements.length / 2)) : 1150;
  const extraHeight = extra ? 345 + 72 * Math.ceil(extra.clips.length / 13) : 0;
  const roundupHeight = data.roundup ? 125 + data.roundup.lines.length * 28 + Math.max(238, data.roundup.timeline.length * 25) : 0;
  const ctx = paperCanvas(canvas, firstPageHeight + extraHeight + roundupHeight, stock);
  const left = 34;
  const right = 766;
  const {year, issueCount, title, review, stats, best, awardLines, achievements} = data;
  drawPaperMasthead(ctx, newspaperName(data), left, right, {
    date:year + ' 年度回顾', issue:'全年出刊 ' + issueCount + ' 期', badge:data.yearLabel || '年终特刊',
    note:'本报编辑部 编印', section:'年终特刊　编辑部评述', column:'一年的报纸'
  });
  paperText(ctx, title, left, 226, 114, 900, PRESS_INK, PAPER_SERIF, right - left);
  const reviewEnd = paperParagraph(ctx, review, left, 370, right - left,
    {size:21, leading:31, maxLines:5});

  const figuresTop = reviewEnd + 12;
  const cellWidth = (right - left) / 3;
  stats.forEach(([label, value], index) => {
    const row = Math.floor(index / 3);
    const x = left + (index % 3) * cellWidth;
    const y = figuresTop + row * 68;
    paperRule(ctx, x, y, x + cellWidth - 12, y, '#a1957f');
    paperText(ctx, label, x, y + 8, 16, 750, PRESS_RED);
    paperText(ctx, value, x, y + 30, 26, 800, PRESS_INK, PAPER_SANS, cellWidth - 12);
  });

  const featuresTop = figuresTop + 151;
  paperRule(ctx, left, featuresTop, right, featuresTop, PRESS_RED, 2);
  paperText(ctx, '年度最佳头版', left, featuresTop + 12, 23, 850);
  const thumbWidth = 238;
  if (best && bestCanvas) {
    const thumbHeight = Math.min(314, thumbWidth * bestCanvas.height / bestCanvas.width);
    ctx.drawImage(bestCanvas, left, featuresTop + 47, thumbHeight * bestCanvas.width / bestCanvas.height, thumbHeight);
    paperText(ctx, '第 ' + best.issue + ' 期 · 实售 ' + best.soldLabel, left, featuresTop + thumbHeight + 55,
      15, 650, PRESS_INK, PAPER_SERIF, thumbWidth);
  } else paperText(ctx, '合订本暂无已签发的报纸。', left, featuresTop + 55, 16);

  const featuresX = 302;
  paperRule(ctx, featuresX - 15, featuresTop + 12, featuresX - 15, firstPageHeight - 53, '#a1957f');
  paperText(ctx, '获奖与成就', featuresX, featuresTop + 12, 23, 850);
  const columnWidth = right - featuresX;
  let y = featuresTop + 50;
  paperText(ctx, '省好新闻奖', featuresX, y, 17, 750, PRESS_RED);
  y += 28;
  for (const line of awardLines) {
    y = paperParagraph(ctx, line, featuresX, y, columnWidth, {size:17, leading:25, maxLines:2}) + 3;
  }
  paperText(ctx, '报社成就', featuresX, y + 14, 17, 750, PRESS_RED);
  y += 43;
  achievements.forEach((achievement, index) => {
    const x = featuresX + index % 2 * (columnWidth / 2);
    paperText(ctx, achievement, x, y + Math.floor(index / 2) * 25, 17, 500, PRESS_INK, PAPER_SERIF, columnWidth / 2 - 7);
  });
  if (extra) drawAnnualFeedback(ctx, extra, left, right, firstPageHeight - 33);
  if (data.roundup) {
    const y = firstPageHeight + extraHeight - 38;
    paperText(ctx,'编辑部年鉴',left,y,22,800,PRESS_RED);
    data.roundup.lines.forEach((line,i) => paperText(ctx,line,left,y+34+i*28,16,600,PRESS_INK,PAPER_SERIF,right-left));
    const mapTop = y + 45 + data.roundup.lines.length * 28;
    const frame = data.roundup.frames.at(-1);
    if (frame) {
      paperText(ctx,'发行版图 · 第 ' + frame.issue + ' 期 · ' + frame.count + ' 格',left,mapTop,18,750,PRESS_RED);
      ctx.save();
      ctx.translate(left,mapTop+35);
      ctx.scale(.45,.45);
      drawCoverageFrame(ctx,frame);
      ctx.restore();
    }
    paperText(ctx,'本报大事记',left+345,mapTop,19,750,PRESS_RED);
    data.roundup.timeline.forEach((item,i) => paperText(ctx,'第 ' + item.issue + ' 期　' + item.text,left+345,mapTop+34+i*25,14,500,PRESS_INK,PAPER_SERIF,right-left-345));
  }
  drawEditionFooter(ctx, data, left, right, firstPageHeight + extraHeight + roundupHeight - 40);
}

function drawAnnualFeedback(ctx, extra, left, right, top) {
  const width = right - left;
  paperRule(ctx, left, top, right, top, PRESS_RED, 2);
  paperText(ctx, '年度数据', left, top + 14, 27, 850);
  let y = top + 56;
  if (extra.titles.length) {
    paperText(ctx, '附加称号：' + extra.titles.join(' · '), left, y, 16, 750, PRESS_RED);
    y += 29;
  }
  for (const [index, [label, value]] of extra.figures.entries()) {
    const x = left + index % 3 * width / 3;
    const row = y + Math.floor(index / 3) * 51;
    paperText(ctx, label, x, row, 14, 700, PRESS_RED);
    paperText(ctx, value, x, row + 20, 19, 750, PRESS_INK, PAPER_SANS, width / 3 - 8);
  }
  y += 110;
  for (const [label, value] of extra.notes) {
    paperText(ctx, label, left, y, 15, 750, PRESS_RED);
    paperText(ctx, value, left + 134, y, 15, 600, PRESS_INK, PAPER_SERIF, width - 134);
    y += 24;
  }
  paperText(ctx, '全年剪报墙 · ' + extra.clips.length + ' 期', left, y + 5, 22, 850);
  y += 38;
  const cell = width / 13;
  for (const [index, clip] of extra.clips.entries()) {
    const x = left + index % 13 * cell;
    const row = y + Math.floor(index / 13) * 72;
    paperRule(ctx, x, row, x + cell - 4, row, clip.tags.length ? PRESS_RED : '#a1957f', 2);
    paperText(ctx, '第 ' + String(clip.issue).padStart(3, '0') + ' 期', x, row + 7, 10, 650, PRESS_INK, PAPER_SANS);
    paperParagraph(ctx, clip.title, x, row + 21, cell - 5, {size:10, leading:12, maxLines:2});
    paperText(ctx, clip.grade + ' 级', x, row + 50, 11, 800, clip.tags.length ? PRESS_RED : PRESS_INK);
  }
}
