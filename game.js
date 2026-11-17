const app = document.getElementById('app');
const announcer = document.getElementById('announcer');
const paperDialog = document.getElementById('paper-dialog');
const paperViewport = document.getElementById('paper-viewport');
const proofZoom = paperDialog.querySelector('[data-action="zoom-proof"]');
const restartDialog = document.getElementById('restart-dialog');
const cityDialog = document.getElementById('city-dialog');
const originalDialog = document.getElementById('original-dialog');
const coverInput = document.getElementById('cover-file');
const riskDialog = document.getElementById('risk-dialog');
const reprintDialog = document.getElementById('reprint-dialog');
const mastheadName = document.getElementById('masthead-name');
const mastheadIssue = document.getElementById('masthead-issue');
const deskShortcuts = document.getElementById('desk-shortcuts');
const GUIDE_KEY = 'lintown-weekly-guide';
const intFormat = new Intl.NumberFormat('zh-CN');
const moneyFormat = new Intl.NumberFormat('zh-CN', {maximumFractionDigits:2});
const escapeMap = {'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'};
const h = value => String(value).replace(/[&<>"']/g, character => escapeMap[character]);
const number = value => intFormat.format(value);
const money = cents => moneyFormat.format(cents / 100);
const dotted = date => date.replaceAll('-', '.');
const ordinal = issue => String(issue).padStart(3, '0');
const local = text => cityText(text, game.city);

let saving = true;
let outdatedSave = false;
function readCampaign() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    const parsed = JSON.parse(raw);
    if (parsed && parsed.version !== SAVE_VERSION) outdatedSave = true;
    if (!parsed?.cityReady && [1,2,3,4,5,6].some(version => localStorage.getItem('lintown-weekly-trial-v' + version))) {
      outdatedSave = true;
    }
    return restoreCampaign(parsed);
  } catch {
    return null;
  }
}

function saveCampaign(campaign) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(campaign));
    saving = true;
  } catch {
    saving = false;
  }
}

function randomSeed() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

function defaultView(campaign) {
  return campaign.phase === 'desk' ? 'desk' : 'sales';
}

function newGame() {
  return newCampaign(randomSeed(), DEFAULT_CITY, false, null, true, CAMPAIGN_YEARS[0]);
}

let game = readCampaign() || newGame();
saveCampaign(game);
let guide = readGuide();
let view = defaultView(game);
let archiveIssue = game.editions.at(-1)?.issue || 0;
let activeProof = null;
let largeProof = null;
let pendingPress = null;
let pendingReprint = null;
let originalEditor = null;
let pendingCover = null;
let coverError = '';
let collapsedStory = null;
const editionPngs = new Map();
const animated = new Set();

let feedbackTimer;

function readGuide() {
  try {
    const settings = JSON.parse(localStorage.getItem(GUIDE_KEY));
    if (settings?.seed === game.seed && typeof settings.skipped === 'boolean' && Array.isArray(settings.closed)) {
      return settings;
    }
  } catch {}
  return {seed:game.seed, skipped:game.week > 0, closed:[]};
}

function saveGuide() {
  try {
    localStorage.setItem(GUIDE_KEY, JSON.stringify(guide));
  } catch {}
}

function guideCue() {
  if (guide.skipped || !game.cityReady || game.phase === 'complete') return null;
  const pending = id => !guide.closed.includes(id);
  const first = game.editions[0];
  const latest = game.editions.at(-1);
  if (view === 'sales' && game.phase === 'sales' && latest?.reprint === null && pending('reprint')) {
    return ['reprint'];
  }
  if (game.newsLibrary) return null;
  if (view === 'finance' && game.phase === 'desk' && AD_SLATES[game.week].length && pending('ads')) return ['ads'];
  if (view !== 'desk' || game.phase !== 'desk') return null;

  if (game.week === 0) {
    const returned = Object.values(game.reports).some(report => report.visited);
    const trip = game.trips[0];
    if (pending('opening') && game.clock === DESK_START && !trip && !game.headline) {
      return ['opening', clockText(DESK_START), clockText(deskDeadline(game.week))];
    }
    if (pending('dispatch') && trip && !returned) return ['dispatch', reporterById(trip.reporter).name, clockText(trip.at)];
    const story = collapsedStory === game.focus ? null : getStory(game, game.focus);
    const report = story && game.reports[story.id];
    const publicCopy = story && !story.original && [story.tip, storyCopy(story, report).brief, ...fieldReport(story, report)].join('');
    if (pending('verify') && !report?.verified && /说法不一|各有各的说法|看不清|没对过|只抄了|说不准|没能对上|还没.*核对|找不到.*原件/.test(publicCopy || '')) {
      return ['verify'];
    }
    if (pending('print') && game.headline) return ['print', clockText(deskDeadline(game.week))];
    if (pending('returned') && returned && !game.headline) return ['returned'];
  }
  if (pending('rival') && knownRival(game)) return ['rival', rivalPaperName(game)];
  return null;
}

function renderGuide() {
  const note = document.getElementById('guide-note');
  const cue = guideCue();
  note.hidden = !cue;
  if (!cue) {
    note.replaceChildren();
    return;
  }
  const [id, ...args] = cue;
  const [subject, copy] = FIRST_ISSUE_GUIDE[id];
  note.innerHTML = '<strong>沈编辑 · ' + h(subject) + '</strong><p>' + h(copy(...args)) +
    '</p><div class="report-buttons"><button class="soft" type="button" data-action="guide-close" data-id="' +
    id + '">收起这条</button><button class="soft" type="button" data-action="guide-skip">跳过引导</button></div>';
}

saveGuide();

function announce(message, tone = 'ok') {
  clearTimeout(feedbackTimer);
  announcer.textContent = message;
  announcer.dataset.tone = tone;
  announcer.classList.remove('show');
  void announcer.offsetWidth;
  announcer.classList.add('show');
  feedbackTimer = setTimeout(() => {
    announcer.classList.remove('show');
    announcer.textContent = '';
  }, 3800);
}

function highlight(selector, focus = false) {
  const element = app.querySelector(selector);
  element?.classList.add('updated');
  if (focus) element?.focus({preventScroll:true});
}

function syncFromStorage() {
  const stored = readCampaign();
  if (!stored || (stored.seed === game.seed && stored.revision <= game.revision)) return false;
  game = stored;
  guide = readGuide();
  collapsedStory = null;
  view = defaultView(game);
  archiveIssue = game.editions.at(-1)?.issue || 0;
  render();
  announce('已同步另一标签页的试玩进度。');
  return true;
}

function commit(next, nextView = view, draw = true) {
  if (syncFromStorage()) return false;
  next = closeIfInsolvent(next);
  if (next.ending === 'insolvent' && game.phase !== 'complete') nextView = 'sales';
  const changedView = nextView !== view;
  const newGame = next.seed !== game.seed;
  game = {...next, revision:game.revision + 1};
  saveCampaign(game);
  if (newGame) {
    guide = readGuide();
    saveGuide();
  }
  view = nextView;
  if (draw) render();
  if (changedView) window.scrollTo(0, 0);
  return true;
}

function navigate(destination) {
  view = destination;
  if (view === 'archive' && !game.editions.some(edition => edition.issue === archiveIssue)) {
    archiveIssue = game.editions.at(-1)?.issue || 0;
  }
  render();
  window.scrollTo(0, 0);
}

function pageHeader(title, kicker, dates = '', note = '') {
  return '<div class="page-title"><div><p class="edition-line">' + h(kicker) + '</p><h1 tabindex="-1">' +
    h(title) + '</h1>' + (note ? '<p class="week-note">' + h(note) + '</p>' : '') + '</div>' + dates +
    '</div><aside id="guide-note" class="guide-note" aria-label="沈编辑的引导" aria-live="polite" hidden></aside>';
}

function bottom(text, extra = '') {
  return '<footer class="game-footer"><span>' + h(saving ? text : '本机存档暂不可用，请在关闭前下载要保留的头版。') +
    '</span>' + extra + '</footer>';
}

function paperPanel(draft, signed) {
  const scene = editionPhoto(draft);
  const busy = coverLoading();
  const supportPending = !signed && draft.storyId === game.headline && !draft.supportId;
  activeProof = {draft:supportPending ? {...draft, supportPending} : draft, signed};
  const controls = signed ? '' : '<div class="cover-controls"><div class="report-buttons">' +
    '<button type="button" class="soft" data-action="choose-cover"' + (busy ? ' disabled' : '') + '>' +
    (busy ? '正在读取照片…' : draft.cover ? '更换头版照片' : '上传头版照片') + '</button>' +
    (draft.cover ? '<button type="button" class="soft" data-action="remove-cover"' + (busy ? ' disabled' : '') +
      '>恢复自动配图</button>' : '') +
    '</div><p class="field-hint">' + (coverError ? '<span class="form-status">' + h(coverError) + '</span>' :
      (scene ? '' : '本稿无资料图，可上传照片。') + 'JPG、PNG 或 WebP，20 MB 以内，照片会居中裁切。') + '</p></div>';
  return '<section class="panel proof" aria-label="头版清样"><header class="panel-heading">' +
    '<h2>' + (signed ? '本期头版' : '头版清样') + '</h2>' +
    '<button type="button" class="proof-link" data-action="open-proof">查看大样 ↗</button></header>' +
    controls +
    '<div class="proof-well"><div class="proof-preview" style="aspect-ratio:800/' + (1040 + paperFlashHeight(draft)) + '"><canvas id="proof" role="img" aria-label="' +
    h(newspaperName(draft) + '头版：' + draft.title + '。' + draft.body[0] +
      (draft.supportId ? ' 副稿：' + draft.secondary[0].title : supportPending ? ' 副稿待定' : '') +
      (draft.flashes?.length ? ' 简讯：' + draft.flashes.map(item => item.text).join('') : '')) + '"></canvas>' +
    '<span class="proof-loading">清样排版中…</span></div></div>' +
    '<footer class="proof-footer"><span>' + h(draft.cover ? '自选头版照片' : scene ?
      '自动配图 · ' + cityText(scene.name, draft.city) + (scene.location ? '（地点空镜）' : '') : '无图版式') +
    '</span><span>总第 ' + ordinal(draft.issue) + ' 期</span></footer></section>';
}

function placementControls(story) {
  const chosen = game.headline === story.id;
  const supported = game.support === story.id;
  return '<div class="angle-bar"><span>头版位置</span><div class="report-buttons">' +
    '<button type="button" class="soft accent" data-action="headline"' + (chosen ? ' disabled' : '') + '>' +
    (chosen ? '已定为头条' : '定为头条') + '</button>' +
    '<button type="button" class="soft" data-action="support"' + (canRunSupport(game, story) ? '' : ' disabled') + '>' +
    (supported ? '撤下副稿' : '排为副稿') + '</button></div></div>';
}

function assignmentControls(story, report) {
  if (report?.visited) return '';
  const trip = game.trips.find(item => item.story === story.id);
  if (trip) return '<p class="field-hint">' + h(reporterById(trip.reporter).name) + '在外采访，预计 ' + clockText(trip.at) + ' 回电。</p>';
  const cost = visitCost;
  const available = availableReporters(game).sort((a, b) =>
    cost(a) - cost(b) || b.reach - a.reach || b.write - a.write);
  if (!available.length) return '<p class="field-hint">记者都在外面，回电后可以再派。</p>';
  const label = '派记者跑一趟';
  const affordable = canSpendDeskTime(game, cost(available[0]));
  return '<div class="report-buttons assignment"><button type="button" class="soft accent" data-action="report" data-label="' +
    label + '"' + (affordable ? '' : ' disabled') + '>' + label + ' · ' + cost(available[0]) + ' 分钟</button>' +
    '<select id="reporter-select" aria-label="出勤记者">' +
    available.map(reporter => '<option value="' + reporter.id + '">' + h(reporter.name) + ' · ' +
      cost(reporter) + ' 分钟' + (reporterFits(reporter, story) ? ' · 擅长' : '') + '</option>').join('') + '</select></div>' +
    '<p class="field-hint" id="assignment-hint"' + (affordable ? ' hidden' : '') + '>这趟采访赶不上最晚交印。</p>';
}

function reportPanel(story) {
  if (story.original) {
    return '<div class="report original-copy"><div class="edit-controls"><div class="report-buttons">' +
      '<button type="button" class="soft" data-action="edit-original">编辑原创稿</button></div>' +
      placementControls(story) + '</div>' +
      (!originalFitsSupport(story) ? '<p class="warn-copy">头版左下的副稿最多 ' + ORIGINAL_SUPPORT_LIMIT + ' 字。</p>' : '') +
      '<div class="report-text">' + story.body.map(paragraph => '<p>' + h(paragraph) + '</p>').join('') + '</div></div>';
  }
  if (story.library) {
    return '<div class="report library-copy">' + placementControls(story) +
      '<details class="report-text"><summary>阅读全文</summary>' +
      story.body.map(paragraph => '<p>' + h(local(paragraph)) + '</p>').join('') +
      '<h3>副稿短版</h3><p>' + h(local(story.short)) + '</p></details></div>';
  }
  const report = game.reports[story.id];
  const copy = storyCopy(story, report);
  const note = DESK_NOTES[story.id];
  const incoming = READER_LEADS.get(story.id);
  const checked = verificationCopy(story, report);
  const field = fieldReport(story, report);
  const returned = report?.visited || report?.verified;
  const work = report?.lastWork || (report?.followed ? 'follow' : report?.verified ? 'verify' : 'visit');
  const latest = work === 'follow' ? note.follow : work === 'verify' ? checked.join('') : report?.rumor && !report.verified ? rumorFieldNote(story) : report?.tier === 'scoop' ? story.scoop.report[0] : field[0];
  const status = work === 'follow' ? '补访回稿' : work === 'verify' ? '查证回稿' : '现场回稿';
  const tierLabel = report?.visited ? {miss:'扑空', regular:'常规', scoop:'猛料'}[report.tier] : '';
  const slip = returned ? '<div class="report-slip' + (report?.tier === 'scoop' ? ' scoop-slip' : '') + '" tabindex="-1"><strong>' +
    (tierLabel ? '<span class="tier-mark">' + tierLabel + '</span> · ' : '') + status +
    (report.name ? ' · ' + h(report.name) : '') + (report.returnedAt ? ' · ' + clockText(report.returnedAt) : '') + '</strong><p>' + h(local(latest)) + '</p></div>' : '';
  const verify = !report?.verified ? '<button type="button" class="soft" data-action="verify-story"' +
    (!canSpendDeskTime(game, verifyCost(report)) ? ' disabled' : '') + '>' +
    (report?.visited ? '查证原件' : '先打电话核实') + ' · ' + verifyCost(report) + ' 分钟</button>' : '';
  const chase = report?.visited && !report.followed ? '<button type="button" class="soft" data-action="follow-story"' +
    (!canSpendDeskTime(game, DESK_UNIT) ? ' disabled' : '') + '>再追一问 · ' + DESK_UNIT + ' 分钟</button>' : '';
  const angles = PAPER_ANGLES.filter(angle => angleAvailable(report, angle.id))
    .map(angle => '<button type="button" class="soft" data-action="angle" data-id="' + angle.id +
    '" aria-pressed="' + ((report?.angle || 'news') === angle.id) + '"' +
    ' title="' + h(angle.note) + '">' + angle.label + '</button>').join('');
  const material = [copy.brief, ...field, ...checked, ...(report?.followed ? [note.follow] : [])];
  const details = returned ? '<details class="report-details"><summary>完整回稿与写法</summary>' +
    '<div class="report-text">' + material.map(paragraph => '<p>' + h(local(paragraph)) + '</p>').join('') +
    '</div><div class="angle-bar"><span>成稿角度</span><div class="report-buttons">' + angles +
    '</div></div>' + '' + '</details>' : '';
  return '<div class="report">' +
    (incoming ? '<p class="tracking-note">' + h(local(incoming.message)) + '</p>' : '') +
    '<p class="desk-quip">“' + h(local(note.quip)) + '”</p>' +
    (returned ? slip : '<p class="desk-facts">' + h(local(copy.brief)) + '</p>') +
    '<div class="edit-controls">' + assignmentControls(story, report) +
    (verify || chase ? '<div class="report-buttons">' + verify + chase + '</div>' : '') +
    placementControls(story) + '</div>' + details + '</div>';
}

function briefsPanel() {
  const candidates = briefCandidates(game);
  const chosen = game.briefs || [];
  const limit = briefLimit(game);
  return '<section class="panel"><header class="panel-heading"><h2>简讯栏与存稿箱</h2><p>' + chosen.length + ' / ' + limit +
    ' 条</p></header><div class="management"><p>本期跑过、未排头条或副稿的材料可进简讯。未见报的回稿留到下期，存稿只进简讯、效果减半。</p>' +
    (game.ad?.placement === 'front' ? '<p>头版广告占一条简讯位，本期最多两条。</p>' : '') + '</div>' +
    (candidates.length ? candidates.map(item => '<article class="management"><div class="manage-row"><div><h3>' +
      h(local(item.title)) + '</h3><p>' + h(item.section + ' · ' + (item.stored ? '上期存稿 · 本期后过期' : '本期回稿')) +
      '</p></div><button type="button" class="soft" data-action="brief" data-id="' + h(item.id) + '"' +
      (!chosen.includes(item.id) && chosen.length >= limit ? ' disabled' : '') + '>' +
      (chosen.includes(item.id) ? '撤下简讯' : '放入简讯') + '</button></div><p>' + h(local(item.flash)) + '</p></article>').join('') :
      '<div class="management"><p>暂没有可用简讯或存稿。</p></div>') + '</section>';
}

function deskClockPanel() {
  const deadline = deskDeadline(game.week);
  const remaining = deadline - game.clock;
  const notice = remaining > 0 ? '距截稿 ' + remaining + ' 分钟' : remaining === 0 ? '截稿时间已到' : '已晚 ' + -remaining + ' 分钟';
  return '<section class="panel desk-clock" aria-label="编辑台时钟"><div class="manage-row"><div><small>现在几点</small>' +
    '<strong id="desk-now">' + clockText(game.clock) + '</strong><p>' + notice + '</p></div>' +
    '<button type="button" class="soft accent" data-action="wait-phone"' + (!canSpendDeskTime(game, 1) ? ' disabled' : '') +
    '>' + (game.clock < deadline || game.trips.length || !knownRival(game) ? '等下一通电话' :
      game.clock === deadline + MAX_OVERTIME ? '已到最晚交印时间' :
      '再等 ' + Math.min(DESK_STEP, deadline + MAX_OVERTIME - game.clock) + ' 分钟') + '</button></div>' +
    '<ul>' + game.staff.map(id => {
      const trip = game.trips.find(item => item.reporter === id);
      return '<li><strong>' + h(reporterById(id).name) + '</strong> · ' + (trip ? '预计 ' + clockText(trip.at) + ' 回电' : '可出勤') + '</li>';
    }).join('') + '</ul></section>';
}

function deskView() {
  if (game.phase !== 'desk') {
    return pageHeader('周五编辑台', newspaperName(game)) +
      '<section class="panel blank"><p>' + (game.phase === 'complete' ? '本局已经结算。' : '本期已经付印，周六的发行回单到了。') +
      '</p><button type="button" class="soft accent" data-view="sales">查看发行</button></section>';
  }
  const week = issueWeek(game.week, game.year);
  const dates = weekDates(game.week, game.year);
  const weekday = game.newsLibrary ? '<div class="shift"><div><small>本期刊期 · 星期六</small><time datetime="' +
    dates.saturday + '">' + dotted(dates.saturday) + '</time></div></div>' :
    '<div class="shift"><div><small>' + (game.week ? '星期五' : '跨年夜班') +
    '</small><time datetime="' + dates.friday + '">' + dotted(dates.friday) + '</time></div>' +
    '<div><small>截稿时间</small><time class="deadline">' + clockText(deskDeadline(game.week)) + '</time></div></div>';

  const rival = knownRival(game);
  const late = game.newsLibrary ? null : lateLead(game);
  const lateStory = late && getStory(game, late.id);
  const slate = storySlate(game);
  const candidateCount = slate.filter(story => story.library).length;
  const tight = game.year && (candidateCount < CANDIDATES_PER_ISSUE || !canUseTwoEvergreens(game));
  const clash = game.year && game.headline && rival?.storyId === game.headline;
  const rows = slate.map(story => {
    const focus = story.id === game.focus && collapsedStory !== story.id;
    const chosen = story.id === game.headline;
    const supported = story.id === game.support;
    const report = game.reports[story.id];
    const summary = story.risk && report?.verified ? story.risk.brief : story.tip;
    const follow = READER_LEADS.get(story.id);
    const flag = chosen ? '拟作头条' : supported ? '拟作副稿' : game.briefs.includes(story.id) ? '拟作简讯' : report?.verified ? '已核实' :
      story.original ? '原创' : story.library ? (story.date ? '时令稿' : '常备稿') :
      report?.visited ? '已回稿' : game.trips.some(trip => trip.story === story.id) ? '采访中' : '待采编';
    const labels = story.library ? '<span class="library-labels"><span>新闻分量 ' + h(story.weight) +
      '</span><span>刊发风险 ' + h(story.publicationRisk) + '</span></span>' : '';
    return '<button type="button" class="lead' + (focus ? ' selected' : '') + '" data-action="focus-story" data-id="' +
      h(story.id) + '" aria-expanded="' + focus + '"><span class="desk">' + h(follow ? '追踪' : story.section) +
      '</span><div><h3>' + h(storyText(story, storyCopy(story, report).title, game.city)) + '</h3><p>' +
      h(storyText(story, summary, game.city)) +
      '</p>' + labels + '</div><span class="flag' + (chosen || supported ? ' red' : '') + '">' + flag + '</span></button>' +
      (focus ? reportPanel(story) : '');
  }).join('');

  const provisional = game.focus === game.support ? slate.find(story => story.id !== game.support)?.id : game.focus;
  const draftStory = getStory(game, game.headline || provisional);
  const draft = draftStory && editionDraft(game, draftStory);
  const shortfall = pressQuote(game, MIN_PRINT).total > cashOf(game);
  return pageHeader(game.newsLibrary ? '编辑台' : '周五编辑台',
    newspaperName(game) + ' · ' + week.name + ' · 第 ' + (game.week + 1) + ' 期', weekday,
    game.newsLibrary ? '' : local(week.note)) +
    '<div class="workspace"><div class="column">' + (game.newsLibrary ? pressurePanel() + rivalCaptureNotice() : deskClockPanel()) +
    '<section class="panel"><header class="panel-heading"><h2>本期稿件</h2><p>' +
    slate.length + ' 条稿件</p></header>' +
    '<div class="desk-tools report-buttons"><button type="button" class="soft accent" data-action="new-original"' +
    ((game.originals?.length || 0) >= ORIGINAL_LIMIT ? ' disabled' : '') + '>写原创稿</button>' +
    '<button type="button" class="soft" data-action="city">城市与报纸</button>' +
    '<button type="button" class="soft" data-action="restart">重开一局</button>' +
    ((game.originals?.length || 0) >= ORIGINAL_LIMIT ? '<small class="field-hint">本期已有 ' + ORIGINAL_LIMIT + ' 篇原创草稿</small>' : '') +
    '</div>' +
    (tight ? '<div class="desk-wire source-warning"><strong>稿源吃紧</strong><p>' +
      (candidateCount < CANDIDATES_PER_ISSUE ? '本期有 ' + candidateCount + ' 条库稿。' : '') +
      (!canUseTwoEvergreens(game) ? '余下刊期需留常备稿。选了常备头条，副稿可用时令稿或原创。' : '') + '</p></div>' : '') +
    (rival ? '<div class="desk-wire"><strong>' + (game.newsLibrary ? '' : clockText(rivalCallTime(game)) + ' 来电 · ') +
      '《' + h(rival.name) + '》动向' + (clash ? ' <span class="flag red">撞稿</span>' : '') +
      '</strong><p>' + (rival.tip ? h(rival.tip) + '<br>' : '') +
      '头条：《' + h(rival.title) + '》<br>铺货点：' + h(rival.outlets.map(id => channelById(id).name).join('、')) + '</p></div>' : '') +
    (lateStory ? '<div class="desk-wire"><strong>' + clockText(late.at) + ' 来电 · 新线索</strong><p>《' +
      h(storyText(lateStory, lateStory.headline, game.city)) + '》</p></div>' : '') + rows + '</section>' +
    (game.newsLibrary ? '' : briefsPanel()) +
    '<section class="panel plan"><header class="panel-heading"><h2 id="print-heading" tabindex="-1">印刷安排</h2><p>账上 ' + money(cashOf(game)) + ' 元</p></header>' +
    '<div class="plan-body"><label class="plan-metric"><small>首印量</small>' +
    '<input id="copies" type="number" min="' + MIN_PRINT + '" max="' + printLimit(game) + '" step="1" inputmode="numeric" value="' +
    game.copies + '" aria-describedby="print-hint"><span>份</span></label>' +
    '<div class="plan-metric"><small>本期出刊支出</small><strong id="print-cost" class="money"></strong><span>元</span></div>' +
    '<button class="issue" type="button" data-action="sign">签发付印<b aria-hidden="true">→</b></button></div>' +
    '<p class="plan-hint" id="print-hint"></p>' +
    (overtimeSteps(game) ? '<p class="plan-hint warn-copy">现在签发，早班报摊会晚到 ' + overtimeSteps(game) * DESK_STEP + ' 分钟，销量受影响。</p>' : '') +
    (shortfall ? '<div class="management"><p>按现有人手和渠道，最低出刊要 ' + money(pressQuote(game, MIN_PRINT).total) +
      ' 元。可在记者或发行页缩减下期支出。</p></div>' : '') +
    '</section></div>' + (draft ? paperPanel(draft, false) : '') + '</div>' +
    bottom('签发后存入合订本，可下载头版', '<span>发行日　' + dotted(dates.saturday) + ' 星期六</span>');
}

function pressurePanel() {
  const issue = game.week + 1;
  const events = game.pressure?.events.filter(event => event.arrived === issue || event.resolved === issue) || [];
  if (!events.length) return '';
  const recap = {
    correction:'本报将更正列入本期刊后记录。',
    reply:'本报已同意刊登对方回应，原报道仍收在合订本。',
    stand:'本报保留原报道，已有记录交复核。',
    confirmed:'复核人员对过原始材料，确认报道所列事实。',
    unresolved:'复核结束，现有材料仍不足以证实争议部分。'
  };
  return '<section class="panel pressure-inbox"><header class="panel-heading"><h2>刊后来电与回单</h2></header>' +
    events.map(event => {
      const target = local(event.target);
      const title = '《' + local(event.title) + '》';
      let heading;
      let copy;
      if (event.kind === 'advertiser') {
        heading = '广告撤单 · ' + target;
        copy = '本报讯 ' + target + '来电称，' + title + '刊出后，该商场已撤回广告委托。广告部核对了订单，第 ' +
          event.arrived + ' 至 ' + game.pressure.adUntil + ' 期的广告报价下调。';
      } else if (event.kind === 'complaint') {
        heading = '投诉回单';
        copy = '本报讯 编辑部接到关于' + title + '的投诉。值班编辑已登记来电并调取材料，资料、通讯支出 ' +
          money(COMPLAINT_COST_CENTS) + ' 元已入账。';
      } else {
        heading = (event.arrived === issue ? '来电施压 · ' : '调查复核回单 · ') + target;
        copy = '本报讯 ' + target + '来电，要求本报撤下' + title + '。' +
          (recap[event.status] || '值班编辑已记下来电时间和对方要求，等候主编答复。');
      }
      const controls = event.status === 'pending' ? '<div class="report-buttons">' +
        '<button type="button" class="soft" data-action="pressure-response" data-id="correction">刊发更正</button>' +
        '<button type="button" class="soft accent" data-action="pressure-response" data-id="stand">坚持报道</button>' +
        '<button type="button" class="soft" data-action="pressure-response" data-id="reply">登对方回应</button></div>' : '';
      return '<article class="management"><h3>' + h(heading) + '</h3><p>' + h(copy) + '</p>' + controls + '</article>';
    }).join('') + '</section>';
}

function rivalCaptureNotice() {
  const change = game.market.lastCapture;
  if (change?.issue !== game.week + 1) return '';
  return '<section class="desk-wire source-warning"><strong>发行回单 · 铺货点变更</strong><p>' +
    h('连续 ' + change.wins + ' 期头条分量落后后，' + channelById(change.id).name +
      '改由《' + rivalPaperName(game) + '》铺货。') + '</p></section>';
}

function salesNote(edition) {
  const stockouts = edition.stands.filter(stand => stand.stockout);
  if (stockouts.length === edition.stands.length) return '发行员来电，各处报摊的首印都卖完了。';
  if (stockouts.length) return '发行员来电，' + stockouts.map(stand => stand.name).join('、') + '先卖完了，其余报摊还有存报。';
  if (edition.returned > (edition.printed + (edition.reprint?.printed || 0)) * .3) return '几个报摊剩了不少，下期印量可以再斟酌。';
  return '首日回单送到编辑部，几个报摊的余报都不多。';
}

function rivalReceipt(edition) {
  if (!edition.rival) return '';
  const {name, title, clash, distinct, stands} = edition.rival;
  const paper = '《' + name + '》';
  const contested = stands.some(stand => stand.competing);
  const affected = edition.stands.filter(stand => stand.components?.rival);
  const effect = affected.length ? ' 本期受' + paper + '分流或撞题影响的报摊：' + affected.map(stand => stand.name).join('、') + '。' : '';
  const outcome = !contested ? '这次两家报纸各有各的铺货点。' :
    !clash ? '两家头条说的是不同的事，共用的报摊仍要争读者。' :
      distinct ? '两家撞了题。报摊回话，有人翻过' + paper + '，又回来买了你家多跑一趟写出来的那版。' :
        '两家撞了题。报摊回话，好些读者觉得消息看过一遍就够了。';
  return '<section class="receipt-detail"><h3>' + h(name) + '</h3><p class="other-headline">' + h(title) + '</p>' +
    '<ul>' + stands.map(stand => '<li><span>' + h(stand.name) + (stand.competing ? ' · 同摊' : '') + '</span><span>' +
      number(stand.sold) + ' 份</span></li>').join('') + '</ul><p>' + h(outcome + effect) + '</p></section>';
}

function readerReceipt(edition) {
  const lead = READER_LEADS.get(edition.nextLead);
  const briefs = edition.flashes?.length ? '<p>本期简讯 ' + edition.flashes.length + ' 条' +
    (edition.flashes.some(item => item.stored) ? '，其中有上期存稿' : '') + '。</p>' : '';
  if (!lead && !briefs) return '';
  return '<section class="receipt-detail reader-letter"><h3>' + (lead ? '读者来信 · 下期可追' : '读者回音') + '</h3>' +
    (lead ? '<p>' + h(cityText(lead.message, edition.city)) + '</p>' : '') + briefs + '</section>';
}

function reprintPanel(edition) {
  const calls = reprintCalls(edition);
  if (!calls.length) return '';
  if (edition.reprint) {
    const {printed, sold, cost} = edition.reprint;
    return '<section class="receipt-detail"><h3>补印回单</h3><p>' + (printed ?
      '共补送 ' + number(printed) + ' 份，卖出 ' + number(sold) + ' 份，退回 ' + number(printed - sold) +
      ' 份，补印与配送共 ' + money(cost) + ' 元。' : '本期来电均未补送。') + '</p></section>';
  }
  return '<section class="receipt-detail reprint-panel"><h3>报摊来电 · 要货</h3>' + calls.map(call =>
    '<div class="reprint-call"><div><strong>' + h(call.name) + ' · ' + h(call.time) + ' 售罄</strong><p>“' +
    h(REPRINT_CALL_COPY[call.tier]) + '”</p></div><label>补送给' + h(call.name) + '<select data-reprint="' + h(call.id) + '">' +
    call.options.map(copies => '<option value="' + copies + '">' + (copies ? number(copies) + ' 份 · ' +
    money(reprintCost(copies)) + ' 元' : '不补送') + '</option>').join('') + '</select></label></div>').join('') +
    '<div class="sales-actions"><button type="button" class="issue" data-action="reprint">确认补印安排</button>' +
    '<span id="reprint-quote" role="status">补印与配送共 0 元</span></div></section>';
}

function readReprintOrders() {
  return Object.fromEntries([...app.querySelectorAll('[data-reprint]')].map(select => [select.dataset.reprint, Number(select.value)]));
}

function reprintOrderCost(orders) {
  return Object.values(orders).reduce((sum, copies) => sum + reprintCost(copies), 0);
}

function confirmReprint() {
  const orders = readReprintOrders();
  const cost = reprintOrderCost(orders);
  const remaining = cashOf(game) - cost;
  if (remaining < 0) return;
  const minimum = pressQuote(game, MIN_PRINT).total;
  if (cost && remaining < minimum && !game.ending) {
    pendingReprint = {orders, revision:game.revision, seed:game.seed};
    document.getElementById('reprint-reserve-copy').textContent =
      reprintReserveCopy(money(cost), money(remaining), money(minimum));
    reprintDialog.returnValue = '';
    reprintDialog.showModal();
  } else finishReprint(orders);
}

function finishReprint(orders) {
  const next = settleReprint(game, orders);
  if (next && commit(next)) {
    app.querySelector('[data-action="next"]')?.focus({preventScroll:true});
    announce('补印已结算，回款和退报已计入当日回单。');
  }
}

function salesView() {
  if (game.phase === 'complete') return annualSummaryView();
  if (game.phase !== 'sales') return channelsView();
  const edition = game.editions.at(-1);
  const previous = game.editions.at(-2);
  const change = previous ? edition.sold - previous.sold : null;
  const delta = change === null ? '' : '<span class="change' + (change < 0 ? ' down' : '') + '">较上期 ' +
    (change > 0 ? '+' : '') + number(change) + ' 份</span>';
  const rows = edition.stands.map(stand => '<tr><td>' + h(stand.name) + '</td><td>' + number(stand.printed + (stand.reprint?.copies || 0)) +
    '</td><td>' + number(stand.sold + (stand.reprint?.sold || 0)) + '</td><td class="' + (stand.stockout ? 'sold-out' : '') + '">' +
    (stand.stockout ? h(stand.time + ' 售罄') : '余 ' + number(stand.printed - stand.sold)) +
    (stand.deliveryAt > 480 ? '<br><small>' + clockText(stand.deliveryAt) + ' 到摊</small>' : '') + '</td></tr>' +
    (stand.phone ? '<tr class="phone-row"><td colspan="4">' + h(stand.phone) + (stand.reprint ?
      ' 补送 ' + number(stand.reprint.copies) + ' 份，卖出 ' + number(stand.reprint.sold) +
      ' 份，退回 ' + number(stand.reprint.returned) + ' 份。' :
      edition.reprint && stand.requests > stand.printed && stand.stockout ? ' 本摊未补送。' : '') + '</td></tr>' : '')).join('');
  const nextLabel = nextIssue(game)?.ending === 'insolvent' ? '查看资金链断裂结局' : '进入下一期';
  return pageHeader('周六发行', newspaperName(edition) + ' · 第 ' + edition.issue + ' 期 · ' + dotted(edition.date)) +
    '<div class="workspace"><section class="panel sales-panel"><header class="receipt-head"><div><h2>发行回单</h2>' +
    '<p>' + h(edition.title) + '</p></div><span class="flag red">当日</span></header><div class="sales-number">' +
    '<span>当日实售</span><strong id="live-sold">' + number(edition.sold) + '</strong><span class="unit">份</span>' +
    '<span class="plus-one" id="plus-one" aria-hidden="true">+1</span>' + delta + '</div>' +
    '<div class="cash-live"><span>发行回款<strong id="live-revenue">' + money(edition.revenue) + '</strong> 元</span>' +
    '<span>账上现金<strong id="live-cash">' + money(cashOf(game)) + '</strong> 元</span>' +
    '<button type="button" class="soft" id="skip-animation" data-action="skip-animation" hidden>跳过动画</button></div>' +
    '<div class="receipt-grid"><div><span>首印</span><strong>' + number(edition.printed) + '</strong></div>' +
    '<div><span>退报</span><strong>' + number(edition.returned) + '</strong></div>' +
    '<div><span>本期盈亏（元）</span><strong>' + money(edition.net) + '</strong></div></div>' +
    '<table class="stands"><thead><tr><th scope="col">报摊</th><th scope="col">送报</th><th scope="col">实售</th><th scope="col">首印回单</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table><p class="stand-note">' + h(salesNote(edition)) + '</p>' + reprintPanel(edition) +
    rivalReceipt(edition) + readerReceipt(edition) +
    (edition.replies || []).map(item => '<section class="receipt-detail"><h3>' + h(item.label) +
      '</h3><p>' + h(item.text) + '</p></section>').join('') +
    edition.corrections.map(item => '<section class="receipt-detail"><h3>刊后更正</h3><p>' + h(item.text) + '</p></section>').join('') +
    (edition.adNotice ? '<section class="receipt-detail"><h3>广告回单</h3><p>' + h(edition.adNotice) + '</p></section>' : '') +
    '<p class="stand-note">本年累计实售 ' + number(soldOf(game)) + ' 份。</p>' +
    '<div class="sales-actions"><button type="button" class="issue" data-action="next"' + (edition.reprint === null ? ' disabled' : '') + '>' + nextLabel + '<b aria-hidden="true">→</b></button>' +
    '<a class="soft export-link" data-download aria-disabled="true">下载头版 PNG</a></div></section>' +
    paperPanel(edition, true) + '</div>' + bottom('各项收入和支出已记入财务台账。');
}

function archiveView() {
  const title = pageHeader('合订本', newspaperName(game) + ' · 已收录 ' + game.editions.length + ' 期');
  if (!game.editions.length) return title + '<section class="panel blank"><p>创刊号签发后会收在这里。</p></section>';
  const edition = game.editions.find(entry => entry.issue === archiveIssue) || game.editions.at(-1);
  const rows = game.editions.map(entry => '<button type="button" class="archive-row' + (entry.issue === edition.issue ? ' active' : '') +
    '" data-action="open-edition" data-issue="' + entry.issue + '" aria-pressed="' + (entry.issue === edition.issue) +
    '"><span>第 ' + ordinal(entry.issue) + ' 期<br>' + dotted(entry.date) + '</span><strong>' + h(entry.title) +
    (entry.corrections.length ? ' <small class="money-out">有刊后更正</small>' : '') + '</strong><span>' + number(entry.sold) + ' 份</span></button>').join('');
  const options = game.editions.slice().reverse().map(entry => '<option value="' + entry.issue + '"' +
    (entry.issue === edition.issue ? ' selected' : '') + '>第 ' + ordinal(entry.issue) + ' 期 · ' + h(entry.title) + '</option>').join('');
  return title + '<div class="workspace"><section class="panel"><header class="panel-heading"><h2>往期报纸</h2>' +
    '<p>查看所选头版</p></header><div class="archive-list">' + rows + '</div>' +
    '<label class="archive-picker" for="archive-issue">选择期数<select id="archive-issue">' + options + '</select></label>' +
    '<p class="archive-meta">' + dotted(edition.date) + ' · 实售 ' + number(edition.sold) + ' 份' +
    (edition.corrections.length ? ' · 有刊后更正' : '') + '</p>' +
    '<div class="archive-actions"><a class="soft accent export-link" data-download aria-disabled="true">下载头版 PNG</a></div>' +
    '</section>' + paperPanel(edition, true) + '</div>';
}

function annualSalesChart(curve) {
  const max = Math.max(1000, Math.ceil(Math.max(...curve) / 1000) * 1000);
  const left = 57, right = 466, top = 16, bottom = 149;
  const x = i => left + i * (right - left) / Math.max(1, curve.length - 1);
  const y = value => bottom - value * (bottom - top) / max;
  const ticks = [0, max / 2, max];
  return '<svg class="annual-chart" viewBox="0 0 480 177" role="img" aria-label="全年逐期实售份数">' +
    ticks.map(value => '<line x1="' + left + '" x2="' + right + '" y1="' + y(value) + '" y2="' + y(value) +
      '"></line><text x="50" y="' + (y(value) + 4) + '" text-anchor="end">' + number(value) + '</text>').join('') +
    '<polyline points="' + curve.map((value, index) => x(index).toFixed(2) + ',' + y(value).toFixed(2)).join(' ') +
    '" fill="none" vector-effect="non-scaling-stroke"></polyline><text x="' + left +
    '" y="168">第 1 期</text><text x="' + right + '" y="168" text-anchor="end">第 ' + curve.length + ' 期</text></svg>';
}

function annualSummaryView() {
  const {curve, weights, best, rivalSold, nominations, missed} = annualSummary(game);
  const last = game.editions.at(-1);
  const totalIssues = yearIssueCount(game.year);
  const yearly = game.ending === 'year';
  const title = yearly ? '年终结算' : '资金链断了';
  const name = last?.rival.name || rivalPaperName(game);
  const sold = soldOf(game);
  const missedIssues = totalIssues - game.editions.length;
  const review = !yearly ? '报社目前的现金无法负担最低出刊开支。已签发的报纸收在合订本。' :
    (missedIssues ? '报纸办到了年末，全年出了 ' + game.editions.length + ' 期。' : '这一年，每个周六都出了报。') +
    (nominations.length ? '你的稿件进了省里的评选名单。' : '来年还要靠选题和事实，把读者留在摊前。');
  const reprint = last?.reprint;
  const notice = yearly ? '' : '<div class="risk-callout"><strong>第 ' + (game.week + 1) +
    ' 期无法出刊</strong><p>' + h(insolventCopy(game.week + 1, money(cashOf(game)), money(minimumViablePressCost(game)),
      reprint?.printed ? number(reprint.printed) : 0, number(reprint ? reprint.printed - reprint.sold : 0), last?.issue)) + '</p></div>';
  const awardList = (items, label, expanded) => '<details class="annual-awards"' + (expanded ? ' open' : '') +
    '><summary>' + label + ' ' + items.length +
    ' 篇</summary>' + (items.length ? '<ul>' + items.map(item => typeof item === 'string' ?
      '<li>' + h(item) + '</li>' : '<li><span>第 ' + item.rank + ' 名 · ' + h(item.title) +
        '</span><small>' + h(item.reason) + '</small></li>').join('') + '</ul>' : '<p>本年没有稿件列入这一项。</p>') + '</details>';
  return pageHeader(title, newspaperName(game) + ' · ' + game.year + ' 年') +
    '<div class="workspace"><section class="panel sales-panel annual-summary"><header class="receipt-head"><div><h2>全年发行</h2><p>出刊 ' +
    game.editions.length + ' / ' + totalIssues + ' 期</p></div></header>' + notice + '<div class="sales-number"><span>实售合计</span><strong>' +
    number(sold) + '</strong><span class="unit">份</span></div>' + annualSalesChart(curve) +
    '<div class="receipt-grid"><div><span>最高单期（份）</span><strong>' + number(best?.sold || 0) +
    '</strong></div><div><span>年终公信力</span><strong>' + game.pressure.credibility +
    '</strong></div><div><span>期末现金（元）</span><strong>' + money(cashOf(game)) + '</strong></div></div>' +
    (best ? '<p class="summary-topline">销量最高为第 ' + best.issue + ' 期《' + h(best.title) + '》。</p>' : '') +
    '<section class="receipt-detail"><h3>头条分量分布</h3><p>重 ' + weights.重 + ' · 中 ' + weights.中 + ' · 轻 ' + weights.轻 + '</p></section>' +
    '<section class="receipt-detail"><h3>发行对比</h3><p>本报实售 ' + number(sold) + ' 份，《' + h(name) +
    '》同期回单合计 ' + number(rivalSold) + ' 份。</p></section>' +
    (yearly ? '<section class="receipt-detail"><h3>省好新闻奖</h3>' +
      '<p>评审从全年头条中择前三名，调查曝光和风险批评优先。公信力至少 ' + AWARD_MIN_CREDIBILITY +
      '，刊发过更正的头条无资格。</p>' + awardList(nominations, '获得提名', true) +
      awardList(missed, '错过提名', true) + '</section>' : '') +
    '<p class="summary-topline">' + h(review) + '</p>' + (last?.reprint === null ? reprintPanel(last) : '') +
    '<div class="sales-actions"><button type="button" class="issue" data-view="archive">翻阅合订本<b aria-hidden="true">→</b></button>' +
    '<button type="button" class="soft" data-action="restart">重开一局</button></div></section>' +
    (best ? paperPanel(best, true) : '') + '</div>';
}
function staffView() {
  const ready = availableReporters(game).map(reporter => reporter.id);
  const cash = cashOf(game);
  const editable = game.phase === 'desk';
  function card(reporter, present) {
    const cost = present ? Math.ceil(reporter.salary / 2) : reporter.hire;
    const label = present ? '解聘' : '招聘';
    const trip = game.trips.find(item => item.reporter === reporter.id);
    const disabled = !editable || cash < cost || (present ? game.staff.length <= 1 || trip : game.staff.length >= staffLimit(game));
    const status = !present ? '应聘中' : game.newsLibrary ? '在岗' :
      ready.includes(reporter.id) ? '可出勤' : '预计 ' + clockText(trip.at) + ' 回电';
    return '<article class="management"><div class="manage-row"><div><h3>' + h(reporter.name) + '</h3><p>' +
      h(reporter.style + ' · ' + status) +
      '</p></div><button type="button" class="soft" data-action="' + (present ? 'fire' : 'hire') + '" data-id="' +
      reporter.id + '"' + (disabled ? ' disabled' : '') + '>' + label + ' · ' + money(cost) + ' 元</button></div>' +
      '<div class="stats-line"><span>跑线 <b>' + reporter.reach + '/5</b></span><span>核实 <b>' + reporter.verify +
      '/5</b></span><span>写稿 <b>' + reporter.write + '/5</b></span><span>周薪 <b>' + money(reporter.salary) +
      '</b> 元</span></div></article>';
  }
  return pageHeader('记者部', newspaperName(game) + ' · 在岗 ' + game.staff.length + ' / ' + staffLimit(game)) +
    (game.newsLibrary && editable ? '' : '<p class="manager-note">' +
      (game.newsLibrary ? '' : '记者可同时外出，回电后还能再派。跑线能力越高，采访回来越快。') +
      (editable ? '' : ' 下期采编开始后可调整人员。') + '</p>') +
    '<div class="workspace"><section class="panel"><header class="panel-heading"><h2>在岗记者</h2></header>' +
    REPORTERS.filter(reporter => game.staff.includes(reporter.id)).map(reporter => card(reporter, true)).join('') +
    '</section><section class="panel"><header class="panel-heading"><h2>招聘名单</h2></header>' +
    REPORTERS.filter(reporter => !game.staff.includes(reporter.id)).map(reporter => card(reporter, false)).join('') + '</section></div>';
}

function channelsView() {
  const editable = game.phase === 'desk';
  const cash = cashOf(game);
  const currentChannels = CHANNELS.filter(channel => game.active.includes(channel.id));
  const planned = allocateCopies(currentChannels, Math.min(game.copies, printLimit(game)), game.priority);
  function card(channel) {
    const open = game.unlocked.includes(channel.id);
    const active = game.active.includes(channel.id);
    const focus = game.priority === channel.id;
    const captured = game.market.captured.includes(channel.id);
    const buttonText = captured ? '对手已接手' : active ? '暂停配送' : open ? '恢复配送' : '开拓 · ' + money(channel.setup) + ' 元';
    const disabled = captured || !editable || (!open && cash < channel.setup) || (active ? game.active.length === 1 : game.active.length >= channelLimit(game));
    const types = Object.keys(channel.interests).join('、');
    const plannedCount = planned[currentChannels.indexOf(channel)] || 0;
    return '<article class="management"><div class="manage-row"><div><h3>' + h(channel.name) + '</h3><p>' +
      h('常见读者关注 ' + types) + '</p></div><div class="report-buttons">' +
      (active ? '<button type="button" class="soft' + (focus ? ' accent' : '') + '" aria-pressed="' + focus +
        '" data-action="priority" data-id="' + channel.id + '"' + (editable ? '' : ' disabled') + '>' +
        (focus ? '已重点配送' : '重点配送') + '</button>' : '') +
      '<button type="button" class="soft" data-action="channel" data-id="' + channel.id + '"' +
      (disabled ? ' disabled' : '') + '>' + buttonText + '</button></div></div>' +
      '<div class="stats-line"><span>容量 <b>' + number(channel.cap) + '</b> 份</span><span>每期配送 <b>' + money(channel.fee) +
      '</b> 元</span><span>每份代售 <b>' + money(channel.commission) + '</b> 元</span>' +
      (active ? '<span>本期拟送 <b>' + number(plannedCount) + '</b> 份</span>' : '') + '</div></article>';
  }
  return pageHeader('发行经营', newspaperName(game) + ' · ' + game.active.length + ' / ' + channelLimit(game) + ' 个在营渠道') +
    '<p class="manager-note">先开拓网点，再决定首印量和重点配送。每期发运会扣配送费，代售费从实售回款里结算。' +
    (editable ? '' : ' 下期采编开始后可调整。') + '</p>' +
    '<div class="workspace"><section class="panel"><header class="panel-heading"><h2>在营渠道</h2><p>总容量 ' +
    number(printLimit(game)) + ' 份</p></header>' + currentChannels.map(card).join('') + '</section>' +
    '<section class="panel"><header class="panel-heading"><h2>待开拓与暂停</h2></header>' +
    (CHANNELS.filter(channel => !game.active.includes(channel.id)).map(card).join('') || '<div class="management"><p>现有渠道都在配送。</p></div>') +
    '</section></div>';
}

function advertisingView() {
  if (game.phase !== 'desk') return '<div class="management"><p>本期广告已经结算，下一期会收到新的报价。</p></div>';
  const list = issueAdOffers(game.week).map(adById);
  return list.map(offer => {
    const chosen = game.ad?.id === offer.id;
    const clear = offer.clearance === 'ready' ? '材料齐备' :
      chosen && game.ad.checked ? offer.clearance === 'missing' ? '查到缺少刊登文件' : '文件已经核对' : '刊登文件待查';
    const check = chosen && !game.ad.checked && offer.clearance !== 'ready'
      ? '<button type="button" class="soft" data-action="review-ad"' +
        (!canSpendDeskTime(game, DESK_UNIT) ? ' disabled' : '') + '>查刊登文件' +
        (game.newsLibrary ? '' : ' · ' + DESK_UNIT + ' 分钟') + '</button>' : '';
    const button = (position, label) => {
      const active = chosen && game.ad.placement === position;
      return '<button type="button" class="soft' + (active ? ' accent' : '') + '" data-action="choose-ad" data-id="' +
        offer.id + '" data-place="' + position + '" aria-pressed="' + active + '">' +
        (active ? '已选 ' : '') + label + ' ' + money(adValue(offer, position, game)) + ' 元</button>';
    };
    return '<article class="management ad-offer' + (chosen ? ' chosen' : '') + '"><div class="manage-row"><div><h3>' +
      h(offer.name) + '</h3><p>' + h(offer.category + ' · ' + clear) + '</p></div>' +
      (chosen ? '<button type="button" class="soft" data-action="drop-ad">撤掉广告</button>' : '') + '</div>' +
      '<p>' + h(offer.lines[0]) + '</p>' +
        '<div class="report-buttons ad-buttons">' + button('inside','内页') + button('front','头版') + check + '</div></article>';
  }).join('');
}

function financeView() {
  const quote = pressQuote(game, Math.min(game.copies, printLimit(game)));
  const totalCash = cashOf(game);
  const rows = [...game.ledger].reverse().map(row => '<tr><td>第 ' + row.issue + ' 期</td><td>' + h(row.label) +
    '</td><td class="' + (row.cents < 0 ? 'money-out' : 'money-in') + '">' + (row.cents > 0 ? '+' : '') +
    money(row.cents) + ' 元</td></tr>').join('');
  return pageHeader('财务台账', newspaperName(game)) + '<div class="workspace"><section class="panel sales-panel">' +
    '<header class="receipt-head"><div><h2>报社现金</h2><p>启动金 ' + money(STARTING_CASH) + ' 元</p></div></header>' +
    '<div class="sales-number"><span>当前余额</span><strong>' + money(totalCash) + '</strong><span class="unit">元</span></div>' +
    '<table class="ledger"><thead><tr><th scope="col">期数</th><th scope="col">项目</th><th scope="col">收支</th></tr></thead><tbody>' +
    rows + '</tbody></table></section><section class="panel"><header class="panel-heading"><h2>广告簿</h2>' +
    (game.phase === 'desk' && !game.newsLibrary ? '<p>编辑台 ' + clockText(game.clock) + '</p>' : '') + '</header>' +
    (game.phase === 'desk' ? '<div class="management"><p>每期接一单。头版广告报价更高。' +
      (game.newsLibrary ? '' : '头版广告会挤掉一条街巷消息。查刊登文件用时 ' + DESK_UNIT + ' 分钟。') +
      '本期出刊预计支出 ' + money(quote.total) + ' 元。</p></div>' : '') +
    (game.phase === 'desk' && game.pressure?.adUntil >= game.week + 1 ? '<p class="manager-note">广告撤单后，本期报价已下调。</p>' : '') +
    advertisingView() + '</section></div>';
}

const VIEWS = {
  desk:deskView, sales:salesView, staff:staffView, finance:financeView, archive:archiveView
};

let finishAnimation = null;
function animateSales() {
  if (view !== 'sales' || game.phase !== 'sales') return;
  const edition = game.editions.at(-1);
  const key = game.seed + '/' + edition.issue;
  if (animated.has(key) || !edition.sold || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  animated.add(key);
  const sold = document.getElementById('live-sold');
  const revenue = document.getElementById('live-revenue');
  const cash = document.getElementById('live-cash');
  const burst = document.getElementById('plus-one');
  const skip = document.getElementById('skip-animation');
  const targetCash = cashOf(game);
  let frame = 0;
  const start = performance.now();

  function count(ratio) {
    sold.textContent = number(Math.floor(edition.sold * ratio));
    const earned = Math.floor(edition.revenue * ratio);
    revenue.textContent = money(earned);
    cash.textContent = money(ratio === 1 ? targetCash : edition.cashBeforeSales + earned);
  }

  finishAnimation = () => {
    cancelAnimationFrame(frame);
    count(1);
    burst.classList.remove('counting');
    skip.hidden = true;
    finishAnimation = null;
  };
  count(0);
  burst.classList.add('counting');
  skip.hidden = false;
  function tick(now) {
    const time = Math.min(1, (now - start) / 2550);
    count(1 - (1 - time) ** 2);
    if (time < 1) frame = requestAnimationFrame(tick);
    else finishAnimation();
  }
  frame = requestAnimationFrame(tick);
}

function render() {
  finishAnimation?.();
  activeProof = null;
  mastheadName.textContent = newspaperName(game);
  mastheadIssue.textContent = game.year + ' 年 · 第 ' +
    (game.week + 1) + ' / ' + yearIssueCount(game.year) + ' 期';
  for (const button of document.querySelectorAll('[data-view]')) {
    const selected = button.dataset.view === view;
    button.classList.toggle('current', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  app.innerHTML = VIEWS[view]();
  deskShortcuts.hidden = view !== 'desk' || game.phase !== 'desk';
  deskShortcuts.querySelector('[data-action="open-proof"]').disabled = !activeProof;
  renderGuide();
  if (document.getElementById('copies')) printInput();
  const proof = document.getElementById('proof');
  if (proof) {
    const entry = activeProof;
    renderNewspaper(proof, entry.draft).then(rendered => {
      if (!rendered || !proof.isConnected) return;
      proof.dataset.ready = 'yes';
      const link = app.querySelector('[data-download]');
      if (entry.signed && link) {
        link.dataset.issue = String(entry.draft.issue);
        prepareDownload(link, proof, entry.draft);
      }
    });
  }
  animateSales();
}

function printInput() {
  const field = document.getElementById('copies');
  const value = Number(field.value);
  const limit = printLimit(game);
  const valid = validCopies(value) && value <= limit;
  const total = valid ? pressQuote(game, value).total : 0;
  const affordable = valid && total <= cashOf(game);
  const headline = game.headline && getStory(game, game.headline);
  const hint = document.getElementById('print-hint');
  document.getElementById('print-cost').textContent = valid ? money(total) : '—';
  hint.textContent = !valid ? '请输入 ' + number(MIN_PRINT) + '～' + number(limit) + ' 份的整数。' :
    !affordable ? '现金不足，减少印量或调整人员和发行开支。' :
    coverLoading() ? '正在处理头版照片。' :
    pendingPressure(game) ? '请先答复本期刊后来电。' :
    headline ? '头条已排：' + storyText(headline, storyCopy(headline, game.reports[headline.id]).title, game.city) + '。' :
      '先从稿件里定一条头条。';
  hint.classList.toggle('error', !affordable);
  field.setAttribute('aria-invalid', String(!affordable));
  app.querySelector('[data-action="sign"]').disabled = !affordable || !game.headline || coverLoading() || Boolean(pendingPressure(game));
  return {value, valid, affordable};
}

function clearDownloads() {
  for (const pending of editionPngs.values()) {
    pending.then(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
  }
  editionPngs.clear();
}

async function prepareDownload(link, canvas, edition) {
  if (!editionPngs.has(edition)) {
    const pending = new Promise(resolve => {
      canvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png')), 'image/png');
    });
    editionPngs.set(edition, pending);
  }
  const url = await editionPngs.get(edition);
  if (!link.isConnected || link.dataset.issue !== String(edition.issue)) return;
  link.href = url;
  const filename = newspaperName(edition).replace(/[<>:"/\\|?*]/g, '＿');
  link.download = filename + '_第' + ordinal(edition.issue) + '期_' + edition.date + '.png';
  link.removeAttribute('aria-disabled');
}

function setProofZoom(zoomed) {
  paperViewport.classList.toggle('zoomed', zoomed);
  proofZoom.setAttribute('aria-pressed', String(zoomed));
  proofZoom.textContent = zoomed ? '缩小' : '放大';
  if (!zoomed) paperViewport.scrollTo(0, 0);
}

function openProof() {
  if (!activeProof) return;
  largeProof = activeProof;
  const canvas = document.getElementById('large-proof');
  delete canvas.dataset.ready;
  const link = paperDialog.querySelector('[data-download]');
  link.hidden = !largeProof.signed;
  link.dataset.issue = String(largeProof.draft.issue);
  link.removeAttribute('href');
  link.setAttribute('aria-disabled', 'true');
  canvas.setAttribute('aria-label', newspaperName(largeProof.draft) + '头版：' + largeProof.draft.title);
  paperDialog.showModal();
  setProofZoom(false);
  renderNewspaper(canvas, largeProof.draft).then(rendered => {
    if (!rendered || !paperDialog.open) return;
    canvas.dataset.ready = 'yes';
    if (largeProof.signed) prepareDownload(link, canvas, largeProof.draft);
  });
}

function openCity() {
  document.getElementById('city-title').textContent = game.cityReady ? '城市与报纸' : '给报纸和城市起名';
  document.getElementById('city-name').value = game.city;
  document.getElementById('paper-name').value = game.paperName || '';
  document.getElementById('year-field').hidden = game.cityReady;
  document.getElementById('campaign-year').value = String(game.year);
  document.getElementById('city-submit').textContent = game.cityReady ? '保存名称' : '开始新一局';
  cityDialog.querySelector('[data-action="close-city"]').hidden = !game.cityReady;
  document.getElementById('city-error').textContent = !game.cityReady && outdatedSave ? '新规则需重开' :
    game.editions.length ? '新名称用于之后签发的报纸。' : '';
  cityDialog.showModal();
}

function dismissCity() {
  if (game.cityReady) cityDialog.close();
}

function openOriginal(id = null) {
  if (game.phase !== 'desk') return;
  const existing = game.originals?.find(draft => draft.id === id);
  if (id && !existing) return;
  originalEditor = {id, seed:game.seed, week:game.week};
  document.getElementById('original-title').textContent = existing ? '编辑原创稿' : '写原创稿';
  document.getElementById('original-topic').innerHTML = Object.keys(ORIGINAL_TOPICS).map(topic =>
    '<option value="' + h(topic) + '">' + h(topic) + '</option>').join('');
  document.getElementById('original-topic').value = existing?.section || '街巷';
  document.getElementById('original-headline').value = existing?.headline || '';
  document.getElementById('original-body').value = existing?.body.join('\n') || '';
  document.getElementById('original-error').textContent = '';
  originalDialog.querySelector('[data-action="delete-original"]').hidden = !existing;
  originalDialog.showModal();
}

function isCurrentDesk(request) {
  return request && game.phase === 'desk' && game.seed === request.seed && game.week === request.week;
}

function coverLoading() {
  return Boolean(isCurrentDesk(pendingCover));
}

async function readCover(file) {
  if (!file || game.phase !== 'desk') return;
  const request = {seed:game.seed, week:game.week};
  pendingCover = request;
  coverError = '';
  render();
  const cover = await prepareCoverPhoto(file).catch(() => null);
  if (pendingCover !== request) return;
  pendingCover = null;
  if (!isCurrentDesk(request)) return;
  const next = cover && changeCover(game, cover);
  if (!next) {
    coverError = '读不出这张照片。请换一张 20 MB 以内的 JPG、PNG 或 WebP。';
    render();
    announce(coverError, 'notice');
  } else if (commit(next)) announce('头版照片已更换。');
  app.querySelector('[data-action="choose-cover"]')?.focus({preventScroll:true});
}

function focusAppHeading() {
  app.querySelector('h1')?.focus({preventScroll:true});
}

function finishPress(copies) {
  const published = publishIssue({...game, copies});
  if (!published) return;
  if (commit(published, 'sales')) {
    archiveIssue = published.editions.at(-1).issue;
    focusAppHeading();
    announce(published.year && published.week + 1 === yearIssueCount(published.year) ? '最后一期已签发，年终结算到了。' :
      '第 ' + (game.week + 1) + ' 期已付印，发行回单到了。');
  }
}

function sign() {
  const {value, affordable} = printInput();
  if (!affordable || !game.headline || coverLoading() || pendingPressure(game)) return;
  const story = getStory(game, game.headline);
  const notices = [];
  if (adNeedsCheck(game.ad)) notices.push(adById(game.ad.id).name + '的刊登文件尚不齐备，本期广告可能被撤下。');
  if (notices.length) {
    document.getElementById('risk-copy').textContent = notices.join(' ');
    pendingPress = {revision:game.revision, copies:value};
    riskDialog.returnValue = '';
    riskDialog.showModal();
  } else finishPress(value);
}

function advance() {
  const next = nextIssue(game);
  coverError = '';
  collapsedStory = null;
  if (next && commit(next, defaultView(next))) {
    window.scrollTo(0, 0);
    focusAppHeading();
    if (next.phase === 'desk') announce('第 ' + (next.week + 1) +
      (next.newsLibrary ? ' 期稿件已到编辑台。' : ' 期开始，现在是 ' + clockText(next.clock) + '。'));
  }
}

function clockFeedback(before, next, action = '') {
  const news = before.trips.filter(trip => trip.at <= next.clock).sort((a, b) => a.at - b.at)
    .map(trip => reporterById(trip.reporter).name + '已回电');
  if (!knownRival(before) && knownRival(next)) news.push('《' + rivalPaperName(next) + '》动向来电');
  if (!getStory(before, lateLead(before).id) && getStory(next, lateLead(next).id)) news.push('新线索来电');
  const elapsed = clockText(before.clock) + ' → ' + clockText(next.clock) + '（' + (next.clock - before.clock) + ' 分钟）';
  announce([elapsed, action, ...news].filter(Boolean).join(' · ') + '。');
}

function completeStoryWork(action, angle) {
  const id = game.focus;
  const story = getStory(game, id);
  if (!story) return;
  const before = game;
  const detailsOpen = app.querySelector('.report-details')?.open;
  let next;
  if (action === 'report') {
    next = assignStory(game, id, document.getElementById('reporter-select')?.value);
  } else if (action === 'verify-story') {
    next = verifyStory(game, id);
    if (next) next = chooseAngle(next, id, 'check');
  } else if (action === 'follow-story') {
    next = followStory(game, id);
  } else {
    next = chooseAngle(game, id, angle);
  }
  if (!next) {
    announce('这项采编当前无法安排，请查看编辑台时钟和记者状态。', 'notice');
    return;
  }
  if (!commit(next)) return;
  const previewChanged = game.headline === id || game.support === id || !game.headline;
  if (previewChanged) highlight('.proof-preview');
  if (action === 'angle') {
    const details = app.querySelector('.report-details');
    if (details) details.open = detailsOpen;
    app.querySelector('[data-action="angle"][data-id="' + angle + '"]')?.focus({preventScroll:true});
    announce('写法已切换为「' + PAPER_ANGLES.find(item => item.id === angle).label + '」。');
    return;
  }
  if (action === 'report') {
    const trip = next.trips.find(item => item.story === id);
    announce(reporterById(trip.reporter).name + '已出发，预计 ' + clockText(trip.at) + ' 回电。');
    return;
  }
  highlight('.report-slip', true);
  clockFeedback(before, next, action === 'follow-story' ? '补访回稿' : '已核实');
}

document.addEventListener('input', event => {
  if (event.target.id !== 'copies') return;
  const {value, valid} = printInput();
  if (valid && value !== game.copies) commit({...game, copies:value}, view, false);
});

document.getElementById('city-form').addEventListener('submit', event => {
  event.preventDefault();
  const paperName = document.getElementById('paper-name').value;
  if (!validPaperName(paperName)) {
    document.getElementById('city-error').textContent = '请填写 1～18 字的报名。';
    return;
  }
  const city = normalizeCity(document.getElementById('city-name').value);
  if (!city) {
    document.getElementById('city-error').textContent = '请填写 1～8 个汉字、英文字母或数字。';
    return;
  }
  const year = game.cityReady ? game.year : Number(document.getElementById('campaign-year').value);
  if (!CAMPAIGN_YEARS.includes(year)) {
    document.getElementById('city-error').textContent = '请选择创刊年份。';
    return;
  }
  const next = game.cityReady ? {...game, city, paperName} : newCampaign(game.seed, city, true, paperName, true, year);
  if (commit(next)) {
    cityDialog.close();
    outdatedSave = false;
    announce('已保存《' + newspaperName(game) + '》的报名与城市。');
  }
});

document.getElementById('original-form').addEventListener('submit', event => {
  event.preventDefault();
  const error = document.getElementById('original-error');
  if (!isCurrentDesk(originalEditor)) {
    error.textContent = '本期采编已经结束。';
    return;
  }
  const fields = originalFields(document.getElementById('original-topic').value,
    document.getElementById('original-headline').value, document.getElementById('original-body').value);
  if (!fields) {
    error.textContent = '请填写标题和正文，并把字数、段落控制在版面限制以内。';
    return;
  }
  if (originalEditor.id && originalEditor.id === game.support && !originalFitsSupport(fields)) {
    error.textContent = '这篇已排为副稿。请缩短正文，或先撤下副稿再写长稿。';
    return;
  }
  const next = saveOriginal(game, originalEditor.id, fields);
  if (next && commit(next)) {
    originalDialog.close();
    app.querySelector('[data-id="' + game.focus + '"]')?.focus();
    announce('原创稿已保存。');
  }
});

coverInput.addEventListener('change', () => {
  const [file] = coverInput.files;
  coverInput.value = '';
  readCover(file);
});

app.addEventListener('change', event => {
  if (event.target.id === 'archive-issue') {
    archiveIssue = Number(event.target.value);
    render();
    document.getElementById('archive-issue').focus({preventScroll:true});
    highlight('.proof-preview');
    return;
  }
  if (event.target.hasAttribute('data-reprint')) {
    const cost = reprintOrderCost(readReprintOrders());
    document.getElementById('reprint-quote').textContent = '补印与配送共 ' + money(cost) + ' 元' + (cost > cashOf(game) ? '，现金不足' : '');
    app.querySelector('[data-action="reprint"]').disabled = cost > cashOf(game);
    return;
  }
  if (event.target.id !== 'reporter-select') return;
  const reporter = reporterById(event.target.value);
  const button = app.querySelector('[data-action="report"]');
  const cost = visitCost(reporter);
  button.textContent = button.dataset.label + ' · ' + cost + ' 分钟';
  button.disabled = !canSpendDeskTime(game, cost);
  document.getElementById('assignment-hint').hidden = !button.disabled;
});

cityDialog.addEventListener('cancel', event => {
  event.preventDefault();
  dismissCity();
});

riskDialog.addEventListener('close', () => {
  const plan = pendingPress;
  pendingPress = null;
  if (riskDialog.returnValue === 'publish' && plan?.revision === game.revision) finishPress(plan.copies);
});

reprintDialog.addEventListener('close', () => {
  const plan = pendingReprint;
  pendingReprint = null;
  if (plan && reprintDialog.returnValue === 'confirm' && plan.seed === game.seed && plan.revision === game.revision) {
    finishReprint(plan.orders);
  }
});

restartDialog.addEventListener('close', () => {
  if (restartDialog.returnValue === 'restart') coverError = '';
  if (restartDialog.returnValue === 'restart' && commit(newGame(), 'desk')) {
    archiveIssue = 0;
    collapsedStory = null;
    clearDownloads();
    animated.clear();
    openCity();
  }
});

document.addEventListener('click', event => {
  const download = event.target.closest('a[data-download][href]');
  if (download) {
    announce('头版 PNG 下载已开始。');
    return;
  }
  const button = event.target.closest('button[data-action], button[data-view]');
  if (!button || button.disabled) return;
  if (button.dataset.view) {
    navigate(button.dataset.view);
    return;
  }
  const {action, id, issue} = button.dataset;
  switch (action) {
    case 'guide-close':
    case 'guide-skip':
      if (action === 'guide-skip') guide.skipped = true;
      else if (!guide.closed.includes(id)) guide.closed.push(id);
      saveGuide();
      renderGuide();
      (app.querySelector('[data-action="guide-close"]') || app.querySelector('h1'))?.focus({preventScroll:true});
      break;
    case 'focus-story':
      if (id === game.focus) {
        collapsedStory = collapsedStory === id ? null : id;
        render();
      } else {
        collapsedStory = null;
        if (!commit({...game, focus:id})) break;
      }
      app.querySelector('[data-id="' + id + '"]')?.focus({preventScroll:true});
      break;
    case 'report':
    case 'verify-story':
    case 'follow-story':
    case 'angle':
      completeStoryWork(action, id);
      break;
    case 'headline':
    case 'support': {
      const next = placeStory(game, game.focus, action);
      if (next && commit(next)) {
        highlight('[data-id="' + game.focus + '"]', true);
        highlight('.proof-preview');
        announce(action === 'headline' ? '已排入头条，头版清样已更新。' :
          next.support ? '副稿已排到头版左下。' : '已撤下所选副稿。');
      }
      break;
    }
    case 'brief': {
      const next = toggleBrief(game, id);
      if (next && commit(next)) announce(next.briefs.includes(id) ? '已排入简讯栏。' : '已撤下简讯。');
      break;
    }
    case 'sign': sign(); break;
    case 'pressure-response': {
      const next = respondToPressure(game, id);
      if (next && commit(next)) {
        focusAppHeading();
        announce('编辑部已记录答复。');
      }
      break;
    }
    case 'wait-phone': {
      const before = game;
      const next = waitForPhone(game);
      if (next && commit(next)) {
        highlight('.desk-clock');
        app.querySelector('[data-action="wait-phone"]')?.focus({preventScroll:true});
        clockFeedback(before, next);
      }
      break;
    }
    case 'next': advance(); break;
    case 'reprint': confirmReprint(); break;
    case 'open-edition':
      archiveIssue = Number(issue);
      render();
      app.querySelector('[data-issue="' + issue + '"]')?.focus({preventScroll:true});
      highlight('.proof-preview');
      break;
    case 'open-proof': openProof(); break;
    case 'zoom-proof': setProofZoom(!paperViewport.classList.contains('zoomed')); break;
    case 'show-print': {
      const heading = document.getElementById('print-heading');
      heading?.focus({preventScroll:true});
      heading?.scrollIntoView({block:'start'});
      break;
    }
    case 'close-proof': paperDialog.close(); break;
    case 'new-original': openOriginal(); break;
    case 'edit-original': openOriginal(game.focus); break;
    case 'close-original': originalDialog.close(); break;
    case 'delete-original': {
      const next = isCurrentDesk(originalEditor) && removeOriginal(game, originalEditor.id);
      if (next && commit(next)) {
        originalDialog.close();
        app.querySelector('[data-action="new-original"]')?.focus();
        announce('原创草稿已删除。');
      }
      break;
    }
    case 'choose-cover': coverInput.click(); break;
    case 'remove-cover': {
      const next = changeCover(game, null);
      coverError = '';
      if (next && commit(next)) {
        app.querySelector('[data-action="choose-cover"]')?.focus({preventScroll:true});
        announce('已恢复自动配图。');
      }
      break;
    }
    case 'city': openCity(); break;
    case 'close-city': dismissCity(); break;
    case 'skip-animation':
      finishAnimation?.();
      announce('已显示当日销量与实收。');
      break;
    case 'hire':
    case 'fire': {
      const cash = cashOf(game);
      const next = changeStaff(game, id, action === 'hire');
      if (next && commit(next)) {
        announce((action === 'hire' ? '已聘用' : '已解聘') + reporterById(id).name +
          ' · 支出 ' + money(cash - cashOf(next)) + ' 元。');
      }
      break;
    }
    case 'channel': {
      const active = game.active.includes(id);
      const opened = game.unlocked.includes(id);
      const copies = game.copies;
      const next = changeChannel(game, id);
      if (next && commit({...next, copies:Math.min(next.copies, printLimit(next))})) {
        const channel = channelById(id);
        announce(channel.name + (active ? '已暂停配送' : opened ? '已恢复配送' :
          '已开通 · 支出 ' + money(channel.setup) + ' 元') +
          (copies !== game.copies ? '，首印量已调至 ' + number(game.copies) + ' 份。' : '。'));
      }
      break;
    }
    case 'priority': {
      if (game.phase !== 'desk' || !game.active.includes(id)) break;
      const priority = game.priority === id ? null : id;
      if (commit({...game, priority})) announce(channelById(id).name + (priority ? '已设为重点配送。' : '已取消重点配送。'));
      break;
    }
    case 'choose-ad': {
      const next = chooseAd(game, id, button.dataset.place);
      if (next && commit(next)) {
        const offer = adById(id);
        announce('已选' + (next.ad.placement === 'front' ? '头版' : '内页') + '广告 · ' +
          cityText(offer.name, game.city) + ' · 刊登价 ' + money(adValue(offer, next.ad.placement, game)) + ' 元。');
      }
      break;
    }
    case 'review-ad': {
      const before = game;
      const next = reviewAd(game);
      if (next && commit(next)) {
        const missing = adNeedsCheck(next.ad);
        const feedback = missing ? '发现刊登文件不齐' : '广告文件已核对';
        if (next.newsLibrary) announce(feedback);
        else clockFeedback(before, next, feedback);
      }
      break;
    }
    case 'drop-ad':
      if (game.phase === 'desk' && commit({...game, ad:null})) announce('本期广告已撤下。');
      break;
    case 'restart':
      restartDialog.returnValue = '';
      restartDialog.showModal();
      break;
  }
});

window.addEventListener('storage', event => {
  if (event.key === SAVE_KEY) syncFromStorage();
  if (event.key === GUIDE_KEY) {
    guide = readGuide();
    renderGuide();
  }
});

render();
if (!game.cityReady) openCity();
