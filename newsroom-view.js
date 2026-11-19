// 编辑部例会、号外、设备与年终附页共用已结算的回单。
function extraDeskWire(campaign) {
  const event = specialEventFor(campaign);
  if (!event) return '';
  const order = campaign.extraOrder;
  const decided = order?.issue === campaign.week + 1;
  const choices = FEEDBACK_CONFIG.extra.batches.map(copies => {
    const cost = extraCost(copies);
    return '<button class="soft" type="button" data-action="extra" data-id="' + copies + '"' +
      (cashOf(campaign) < cost + minimumViablePressCost(campaign) ? ' disabled' : '') + '>印 ' + number(copies) + ' 份 · ' + money(cost) + ' 元</button>';
  }).join('');
  return '<section class="desk-wire extra-wire"><strong>号外</strong><div><h3>' + h(event.title) + '</h3><p>' +
    h(event.call) + '</p>' + (decided ? '<p>' + (order.copies ? '已付印 ' + number(order.copies) + ' 份。' : '本报照常出刊。') + '</p>' :
    '<div class="report-buttons">' + choices + '<button type="button" class="soft" data-action="extra" data-id="0">本次不出</button></div>') + '</div></section>';
}

function meetingReward(reward) {
  if (!reward) return '';
  return [reward.cash && ('奖金 ' + money(reward.cash) + ' 元'), reward.influence && ('影响力 +' + reward.influence),
    reward.trust && ('口碑 +' + reward.trust)].filter(Boolean).join(' · ');
}

function meetingPanel(meeting) {
  if (!meeting) return '';
  return '<section class="panel meeting"><header class="panel-heading"><h2>' + (meeting.closed ? '月底例会' : '本月目标') +
    '</h2><p>' + h(String(meeting.month).slice(0,7)) + '</p></header><ul>' + meeting.cards.map(card =>
      '<li class="' + (card.done ? 'met' : '') + '"><div><b>' + (card.done ? '✓ ' : meeting.closed ? '× ' : '') + h(card.label) +
      '</b><small>' + h(card.difficulty) + '</small></div><progress aria-label="' + h(card.label) + '" max="' + card.goal +
      '" value="' + Math.max(0, Math.min(card.goal, card.progress)) + '"></progress><div><small>' + h(meetingReward(card.reward)) +
      '</small><span>' + number(card.progress) + ' / ' + number(card.goal) + '</span></div></li>').join('') +
    '</ul>' + (meeting.closed && meeting.cards.every(card => card.done) ? '<p class="weekly-highlight">✓ 三项目标全中 · 月度徽章</p>' : '') + '</section>';
}

function upgradeButton(campaign, id) {
  if (campaign.issueCount !== 156 || !campaign.active.includes(id)) return '';
  const grade = channelGrade(campaign, id);
  if (grade >= 3) return '';
  const cost = upgradeCost(campaign, id);
  return '<button type="button" class="soft" data-action="upgrade-channel" data-id="' + id + '"' +
    (campaign.phase !== 'desk' || cashOf(campaign) < cost + minimumViablePressCost(campaign) ? ' disabled' : '') + '>升为' +
    h(FEEDBACK_CONFIG.network.names[grade]) + ' · ' + money(cost) + ' 元</button>';
}

function equipmentPanel(campaign) {
  if (!roundEnabled(campaign)) return '';
  const stage = campaign.equipment || 0;
  const items = FEEDBACK_CONFIG.equipment.items;
  const budget = cashOf(campaign) - minimumViablePressCost(campaign);
  return '<section class="panel"><header class="panel-heading"><h2>印厂设备</h2><p>已置办 ' + stage +
    ' / ' + items.length + ' 件</p></header><ol class="equipment-list">' + items.map((item,i) => {
      const control = i < stage ? '<span class="chip chip-active">已置办</span>' : i > stage ? '<small>待安装 · ' + money(item.cost) + ' 元</small>' :
        '<button class="soft" data-action="buy-equipment" type="button"' + (campaign.phase !== 'desk' || budget < item.cost ? ' disabled' : '') +
          '>置办 · ' + money(item.cost) + ' 元</button>';
      const note = i === stage && campaign.phase === 'desk' && budget < item.cost ?
        '<small>预留开印资金后还差 ' + money(item.cost - budget) + ' 元</small>' : '';
      return '<li><div><b>' + h(item.name) + '</b><small>' + h(item.description) + '</small>' + note + '</div>' + control + '</li>';
    }).join('') + '</ol></section>';
}

function certificateButton(year, label = '查看奖状') {
  return '<button type="button" class="soft accent" data-action="open-certificate" data-id="' + year + '" aria-haspopup="dialog">' + label + '</button>';
}

function certificateMarkup(certificate) {
  const text = certificateText(certificate);
  return '<article class="award-certificate"><p class="certificate-year">' + text.award + '</p>' +
    '<h3>获奖证书</h3><p class="certificate-recipient">' + h(text.recipient) + '</p>' +
    '<p>贵报刊发的报道</p><p class="certificate-work">' + h(text.work) + '</p><p>荣获省好新闻奖，特颁此证。</p>' +
    '<p class="certificate-credit">' + h(text.credit) + '</p>' +
    '<footer><div><strong>' + text.issuer + '</strong><br><time datetime="' + certificate.date + '">' + text.date +
    '</time></div><span class="certificate-seal" aria-hidden="true">省奖<br>评审</span></footer></article>';
}

function issueHighlights(edition) {
  const f = edition.feedback;
  const extra = f.extra;
  const news = [];
  if (extra?.copies) news.push('<h3>号外回单 · ' + h(extra.title) + '</h3><p>印 ' + number(extra.copies) + ' 份，售出 ' +
    number(extra.sold) + ' 份。印配费 ' + money(extra.cost) + ' 元，报款 ' + money(extra.revenue) + ' 元。</p><p>影响力 +' +
    extra.influence + ' · 新订户 +' + extra.subscribers + ' 户</p>');
  if (f.pressHit) {
    const labels = {sellout:'多印也卖光，创近期新高', record:'刷新发行纪录', overtake:'大幅反超对手'};
    const reasons = (f.hitReasons || []).map(reason => labels[reason]).filter(Boolean);
    news.push('<p class="weekly-highlight"><b>爆款</b> · ' + h(reasons.join('、') || '报摊传来捷报') + '。这期头版已镶上金框。</p>');
  }
  if (f.coverage?.milestone) news.push('<p class="weekly-highlight">发行网新进一圈，城区已覆盖 ' + f.coverage.count + ' 格。</p>');
  for (const p of f.reporters?.promotions || []) news.push('<p class="weekly-highlight">' + h(p.name) + ' 晋升「' + h(p.title) + '」</p>');
  return (news.length ? '<div class="round-highlights">' + news.join('') + '</div>' : '') +
    (f.meeting?.closed ? meetingPanel(f.meeting) : '');
}

function annualComparison(campaign) {
  return annualYears(campaign).map(year => {
    const snapshot = annualCampaign(campaign, year);
    const last = snapshot.editions.at(-1);
    const annual = annualSpecial(snapshot);
    return [year + ' 年', annual.title, number(reportData(snapshot).total) + ' 份', annual.trust + ' 点',
      mapLevelNames()[last.feedback.influence.level] + ' ' + last.feedback.influence.points + ' 点', (last.feedback.coverage?.count ?? '—') + ' 格',
      annual.winner ? '《' + annual.winner.title + '》' : '无', '《' + last.rival.name + '》' + (last.feedback.rival.closed ? '停刊' : '在刊')];
  });
}

function annualRoundup(editions, replayEditions, comparison) {
  const summary = yearRoundSummary(editions);
  const replay = replayEditions === editions ? summary : yearRoundSummary(replayEditions);
  const rows = comparison.length ? '<h3>三年办报对照</h3><div class="table-scroll"><table class="grid-table"><thead><tr>' +
    ['年份','年度称号','发行','口碑','影响力','城区覆盖','省好新闻奖','对手结局'].map(x => '<th>' + x + '</th>').join('') +
    '</tr></thead><tbody>' + comparison.map(row => '<tr>' + row.map(cell => '<td>' + h(cell) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' : '';
  const monthly = summary.months.map(m => String(m.month).slice(-2).replace(/^0/,'') + '月 ' + m.cards.filter(c => c.done).length + '/3');
  const events = summary.extras.filter(e => e.copies).map(e => e.title + ' · 实售 ' + number(e.sold) + ' 份');
  const lines = ['年度记者 · ' + (summary.reporter ? summary.reporter.name + '，经验 ' + summary.reporter.xp : '尚无签名稿'),
    ...events.map(line => '号外 · ' + line), '例会 · ' + monthly.slice(0,6).join('　'), '例会 · ' + monthly.slice(6).join('　'),
    ...comparison.map(row => row.join(' · '))];
  const list = replay.timeline.map(t => '<li><b>第 ' + t.issue + ' 期</b> ' + h(t.text) + '</li>').join('');
  return {lines,frames:replay.frames,timeline:replay.timeline,html:'<section class="annual-feedback round-year"><h2>编辑部年鉴</h2>' + rows +
    '<h3>年度记者</h3><p>' + h(summary.reporter ? summary.reporter.name + ' · 经验 ' + summary.reporter.xp + ' · 刊稿 ' + summary.reporter.stories + ' 篇' : '尚无签名稿') + '</p><h3>本年号外</h3><p>' + (events.length ? events.map(h).join('<br>') : '本年未印号外。') +
    '</p><h3>十二个月例会成绩</h3><div class="month-register">' + monthly.map(x => '<span>' + h(x) + '</span>').join('') +
    '</div><h3>发行版图回放</h3><figure class="coverage-film"><canvas id="coverage-film" width="720" height="460" role="img" aria-label="城区六边形覆盖回放"></canvas>' +
    '<figcaption><span id="coverage-caption"></span><button type="button" class="soft" data-action="skip-replay">看最后一期</button></figcaption></figure>' +
    '<h3>本报大事记</h3><ol class="year-timeline">' + list + '</ol></section>'};
}

let coveragePaths;
function drawCoverageFrame(ctx,frame) {
  if (!coveragePaths) coveragePaths = cityDeliveryCells().map(cell => {
    const p = new Path2D();
    const [x,y] = hexCenter(CITY_GRID,cell);
    for (let i=0;i<6;i++) { const [cx,cy] = hexCorner(x,y,CITY_GRID.size*.93,i); if (i) p.lineTo(cx,cy); else p.moveTo(cx,cy); }
    p.closePath();
    return {p,distances:Object.fromEntries(Object.entries(CHANNEL_HEX).map(([id,hex]) => [id,hexDistance(cell,hex)]))};
  });
  const active = Object.entries(frame.active || {});
  ctx.fillStyle = '#e4e9eb';ctx.fillRect(0,0,720,460);
  for (const {p,distances} of coveragePaths) {
    ctx.fillStyle = active.some(([id,grade]) => distances[id] <= (grade === 3 ? 3 : 2)) ? '#79ae90' : '#f8fafb';
    ctx.fill(p);
  }
  for (const [id,grade] of active) {
    const [x,y] = hexCenter(CITY_GRID,CHANNEL_HEX[id]);
    ctx.fillStyle = '#174e78';ctx.fillRect(x-4-grade,y-4-grade,8+2*grade,8+2*grade);
  }
}

let skipCoverageReplay;
function playCoverageReplay(frames) {
  const canvas = document.getElementById('coverage-film');
  if (!canvas || !frames?.length) return;
  const ctx = canvas.getContext('2d');
  let last = -1, request;
  const draw = index => {
    if (last === index) return;
    last = index;
    const frame = frames[index];
    drawCoverageFrame(ctx,frame);
    document.getElementById('coverage-caption').textContent = '第 ' + frame.issue + ' 期 · ' + frame.count + ' 格';
  };
  skipCoverageReplay = () => { cancelAnimationFrame(request); if(canvas.isConnected) draw(frames.length-1); };
  if (!pressMotionEnabled()) { skipCoverageReplay(); return; }
  const start = performance.now();
  function tick(now) {
    if (!canvas.isConnected) return;
    draw(Math.min(frames.length-1,Math.max(0, Math.floor((now-start)*frames.length/FEEDBACK_CONFIG.highlights.replayMs))));
    if (last < frames.length-1) request=requestAnimationFrame(tick);
  }
  tick(start);
}
