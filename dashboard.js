// 经营看板与高密度报表：顶部指标条、发行网点表、记者表、逐期损益表、逐期经营明细。

function sparkline(values, width = 76, height = 20) {
  const points = values.filter(value => Number.isFinite(value));
  if (points.length < 2) return '<svg class="spark" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true"></svg>';
  const min = Math.min(...points), max = Math.max(...points);
  const span = max - min || 1;
  const x = index => (index * (width - 2) / (points.length - 1) + 1).toFixed(1);
  const y = value => (height - 2 - (value - min) * (height - 4) / span).toFixed(1);
  const path = points.map((value, index) => x(index) + ',' + y(value)).join(' ');
  const last = points.at(-1);
  return '<svg class="spark" viewBox="0 0 ' + width + ' ' + height + '" aria-hidden="true">' +
    '<polyline points="' + path + '"/><circle cx="' + x(points.length - 1) + '" cy="' + y(last) + '" r="1.8"/></svg>';
}

function signedNumber(value, digits = 0) {
  const text = Math.abs(value).toLocaleString('zh-CN', {maximumFractionDigits:digits, minimumFractionDigits:digits});
  return (value > 0 ? '+' : value < 0 ? '−' : '±') + text;
}

function deltaTag(now, before, percent = false) {
  if (!Number.isFinite(before) || !Number.isFinite(now)) return '<span class="delta flat">—</span>';
  const change = now - before;
  const value = percent ? (before ? change * 100 / before : 0) : change;
  const cls = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
  return '<span class="delta ' + cls + '">' + signedNumber(value, percent ? 1 : 0) + (percent ? '%' : '') + '</span>';
}

function balanceSeries(campaign) {
  const totals = new Map();
  for (const row of campaign.ledger) totals.set(row.issue, (totals.get(row.issue) || 0) + row.cents);
  let running = 0;
  return campaign.editions.map(edition => (running += totals.get(edition.issue) || 0) / 100);
}

function kpiStrip(campaign) {
  const editions = campaign.editions;
  const recent = editions.slice(-12);
  const last = editions.at(-1), prev = editions.at(-2);
  const f = edition => edition?.feedback;
  const levels = FEEDBACK_CONFIG.influence.levels;
  const balances = balanceSeries(campaign).slice(-12);
  const influence = f(last)?.influence ?? {points:0, level:0};
  const nextLevel = levels[influence.level + 1];
  const rivalName = rivalPaperName(campaign);
  const rival = last?.rival?.name === rivalName && Number(last.date.slice(0,4)) === currentYear(campaign) ? f(last).rival : null;
  const closed = rivalHasClosed(campaign);
  const capacity = campaign.active.reduce((sum, id) => sum + effectiveChannel(campaign,id).cap, 0);
  const issueCount = campaignIssueCount(campaign);
  const phase = campaign.phase === 'desk' ? '采编中' : campaign.phase === 'sales' ? '发行回单' : '已结账';
  const cell = (key, label, value, sub, spark, extra = '') =>
    '<div class="kpi kpi-' + key + '"' + extra + '><div class="kpi-head"><span>' + label + '</span>' + (sub || '') + '</div>' +
    '<strong>' + value + '</strong>' + (spark || '') + '</div>';
  return '<div class="kpi-inner">' +
    cell('issue', '刊期', '<b>' + Math.min(campaign.week + 1, issueCount) + '</b><small>/' + issueCount + '</small>',
      '<span class="kpi-note">' + phase + '</span>',
      '<div class="kpi-bar"><i style="width:' + (Math.min(1, editions.length / issueCount) * 100).toFixed(1) + '%"></i></div>') +
    cell('cash', '现金', money(cashOf(campaign)) + '<small>元</small>',
      balances.length > 1 ? deltaTag(balances.at(-1), balances.at(-2)) : '', sparkline(balances)) +
    cell('retail', '上期零售', last ? number(last.sold) + '<small>份</small>' : '—',
      prev ? deltaTag(last.sold, prev.sold, true) : '', sparkline(recent.map(item => item.sold))) +
    cell('subs', '订户', number(f(last)?.subscribers?.count ?? FEEDBACK_CONFIG.subscribers.initial) + '<small>户</small>',
      f(last)?.subscribers ? '<span class="delta ' + (f(last).subscribers.delta >= 0 ? 'up' : 'down') + '">' +
        signedNumber(f(last).subscribers.delta) + '</span>' : '', sparkline(recent.map(item => f(item)?.subscribers?.count))) +
    cell('circ', '合计发行', last ? number(issueCirculation(last)) + '<small>份</small>' : '—',
      prev ? deltaTag(issueCirculation(last), issueCirculation(prev), true) : '', sparkline(recent.map(issueCirculation))) +
    cell('trust', '口碑', String(campaign.pressure.credibility),
      prev && f(last)?.trust != null && f(prev)?.trust != null ? deltaTag(f(last).trust, f(prev).trust) : '',
      sparkline(recent.map(item => f(item)?.trust))) +
    cell('grade', '版面评分', last ? '<b class="grade-mark grade-' + f(last).score.grade + '">' + f(last).score.grade + '</b>' +
      f(last).score.total : '—', prev ? deltaTag(f(last).score.total, f(prev).score.total) : '',
      sparkline(recent.map(item => f(item)?.score?.total))) +
    cell('influence', '影响力', h(levels[influence.level][0]) + '<small>' + number(influence.points) + '</small>',
      '<span class="kpi-note">' + (nextLevel ? '差 ' + number(nextLevel[1] - influence.points) : '最高级') + '</span>',
      '<div class="kpi-bar"><i style="width:' + (nextLevel ? Math.max(0, Math.min(1, (influence.points - levels[influence.level][1]) /
        (nextLevel[1] - levels[influence.level][1]))) * 100 : 100).toFixed(1) + '%"></i></div>') +
    cell('rival', '对手 ' + h(rivalName), closed ? '已停刊' : rival ? number(rival.sold) + '<small>份</small>' : '—',
      !closed && rival && last ? '<span class="delta ' + (last.sold >= rival.sold ? 'up' : 'down') + '" title="本报零售与对手之差">' +
        signedNumber(last.sold - rival.sold) + '</span>' : '',
      sparkline(recent.filter(item => item.rival?.name === rivalName && Number(item.date.slice(0,4)) === currentYear(campaign)).map(item => f(item)?.rival?.sold))) +
    cell('outlets', '在营网点', campaign.active.length + '<small>/' + channelLimit(campaign) + '</small>',
      '<span class="kpi-note">容量 ' + number(capacity) + '</span>',
      '<div class="kpi-bar"><i style="width:' + (campaign.active.length / channelLimit(campaign) * 100).toFixed(1) + '%"></i></div>') +
    '</div>';
}

function lastStand(campaign, id) {
  return campaign.editions.at(-1)?.stands?.find(stand => stand.id === id) || null;
}

function pips(value, max = 5) {
  return '<span class="pips" aria-label="' + value + ' / ' + max + '">' +
    Array.from({length:max}, (_, index) => '<i class="' + (index < value ? 'on' : '') + '"></i>').join('') + '</span>';
}

function statusChip(state) {
  return '<span class="chip chip-' + state + '">' + MAP_STATE_LABELS[state] + '</span>';
}

function channelStatsList(labels, values) {
  return '<dl class="channel-stats">' + labels.map((label, index) =>
    '<div><dt>' + label + '</dt><dd>' + values[index] + '</dd></div>').join('') + '</dl>';
}

function channelsTableView() {
  const editable = game.phase === 'desk';
  const cash = cashOf(game);
  const outlets = CHANNELS.map(channel => effectiveChannel(game, channel.id));
  const current = outlets.filter(channel => game.active.includes(channel.id));
  const planned = allocateCopies(current, Math.min(game.copies, printLimit(game)), game.priority);
  const rivalOutlets = mapRivalOutlets(game);
  const order = {active:0, paused:1, available:2, remote:3, captured:4, locked:5};
  const rows = [...outlets].sort((a, b) => order[channelMapState(game, a)] - order[channelMapState(game, b)]);
  const totals = {cap:0, planned:0, sold:0, printed:0, revenue:0, fee:0};
  const labels = ['容量', '本期拟送', '上期实售', '售出率', '售罄', '上期报款', '配送费', '代售/份', '读者偏好'];
  const entries = rows.map(channel => {
    const state = channelMapState(game, channel);
    const active = state === 'active';
    const stand = lastStand(game, channel.id);
    const plan = active ? planned[current.indexOf(channel)] || 0 : 0;
    const focus = game.priority === channel.id;
    if (active) {
      totals.cap += channel.cap; totals.planned += plan; totals.fee += channel.fee;
    }
    const sold = stand ? stand.sold + (stand.reprint?.sold || 0) : 0;
    const printed = stand ? stand.printed + (stand.reprint?.copies || 0) : 0;
    const revenue = stand ? stand.revenue + (stand.reprint?.revenue || 0) : 0;
    if (stand) {
      totals.sold += sold; totals.printed += printed; totals.revenue += revenue;
    }
    const rate = printed ? sold / printed : null;
    const topics = Object.entries(channel.interests).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([topic]) => topic).join(' ');
    const disabled = !editable || (state === 'available' && cash < channelSetupCost(game, channel)) ||
      (active ? game.active.length === 1 : game.active.length >= channelLimit(game));
    const action = state === 'captured' ? '<span class="cell-note">对手停刊后开放</span>' :
      state === 'remote' ? '<span class="cell-note">先开通相邻网点</span>' :
      state === 'locked' ? '<span class="cell-note">' + h(FEEDBACK_CONFIG.influence.levels[channelRequiredLevel(game,channel)][0]) + (game.issueCount === 156 && game.week < ANNUAL_ISSUES && ['county','capital'].includes(channel.id) ? ' · 次年开办' : '解锁') + '</span>' :
      (active ? '<button type="button" class="soft' + (focus ? ' accent' : '') + '" aria-pressed="' + focus +
        '" data-action="priority" data-id="' + channel.id + '"' + (editable ? '' : ' disabled') + '>' + (focus ? '重点中' : '重点') + '</button>' : '') +
      '<button type="button" class="' + (state === 'available' ? 'issue' : 'soft') + '" data-action="channel" data-id="' + channel.id + '"' +
      (disabled ? ' disabled' : '') + '>' + (active ? '暂停' : state === 'paused' ? '恢复' : '开拓 ' + money(channelSetupCost(game, channel))) + '</button>';
    const name = h(channel.name);
    const district = h(CITY_MAP.nodes[channel.id]?.district || '');
    const badges = (game.issueCount === 156 && game.unlocked.includes(channel.id) ?
      '<span class="chip">' + FEEDBACK_CONFIG.network.names[channelGrade(game,channel.id)-1] + '</span>' : '') +
      statusChip(state) + (rivalOutlets.includes(channel.id) && state !== 'captured' ? '<span class="chip chip-rival">对手同点</span>' : '');
    const values = [number(channel.cap), active ? number(plan) : '—', stand ? number(sold) : '—',
      rate == null ? '—' : '<span class="ratebar"><i style="width:' + (rate * 100).toFixed(0) + '%"></i></span>' + (rate * 100).toFixed(0) + '%',
      h(stand?.time || '—'), stand ? money(revenue) : '—', money(channel.fee), money(channel.commission), h(topics)];
    const controls = '<div class="channel-actions">' + action + upgradeButton(game, channel.id) + '</div>';
    const row = '<tr class="row-' + state + '"><th scope="row"><b>' + name + '</b><small>' + district + '</small></th><td>' + badges + '</td>' +
      values.map((value, index) => '<td class="' + (index === labels.length - 1 ? 'topics' : 'num') + '">' + value + '</td>').join('') +
      '<td>' + controls + '</td></tr>';
    const card = '<article class="channel-card row-' + state + '" aria-labelledby="outlet-' + channel.id + '"><header><div>' +
      '<h3 id="outlet-' + channel.id + '">' + name + '</h3><small>' + district + '</small></div><div class="channel-badges">' + badges + '</div></header>' +
      controls + channelStatsList(labels.slice(0, 3), values.slice(0, 3)) +
      '<details><summary>更多统计</summary>' + channelStatsList(labels.slice(3), values.slice(3)) + '</details></article>';
    return {row, card};
  });
  const sellThrough = totals.printed ? (totals.sold * 100 / totals.printed).toFixed(1) + '%' : '—';
  return pageHeader('发行经营', newspaperName(game)) +
    '<dl class="metric-row"><div><dt>在营网点</dt><dd>' + game.active.length + ' / ' + channelLimit(game) + '</dd></div>' +
    '<div><dt>总容量</dt><dd>' + number(totals.cap) + ' 份</dd></div><div><dt>本期首印</dt><dd>' + number(Math.min(game.copies, printLimit(game))) +
    ' 份</dd></div><div><dt>上期售出率</dt><dd>' + sellThrough + '</dd></div><div><dt>上期报款</dt><dd>' + money(totals.revenue) +
    ' 元</dd></div><div><dt>每期配送费</dt><dd>' + money(totals.fee) + ' 元</dd></div><div><dt>重点配送</dt><dd>' +
    h(game.priority ? channelById(game.priority).name : '未设') + '</dd></div></dl>' +
    '<section class="panel table-panel channel-ledger"><header class="panel-heading"><h2>网点台账</h2><p>' +
    (editable ? '采编期间可调整网点；' : '下期采编开始后可调整；') + '地图上也能直接操作 <button type="button" class="link-button" data-view="influence">打开地图</button></p></header>' +
    '<div class="table-scroll channel-ledger-table"><table class="grid-table"><thead><tr><th scope="col">网点</th><th scope="col">状态</th>' +
    labels.map((label, index) => '<th scope="col"' + (index < labels.length - 1 ? ' class="num"' : '') + '>' + label + '</th>').join('') +
    '<th scope="col">操作</th></tr></thead><tbody>' + entries.map(entry => entry.row).join('') + '</tbody><tfoot><tr><th scope="row">合计</th><td></td><td class="num">' + number(totals.cap) +
    '</td><td class="num">' + number(totals.planned) + '</td><td class="num">' + number(totals.sold) + '</td><td class="num">' + sellThrough +
    '</td><td></td><td class="num">' + money(totals.revenue) + '</td><td class="num">' + money(totals.fee) + '</td><td colspan="3"></td></tr></tfoot></table></div>' +
    '<div class="channel-cards">' + entries.map(entry => entry.card).join('') +
    '<p class="channel-total">上期网点合计实售 <strong>' + number(totals.sold) + '</strong> 份</p></div></section>';
}

function staffTableView() {
  const ready = availableReporters(game).map(reporter => reporter.id);
  const cash = cashOf(game);
  const editable = game.phase === 'desk';
  const salary = reporter => reporterSalary(game, reporter);
  const payroll = REPORTERS.filter(reporter => game.staff.includes(reporter.id)).reduce((sum, reporter) => sum + salary(reporter), 0);
  const row = reporter => {
    const career = reporterCareer(game, reporter.id);
    const present = game.staff.includes(reporter.id);
    const cost = present ? Math.ceil(salary(reporter) / 2) : reporter.hire;
    const trip = game.trips.find(item => item.reporter === reporter.id);
    const disabled = !editable || cash < cost || (present ? game.staff.length <= 1 || trip : game.staff.length >= staffLimit(game));
    const status = !present ? '可招聘' : game.newsLibrary ? '在岗' : ready.includes(reporter.id) ? '可出勤' : clockText(trip.at) + ' 回电';
    return '<tr class="' + (present ? 'row-active' : '') + '"><th scope="row"><b>' + h(reporter.name) + '</b><small>' + h(reporter.style) +
      '</small>' + (game.issueCount === 156 && (present || career.xp) ? '<div class="career"><span>' + h(career.title || '见习记者') +
        ' · ' + career.xp + ' 经验</span><progress aria-label="晋级进度" max="' + (career.needed || 1) + '" value="' + (career.needed ? career.progress : 1) + '"></progress></div>' : '') + '</th><td><span class="chip ' + (present ? 'chip-active' : 'chip-paused') + '">' + h(status) + '</span></td><td>' +
      h(reporter.specialties.join(' ')) + '</td><td>' + pips(career.reach) + '</td><td>' + pips(career.verify) + '</td><td>' +
      pips(career.write) + '</td><td class="num">' + money(salary(reporter)) + '</td><td class="num">' + money(cost) +
      '</td><td class="actions"><button type="button" class="soft" data-action="' + (present ? 'fire' : 'hire') + '" data-id="' + reporter.id + '"' +
      (disabled ? ' disabled' : '') + '>' + (present ? '解聘' : '招聘') + '</button></td></tr>';
  };
  const staffed = REPORTERS.filter(reporter => game.staff.includes(reporter.id));
  const others = REPORTERS.filter(reporter => !game.staff.includes(reporter.id));
  return pageHeader('记者部', newspaperName(game)) +
    '<dl class="metric-row"><div><dt>在岗</dt><dd>' + game.staff.length + ' / ' + staffLimit(game) + '</dd></div><div><dt>周薪合计</dt><dd>' +
    money(payroll) + ' 元</dd></div><div><dt>可招聘</dt><dd>' + others.length + ' 人</dd></div><div><dt>人员调整</dt><dd>' +
    (editable ? '可调整' : '下期采编开始后') + '</dd></div></dl>' +
    '<section class="panel table-panel"><header class="panel-heading"><h2>记者名册</h2><p>解聘结算半周薪，招聘一次性付费</p></header>' +
    '<div class="table-scroll"><table class="grid-table"><thead><tr><th scope="col">记者</th><th scope="col">状态</th><th scope="col">专长</th>' +
    '<th scope="col">跑线</th><th scope="col">核实</th><th scope="col">写稿</th><th scope="col" class="num">周薪</th><th scope="col" class="num">费用</th>' +
    '<th scope="col">操作</th></tr></thead><tbody><tr class="group-row"><th colspan="9">在岗</th></tr>' + staffed.map(row).join('') +
    '<tr class="group-row"><th colspan="9">招聘名单</th></tr>' + others.map(row).join('') + '</tbody></table></div></section>';
}

const LEDGER_COLUMNS = [
  ['sales', '报款'], ['ads', '广告'], ['print', '印刷'], ['delivery', '配送'], ['commission', '代售'],
  ['staff', '人员'], ['office', '日常'], ['equipment', '设备'], ['other', '开拓及其他']
];

function ledgerCategory(label) {
  if (label === '报社启动金') return 'opening';
  if (label === '首日报款' || label === '补印报款') return 'sales';
  if (label.startsWith('广告')) return 'ads';
  if (label === '印刷费' || label === '加急补印费') return 'print';
  if (label === '发行配送' || label === '补送配送费') return 'delivery';
  if (/设备|置办/.test(label)) return 'equipment';
  if (label === '网点代售费' || label === '渠道代售费' || label === '补印代售费') return 'commission';
  if (label === '记者工资' || label.startsWith('招聘费') || label.startsWith('解聘结算')) return 'staff';
  if (label === '编辑部日常') return 'office';
  return 'other';
}

const statementsCache = new WeakMap();
function issueStatements(campaign) {
  if (statementsCache.has(campaign.ledger)) return statementsCache.get(campaign.ledger);
  const byIssue = new Map();
  for (const row of campaign.ledger) {
    const entry = byIssue.get(row.issue) || {issue:row.issue, opening:0, net:0};
    const key = ledgerCategory(row.label);
    entry[key] = (entry[key] || 0) + row.cents;
    if (key !== 'opening') entry.net += row.cents;
    byIssue.set(row.issue, entry);
  }
  let balance = 0;
  const statements = [...byIssue.values()].sort((a, b) => a.issue - b.issue).map(entry => {
    balance += entry.net + entry.opening;
    return {...entry, balance};
  });
  statementsCache.set(campaign.ledger,statements);
  return statements;
}

function moneyCell(cents) {
  if (!cents) return '<td class="num zero">—</td>';
  return '<td class="num ' + (cents < 0 ? 'money-out' : 'money-in') + '">' + (cents > 0 ? '+' : '−') + money(Math.abs(cents)) + '</td>';
}

function ledgerDetailRows() {
  return [...game.ledger].reverse().map(row => '<tr><td>第 ' + row.issue + ' 期</td><td>' + h(row.label.replaceAll('渠道','网点')) + '</td>' +
    moneyCell(row.cents) + '</tr>').join('');
}

function financeTableView() {
  const quote = pressQuote(game, Math.min(game.copies, printLimit(game)));
  const statements = issueStatements(game);
  const closed = statements.filter(item => item.issue <= game.editions.length);
  const recent = closed.slice(-4);
  const average = recent.length ? recent.reduce((sum, item) => sum + item.net, 0) / recent.length : 0;
  const sum = key => statements.reduce((total, item) => total + (item[key] || 0), 0);
  const edition = game.editions.at(-1);
  const booked = game.phase === 'desk' ? scheduledAds(game).map(selection => adForEdition(selection, game.city, game)) : [];
  const runway = average < 0 ? Math.floor(cashOf(game) / -average) : null;
  const rows = [...statements].reverse().map(item => '<tr><th scope="row">第 ' + item.issue + ' 期</th>' +
    LEDGER_COLUMNS.map(([key]) => moneyCell(item[key] || 0)).join('') + moneyCell(item.net) +
    '<td class="num strong">' + money(item.balance) + '</td></tr>').join('');
  return pageHeader('财务台账', newspaperName(game)) +
    '<dl class="metric-row"><div><dt>当前余额</dt><dd class="big">' + money(cashOf(game)) + ' 元</dd></div>' +
    '<div><dt>近 4 期平均净额</dt><dd class="' + (average < 0 ? 'money-out' : 'money-in') + '">' + (average >= 0 ? '+' : '−') + money(Math.abs(Math.round(average))) + ' 元</dd></div>' +
    '<div><dt>纸张印刷</dt><dd>' + money(campaignPrices(game).paper) + ' 元 / 份</dd></div><div><dt>每周社务</dt><dd>' + money(Math.round(OFFICE_CENTS * campaignPrices(game).office)) +
      ' 元</dd></div><div><dt>本期印发预计</dt><dd>' + money(quote.total) + ' 元</dd></div>' +
    '<div><dt>累计报款</dt><dd>' + money(sum('sales')) + ' 元</dd></div><div><dt>累计广告</dt><dd>' + money(sum('ads')) + ' 元</dd></div>' +
    '<div><dt>' + (runway != null ? '按近期亏损可撑' : '启动金') + '</dt><dd>' + (runway != null ? runway + ' 期' : money(STARTING_CASH) + ' 元') + '</dd></div></dl>' +
    '<div class="finance-grid"><section class="panel table-panel"><header class="panel-heading"><h2>逐期损益</h2><p>单位：元</p></header>' +
    '<div class="table-scroll tall"><table class="grid-table"><thead><tr><th scope="col">刊期</th>' +
    LEDGER_COLUMNS.map(([, label]) => '<th scope="col" class="num">' + label + '</th>').join('') +
    '<th scope="col" class="num">当期净额</th><th scope="col" class="num">期末余额</th></tr></thead><tbody>' + rows +
    '</tbody><tfoot><tr><th scope="row">合计</th>' + LEDGER_COLUMNS.map(([key]) => moneyCell(sum(key))).join('') + moneyCell(sum('net')) +
    '<td class="num strong">' + money(cashOf(game)) + '</td></tr></tfoot></table></div></section>' +
    '<aside class="finance-side">' + equipmentPanel(game) + '<section class="panel"><header class="panel-heading"><h2>广告簿</h2><p>' +
    (game.phase === 'desk' ? '本期' : '上期') + '</p></header><div class="side-body">' +
    (game.phase === 'desk' ? (booked.length ? '<table class="grid-table compact"><tbody>' + booked.map(offer => '<tr><th scope="row">' + h(offer.name) +
      '</th><td class="num money-in">+' + money(offer.paid) + '</td></tr>').join('') + '</tbody></table>' : '<p class="cell-note">本期尚未排入广告。</p>') +
      '<button type="button" class="soft" data-action="arrange-ads">到编辑台排广告</button>' :
      '<p>广告收入 <b>' + money(edition?.ad || 0) + '</b> 元</p>') + '</div></section>' +
    '<section class="panel"><details class="ledger-detail"><summary>流水明细 · ' + game.ledger.length + ' 笔</summary>' +
    '<div class="table-scroll tall"><table class="grid-table compact"><tbody>' + '' + '</tbody></table></div></details></section></aside></div>';
}

function issueRegisterTable(campaign) {
  const editions = campaign.editions;
  if (!editions.length) return '<p class="cell-note">创刊后开始记录。</p>';
  let previousPoints = 0;
  const nets = new Map(issueStatements(campaign).map(row => [row.issue,row.net]));
  const rows = editions.map(edition => {
    const f = edition.feedback || {};
    const points = f.influence?.points ?? previousPoints;
    const gain = points - previousPoints;
    previousPoints = points;
    const printed = edition.printed + (edition.reprint?.printed || 0);
    const rate = printed ? edition.sold * 100 / printed : 0;
    const rivalSold = f.rival?.closed ? null : f.rival?.sold;
    return '<tr><th scope="row">' + ordinal(edition.issue) + '</th><td class="num">' + dotted(edition.date) + '</td><td class="title-cell">' + h(edition.title) +
      '</td><td>' + h(edition.weight) + '</td><td><b class="grade-mark grade-' + (f.score?.grade || 'C') + '">' + (f.score?.grade || '—') + '</b>' +
      (f.score?.total ?? '') + '</td><td class="num">' + number(printed) + '</td><td class="num">' + number(edition.sold) + '</td><td class="num">' +
      rate.toFixed(0) + '%</td><td class="num">' + number(f.subscribers?.count ?? 0) + '</td><td class="num">' + number(issueCirculation(edition)) +
      '</td><td class="num">' + (rivalSold == null ? '停刊' : number(rivalSold)) + '</td><td class="num">' + (gain >= 0 ? '+' : '−') + Math.abs(gain) +
      '</td><td class="num">' + (f.trust ?? '—') + '</td>' + moneyCell(nets.get(edition.issue)) + '</tr>';
  }).reverse().join('');
  return '<div class="table-scroll tall"><table class="grid-table"><thead><tr><th scope="col">期</th><th scope="col" class="num">日期</th><th scope="col">头条</th>' +
    '<th scope="col">级别</th><th scope="col">评分</th><th scope="col" class="num">总印量</th><th scope="col" class="num">零售</th><th scope="col" class="num">售出率</th>' +
    '<th scope="col" class="num">订户</th><th scope="col" class="num">合计</th><th scope="col" class="num">对手</th><th scope="col" class="num">影响力</th>' +
    '<th scope="col" class="num">口碑</th><th scope="col" class="num">当期净额</th></tr></thead><tbody>' + rows + '</tbody></table></div>';
}

function deskRail() {
  // 编辑台右栏：头条题材在各网点的号召力、上期回单、对手铺货。
  const week = issueWeek(game.week, game);
  const story = getStory(game, game.headline) || getStory(game, game.focus);
  const channels = CHANNELS.filter(channel => game.active.includes(channel.id));
  const rivalOutlets = mapRivalOutlets(game);
  let appeal = '<p class="cell-note">点选一篇稿件，查看它在各网点的号召力。</p>';
  if (story) {
    const values = channels.map(channel => ({channel, local:channel.interests[story.section] || 0, week:week.tastes?.[story.section] || 0}));
    const max = Math.max(700, ...values.map(item => item.local + item.week));
    appeal = '<p class="rail-caption">' + (game.headline === story.id ? '本期头条' : '选中稿件') + '「' + h(story.section) + '」' +
      (week.tastes?.[story.section] ? '，本周题材热度 +' + week.tastes[story.section] : '') + '</p>' +
      '<table class="grid-table compact"><tbody>' + values.sort((a, b) => (b.local + b.week) - (a.local + a.week)).map(item =>
        '<tr><th scope="row">' + h(item.channel.name) + (rivalOutlets.includes(item.channel.id) ? ' <span class="chip chip-rival">对手</span>' : '') +
        '</th><td class="bar-cell"><span class="hbar"><i style="width:' + ((item.local + item.week) * 100 / max).toFixed(0) + '%"></i></span></td>' +
        '<td class="num">' + (item.local + item.week ? '+' + (item.local + item.week) : '0') + '</td></tr>').join('') + '</tbody></table>';
  }
  const last = game.editions.at(-1);
  const stands = last ? [...last.stands].sort((a, b) => b.sold - a.sold) : [];
  const receipt = last ? '<table class="grid-table compact"><thead><tr><th scope="col">网点</th><th scope="col" class="num">实售</th>' +
    '<th scope="col" class="num">售出率</th><th scope="col" class="num">售罄</th></tr></thead><tbody>' + stands.map(stand =>
      '<tr><th scope="row">' + h(stand.name) + '</th><td class="num">' + number(stand.sold + (stand.reprint?.sold || 0)) + '</td><td class="num">' +
      Math.round((stand.sold + (stand.reprint?.sold || 0)) * 100 / Math.max(1, stand.printed + (stand.reprint?.copies || 0))) + '%</td><td class="num">' +
      (stand.time || '—') + '</td></tr>').join('') + '</tbody></table>' : '<p class="cell-note">创刊号尚无回单。</p>';
  const f = last?.feedback;
  const net = last ? issueStatements(game).find(row => row.issue === last.issue)?.net || 0 : 0;
  const summary = last ? '<dl class="rail-metrics"><div><dt>上期头条</dt><dd class="title">' + h(last.title) + '</dd></div>' +
    '<div><dt>首印</dt><dd>' + number(last.printed) + '</dd></div><div><dt>零售</dt><dd>' + number(last.sold) + '</dd></div>' +
    '<div><dt>评分</dt><dd><b class="grade-mark grade-' + (f?.score?.grade || 'C') + '">' + (f?.score?.grade || '—') + '</b>' + (f?.score?.total ?? '') + '</dd></div>' +
    '<div><dt>当期净额</dt><dd class="' + (net < 0 ? 'money-out' : 'money-in') + '">' + (net >= 0 ? '+' : '−') + money(Math.abs(net)) + '</dd></div></dl>' : '';
  return '<aside class="desk-rail">' + (game.issueCount === 156 ? meetingPanel(monthlyMeeting(game)) : '') + '<section class="panel"><header class="panel-heading"><h2>题材号召力</h2><p>需求加成</p></header>' +
    '<div class="rail-body">' + appeal + '</div></section>' +
    '<section class="panel"><header class="panel-heading"><h2>上期回单</h2><p>' + (last ? '第 ' + last.issue + ' 期' : '') + '</p></header>' +
    '<div class="rail-body">' + summary + receipt + '</div></section></aside>';
}
