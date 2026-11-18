const pressDialog = document.getElementById('press-dialog');
let finishPressAnimation;

function pressMotionEnabled() {
  return !game.quickPress && !matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function streetTranscript(edition) {
  const lines = edition.feedback?.street || [];
  return lines.length ? '<ul class="street-transcript">' + lines.map(line =>
    '<li><strong>' + h(line.person) + '：</strong>' + h(line.text) + '</li>').join('') + '</ul>' : '';
}

function circulationStamp(change) {
  const {sold, percent, record} = change;
  const direction = percent > 0 ? 'up' : percent < 0 ? 'down' : '';
  const magnitude = Math.abs(percent);
  const label = magnitude && magnitude < .1 ? '小于 0.1' : Math.round(magnitude * 10) / 10;
  const compare = percent == null ? '创刊起计' : '环比 ' +
    (percent > 0 ? '↑' : percent < 0 ? '↓' : '—') + label + '%';
  return '<div class="circulation-stamp"><small>本期发行量</small><strong>' + number(sold) + ' 份</strong>' +
    '<span class="' + direction + '">' + compare + '</span>' +
    (record ? '<b class="record-stamp">创刊以来最高发行量</b>' : '') + '</div>';
}

function playPressSequence(edition) {
  if (!pressMotionEnabled()) return growthNotice(edition, null, true);
  finishPressAnimation?.(true);
  const earlier = game.editions.slice(0, -1);
  const change = circulationChange(edition, earlier.at(-1), earlier, issueCirculation);
  const dispatch = retailDispatch(edition, game.seed);
  const extra = edition.feedback.extra, hit = edition.feedback.pressHit;
  const scenes = ['印刷','发行','街头声音','发行回单', ...(extra?.copies ? ['号外上街'] : []), ...(hit ? ['爆款'] : [])];
  const times = [...FEEDBACK_CONFIG.press.times];
  while (times.length < scenes.length) times.push(times.at(-1) + FEEDBACK_CONFIG.highlights.hitMs);
  const lines = edition.feedback.street;
  let frame, current = -1;
  const finish = skip => {
    cancelAnimationFrame(frame);
    finishPressAnimation = null;
    if (pressDialog.open) pressDialog.close();
    focusAppHeading();
    growthNotice(edition, null, skip);
  };
  finishPressAnimation = finish;
  pressDialog.innerHTML = '<button type="button" class="press-skip" autofocus>点击任意处跳过 <span aria-hidden="true">↵</span></button>' +
    '<div class="press-scene"><p class="press-kicker">' + h(newspaperName(edition)) + ' · 第 ' + ordinal(edition.issue) +
    ' 期</p><h2 id="press-title">印刷</h2><div id="press-scene-body"></div></div>';
  pressDialog.showModal();
  const title = pressDialog.querySelector('h2');
  const body = pressDialog.querySelector('#press-scene-body');
  const start = performance.now();

  function tick(now) {
    const elapsed = Math.max(0, now - start);
    const phase = times.findIndex(time => elapsed < time);
    if (phase === -1) return finish();
    if (phase !== current) {
      current = phase;
      pressDialog.dataset.phase = ['printing','dispatch','voices','stamp'][phase] || (scenes[phase] === '号外上街' ? 'special' : 'hit');
      title.textContent = scenes[phase];
      if (phase === 0) {
        body.innerHTML = '<div class="press-machine" aria-hidden="true"><i></i><i></i><i></i></div>' +
          '<p class="press-counter"><strong>0</strong> 份</p>';
      } else if (phase === 1) {
        body.innerHTML = '<div class="dispatch-map" aria-label="各网点实售">' + dispatch.map(point =>
          '<div class="dispatch-point"><span>' + h(point.name) + '</span><strong>+' + number(point.sold) + ' 份</strong></div>').join('') + '</div>';
      } else if (phase === 2) body.innerHTML = streetTranscript(edition);
      else if (phase === 3) body.innerHTML = circulationStamp(change);
      else body.innerHTML = scenes[phase] === '号外上街' ? '<p class="press-feature">“号外！号外！”</p><p>' + h(extra.title) + '</p><p>报童沿街叫卖，售出 ' + number(extra.sold) + ' 份。</p>' :
        '<p class="press-feature">报摊前排起了长队</p><p>“再送一捆来，这期大家都在问！”</p>';
    }
    const span = times[phase] - (times[phase - 1] || 0);
    const fraction = (elapsed - (times[phase - 1] || 0)) / span;
    if (phase === 0) body.querySelector('strong').textContent =
      number(Math.floor(edition.printed * Math.min(1, fraction / FEEDBACK_CONFIG.press.counterFinish)));
    if (phase === 1 || phase === 2) {
      const items = phase === 1 ? body.querySelectorAll('.dispatch-point') : body.querySelectorAll('.street-transcript li');
      const count = phase === 1 ? dispatch.length : lines.length;
      items.forEach((item, index) => {
        if (index > Math.floor(fraction * count) || item.classList.contains('arrived')) return;
        item.classList.add('arrived');
        if (phase === 2) {
          const list = item.parentElement;
          const overflow = item.getBoundingClientRect().bottom - list.getBoundingClientRect().bottom;
          if (overflow > 0) list.scrollBy({top:overflow, behavior:'smooth'});
        }
      });
    }
    frame = requestAnimationFrame(tick);
  }
  tick(start);
}

pressDialog.addEventListener('click', () => finishPressAnimation?.(true));
pressDialog.addEventListener('cancel', event => {
  event.preventDefault();
  finishPressAnimation?.(true);
});

const SCORE_PARTS = {news:'新闻分量', variety:'可读性', balance:'题材平衡', safety:'风险控制'};
function benchmarkEvents(rival, name = '《' + rivalPaperName(game) + '》') {
  return (rival.events || []).map(event => ({
    overtake:'本报销量首次超过' + name + '！',
    redesign:name + '宣布改版。',
    thin:name + '宣布缩减版面。',
    close:name + '宣布停刊。', spring:name + '新年改版。', entry:name + '入城创刊。'
  })[event]);
}

function followUpCards(edition) {
  return (edition.feedback?.followUps || []).map(item => '<article class="aftermath-card aftermath-' + item.type +
    '"><div class="aftermath-clipping" aria-label="旧剪报"><small>第 ' + ordinal(item.issue) + ' 期 · ' +
    h(dotted(item.date)) + '</small><strong>' + h(item.title) + '</strong></div><div><h3>报道后续</h3><p>' +
    h(item.text) + '</p><small>' + (item.type === 'positive' ? '积极进展' : item.type === 'negative' ? '收到异议' : '新进展') +
    (item.influence ? ' · 影响力 ' + (item.influence > 0 ? '+' : '') + item.influence : '') +
    (item.reputation ? ' · 口碑 ' + (item.reputation > 0 ? '+' : '') + item.reputation : '') +
    '</small></div></article>').join('');
}

function weeklyFeedbackView(edition) {
  const data = edition.feedback;
  if (!data?.score) return '';
  const {score, street, mail, syndication, quote, rival, subscribers, badges, influence, profile} = data;
  const name = '《' + (edition.rival?.name || rivalPaperName(game)) + '》';
  const max = Math.max(1, edition.sold, rival.sold);
  const row = (label, value) => '<div><span>' + h(label) + '</span><meter min="0" max="' + max +
    '" value="' + value + '" aria-label="' + h(label) + '"></meter><strong>' + number(value) + ' 份</strong></div>';
  const grade = '<section class="weekly-section"><h3>版面评分 <b class="grade grade-' + score.grade + '">' +
    score.grade + ' · ' + score.total + '</b></h3><div class="feedback-bars">' +
    Object.entries(SCORE_PARTS).map(([key, label]) => '<div><span>' + label + '</span><meter min="0" max="100" value="' +
      score[key] + '" aria-label="' + label + '"></meter><strong>' + score[key] + ' 分</strong></div>').join('') +
    '</div></section>';
  const reactions = '<section class="weekly-section"><h3>读者热线 / 来信</h3><ul class="weekly-mail">' +
    mail.map(item => '<li' + (item.warm ? ' class="warm-mail"' : '') + '><strong>' + h(item.source + ' · ' + item.person) +
      '</strong><p>' + h(item.text) + '</p></li>').join('') + '</ul></section>';
  const reprints = '<section class="weekly-section"><h3>同行转载</h3>' + (syndication.length ? '<ul>' +
    syndication.map(item => '<li>《' + h(item.title) + '》被' + h(item.outlets.join('、')) + '转载。</li>').join('') + '</ul>' :
    '<p>本期未收到转载回执。</p>') + '</section>';
  const comparison = '<section class="weekly-section"><h3>零售销量对比</h3><div class="feedback-bars">' +
    row('本报', edition.sold) + row(name, rival.sold) + '</div><p>' +
    (rival.sold ? (edition.sold === rival.sold ? '两报销量持平。' :
      (edition.sold > rival.sold ? '本报领先 ' : '本报相差 ') + number(Math.abs(edition.sold - rival.sold)) + ' 份。') :
      name + '已停刊，本报领先 ' + number(edition.sold) + ' 份。') + '</p>' + benchmarkEvents(rival,name).map(line => '<p class="weekly-highlight">' + h(line) + '</p>').join('') +
    (data.extra?.rival ? '<p>本周' + h(name) + '抢发号外《' + h(data.extra.title) + '》。</p>' : '') +
    (edition.rival?.change ? '<p>' + h(name + edition.rival.change + ' · ' + edition.rival.style) + '</p>' : '') +
    (rival.headline ? '<p>本周' + h(name) + '头条：《' + h(rival.headline) + '》</p>' : '') + '</section>';
  const earlier = game.editions.filter(item => item.issue < edition.issue);
  const stamp = circulationStamp(circulationChange(edition, earlier.at(-1), earlier, issueCirculation));
  const notes = '<div class="weekly-data">' + stamp + '<p><strong>订户 ' + number(subscribers.count) + '</strong>（' +
    (subscribers.delta > 0 ? '+' : '') + number(subscribers.delta) + '）' +
    (subscribers.groupGain ? '，其中发行站集体订报 ' + number(subscribers.groupGain) + ' 份' : '') + '</p>' +
    '<p>零售连涨 ' + data.streaks.growth + ' 周 · 连续 A 级及以上 ' + data.streaks.grade +
    ' 周 · 连续无负面后续 ' + data.streaks.calm + ' 周</p>' +
    (influence.promoted ? '<p class="weekly-highlight">影响力扩大至' +
      h(FEEDBACK_CONFIG.influence.levels[influence.level][0]) + '！' +
      h(CHANNELS.filter(channel => channel.level && channelRequiredLevel(game,channel) === influence.level && !channelLocked(game,channel)).map(channel => channel.name).join('、')) +
      (CHANNELS.some(channel => channel.level && channelRequiredLevel(game,channel) === influence.level && !channelLocked(game,channel)) ? '可以开拓了。' : '') + '</p>' : '') +
    (profile?.change ? '<p>' + h(profileCaption(profile)) + '</p>' : '') +
    (badges.length ? '<p class="weekly-badges" aria-label="本期新徽章">' +
      badgeNames(badges).map(name => '<span>' + h(name) + '</span>').join('') + '</p>' : '') + '</div>';
  return disclosure('weekly-feedback', '每周结算 · 第 ' + edition.issue + ' 期 · ' + score.grade + ' 级',
    issueHighlights(edition) + followUpCards(edition) + notes + grade + comparison + reactions + reprints + (quote ? '<section class="weekly-section"><h3>广告主上门</h3><p>' +
      h(adById(quote.id).name) + '希望买下下期' + SLOT_TITLES[quote.slot] + '版位，出价 ' + money(quote.cents) +
      ' 元。</p>' + (quote.accepted ? '<p>已接单，下期' + SLOT_TITLES[quote.slot] + '已预留。</p>' :
        game.phase === 'sales' && edition.issue === game.editions.at(-1)?.issue ?
          '<button type="button" class="soft" data-action="accept-quote" data-issue="' + edition.issue + '">接受报价，预留下期' +
            SLOT_TITLES[quote.slot] + '</button><p>也可等到下期排版时决定。</p>' : '') + '</section>' : '') +
    (street?.length ? '<details class="weekly-section"><summary>街头声音</summary>' + streetTranscript(edition) + '</details>' : ''),
    'receipt-detail weekly-feedback', true);
}

function badgeNames(keys) {
  return feedbackBadgeDefinitions().filter(item => keys.includes(item.key)).map(item => item.name);
}

function growthNotice(edition, prior, skip = false) {
  const feedback = edition.feedback;
  const keys = feedback.badges.filter(key => !prior?.badges.includes(key));
  const names = badgeNames(keys);
  const level = feedback.influence.level;
  const promoted = feedback.influence.promoted && level > (prior?.influence.level ?? 0);
  if (names.length) announce('新徽章：' + names.join('、'));
  if (!promoted || skip || !pressMotionEnabled()) return;
  const district = FEEDBACK_CONFIG.influence.levels[level][0];
  pressDialog.dataset.phase = 'influence';
  pressDialog.innerHTML = '<button type="button" class="press-skip" autofocus>点击任意处跳过</button>' +
    '<div class="press-scene"><p class="press-kicker">' + h(newspaperName(edition)) +
    ' · 发行版图</p><h2 id="press-title">影响力扩大至' + h(district) + '！</h2>' + influenceRings(level) + '</div>';
  const timer = setTimeout(finish, FEEDBACK_CONFIG.influence.revealMs);
  function finish() {
    clearTimeout(timer);
    finishPressAnimation = null;
    if (pressDialog.open) pressDialog.close();
    focusAppHeading();
  }
  finishPressAnimation = finish;
  pressDialog.showModal();
}

function influenceProgress(influence) {
  const levels = FEEDBACK_CONFIG.influence.levels;
  const {level, points} = influence;
  const ceiling = levels[level + 1];
  const min = levels[level][1];
  const span = ceiling ? ceiling[1] - min : 1;
  const caption = ceiling ? '距' + ceiling[0] + '还差 ' + number(ceiling[1] - points) + ' 点' : '已达最高影响力等级';
  return '<div class="influence-progress"><p><strong>' + h(levels[level][0]) + ' · ' + number(points) + ' 点</strong>' +
    '<span>' + h(caption) + (roundEnabled(game) && level === 3 && game.active.length < FEEDBACK_CONFIG.network.minNationalStands ? ' · 全国需在营 ' + FEEDBACK_CONFIG.network.minNationalStands + ' 个网点' : '') + '</span></p><progress max="' + span + '" value="' + (ceiling ? points - min : span) +
    '" aria-label="影响力升级进度"></progress></div>';
}

function distributionGraph(editions) {
  if (!editions.length) return '<p>创刊后开始记录每周发行量。</p>';
  const width = 640, height = 226, left = 61, right = 601, top = 15, bottom = 189;
  const data = editions.map(item => ({issue:item.issue, retail:item.sold, total:issueCirculation(item),
    rival:item.feedback?.rival?.sold || 0}));
  const maximum = Math.max(1, ...data.flatMap(item => [item.total, item.rival]));
  const step = Math.max(1, Math.ceil(maximum / 4000) * 1000);
  const max = step * 4;
  const x = index => left + (right - left) * index / Math.max(1, data.length - 1);
  const y = value => bottom - (bottom - top) * value / max;
  const path = key => data.map((item, i) => [x(i).toFixed(1), y(item[key]).toFixed(1)].join(',')).join(' ');
  const grid = Array.from({length:5}, (_, i) => '<line x1="' + left + '" x2="' + right + '" y1="' + y(i*step) +
    '" y2="' + y(i*step) + '"/><text x="' + (left - 7) + '" y="' + (y(i*step)+4) +
    '" text-anchor="end">' + number(i*step) + '</text>').join('');
  const labels = [...new Set([0, ...[.25,.5,.75].map(f => Math.round((data.length-1)*f)).filter(n => n >= 3 && n < data.length - 3), data.length - 1])];
  const ticks = labels.map(index => '<text x="' + x(index) + '" y="211" text-anchor="middle">第 ' +
    data[index].issue + ' 期</text>').join('');
  const rivalName = h(rivalPaperName(game));
  const last = data.at(-1);
  return '<svg class="distribution-graph" viewBox="0 0 ' + width + ' ' + height +
    '" role="img" aria-label="周发行量。最新一期零售 ' + last.retail + ' 份，合计 ' + last.total +
    ' 份，' + rivalName + ' ' + last.rival + ' 份。"><g class="graph-grid">' + grid + ticks + '</g>' +
    '<polygon class="graph-area" points="' + path('total') + ' ' + x(data.length-1) + ',' + bottom + ' ' + left + ',' + bottom + '"/>' +
    '<polygon class="graph-retail-area" points="' + path('retail') + ' ' + x(data.length-1) + ',' + bottom + ' ' + left + ',' + bottom + '"/>' +
    ['total','retail','rival'].map(key => '<polyline class="graph-' + key + '" points="' + path(key) + '"/>' +
      (data.length === 1 ? '<circle class="graph-' + key + '" cx="' + left + '" cy="' + y(last[key]) + '" r="3"/>' : '')).join('') +
    '</svg><p class="chart-key"><span>零售＋订户</span><span>零售</span><span>' + rivalName + '（零售）</span></p>';
}

function profileCaption(profile) {
  if (!profile?.change) return '';
  const {section, delta} = profile.change;
  return '本报' + section + '读者比例较上月' + (delta > 0 ? '上升' : '下降') + Math.abs(delta) + '个百分点。';
}

function profileGraph(profile) {
  if (!profile) return '<p>刊出第一期后开始估算读者构成。</p>';
  let offset = 0;
  const palette = FEEDBACK_CONFIG.profile.colors;
  const topics = Object.keys(ORIGINAL_TOPICS);
  const wedges = profile.rows.map(({section, percent}, index) => {
    const position = topics.indexOf(section);
    const color = palette[(position < 0 ? index : position) % palette.length];
    const stop = offset + percent;
    const wedge = color + ' ' + offset + '% ' + stop + '%';
    offset = stop;
    return {section, percent, color, wedge};
  });
  return '<p class="profile-month">' + h(profile.month) + ' · 按最近刊发题材估算</p><div class="profile-graph">' +
    '<div class="profile-pie" aria-hidden="true" style="background:conic-gradient(' + wedges.map(item => item.wedge).join(',') + ')"></div>' +
    '<ul>' + wedges.map(({section, percent, color}) => '<li><span style="--topic-color:' + color + '"></span>' +
      h(section) + '读者 <b>' + percent + '%</b></li>').join('') + '</ul></div>' +
    (profile.change ? '<p class="weekly-highlight">' + h(profileCaption(profile)) + '</p>' : '');
}

function newspaperDataView() {
  const data = reportData(game);
  const editions = game.editions;
  return pageHeader('报社数据', newspaperName(game) + ' · 发行与读者') +
    '<div class="data-board"><section class="panel data-sales"><h2>周发行量</h2>' + distributionGraph(editions) +
    '</section><section class="panel"><h2>影响力</h2>' + influenceProgress(data.influence) +
    '<dl class="data-totals"><div><dt>订户</dt><dd>' + number(data.subscribers) + '</dd></div><div><dt>累计转载</dt><dd>' +
    number(data.syndication) + ' 次</dd></div><div><dt>累计报道后续</dt><dd>' + number(data.followUps) + ' 条</dd></div></dl>' +
    '</section><section class="panel"><h2>读者画像</h2>' + profileGraph(data.profile) +
    '</section><section class="panel data-sales"><h2>版面评分历史</h2>' +
    (editions.length ? '<ol class="grade-history">' + editions.map(item => '<li><span>' + ordinal(item.issue) +
      '</span><span><b class="grade-mark grade-' + item.feedback.score.grade + '">' + item.feedback.score.grade +
      '</b>' + item.feedback.score.total + '</span></li>').join('') + '</ol>' : '<p>暂无评分。</p>') + '</section>' +
    '<section class="panel register-panel"><h2>逐期经营明细</h2>' + issueRegisterTable(game) + '</section></div>';
}

function clippingItems(campaign) {
  // 合订本就是剪报原件；标记随后续和省奖结果更新。
  const editions = campaign.editions;
  const awards = annualYears(campaign).map(year => annualAwardResults(annualCampaign(campaign,year)));
  const praise = new Set(editions.flatMap(item => (item.feedback?.followUps || [])
    .filter(later => later.type === 'positive' && later.slot === 'headline').map(later => later.issue)));
  let best = 0, lastRecord = 0, markedHigh = 0;
  return editions.map(item => {
    const copies = issueCirculation(item);
    const tags = [];
    const record = item.feedback?.record ?? (best > 0 && copies > best && item.issue-lastRecord >= FEEDBACK_CONFIG.highlights.recordGap && copies >= markedHigh*FEEDBACK_CONFIG.highlights.recordFactor);
    if (record) { tags.push('纪录'); lastRecord=item.issue; markedHigh=copies; }
    if (item.feedback?.extra?.copies) tags.push('号外');
    if (item.feedback?.pressHit) tags.push('爆款');
    if (awards.some(a => a.winner?.issue === item.issue)) tags.push('省好新闻奖获奖');
    else if (awards.some(a => a.nominationIssues.includes(item.issue))) tags.push('省奖提名');
    if (praise.has(item.issue)) tags.push('积极后续');
    best = Math.max(best, copies);
    return {issue:item.issue, title:item.title, sold:item.sold, grade:item.feedback?.score?.grade || '—', tags};
  });
}

function clippingGrid(items, miniature = false) {
  if (!items.length) return '<p>创刊号出刊后，编辑部会把每期头条剪下来贴在这里。</p>';
  return '<div class="clipping-grid' + (miniature ? ' miniature' : '') + '">' + items.map(item =>
    '<button class="clipping' + (item.tags.length ? ' tagged' : '') + (item.tags.includes('号外') ? ' clipping-extra' : '') + (item.tags.includes('爆款') ? ' clipping-hit' : '') + '" type="button" data-action="clipping" data-issue="' +
    item.issue + '" title="' + h(item.title + (item.tags.length ? ' · ' + item.tags.join('、') : '')) +
    '"><small>第 ' + ordinal(item.issue) + ' 期</small><strong>' + h(item.title) + '</strong><span>' +
    (miniature ? '' : number(item.sold) + ' 份 · ') + item.grade + ' 级</span>' +
    (item.tags.length && !miniature ? '<b>' + h(item.tags.join(' · ')) + '</b>' : '') + '</button>').join('') + '</div>';
}

function clippingWallView() {
  return pageHeader('编辑部剪报墙', newspaperName(game) + ' · ' + game.editions.length + ' 张头条剪报') +
    '<section class="panel clipping-wall">' + clippingGrid(clippingItems(game)) + '</section>';
}

function annualFeedbackView(data, clips, opponent = rivalPaperName(game)) {
  const best = data.best;
  const rivalName = '《' + opponent + '》';
  const rivalEnding = data.rival?.closed ? rivalName + '第 ' + data.rival.milestones.close + ' 期宣布停刊。' :
    !data.rival ? '暂无对手回单。' : rivalName + (data.rival.milestones.thin ? '缩减版面后继续发行。' :
      data.rival.milestones.redesign ? '改版后继续发行。' : '继续发行。');
  const figures = [['全年总发行量', number(data.total) + ' 份'],
    ['最高单期发行量', best ? number(issueCirculation(best)) + ' 份 · 第 ' + ordinal(best.issue) + ' 期' : '—'],
    ['年终订户', number(data.subscribers) + ' 户'],
    ['影响力', FEEDBACK_CONFIG.influence.levels[data.influence.level][0] + ' · ' + number(data.influence.points) + ' 点'],
    ['被转载', number(data.syndication) + ' 次'], ['报道后续', number(data.followUps) + ' 条']];
  const notes = [
    ['最高单期头条', best?.title || '暂无'],
    ['最有影响力的报道', data.most ? '《' + data.most.title + '》 · 第 ' + ordinal(data.most.issue) + ' 期' : '暂无积极后续'],
    ['对手的结局', rivalEnding]
  ];
  const titles = data.titles.length ? '<p class="annual-extra-titles">附加称号：' + h(data.titles.join(' · ')) + '</p>' : '';
  const html = '<section class="annual-feedback"><h2>年度数据</h2>' + titles +
    '<dl class="year-figures">' + figures.map(([label, value]) => '<div><dt>' + h(label) + '</dt><dd>' +
      h(value) + '</dd></div>').join('') + '</dl><dl class="annual-feedback-notes">' +
    notes.map(([label,value]) => '<div><dt>' + h(label) + '</dt><dd>' + h(value) + '</dd></div>').join('') +
    '</dl><h3>全年剪报墙 · ' + clips.length + ' 期</h3>' + clippingGrid(clips, true) + '</section>';
  return {html, figures, notes, titles:data.titles, clips};
}
