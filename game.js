const app = document.getElementById('app');
const announcer = document.getElementById('announcer');
const paperDialog = document.getElementById('paper-dialog');
const achievementsDialog = document.getElementById('achievements-dialog');
const certificateDialog = document.getElementById('certificate-dialog');
const certificateLink = certificateDialog.querySelector('[data-certificate-download]');
const pointsTotal = document.getElementById('points-total');
const achievementContent = document.getElementById('achievement-content');
const paperViewport = document.getElementById('paper-viewport');
const proofZoom = paperDialog.querySelector('[data-action="zoom-proof"]');
const restartDialog = document.getElementById('restart-dialog');
const resumeDialog = document.getElementById('resume-dialog');
const cityDialog = document.getElementById('city-dialog');
const originalDialog = document.getElementById('original-dialog');
const coverInput = document.getElementById('cover-file');
const riskDialog = document.getElementById('risk-dialog');
const reprintDialog = document.getElementById('reprint-dialog');
const mastheadName = document.getElementById('masthead-name');
const mastheadIssue = document.getElementById('masthead-issue');
const deskShortcuts = document.getElementById('desk-shortcuts');
const deskPrimary = document.getElementById('desk-primary');
const phoneLayout = matchMedia('(max-width: 720px)');
const visualViewport = window.visualViewport;
const editableField = 'input:not([type="file"]), textarea, select';
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
let storedText;
let pendingVolume = null;
let archiveWrite = Promise.resolve();
let writeSequence = 0;
let outdatedSave = false;
function readCampaign() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (raw === storedText) return null;
    if (archivePointer(raw)) {
      if (pendingVolume !== raw) {
        pendingVolume = raw;
        queueMicrotask(() => loadBoundVolume(raw));
      }
      return null;
    }
    pendingVolume = null;
    const parsed = JSON.parse(raw);
    storedText = raw;
    if (parsed && parsed.version !== SAVE_VERSION) outdatedSave = true;
    if (!parsed?.cityReady && [1,2,3,4,5,6].some(version => localStorage.getItem('lintown-weekly-trial-v' + version))) {
      outdatedSave = true;
    }
    return restoreCampaign(parsed);
  } catch {
    return null;
  }
}

async function loadBoundVolume(raw) {
  try {
    const saved = restoreCampaign(await archiveRecord('readonly', store => store.get(archivePointer(raw))));
    if (pendingVolume !== raw || raw !== localStorage.getItem(SAVE_KEY)) return;
    if (!saved) throw new Error('archive');
    storedText = raw;
    pendingVolume = null;
    const opening = !game.cityReady;
    if (cityDialog.open && opening) cityDialog.close();
    adoptCampaign(saved);
    if (opening && saved.phase !== 'complete') {
      resumePending = true;
      document.getElementById('resume-copy').textContent = '《' + newspaperName(saved) + '》已保存到第 ' + (saved.week + 1) + ' 期。';
      resumeDialog.showModal();
    }
  } catch {
    if (pendingVolume === raw) announce('合订本暂时读不出，请重新打开这份报纸。', 'warn');
  }
}

function saveCampaign(campaign) {
  const serial = ++writeSequence;
  const expected = storedText;
  try {
    if (!archivePointer(expected)) {
      const raw = JSON.stringify(campaign);
      localStorage.setItem(SAVE_KEY,raw);
      storedText = raw;
      saving = true;
      return;
    }
  } catch { /* 小存储已满，继续尝试浏览器书库。 */ }
  archiveWrite = archiveWrite.then(async () => {
    if (serial !== writeSequence) return;
    const previous = localStorage.getItem(SAVE_KEY);
    if (previous !== storedText) { syncFromStorage(); return; }
    const key = campaign.seed + '/' + campaign.revision + '/' + randomSeed();
    await archiveRecord('readwrite', store => store.put(campaign,key));
    if (serial !== writeSequence || localStorage.getItem(SAVE_KEY) !== previous) {
      await archiveRecord('readwrite',store => store.delete(key));
      return;
    }
    const pointer = JSON.stringify({volume:key});
    localStorage.setItem(SAVE_KEY,pointer);
    storedText = pointer;
    saving = true;
    const oldKey = archivePointer(previous);
    if (oldKey) await archiveRecord('readwrite',store => store.delete(oldKey));
  }).catch(() => {
    saving = false;
    announce('本期进度未能留存，请为浏览器腾出空间。','warn');
  });
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

const savedGame = readCampaign();
let game = savedGame || newGame();
let resumePending = Boolean(savedGame?.cityReady && savedGame.phase !== 'complete');
let visibleSince = null;
let reportedTimingSeed;

let guide = readGuide();
let view = defaultView(game);
let archiveYear = null;
let archiveIssue = game.editions.at(-1)?.issue || 0;
let activeProof = null;
let activeAnnual = null;
let largeProof = null;
let pendingPress = null;
let pendingReprint = null;
let originalEditor = null;
let pendingCover = null;
let coverError = '';
let expandedStory = null;
let deskStage = 'headline';
let deskIssueKey;
const SLOT_TITLES = {support:'二条', third:'三条'};
const LAYOUT_NOTES = {
  lead:'主稿通栏，次稿放在下方。重稿更能带动销量，轻稿撑不起大版面。',
  balanced:'主稿与次稿分栏，报摊销量较稳定。',
  photo:'头版先见大图。体育、文娱等现场题材更合适。',
  banner:'底部留整栏广告。每则广告出价更高，扣的口碑也更多。'
};
const YEAR_END_REVIEWS = {
  关门大吉:'账上的钱已付不起下一张开机单。印厂收了铅字，本报把已出刊的报纸装进合订本。',
  全国大报:'这张办在小城里的报纸，摆上报摊就有读者认得。大事追得到底，街坊的小事也有地方说。',
  小广告单:'广告账上笔笔有回款，报摊的退报单却越垒越高。读者来信问，翻过这半张广告，到哪儿才能看到新闻？',
  本城第一大报:'城里有事，街坊愿意先来翻本报。报摊多留一捆，靠的是记者把来龙去脉写清楚。',
  良心小报:'报社手头并不宽裕，街坊有事仍愿来打电话。该跑的现场跑到了，该向读者交代的也写在纸上。',
  印钞机:'到账的款项一笔笔摞起来，账本比合订本厚实。卖出去的版位有了回音，愿意每周买报的人还得慢慢攒。',
  沿江名报:'沿江几座城的报刊亭都有读者按报名找这一份。头一次出城的那捆报纸，如今已成了一条熟路。',
  省内名刊:'外县的来信寄进了编辑部，省城的报刊亭也给本报留着位置。',
  街坊信得过的报纸:'街坊遇到事会给编辑部打电话。报头下这一行城里的消息，慢慢有了自己的读者。',
  惨淡经营:'这一年账本和报摊回单都得一页页对。还有摊位肯摆本报，下一张版面也还得靠实在的消息。'
};
const disclosures = new Map();
const slotModes = new Map();
const editionPngs = new Map();
let annualPngUrl;

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
    const story = expandedStory === game.focus ? getStory(game, game.focus) : null;
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
  if (!note) return;
  const cue = guideCue();
  note.hidden = !cue;
  if (!cue) {
    note.replaceChildren();
    return;
  }
  const [id, ...args] = cue;
  const [subject, copy] = FIRST_ISSUE_GUIDE[id];
  note.innerHTML = '<strong>吴编辑 · ' + h(subject) + '</strong><p>' + h(copy(...args)) +
    '</p><div class="report-buttons"><button class="soft" type="button" data-action="guide-close" data-id="' +
    id + '">收起这条</button><button class="soft" type="button" data-action="guide-skip">收起交接便条</button></div>';
}

if (!pendingVolume) saveGuide();

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

function updateVisibleArea() {
  if (!phoneLayout.matches || !visualViewport) return;
  const style = document.documentElement.style;
  style.setProperty('--visible-top', visualViewport.offsetTop + 'px');
  style.setProperty('--visible-height', visualViewport.height + 'px');
}

let fieldFrame;
function revealFocusedField() {
  cancelAnimationFrame(fieldFrame);
  if (!phoneLayout.matches) return;
  fieldFrame = requestAnimationFrame(() => {
    const field = document.activeElement;
    if (!field?.matches(editableField)) return;
    const scroller = field.closest('.original-fields, dialog');
    const clip = scroller?.getBoundingClientRect();
    const areaTop = visualViewport?.offsetTop ?? 0;
    const areaBottom = areaTop + (visualViewport?.height ?? window.innerHeight);
    const top = Math.max(areaTop, clip?.top ?? 0) + 10;
    const bottom = Math.min(areaBottom, clip?.bottom ?? areaBottom) - 10;
    const box = field.getBoundingClientRect();
    const distance = box.top < top ? box.top - top : Math.max(0, Math.min(box.bottom, box.top + bottom - top) - bottom);
    if (bottom > top && Math.abs(distance) >= 1) {
      const behavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
      (scroller || window).scrollBy({top:distance, behavior});
    }
  });
}

function viewportResized() {
  updateVisibleArea();
  revealFocusedField();
}

function highlight(selector, focus = false) {
  const element = app.querySelector(selector);
  element?.classList.add('updated');
  if (focus) element?.focus({preventScroll:true});
}

function syncFromStorage() {
  const stored = readCampaign();
  if (!stored) return Boolean(pendingVolume);
  return adoptCampaign(stored);
}

function adoptCampaign(stored) {
  if (stored.seed === game.seed && stored.revision <= game.revision) {
    if (stored.revision === game.revision && stored.timing?.totalMs > (game.timing?.totalMs ?? 0)) {
      game = {...game, timing:stored.timing};
      if (visibleSince !== null) visibleSince = performance.now();
    }
    return false;
  }
  if (stored.seed !== game.seed || stored.paperStock !== game.paperStock) clearDownloads();
  visibleSince = null;
  game = stored;
  if (game.phase === 'complete' && resumePending) {
    resumePending = false;
    resumeDialog.close();
  }
  guide = readGuide();
  expandedStory = null;
  view = defaultView(game);
  archiveIssue = game.editions.at(-1)?.issue || 0;
  render();
  startPlayClock();
  announce('已接上这份报纸的最新一期。');
  return true;
}

function commit(next, nextView = view, draw = true) {
  if (syncFromStorage()) return false;
  next = closeIfInsolvent(next);
  if (next.ending === 'insolvent' && game.phase !== 'complete') nextView = 'sales';
  const changedView = nextView !== view;
  const newGame = next.seed !== game.seed;
  const timing = takePlayTime();
  if (!newGame && timing) {
    const signed = next.editions.length > game.editions.length;
    next = {...next, timing};
    if (signed) {
      next.timing = {...timing, issueMs:null};
      next.editions = [...next.editions.slice(0, -1), {...next.editions.at(-1), deskTimeMs:timing.issueMs ?? 0}];
    }
  }
  const stockChanged = next.paperStock !== game.paperStock;
  game = {...next, revision:game.revision + 1};
  saveCampaign(game);
  if (stockChanged) clearDownloads();
  if (newGame) {
    guide = readGuide();
    saveGuide();
  }
  view = nextView;
  if (draw) render();
  startPlayClock();
  if (changedView) window.scrollTo(0, 0);
  return true;
}

function navigate(destination) {
  archiveYear = null;
  view = destination;
  if (view === 'archive' && !game.editions.some(edition => edition.issue === archiveIssue)) {
    archiveIssue = game.editions.at(-1)?.issue || 0;
  }
  render();
  startPlayClock();
  window.scrollTo(0, 0);
}

function takePlayTime() {
  if (visibleSince === null) return game.timing;
  const elapsed = performance.now() - visibleSince;
  visibleSince = null;
  return noteVisibleTime(game.timing, elapsed);
}

function startPlayClock() {
  if (!game.cityReady || game.phase === 'complete' || resumePending || document.hidden) return;
  if (game.phase === 'desk' && view === 'desk' && game.timing?.issueMs == null) {
    const timing = noteVisibleTime(takePlayTime(), 0, true);
    game = {...game, timing};
  }
  if (visibleSince === null) visibleSince = performance.now();
}

function checkpointPlayTime(restart = true) {
  if (visibleSince === null || syncFromStorage()) return;
  const timing = takePlayTime();
  game = {...game, timing};
  saveCampaign(game);
  if (restart) startPlayClock();
}

function durationText(value) {
  if (value == null) return '未记录';
  const seconds = Math.floor(value / 1000);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  return (hours ? hours + ' 小时 ' : '') + (hours || minutes ? minutes + ' 分 ' : '') + seconds % 60 + ' 秒';
}

function printIssueTimings() {
  const timings = game.editions.map(edition => ({期号:edition.issue, 刊期:edition.date, 用时:durationText(edition.deskTimeMs),
    毫秒:edition.deskTimeMs ?? null}));
  console.table(timings);
  return timings;
}

function pageHeader(title, kicker, dates = '', note = '') {
  return '<div class="page-title"><div><p class="edition-line">' + h(kicker) + '</p><h1 tabindex="-1">' +
    h(title) + '</h1>' + (note ? '<p class="week-note">' + h(note) + '</p>' : '') + '</div>' + dates +
    '</div><aside id="guide-note" class="guide-note" aria-label="吴编辑的交接便条" aria-live="polite" hidden></aside>';
}

function bottom(text, extra = '') {
  return '<footer class="game-footer"><span>' + h(saving ? text : '本期进度未能留存，关掉网页前可先下载头版。') +
    '</span>' + extra + '</footer>';
}

function proofDescription(draft) {
  return [newspaperName(draft) + '第一版：' + draft.title, draft.body[0].replace(/。$/u, ''),
    ...draft.secondary.map(item => item.title), ...(draft.slotAds || []).map(item => '广告：' + item.name),
    ...(draft.emptySlots?.length ? ['版面留白 ' + draft.emptySlots.length + ' 处'] : []),
    ...(draft.editorName ? ['总编辑：' + draft.editorName] : [])].join('。');
}

function paperPanel(draft, signed) {
  activeProof = {draft, signed};
  const preview = '<div class="proof-preview" style="aspect-ratio:800/' + (1040 + paperFlashHeight(draft)) +
    '"><canvas id="proof" role="img" aria-label="' +
    h(proofDescription(draft)) + '"></canvas>' +
    '<span class="proof-loading">清样排版中…</span></div>';
  const proofButton = '<button type="button" class="proof-link" data-action="open-proof">查看大样</button>';
  if (!signed) {
    return '<section class="panel desk-proof" aria-labelledby="desk-proof-title">' +
      '<div class="desk-proof-thumb">' + preview + '</div><div class="desk-proof-copy">' +
      '<h2 id="desk-proof-title" tabindex="-1">头版清样</h2><p>' +
      h(game.headline ? draft.title : '待定头条') + '</p></div>' + proofButton + '</section>';
  }
  return '<section class="panel proof" aria-label="本期头版"><header class="panel-heading">' +
    '<h2>本期头版</h2>' + proofButton + '</header><div class="proof-well">' + preview +
    '</div><footer class="proof-footer"><span>总第 ' + ordinal(draft.issue) + ' 期</span></footer></section>';
}

function placementControls(story) {
  const headline = deskStage === 'headline';
  const placed = game[deskStage] === story.id;
  const allowed = headline ? !placed : canRunSupport(game, story, deskStage);
  const slot = SLOT_TITLES[deskStage];
  const label = headline ? placed ? '已定为头条' : '定为头条' : placed ? '撤下' + slot : '排为' + slot;
  return '<div class="report-buttons"><button type="button" class="soft accent" data-action="' +
    deskStage + '"' + (allowed ? '' : ' disabled') + '>' + label + '</button></div>';
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

function awardHint() {
  if (game.issueCount !== 156) return '作头条刊出、未刊更正，年终口碑至少 ' + AWARD_MIN_CREDIBILITY + ' 点可参评。';
  return '头条版面须达 A 级、未刊更正，并获转载、积极后续或异议复核支持。全年积满 ' +
    FEEDBACK_CONFIG.campaign.provincialPrize.series + ' 篇，年末口碑至少 ' + AWARD_MIN_CREDIBILITY + ' 点，可竞逐省奖。';
}

function reportPanel(story) {
  const brief = storyText(story, story.tip, game.city);
  const risk = story.library ? '<p class="field-hint">见报风险 ' + h(story.publicationRisk) + '</p>' : '';

  if (story.original) {
    return '<div class="report original-copy"><div class="edit-controls"><div class="report-buttons">' +
      '<button type="button" class="soft" data-action="edit-original">编辑原创稿</button></div>' +
      placementControls(story) + '</div>' +
      '<div class="report-text">' + story.body.map(paragraph => '<p>' + h(paragraph) + '</p>').join('') + '</div></div>';
  }
  if (story.library) {
    return '<div class="report library-copy"><p>' + h(brief) + '</p>' + risk + (deskStage === 'headline' && canContendForAward(game,story) ? '<p class="field-hint">' + h(awardHint()) + '</p>' : '') + placementControls(story) +
      '<details class="report-text"><summary>阅读全文</summary>' +
      story.body.map(paragraph => '<p>' + h(local(paragraph)) + '</p>').join('') + '</details></div>';
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
  const reporterName = reporterById(report?.id)?.name || report?.name;
  const slip = returned ? '<div class="report-slip' + (report?.tier === 'scoop' ? ' scoop-slip' : '') + '" tabindex="-1"><strong>' +
    (tierLabel ? '<span class="tier-mark">' + tierLabel + '</span> · ' : '') + status +
    (reporterName ? ' · ' + h(reporterName) : '') + (report.returnedAt ? ' · ' + clockText(report.returnedAt) : '') + '</strong><p>' + h(local(latest)) + '</p></div>' : '';
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
    ' 条</p></header><div class="management"><p>本期跑过、尚未排上的材料可进简讯。未见报的回稿留到下期，上期回稿只能排简讯，吸引的读者少一些。</p>' +
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
    const title = pageHeader('编辑台', newspaperName(game));
    if (game.phase === 'complete' || isAnnualIssue(game)) {
      return title + '<section class="panel blank"><p>本年已经结账。</p>' +
        '<button type="button" class="soft accent" data-view="sales">查看结算</button></section>';
    }
    const pending = game.editions.at(-1).reprint === null;
    return title + '<section class="panel blank"><p>本期已经付印，周六的发行回单到了。' +
      (pending ? '还有报摊来电等你决定是否补印。' : '') + '</p><div class="report-buttons">' +
      '<button type="button" class="soft" data-view="sales">查看发行</button>' +
      '<button type="button" class="issue" data-action="' + (pending ? 'next-without-reprint' : 'next') + '">' +
      (pending ? '不补印，进入下一期' : nextIssueLabel()) + '</button></div></section>';
  }
  const week = issueWeek(game.week, game);
  const dates = weekDates(game.week, game);
  const weekday = game.newsLibrary ? '<div class="shift"><div><small>本期刊期 · 星期六</small><time datetime="' +
    dates.saturday + '">' + dotted(dates.saturday) + '</time></div></div>' :
    '<div class="shift"><div><small>' + (dates.friday.endsWith('12-31') ? '跨年夜班' : '星期五') +
    '</small><time datetime="' + dates.friday + '">' + dotted(dates.friday) + '</time></div>' +
    '<div><small>截稿时间</small><time class="deadline">' + clockText(deskDeadline(game.week)) + '</time></div></div>';

  const rival = knownRival(game);
  const late = game.newsLibrary ? null : lateLead(game);
  const lateStory = late && getStory(game, late.id);
  const slate = storySlate(game);
  const candidateCount = slate.filter(story => story.library).length;
  const tight = game.year && (candidateCount < CANDIDATES_PER_ISSUE || !canUseEvergreens(game, 3));
  const clash = game.year && game.headline && rival?.storyId === game.headline;
  const provisional = SECONDARY_SLOTS.some(slot => game.focus === game[slot]) ?
    slate.find(story => SECONDARY_SLOTS.every(slot => story.id !== game[slot]))?.id : game.focus;
  const draftStory = getStory(game, game.headline || provisional) || slate[0];
  const draft = draftStory && editionDraft(game, draftStory);
  const pickingNews = deskStage === 'headline' || SECONDARY_SLOTS.includes(deskStage);
  const candidates = deskStage === 'headline' ? slate : pickingNews ?
    slate.filter(story => canRunSupport(game, story, deskStage)) : [];
  const rows = pickingNews ? candidates.map(story => {
    const focus = story.id === expandedStory;
    const follow = READER_LEADS.get(story.id);
    const section = follow ? '追踪' : story.section;
    return '<button type="button" class="lead' + (focus ? ' selected' : '') + '" data-action="focus-story" data-id="' +
      h(story.id) + '" aria-expanded="' + focus + '"><span class="desk">' + h(section) + '</span><strong>' +
      h(deskStoryTitle(story)) + '</strong>' +
      (story.library ? (deskStage === 'headline' && canContendForAward(game, story) ? '<span class="flag award-flag" title="' + h(awardHint()) + '">要闻级别 ' + h(story.weight) + ' · 可冲省奖</span>' :
        '<span class="flag">要闻级别 ' + h(story.weight) + '</span>') : '') +
      '</button>' + (focus ? reportPanel(story) : '');
  }).join('') : '';

  const walkIn = incomingQuote(game);
  const walkInWire = walkIn ? '<div class="desk-wire"><strong>广告主上门</strong><p>' + h(adById(walkIn.id).name) + '报价 ' +
    money(walkIn.cents) + ' 元，欲订本期' + SLOT_TITLES[walkIn.slot] + '。' +
    (game.slotAds?.[walkIn.slot]?.id === walkIn.id ? '已列入版面。' : '可在该版位的广告单上接单。') + '</p></div>' : '';
  const wires = extraDeskWire(game) + (game.newsLibrary ? pressurePanel() + rivalCaptureNotice() : deskClockPanel()) + walkInWire +
    (tight ? '<div class="desk-wire source-warning"><strong>稿源吃紧</strong><p>' +
      (candidateCount < CANDIDATES_PER_ISSUE ? '本期有 ' + candidateCount + ' 篇备选稿。' : '') +
      (!canUseEvergreens(game, 3) ? '给后续刊期留些常备稿。二条、三条也可排时令稿、原创稿或广告。' : '') + '</p></div>' : '') +
    (rival ? disclosure('rival-desk', '《' + rival.name + '》动向' + (clash ? ' · 撞稿' : ''),
      '<p>' + (rival.tip ? h(rival.tip) + '<br>' : '') + '头条：《' + h(rival.title) +
      '》<br>网点：' + h(rival.outlets.map(id => channelById(id).name).join('、')) + '</p>', 'panel desk-disclosure') : '') +
    (lateStory ? disclosure('late', clockText(late.at) + ' 来电 · 新线索', '<p>《' +
      h(storyText(lateStory, lateStory.headline, game.city)) + '》</p>', 'panel desk-disclosure') : '');
  const headline = getStory(game, game.headline);
  const printSummary = number(game.copies) + ' 份';
  return pageHeader(game.newsLibrary ? '编辑台' : '周五编辑台',
    newspaperName(game) + ' · ' + week.name + ' · 第 ' + (game.week + 1) + ' 期', weekday,
    game.issueCount === 156 ? ['第一年 · 在城区铺开发行网。','第二年 · 把报纸送到邻县和省城。','第三年 · 沿铁路发行，争取央媒转载与省奖。'][currentYear(game)-game.year] : game.newsLibrary ? '' : local(week.note)) +
    '<div class="desk-layout"><div class="desk-flow">' + wires + deskOptions() +
    deskStep('headline', '选头条', headline ? '头条：' + deskStoryTitle(headline) : '', rows) +
    deskStep('layout', '选版式', game.layout ? '版式：' + EDITION_LAYOUTS[game.layout].label : '',
      deskStage === 'layout' && headline ? layoutOptions(headline) : '', Boolean(headline)) +
    SECONDARY_SLOTS.map(slot => slotStep(slot, rows, Boolean(headline && game.layout))).join('') +
    (!game.newsLibrary ? briefsPanel() : '') + (draft ? paperPanel(draft, false) : '') +
    deskStep('print', '印量与签发', printSummary,
      deskStage === 'print' ? printPanel() : '', readyForProof()) + '</div>' + deskRail() + '</div>' +
    bottom('签发后存入合订本，可下载头版', '<span>发行日　' + dotted(dates.saturday) + ' 星期六</span>');
}

function deskStoryTitle(story) {
  return storyText(story, storyCopy(story, game.reports[story.id]).title, game.city);
}

function deskStep(id, title, summary, copy, enabled = true) {
  const open = deskStage === id;
  return '<section class="panel desk-step' + (open ? ' current-step' : '') + '">' +
    '<h2 class="step-heading"><button type="button" data-action="desk-step" data-id="' + id +
    '" aria-expanded="' + open + '" aria-controls="desk-step-' + id + '"' + (enabled ? '' : ' disabled') + '>' +
    '<span>' + h(open || !summary || id === 'print' ? title : summary) + '</span>' +
    (id === 'print' ? '<small>' + h(open ? '账上 ' + money(cashOf(game)) + ' 元' : summary) + '</small>' : '') +
    '</button></h2><div id="desk-step-' + id + '"' + (open ? '' : ' hidden') + '>' +
    (open ? copy : '') + '</div></section>';
}

function disclosure(id, title, copy, classes, initiallyOpen = false) {
  const open = disclosures.get(id) ?? initiallyOpen;
  return '<details class="' + classes + '" data-disclosure="' + id + '"' + (open ? ' open' : '') +
    '><summary>' + h(title) + '</summary>' + copy + '</details>';
}

function layoutOptions(story) {
  return '<div class="layout-options">' + Object.entries(EDITION_LAYOUTS).map(([id, layout]) => {
    const available = id !== 'photo' || hasEditionPhoto(game, story);
    const change = Math.round(layoutDemandChange(game, story, id) * 100);
    const forecast = !available ? '先给头条配一张照片' : id === 'balanced' ? '销量基准' :
      '本稿需求约 ' + (change >= 0 ? '+' : '−') + Math.abs(change) + '%';
    return '<button type="button" class="layout-option" data-action="choose-layout" data-id="' + id +
      '" aria-pressed="' + (game.layout === id) + '"' + (available ? '' : ' disabled') + '>' +
      '<span class="layout-preview" aria-hidden="true"><i class="preview-mast"></i><i class="preview-headline"></i>' +
      '<i class="preview-photo"></i><i class="preview-copy"></i><i class="preview-side">' +
      (id === 'banner' ? '广告' : '') + '</i></span><span class="layout-text"><strong>' + h(layout.label) + '</strong>' +
      '<span class="layout-forecast">' + h(forecast) + '</span><span class="layout-note">' + h(LAYOUT_NOTES[id]) + '</span></span></button>';
  }).join('') + '</div>';
}

function doneSlot(slot) {
  return Boolean(game[slot]) || Object.hasOwn(game.slotAds ?? {}, slot);
}

function readyForProof() {
  return Boolean(game.headline && game.layout && SECONDARY_SLOTS.every(doneSlot));
}

function firstDeskStage() {
  return !game.headline ? 'headline' : !game.layout ? 'layout' : SECONDARY_SLOTS.find(slot => !doneSlot(slot)) || 'proof';
}

function slotStep(slot, rows, enabled) {
  const name = SLOT_TITLES[slot];
  const story = getStory(game, game[slot]);
  const ad = game.slotAds?.[slot];
  const offer = ad && adById(ad.id);
  const summary = story ? deskStoryTitle(story) : offer ?
    '广告 · ' + local(offer.name) + ' · ' + money(slotAdValue(game, slot, offer)) + ' 元' :
    doneSlot(slot) ? '留空' : '';
  const open = deskStage === slot;
  const mode = slotModes.get(slot) || (offer ? 'ads' : 'news');
  const content = open ? '<div class="slot-switch" role="group" aria-label="' + name + '内容">' +
    [['news','放新闻'], ['ads','放广告']].map(([id, label]) => '<button type="button" class="soft" ' +
      'data-action="slot-mode" data-id="' + id + '" data-slot="' + slot + '" aria-pressed="' + (mode === id) +
      '">' + label + '</button>').join('') + '</div>' +
    (mode === 'ads' ? advertisingView(slot) : rows || '<p class="step-hint">本期没有可排在这里的稿件。</p>') +
    '<div class="step-actions report-buttons">' +
    (story || offer ? '<button type="button" class="soft accent" data-action="slot-done" data-id="' + slot + '">保留并继续</button>' : '') +
    '<button type="button" class="soft" data-action="skip-slot" data-id="' + slot + '">' +
    (story || offer ? '撤下并留空' : '本期留空') + '</button>' +
    '<p class="blank-slot-hint">版面开天窗，读者会注意到。每留一处，口碑扣 ' +
    EDITION_RULES.emptySlotTrust + ' 点。</p></div>' : '';
  return deskStep(slot, '安排' + name, summary ? name + '：' + summary : '', content, enabled);
}

function deskOptions() {
  const busy = coverLoading();
  const full = (game.originals?.length || 0) >= ORIGINAL_LIMIT;
  return disclosure('desk-options', '更多', '<div class="report-buttons desk-options">' +
    '<button type="button" class="soft" data-action="new-original"' + (full ? ' disabled' : '') + '>写原创稿</button>' +
    '<button type="button" class="soft" data-action="choose-cover"' + (busy ? ' disabled' : '') + '>' +
    (busy ? '正在换照片…' : '换一张照片') + '</button>' +
    (game.cover ? '<button type="button" class="soft" data-action="remove-cover"' + (busy ? ' disabled' : '') + '>恢复本报资料图</button>' : '') +
    '<button type="button" class="soft" data-action="restart">重新创刊</button></div>' +
    (coverError ? '<p class="form-status">' + h(coverError) + '</p>' : '') +
    (full ? '<p class="field-hint">本期已有 ' + ORIGINAL_LIMIT + ' 篇原创草稿。</p>' : ''), 'panel desk-disclosure');
}

function printPanel() {
  const shortfall = pressQuote(game, MIN_PRINT).total > cashOf(game);
  return '<div class="plan-body"><label class="plan-metric"><small>首印量</small>' +
    '<input id="copies" type="number" min="' + MIN_PRINT + '" max="' + printLimit(game) + '" step="1" inputmode="numeric" value="' +
    game.copies + '" aria-describedby="print-hint"><span>份</span></label>' +
    '<div class="plan-metric"><small>本期出刊支出</small><strong id="print-cost" class="money"></strong><span>元</span></div>' +
    '<button class="issue" type="button" data-action="sign">签发付印<b aria-hidden="true">→</b></button></div>' +
    '<p class="plan-hint" id="print-hint"></p>' +
    (overtimeSteps(game) ? '<p class="plan-hint warn-copy">现在签发，早班报摊会晚到 ' + overtimeSteps(game) * DESK_STEP + ' 分钟，销量受影响。</p>' : '') +
    (shortfall ? '<div class="management"><p>按现有人手和网点，最低出刊要 ' + money(pressQuote(game, MIN_PRINT).total) +
      ' 元。可在记者或发行页缩减下期支出。</p></div>' : '');
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
  return disclosure('press-calls', '刊后来电与回单' + (pendingPressure(game) ? ' · 待回复' : ''),
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
    }).join(''), 'panel desk-disclosure pressure-inbox', Boolean(pendingPressure(game)));
}

function rivalCaptureNotice() {
  const last = game.editions.at(-1);
  if (last?.issue === game.week && last.feedback?.rival?.events?.includes('close')) {
    return disclosure('rival-capture', '发行回单 · 对手停刊', '<p>' + h('《' + rivalPaperName(game) +
      '》宣布停刊。它占过的网点重新开放，可到「地图」或「发行」恢复配送。') + '</p>', 'panel desk-disclosure');
  }
  const change = game.market.lastCapture;
  if (change?.issue !== game.week + 1) return '';
  return disclosure('rival-capture', '发行回单 · 网点变更', '<p>' +
    h('对手头条连续 ' + change.wins + ' 期占先，' + channelById(change.id).name +
      '改由《' + rivalPaperName(game) + '》铺货。') + '</p>', 'panel desk-disclosure source-warning');
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
  const outcome = !contested ? '这次两家报纸各有各的网点。' :
    !clash ? '两家头条说的是不同的事，共用的报摊仍要争读者。' :
      distinct ? '两家撞了题。报摊回话，有人翻过' + paper + '，又回来买了你家多跑一趟写出来的那版。' :
        '两家撞了题。报摊回话，好些读者觉得消息看过一遍就够了。';
  return disclosure('rival-receipt', '《' + name + '》发行回单', '<p class="other-headline">' + h(title) + '</p>' +
    '<ul>' + stands.map(stand => '<li><span>' + h(stand.name) + (stand.competing ? ' · 同摊' : '') + '</span><span>' +
      number(stand.sold) + ' 份</span></li>').join('') + '</ul><p>' + h(outcome + effect) + '</p>', 'receipt-detail');
}

function readerReceipt(edition) {
  const lead = READER_LEADS.get(edition.nextLead);
  const briefs = edition.flashes?.length ? '<p>本期简讯 ' + edition.flashes.length + ' 条' +
    (edition.flashes.some(item => item.stored) ? '，其中有上期存稿' : '') + '。</p>' : '';
  const adLetter = edition.adReaderLetter ?
    '<p>“这几期一翻开，半张是广告。新闻排到哪儿去了？”</p>' : '';
  if (!lead && !briefs && !adLetter) return '';
  return disclosure('reader-receipt', lead ? '读者来信 · 下期可追' : adLetter ? '读者来信 · 头版广告太多' : '读者回音',
    (lead ? '<p>' + h(cityText(lead.message, edition.city)) + '</p>' : '') + adLetter + briefs, 'receipt-detail reader-letter');
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
  return disclosure('reprint-calls', '报摊来电 · 要货', calls.map(call =>
    '<div class="reprint-call"><div><strong>' + h(call.name) + ' · ' + h(call.time) + ' 售罄</strong><p>“' +
    h(REPRINT_CALL_COPY[call.tier]) + '”</p></div><label>补送给' + h(call.name) + '<select data-reprint="' + h(call.id) + '">' +
    call.options.map(copies => '<option value="' + copies + '">' + (copies ? number(copies) + ' 份 · ' +
    money(reprintCost(copies)) + ' 元' : '不补送') + '</option>').join('') + '</select></label></div>').join('') +
    '<div class="sales-actions"><button type="button" class="issue" data-action="reprint">确认补印安排</button>' +
    '<span id="reprint-quote" role="status">补印与配送共 0 元</span></div>', 'receipt-detail reprint-panel', true);
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
  const prior = game.editions.at(-1)?.feedback;
  const next = settleReprint(game, orders);
  if (next && commit(next)) {
    app.querySelector('[data-action="next"]')?.focus({preventScroll:true});
    announce('补印已结算，回款和退报已计入当日回单。');
    growthNotice(game.editions.at(-1), prior);
  }
}

function nextIssueLabel() {
  if (isAnnualIssue(game)) return '查看年终特刊';
  return cashOf(game) < minimumViablePressCost(game) ? '查看资金链断裂结局' : '进入下一期';
}

function salesView() {
  if (game.phase === 'complete' || (game.phase === 'sales' && isAnnualIssue(game))) return annualSummaryView();
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
  return pageHeader('周六发行', newspaperName(edition) + ' · 第 ' + edition.issue + ' 期 · ' + dotted(edition.date)) +
    '<div class="workspace"><section class="panel sales-panel"><header class="receipt-head"><div><h2>发行回单</h2>' +
    '<p>' + h(edition.title) + '</p></div><span class="flag red">当日</span></header><div class="sales-number">' +
    '<span>当日实售</span><strong id="live-sold">' + number(edition.sold) + '</strong><span class="unit">份</span>' +
    delta + '</div>' +
    '<div class="cash-live"><span>发行回款<strong id="live-revenue">' + money(edition.revenue) + '</strong> 元</span>' +
    '<span>账上现金<strong id="live-cash">' + money(cashOf(game)) + '</strong> 元</span></div>' +
    '<div class="receipt-grid"><div><span>首印</span><strong>' + number(edition.printed) + '</strong></div>' +
    '<div><span>退报</span><strong>' + number(edition.returned) + '</strong></div>' +
    '<div><span>本期盈亏（元）</span><strong>' + money(issueStatements(game).find(row => row.issue === edition.issue)?.net || 0) + '</strong></div></div>' +
    '<table class="stands"><thead><tr><th scope="col">网点</th><th scope="col">送报</th><th scope="col">实售</th><th scope="col">首印回单</th>' +
    '</tr></thead><tbody>' + rows + '</tbody></table><p class="stand-note">' + h(salesNote(edition)) + '</p>' + reprintPanel(edition) +
    weeklyFeedbackView(edition) + rivalReceipt(edition) + readerReceipt(edition) +
    (edition.replies || []).map(item => '<section class="receipt-detail"><h3>' + h(item.label) +
      '</h3><p>' + h(item.text) + '</p></section>').join('') +
    edition.corrections.map(item => '<section class="receipt-detail"><h3>刊后更正</h3><p>' + h(item.text) + '</p></section>').join('') +
    (edition.emptySlots?.length ?
      '<p class="stand-note">版面开天窗 ' + edition.emptySlots.length + ' 处，口碑扣 ' + Math.abs(edition.blankTrust) + ' 点。</p>' : '') +
    (edition.ad || edition.adNotice || edition.adTrust ?
      disclosure('ad-receipt', '广告回单 · ' + money(edition.ad) + ' 元',
        (edition.adTrust ? '<p>本期广告安排使口碑' + (edition.adTrust > 0 ? '回升 ' : '下降 ') +
          Math.abs(edition.adTrust) + ' 点。</p>' : '') +
        (edition.adNotice ? '<p>' + h(edition.adNotice) + '</p>' : ''), 'receipt-detail') : '') +
    '<p class="stand-note">创刊累计实售 ' + number(soldOf(game)) + ' 份。</p>' +
    '<div class="sales-actions"><button type="button" class="issue" data-action="next"' + (edition.reprint === null ? ' disabled' : '') + '>' + nextIssueLabel() + '<b aria-hidden="true">→</b></button>' +
    '<a class="soft export-link" data-download aria-disabled="true">下载头版</a></div></section>' +
    paperPanel(edition, true) + '</div>' + bottom('各项收入和支出已记入财务台账。');
}

function archiveView() {
  if (archiveYear != null && annualYears(game).includes(archiveYear)) return annualSummaryView(archiveYear);
  const annualLinks = annualYears(game).map(year => '<button type="button" class="soft" data-action="open-annual" data-id="' + year + '">' + year + ' 年终特刊</button>').join('');
  const title = pageHeader('合订本', newspaperName(game) + ' · 已收录 ' + game.editions.length + ' 期');
  if (!game.editions.length) return title + '<section class="panel blank"><p>创刊号签发后会收在这里。</p></section>';
  const edition = game.editions.find(entry => entry.issue === archiveIssue) || game.editions.at(-1);
  const rows = game.editions.map(entry => '<button type="button" class="archive-row' + (entry.issue === edition.issue ? ' active' : '') +
    '" data-action="open-edition" data-issue="' + entry.issue + '" aria-pressed="' + (entry.issue === edition.issue) +
    '"><span>第 ' + ordinal(entry.issue) + ' 期<br><i>' + dotted(entry.date) + '</i>' + '</span><strong>' + h(entry.title) +
    (entry.corrections.length ? ' <small class="money-out">有刊后更正</small>' : '') + '</strong><span>' + number(entry.sold) + ' 份</span></button>').join('');
  const options = game.editions.slice().reverse().map(entry => '<option value="' + entry.issue + '"' +
    (entry.issue === edition.issue ? ' selected' : '') + '>第 ' + ordinal(entry.issue) + ' 期 · ' + h(entry.title) + '</option>').join('');
  return title + (annualLinks ? '<nav class="year-actions" aria-label="往年特刊">' + annualLinks + '</nav>' : '') + '<div class="workspace"><section class="panel"><header class="panel-heading"><h2>往期报纸</h2>' +
    '<p>查看所选头版</p></header><div class="archive-list">' + rows + '</div>' +
    '<label class="archive-picker" for="archive-issue">选择期数<select id="archive-issue">' + options + '</select></label>' +
    '<p class="archive-meta">' + dotted(edition.date) + ' · 实售 ' + number(edition.sold) + ' 份' +
    (edition.corrections.length ? ' · 有刊后更正' : '') + '</p>' +
    '<div class="archive-actions"><a class="soft accent export-link" data-download aria-disabled="true">下载头版</a></div>' +
    '</section>' + paperPanel(edition, true) + '</div>';
}

function annualSalesChart(curve, firstIssue = 1) {
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
    '" y="168">第 ' + firstIssue + ' 期</text><text x="' + right + '" y="168" text-anchor="end">第 ' + (firstIssue + curve.length - 1) + ' 期</text></svg>';
}

function annualSummaryView(selectedYear = null) {
  const year = selectedYear ?? currentYear(game);
  const completeYear = annualYears(game).includes(year);
  let snapshot = annualCampaign(game,year);
  if (!snapshot) snapshot = {...game,editions:[],annualRange:{first:game.week+1,last:game.week}};
  if (!completeYear && game.ending === 'insolvent') snapshot = {...snapshot,ending:game.ending,ledger:game.ledger,pressure:game.pressure};
  const finale = game.issueCount === 156 && game.ending === 'year' && year === currentYear(game);
  const data = annualSpecial(snapshot);
  const endingTitle = finale ? annualSpecial(game).title : data.title;
  const yearLabel = game.ending === 'insolvent' && !completeYear ? '停刊结账' : finale ? '终局特刊' : '年终特刊';
  const {curve, weights, best, rivalSold, nominations, missed, sold, trust, cash, ads, blanks, totalMs, title, achievements} = data;
  const last = snapshot.editions.at(-1);
  const issueCount = snapshot.editions.length;
  const review = (finale ? '三年总评「' + endingTitle + '」。本年度评为「' + title + '」。' : '') + YEAR_END_REVIEWS[endingTitle] + '这一年出了 ' + issueCount + ' 期，实售 ' +
    number(sold) + ' 份，年末口碑 ' + trust + ' 点。' +
    (ads ? '全年共刊广告 ' + ads + ' 则。' : '全年没有刊登广告。');
  const stats = [
    ['年末现金', money(cash) + ' 元'], ['年末口碑', number(trust) + ' 点'],
    ['全年实售', number(sold) + ' 份'], ['刊登广告', number(ads) + ' 次'],
    ['开天窗', number(blanks) + ' 次'], ['采编用时', durationText(totalMs)]
  ];
  const allClips = clippingItems(game);
  const issueIds = new Set(snapshot.editions.map(item => item.issue));
  const annualFeedback = annualFeedbackView(reportData(snapshot), allClips.filter(clip => issueIds.has(clip.issue)), last?.rival.name);
  const roundup = game.issueCount === 156 ? annualRoundup(snapshot.editions, finale ? game.editions : snapshot.editions, finale ? annualComparison(game) : []) : null;
  const awardLines = nominations.length ? nominations.map((item, index) =>
    (data.winner?.issue === data.nominationIssues[index] ? '年度获奖作品' : '获提名') + '《' + item + '》') : ['本局暂无新闻奖提名。'];
  const achievementNames = achievements.length ? achievements.map(item => item.name) : ['本局暂无成就。'];
  activeAnnual = {paperName:newspaperName(game), editorName:game.editorName, year, issueCount, title:endingTitle, yearLabel, roundup, review,
    stats, annualFeedback, best:best && {...best, soldLabel:number(best.sold) + ' 份'}, awardLines, achievements:achievementNames};
  const list = items => '<ul>' + items.map(item => '<li>' + h(item) + '</li>').join('') + '</ul>';
  const report = '<article class="year-paper" aria-label="本报年终特刊"><header class="year-masthead">' +
    '<div class="year-dateline"><span>' + year + ' 年度回顾</span><span>全年出刊 ' + issueCount + ' 期</span></div>' +
    '<div class="year-brand"><p>' + h(newspaperName(game)) + '</p><b>' + yearLabel + '</b></div>' +
    '<div class="year-columns"><span>年终特刊 · 编辑部评述</span><span>一年的报纸</span></div></header>' +
    '<h1 tabindex="-1">' + endingTitle + '</h1><p class="year-review">' + h(review) + '</p>' +
    '<dl class="year-figures" aria-label="年度数据">' + stats.map(([label,value]) => '<div><dt>' + label + '</dt><dd>' +
      h(value) + '</dd></div>').join('') + '</dl>' +
    (roundup?.html || '') + '<div class="year-features"><section class="year-best"><h2>年度最佳头版</h2>' +
    (best ? '<figure><canvas id="year-best-proof" role="img" aria-label="' + h(proofDescription(best)) +
      '"></canvas><figcaption>第 ' + best.issue + ' 期 · 实售 ' + number(best.sold) + ' 份<br><strong>' +
      h(best.title) + '</strong></figcaption></figure>' : '<p>合订本暂无已签发的报纸。</p>') + '</section>' +
    '<section class="year-honors"><h2>获奖与成就</h2><h3>省好新闻奖</h3>' + list(awardLines) +
    (awardCertificate(game, year) ? certificateButton(year) : '') +
    '<h3>报社成就</h3>' + list(achievementNames) + '</section></div>' + annualFeedback.html + (last ? weeklyFeedbackView(last) : '') + '<footer class="year-imprint"><span>' +
    h(newspaperName(game)) + '编辑部</span>' + (game.editorName ? '<span>总编辑 ' + h(game.editorName) + '</span>' : '') +
    '</footer></article>';
  const actions = '<nav class="year-actions" aria-label="年终特刊操作">' +
    '<a class="soft accent export-link" data-annual-download aria-disabled="true">下载结算页图片</a>' +
    '<button type="button" class="soft" data-action="year-archive" data-issue="' + (best?.issue || 0) + '">查看合订本</button>' +
    (selectedYear === null && game.phase === 'sales' ? '<button type="button" class="issue" data-action="next-without-reprint">' +
      (last?.reprint === null ? '不补印，' : '') + '进入 ' + (year + 1) + ' 年 →</button>' : game.phase === 'complete' ? '<button type="button" class="soft" data-action="restart">重新开始</button>' : '') + '</nav>';
  const details = '<p>要闻级别　重 ' + weights.重 + ' · 中 ' + weights.中 + ' · 轻 ' + weights.轻 + '</p>' +
    '<p>《' + h(last?.rival.name || rivalPaperName(game)) + '》同期实售 ' + number(rivalSold) + ' 份。</p>' +
    annualSalesChart(curve, snapshot.editions[0]?.issue || 1) +
    (missed.length ? '<h3>未获提名</h3>' + list(missed.map(item => '第 ' + item.rank + ' 名　' + item.title + ' · ' + item.reason)) : '');
  return '<div class="year-wrap">' + actions + report +
    (!saving ? '<p class="form-status">本局进度未能留存，可先下载年终特刊。</p>' : '') +
    (last?.reprint === null && last.issue === game.editions.at(-1)?.issue ? reprintPanel(last) : '') +
    disclosure('annual-details', '全年发行明细', details, 'receipt-detail annual-awards') + '</div>';
}
function staffView() {
  return staffTableView();
}

function channelsView() {
  return channelsTableView();
}

function advertisingView(slot) {
  const current = game.slotAds?.[slot];
  const otherSlot = SECONDARY_SLOTS.find(key => key !== slot);
  const other = game.slotAds?.[otherSlot];
  const count = 1 + Number(Boolean(other));
  const terms = '<div class="step-hint"><p>本期口碑 ' + game.pressure.credibility +
    '。此处刊广告时，全期广告预计扣 ' + Math.abs(adTrustChange(game, count)) + ' 点口碑。' +
    (count > 1 ? ' 两则广告各自计入连登，再多扣 ' + EDITION_RULES.doubleAdTrust + ' 点。' :
      game.adStreak ? ' 连续刊广告会加重扣分。' : '') +
    (game.pressure.adUntil >= game.week + 1 ? ' 广告撤单后，本期报价已下调。' : '') + '</p></div>';
  const quote = incomingQuote(game);
  const walkIn = quote?.slot === slot ? [quote.id] : [];
  return terms + [...walkIn, ...issueAdOffers(game.week)].map(adById).map(offer => {
    const chosen = current?.id === offer.id;
    const taken = other?.id === offer.id;
    const clear = offer.clearance === 'ready' ? '材料齐备' :
      chosen && current.checked ? offer.clearance === 'missing' ? '查到缺少刊登文件' : '文件已经核对' : '刊登文件待查';
    const check = chosen && !current.checked && offer.clearance !== 'ready' ?
      '<button type="button" class="soft" data-action="review-ad" data-id="' + slot + '">查刊登文件</button>' : '';
    const price = money(slotAdValue(game, slot, offer)) + ' 元';
    return '<article class="management ad-offer' + (chosen ? ' chosen' : '') + '"><div class="manage-row"><div><h3>' +
      h(local(offer.name)) + '</h3><p>' + h(offer.category + ' · ' + clear) + '</p></div><strong>' + price + '</strong></div>' +
      '<p>' + h(local(offer.lines[0])) + '</p>' +
      '<div class="report-buttons ad-buttons"><button type="button" class="soft' + (chosen ? ' accent' : '') +
      '" data-action="choose-ad" data-id="' + offer.id + '" data-slot="' + slot + '"' + (taken || chosen ? ' disabled' : '') +
      '>' + (taken ? '已排在' + SLOT_TITLES[otherSlot] : chosen ? '已选' : quote?.id === offer.id ? '接受报价' : '刊登这则广告') + '</button>' +
      check + '</div></article>';
  }).join('');
}

function financeView() {
  return financeTableView();
}

const VIEWS = {
  desk:deskView, sales:salesView, staff:staffView, finance:financeView, archive:archiveView,
  data:newspaperDataView, influence:influenceView, clippings:clippingWallView
};

function render() {
  finishPressAnimation?.(true);
  activeProof = null;
  activeAnnual = null;
  const issueKey = game.seed + ':' + game.week;
  if (issueKey !== deskIssueKey) {
    deskIssueKey = issueKey;
    deskStage = firstDeskStage();
    expandedStory = null;
    disclosures.clear();
    slotModes.clear();
  }
  if (game.phase === 'desk' && !game.headline && deskStage !== 'headline') {
    deskStage = 'headline';
    expandedStory = null;
  }
  if (game.phase === 'desk' && deskStage === 'print' && !readyForProof()) deskStage = firstDeskStage();
  mastheadName.textContent = newspaperName(game);
  mastheadName.title = mastheadName.textContent;
  mastheadIssue.textContent = game.phase === 'complete' ? currentYear(game) + ' 年 · 年终特刊' : currentYear(game) + ' 年 · 第 ' +
    (game.week + 1) + ' / ' + campaignIssueCount(game) + ' 期';
  document.documentElement.style.setProperty('--paper-stock', paperStock(game.paperStock).color);
  for (const button of document.querySelectorAll('[data-view]')) {
    const selected = button.dataset.view === view;
    button.classList.toggle('current', selected);
    if (selected) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  }
  const strip = document.getElementById('kpi-strip');
  if (strip) strip.innerHTML = kpiStrip(game);
  app.innerHTML = VIEWS[view]();
  const ledgerDetail = app.querySelector('.ledger-detail');
  if (ledgerDetail) ledgerDetail.addEventListener('toggle', () => {
    const body = ledgerDetail.querySelector('tbody');
    if (ledgerDetail.open && !body.children.length) body.innerHTML = ledgerDetailRows();
  });
  renderAchievements();
  deskShortcuts.hidden = view !== 'desk' || game.phase !== 'desk';
  if (!deskShortcuts.hidden) renderDeskPrimary();
  renderGuide();
  if (document.getElementById('copies')) printInput();
  const proof = document.getElementById('proof');
  if (proof) {
    const entry = activeProof;
    renderNewspaper(proof, entry.draft, game.paperStock).then(rendered => {
      if (!rendered || !proof.isConnected) return;
      proof.dataset.ready = 'yes';
      const link = app.querySelector('[data-download]');
      if (entry.signed && link) {
        link.dataset.issue = String(entry.draft.issue);
        prepareDownload(link, proof, entry.draft);
      }
    });
  }
  if (activeAnnual) {
    playCoverageReplay(activeAnnual.roundup?.frames);
    prepareAnnualDownload(activeAnnual, game.paperStock);
    if (reportedTimingSeed !== game.seed) {
      reportedTimingSeed = game.seed;
      printIssueTimings();
    }
  }
}

function renderAchievements() {
  const {total, pressPoints, salePoints, awardPoints, achievements} = newsroomProgress(game);
  pointsTotal.textContent = number(total) + ' 分';
  if (!achievementsDialog.open) return;
  const earned = achievements.filter(achievement => achievement.earned).length;
  const certificates = annualYears(game).map(year => awardCertificate(game, year)).filter(Boolean);
  const awards = certificates.length ? '<section class="certificate-shelf"><h3>获奖证书</h3>' + certificates.map(({year}) =>
    certificateButton(year, year + ' 年省奖奖状')).join('') + '</section>' : '';
  achievementContent.innerHTML = '<div class="achievement-total"><strong>' + number(total) +
    ' 分</strong><p>签发 ' + number(pressPoints) + ' · 实售 ' + number(salePoints) + ' · 成就 ' + number(awardPoints) + '</p>' +
    '<p>每签发一期得 10 分，累计实售每满 1,000 份得 1 分，每项成就只计一次。</p></div>' + awards +
    '<p class="achievement-count">已达成 ' + earned + ' / ' + achievements.length + '</p><ul class="achievement-list">' +
    achievements.map(({name, description, reward, earned}) => '<li' + (earned ? ' class="earned"' : '') +
      '><div><strong>' + h(name) + '</strong><p>' + h(description) + '</p></div><span>' +
      (earned ? '已达成' : '待达成') + '<b>+' + reward + ' 分</b></span></li>').join('') + '</ul>';
}

function renderDeskPrimary() {
  const placeButton = app.querySelector('.report button[data-action="' + deskStage + '"]');
  if (placeButton) {
    deskPrimary.dataset.action = deskStage;
    deskPrimary.textContent = placeButton.textContent;
    deskPrimary.disabled = placeButton.disabled;
    return;
  }
  const actions = {headline:['desk-step', '选头条'], layout:['desk-step', '选版式'],
    support:['desk-step', '安排二条'], third:['desk-step', '安排三条'],
    proof:['open-proof', '查看大样'], print:['sign', '签发付印']};
  const [action, label] = actions[deskStage];
  deskPrimary.dataset.action = action;
  deskPrimary.dataset.id = deskStage;
  deskPrimary.textContent = label;
  deskPrimary.disabled = deskStage === 'proof' && !activeProof;
}

function focusDeskStage() {
  const heading = deskStage === 'proof' ? document.getElementById('desk-proof-title') :
    app.querySelector('[data-action="desk-step"][data-id="' + deskStage + '"]');
  heading?.focus({preventScroll:true});
  heading?.scrollIntoView({block:'nearest'});
}

function openDeskStage(stage) {
  if (deskStage !== stage) {
    deskStage = stage;
    expandedStory = null;
    render();
  }
  focusDeskStage();
}

function afterSlot(slot) {
  return slot === 'support' ? 'third' : doneSlot('support') ? 'proof' : 'support';
}

function printInput() {
  const field = document.getElementById('copies');
  const value = Number(field.value);
  const limit = printLimit(game);
  const valid = validCopies(value, game) && value <= limit;
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
  const blocked = !affordable || !readyForProof() || coverLoading() || Boolean(pendingPressure(game));
  app.querySelector('[data-action="sign"]').disabled = blocked;
  deskPrimary.disabled = blocked;
  return {value, valid, affordable};
}

function clearDownloads() {
  for (const pending of editionPngs.values()) {
    pending.then(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
  }
  editionPngs.clear();
  if (annualPngUrl?.startsWith('blob:')) URL.revokeObjectURL(annualPngUrl);
  annualPngUrl = null;
}

function paperBlobUrl(canvas) {
  return new Promise(resolve => {
    canvas.toBlob(blob => resolve(blob ? URL.createObjectURL(blob) : canvas.toDataURL('image/png')), 'image/png');
  });
}

function paperFileName(record) {
  return newspaperName(record).replace(/[<>:"/\\|?*]/g, '＿');
}

async function prepareDownload(link, canvas, edition) {
  if (!editionPngs.has(edition)) {
    if (editionPngs.size >= 4) {
      const oldest = editionPngs.keys().next().value;
      editionPngs.get(oldest).then(url => { if (url.startsWith('blob:')) URL.revokeObjectURL(url); });
      editionPngs.delete(oldest);
    }
    editionPngs.set(edition, paperBlobUrl(canvas));
  }
  const url = await editionPngs.get(edition);
  if (!link.isConnected || link.dataset.issue !== String(edition.issue)) return;
  link.href = url;
  link.download = paperFileName(edition) + '_第' + ordinal(edition.issue) + '期_' + edition.date + '.png';
  link.removeAttribute('aria-disabled');
}

async function prepareAnnualDownload(data, stock) {
  const link = app.querySelector('[data-annual-download]');
  const best = document.getElementById('year-best-proof');
  if (best) {
    const rendered = await renderNewspaper(best, data.best, stock);
    if (!rendered || !best.isConnected) return;
    best.dataset.ready = 'yes';
  }
  const canvas = document.createElement('canvas');
  renderAnnualPaper(canvas, data, stock, best);
  const url = await paperBlobUrl(canvas);
  if (!link.isConnected) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    return;
  }
  if (annualPngUrl?.startsWith('blob:')) URL.revokeObjectURL(annualPngUrl);
  annualPngUrl = url;
  link.href = url;
  link.download = paperFileName(data) + '_' + data.year + '年终特刊.png';
  link.removeAttribute('aria-disabled');
}

let certificateDownloadVersion = 0;
function clearCertificateDownload() {
  certificateDownloadVersion++;
  const url = certificateLink.getAttribute('href');
  if (url?.startsWith('blob:')) URL.revokeObjectURL(url);
  certificateLink.removeAttribute('href');
  certificateLink.removeAttribute('download');
  certificateLink.setAttribute('aria-disabled', 'true');
}

async function prepareCertificateDownload(certificate) {
  const version = certificateDownloadVersion;
  const canvas = document.createElement('canvas');
  renderAwardCertificate(canvas, certificate);
  const url = await paperBlobUrl(canvas);
  if (version !== certificateDownloadVersion || !certificateDialog.open) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url);
    return;
  }
  certificateLink.href = url;
  certificateLink.download = paperFileName(certificate) + '_' + certificate.year + '年度省好新闻奖_第' + ordinal(certificate.issue) + '期.png';
  certificateLink.removeAttribute('aria-disabled');
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
  canvas.setAttribute('aria-label', proofDescription(largeProof.draft));
  paperDialog.showModal();
  setProofZoom(false);
  renderNewspaper(canvas, largeProof.draft, game.paperStock).then(rendered => {
    if (!rendered || !paperDialog.open) return;
    canvas.dataset.ready = 'yes';
    if (largeProof.signed) prepareDownload(link, canvas, largeProof.draft);
  });
}

function openCity() {
  document.getElementById('city-title').textContent = game.cityReady ? '报社设置' : '给报纸和城市起名';
  document.getElementById('city-name').value = game.city;
  document.getElementById('paper-name').value = game.paperName || '';
  document.getElementById('editor-name').value = game.editorName || '';
  document.getElementById('founding-plan').hidden = game.cityReady;
  document.getElementById('year-field').hidden = game.cityReady;
  document.getElementById('campaign-year').value = String(game.year);
  document.getElementById('paper-stock-options').innerHTML = Object.entries(PAPER_STOCKS).map(([id, stock]) =>
    '<label><input type="radio" name="paper-stock" value="' + id + '"' +
    ((game.paperStock ?? DEFAULT_PAPER_STOCK) === id ? ' checked' : '') + '><span style="--swatch:' + stock.color +
    '">' + stock.name + '</span></label>').join('');
  document.getElementById('quick-press').checked = game.quickPress;
  document.getElementById('city-submit').textContent = game.cityReady ? '保存设置' : '创刊';
  cityDialog.querySelector('[data-action="close-city"]').hidden = !game.cityReady;
  document.getElementById('city-error').textContent = !game.cityReady && outdatedSave ? '旧报名册无法续用，请重新创刊。' :
    game.editions.length ? '新名称和署名用于后续刊期，底色也会应用到合订本。' : '';
  updateVisibleArea();
  cityDialog.showModal();
}

function dismissCity() {
  if (game.cityReady) cityDialog.close();
}

function continueCampaign() {
  resumePending = false;
  resumeDialog.close();
  startPlayClock();
  focusAppHeading();
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
  updateVisibleArea();
  originalDialog.showModal();
  originalDialog.querySelector('.original-fields').scrollTop = 0;
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
    coverError = '这张照片送不进版面，请换一张小些的照片。';
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
    announce(published.cleared ? '最后一期已签发，年终特刊已出。' :
      '第 ' + (game.week + 1) + ' 期已付印，发行回单到了。');
    playPressSequence(game.editions.at(-1));
  }
}

function sign() {
  const {value, affordable} = printInput();
  if (!affordable || !readyForProof() || coverLoading() || pendingPressure(game)) return;
  const notices = scheduledAds(game).filter(adNeedsCheck).map(ad =>
    local(adById(ad.id).name) + '的刊登文件尚不齐备，本期广告可能被撤下。');
  if (notices.length) {
    document.getElementById('risk-copy').textContent = notices.join(' ');
    pendingPress = {revision:game.revision, copies:value};
    riskDialog.returnValue = '';
    riskDialog.showModal();
  } else finishPress(value);
}

function advance(withoutReprint = false) {
  const settled = withoutReprint && game.editions.at(-1)?.reprint === null ? settleReprint(game, {}) : game;
  const next = settled && nextIssue(settled);
  coverError = '';
  expandedStory = null;
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
    announce('这趟采编现在排不开，请看截稿时间和记者回电。', 'notice');
    return;
  }
  if (!commit(next)) return;
  const previewChanged = game.headline === id || SECONDARY_SLOTS.some(slot => game[slot] === id) || !game.headline;
  if (previewChanged) highlight('.proof-preview');
  if (action === 'angle') {
    const details = app.querySelector('.report-details');
    if (details) details.open = detailsOpen;
    app.querySelector('[data-action="angle"][data-id="' + angle + '"]')?.focus({preventScroll:true});
    announce('这篇改用「' + PAPER_ANGLES.find(item => item.id === angle).label + '」。');
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
  const editorName = document.getElementById('editor-name').value.trim();
  if (editorName && !validPaperName(editorName)) {
    document.getElementById('city-error').textContent = '总编辑姓名请填 18 字以内。';
    return;
  }
  const year = game.cityReady ? game.year : Number(document.getElementById('campaign-year').value);
  if (!game.cityReady && ![2000, 2001].includes(year)) {
    document.getElementById('city-error').textContent = '请选择创刊年份。';
    return;
  }
  const next = game.cityReady ? {...game, city, paperName} : newCampaign(game.seed, city, true, paperName, true, year);
  const stock = new FormData(event.currentTarget).get('paper-stock');
  if (!Object.hasOwn(PAPER_STOCKS, stock)) return;
  if (commit({...next, editorName:editorName || null, paperStock:stock, quickPress:document.getElementById('quick-press').checked})) {
    cityDialog.close();
    outdatedSave = false;
    announce('《' + newspaperName(game) + '》的报纸资料已登记。');
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
  const next = saveOriginal(game, originalEditor.id, fields);
  if (next && commit(next)) {
    originalDialog.close();
    app.querySelector('[data-disclosure="desk-options"] summary')?.focus({preventScroll:true});
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

app.addEventListener('toggle', event => {
  const details = event.target;
  if (details.isConnected && details.dataset.disclosure) disclosures.set(details.dataset.disclosure, details.open);
}, true);

paperDialog.addEventListener('close', () => {
  if (view === 'desk' && deskStage === 'proof' && readyForProof()) openDeskStage('print');
});
certificateDialog.addEventListener('close', () => {
  if (!certificateDialog.open) clearCertificateDownload();
});

cityDialog.addEventListener('cancel', event => {
  event.preventDefault();
  dismissCity();
});

resumeDialog.addEventListener('cancel', event => {
  event.preventDefault();
  continueCampaign();
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
  if (restartDialog.returnValue === 'restart' && commit({...newGame(), quickPress:game.quickPress}, 'desk')) {
    if (resumeDialog.open) resumeDialog.close();
    resumePending = false;
    archiveIssue = 0;
    expandedStory = null;
    clearDownloads();
    openCity();
  }
});

document.addEventListener('click', event => {
  const download = event.target.closest('a[data-download][href], a[data-annual-download][href], a[data-certificate-download][href]');
  if (download) {
    announce(download.hasAttribute('data-certificate-download') ? '奖状正在下载。' :
      download.hasAttribute('data-annual-download') ? '年终特刊正在下载。' : '头版正在下载。');
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
    case 'resume': continueCampaign(); break;
    case 'guide-close':
    case 'guide-skip':
      if (action === 'guide-skip') guide.skipped = true;
      else if (!guide.closed.includes(id)) guide.closed.push(id);
      saveGuide();
      renderGuide();
      (app.querySelector('[data-action="guide-close"]') || app.querySelector('h1'))?.focus({preventScroll:true});
      break;
    case 'extra': {
      const next = orderExtra(game, Number(id));
      if (next && commit(next)) announce(Number(id) ? '号外印单已送印厂。' : '编辑部照常编印周六版。');
      break;
    }
    case 'upgrade-channel': {
      const next = upgradeChannel(game, id);
      if (next && commit(next)) announce(channelById(id).name + '已升为' + FEEDBACK_CONFIG.network.names[channelGrade(next,id)-1] + '。');
      break;
    }
    case 'buy-equipment': {
      const next = buyEquipment(game);
      if (next && commit(next)) announce(FEEDBACK_CONFIG.equipment.items[next.equipment-1].name + '已启用。');
      break;
    }
    case 'open-annual':
      archiveYear = Number(id);
      render();
      window.scrollTo(0,0);
      focusAppHeading();
      break;
    case 'skip-replay': skipCoverageReplay?.(); break;
    case 'map-select':
      mapSelection = mapSelection === id ? null : id;
      for (const pin of app.querySelectorAll('.map-pin[data-id]')) {
        const selected = pin.dataset.id === mapSelection;
        pin.classList.toggle('selected', selected);
        pin.setAttribute('aria-pressed', String(selected));
      }
      const card = app.querySelector('.city-map-layout .map-card');
      if (card) card.outerHTML = mapChannelCard(game, mapSelection);
      button.focus({preventScroll:true});
      break;
    case 'map-scale':
      mapScale = id;
      render();
      break;
    case 'focus-story':
      if (id !== game.focus && !commit({...game, focus:id}, view, false)) break;
      expandedStory = expandedStory === id ? null : id;
      render();
      app.querySelector('.lead[data-id="' + id + '"]')?.focus({preventScroll:true});
      break;
    case 'desk-step': openDeskStage(id); break;
    case 'choose-layout': {
      const next = chooseEditionLayout(game, id);
      if (next && commit(next, view, false)) openDeskStage('support');
      break;
    }
    case 'slot-mode': {
      const {slot} = button.dataset;
      slotModes.set(slot, id);
      expandedStory = null;
      render();
      app.querySelector('[data-action="slot-mode"][data-id="' + id + '"]')?.focus({preventScroll:true});
      break;
    }
    case 'slot-done': openDeskStage(afterSlot(id)); break;
    case 'skip-slot': {
      const next = chooseSlotAd(game, id, null);
      if (next && commit(next, view, false)) openDeskStage(afterSlot(id));
      break;
    }
    case 'report':
    case 'verify-story':
    case 'follow-story':
    case 'angle':
      completeStoryWork(action, id);
      break;
    case 'headline':
    case 'support':
    case 'third': {
      const next = placeStory(game, game.focus, action);
      if (next && commit(next, view, false)) {
        if (action === 'headline') deskStage = 'layout';
        else deskStage = afterSlot(action);
        expandedStory = null;
        render();
        focusDeskStage();
        highlight('.proof-preview');
        announce(action === 'headline' ? '已排入头条，头版清样已更新。' :
          next[action] ? SLOT_TITLES[action] + '已排上版面。' : '已撤下' + SLOT_TITLES[action] + '。');
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
    case 'next-without-reprint': advance(true); break;
    case 'open-achievements':
      achievementsDialog.showModal();
      renderAchievements();
      break;
    case 'close-achievements': achievementsDialog.close(); break;
    case 'open-certificate': {
      const certificate = awardCertificate(game, Number(id));
      if (certificate && !certificateDialog.open) {
        clearCertificateDownload();
        document.getElementById('certificate-content').innerHTML = certificateMarkup(certificate);
        certificateDialog.showModal();
        prepareCertificateDownload(certificate);
      }
      break;
    }
    case 'close-certificate': certificateDialog.close(); break;
    case 'accept-quote': {
      const next = acceptAdvertiserQuote(game, Number(issue));
      if (next && commit(next)) announce('已预留下期广告版位，见报后结款。');
      break;
    }
    case 'reprint': confirmReprint(); break;
    case 'open-edition':
      archiveIssue = Number(issue);
      render();
      app.querySelector('[data-issue="' + issue + '"]')?.focus({preventScroll:true});
      highlight('.proof-preview');
      break;
    case 'clipping':
      archiveIssue = Number(issue);
      navigate('archive');
      openProof();
      break;
    case 'year-archive':
      archiveIssue = Number(issue);
      navigate('archive');
      break;
    case 'open-proof': openProof(); break;
    case 'zoom-proof': setProofZoom(!paperViewport.classList.contains('zoomed')); break;
    case 'close-proof': paperDialog.close(); break;
    case 'new-original': openOriginal(); break;
    case 'edit-original': openOriginal(game.focus); break;
    case 'close-original': originalDialog.close(); break;
    case 'delete-original': {
      const next = isCurrentDesk(originalEditor) && removeOriginal(game, originalEditor.id);
      if (next && commit(next)) {
        originalDialog.close();
        app.querySelector('[data-disclosure="desk-options"] summary')?.focus({preventScroll:true});
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
        announce('已换回本报资料图。');
      }
      break;
    }
    case 'city': openCity(); break;
    case 'close-city': dismissCity(); break;
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
          '已开通 · 支出 ' + money(channelSetupCost(game, channel)) + ' 元') +
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
    case 'arrange-ads': {
      const stage = firstDeskStage();
      const slot = SECONDARY_SLOTS.includes(stage) ? stage : 'support';
      slotModes.set(slot, 'ads');
      deskStage = game.headline && game.layout ? slot : stage;
      expandedStory = null;
      navigate('desk');
      focusDeskStage();
      break;
    }
    case 'choose-ad': {
      const {slot} = button.dataset;
      const next = chooseSlotAd(game, slot, id);
      if (next && commit(next, view, false)) {
        if (adNeedsCheck(next.slotAds[slot])) {
          render();
          app.querySelector('[data-action="review-ad"]')?.focus();
        } else openDeskStage(afterSlot(slot));
        announce(SLOT_TITLES[slot] + '已排广告：' + local(adById(id).name) + '。');
      }
      break;
    }
    case 'review-ad': {
      const next = reviewSlotAd(game, id);
      if (next && commit(next, view, false)) {
        const missing = adNeedsCheck(next.slotAds[id]);
        if (missing) render();
        else openDeskStage(afterSlot(id));
        announce(missing ? '发现刊登文件不齐，可以换一则广告。' : '广告文件已核对。');
      }
      break;
    }
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

window.printIssueTimings = printIssueTimings;
document.addEventListener('visibilitychange', () => {
  if (document.hidden) checkpointPlayTime(false);
  else startPlayClock();
});
window.addEventListener('pagehide', () => checkpointPlayTime(false));
window.addEventListener('pageshow', startPlayClock);
window.setInterval(checkpointPlayTime, TIMING_SAVE_INTERVAL_MS);

document.addEventListener('focusin', event => {
  if (event.target.matches(editableField)) revealFocusedField();
});
window.addEventListener('resize', viewportResized);
visualViewport?.addEventListener('resize', viewportResized);
visualViewport?.addEventListener('scroll', updateVisibleArea);

// iOS Safari 允许忽略 viewport 的缩放限制。只拦多指手势，保留单指滚动和大样按钮。
for (const type of ['gesturestart', 'gesturechange', 'gestureend']) {
  document.addEventListener(type, event => {
    if (event.cancelable) event.preventDefault();
  }, {passive:false});
}
for (const type of ['touchstart', 'touchmove']) {
  document.addEventListener(type, event => {
    if (event.touches.length > 1 && event.cancelable) event.preventDefault();
  }, {passive:false});
}

render();
if (pendingVolume) app.textContent = '正在翻开合订本……';
else if (!game.cityReady) openCity();
else if (resumePending) {
  document.getElementById('resume-copy').textContent = '《' + newspaperName(game) +
    '》已保存到第 ' + (game.week + 1) + ' 期。';
  resumeDialog.showModal();
}
startPlayClock();
