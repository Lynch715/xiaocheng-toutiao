const SAVE_VERSION = 7;
const SAVE_KEY = 'lintown-weekly-trial-v' + SAVE_VERSION;
const DEFAULT_CITY = '临渡';
const DEFAULT_PAPER_NAME = '小城头条';
const RIVAL_PAPERS = ['河西晚报', '江岸日报'];
const PRICE_CENTS = 50;
const PRINT_CENTS = 20;
const REPRINT_CENTS = 29;
const REPRINT_DELIVERY_CENTS = 800;
const REPRINT_BATCHES = [0, 250, 500, 1000];
const DESK_START = 18 * 60;
const DESK_STEP = 15;
const MAX_OVERTIME = 60;
const DESK_UNIT = 35;
const LATE_DEMAND_RATE = .075;
const MIN_PRINT = 500;
const MAX_PRINT = 12000;
const DEFAULT_PRINT = 5150;
const STARTING_CASH = 260000;
const OFFICE_CENTS = 58450;
const STAFF_LIMIT = 4;
const CHANNEL_LIMIT = 7;
const EDITION_NOISE = 120;
const STAND_NOISE = 70;
const BASE_DEMAND = 2330;
const EARLY_DEMAND_STEP = 40;
const EARLY_DEMAND_WEEKS = 7;
const LOYALTY_DEMAND_CAP = 300;
const LOYALTY_SALES_SHARE = .08;
const RIVAL_BENCHMARK_SOLD = 4000;
const RIVAL_BASE_RATIO = [.7, 1.1];
const RIVAL_WEIGHT_SALES = {重:1.04, 中:1, 轻:.96};
const RIVAL_CAPTURE_STREAK = 3;
const RIVAL_FURTHER_CAPTURE_STREAK = 4;
const RIVAL_MAX_CAPTURED = 2;
const RIVAL_CLASH_DEMAND = 310;
const RIVAL_SHARED_DEMAND = 90;
const RIVAL_CAPTURE_DEMAND = 150;
const RIVAL_READER_TRANSFER = .50;
const AD_WITHDRAWAL_UNCHECKED = {missing:.78, review:.38, front:.12};
const PAPER_NAME_LIMIT = 18;
const ORIGINAL_LIMIT = 3;
const ORIGINAL_TITLE_LIMIT = 28;
const ORIGINAL_BODY_LIMIT = 420;
const ORIGINAL_SUPPORT_LIMIT = 105;
const COVER_DATA_LIMIT = 180000;
const CAMPAIGN_YEARS = [2000, 2001, 2002, 2003];
const WEEK_MS = 7 * 86400000;
const FIRST_ISSUE_AT = Date.UTC(2000, 0, 1);
const CANDIDATES_PER_ISSUE = 7;
const MIN_ANNUAL_CANDIDATES = 4;
const EVERGREEN_RESERVE = 10;
const STORY_COOLDOWN_ISSUES = 4;
const WEIGHT_SALES_BONUS = {重:.56, 中:.174, 轻:0};
const SUPPORT_WEIGHT_SHARE = .25;
const SAME_SECTION_MULTIPLIERS = [1, .75, .5];
const CLASH_WEIGHT_SHARE = .5;
const RIVAL_WEIGHT_PREFERENCES = {重:4, 中:2, 轻:1};

const ORIGINAL_TOPICS = {
  街巷:'street', 民生:'factory', 消费:'market', 交通:'station', 教育:'school',
  奇闻:'street', 文娱:'cinema', 体育:'court', 科技:'shops', 节庆:'square', 跨年:'millennium'
};

const REPORTERS = [
  {id: 'zhou', specialties:['街巷', '民生'], name: '周建军', style: '熟街熟巷', reach: 4, verify: 3, write: 3, salary: 8200, hire: 14500},
  {id: 'lin', specialties:['消费', '民生', '科技'], name: '林丽华', style: '把账查到底', reach: 2, verify: 5, write: 4, salary: 9600, hire: 17500},
  {id: 'he', specialties:['奇闻', '文娱'], name: '何小军', style: '专跑怪事', reach: 5, verify: 2, write: 4, salary: 10500, hire: 18500},
  {id: 'song', specialties:['交通', '教育'], name: '刘卫东', style: '守得住电话线', reach: 2, verify: 5, write: 2, salary: 7500, hire: 12500},
  {id: 'xu', specialties:['街巷', '跨年', '文娱'], name: '徐静', style: '能写人物', reach: 3, verify: 3, write: 5, salary: 11200, hire: 20000},
  {id: 'tan', specialties:['体育', '节庆'], name: '吴磊', style: '肯蹲现场', reach: 4, verify: 2, write: 2, salary: 6500, hire: 10500}
];

const CHANNELS = [
  {id:'station', name:'车站报摊', weight:28, cap:2350, fee:2100, commission:6, setup:0, interests:{交通:540, 体育:220, 跨年:200}},
  {id:'market', name:'东门菜场', weight:24, cap:2050, fee:1500, commission:4, setup:0, interests:{消费:450, 街巷:220, 奇闻:180, 节庆:280}},
  {id:'shops', name:'百货门口', weight:24, cap:2000, fee:1800, commission:8, setup:0, interests:{科技:450, 消费:250, 文娱:330}},
  {id:'homes', name:'家属区报亭', weight:24, cap:1850, fee:1600, commission:5, setup:0, interests:{民生:440, 教育:410, 街巷:250, 体育:180}},
  {id:'workers', name:'城西工人俱乐部', weight:17, cap:1400, fee:2600, commission:6, setup:17000, interests:{民生:650, 体育:560, 奇闻:310}},
  {id:'rural', name:'乡镇供销站', weight:18, cap:1550, fee:3200, commission:9, setup:20500, interests:{交通:580, 消费:370, 街巷:330, 节庆:500}},
  {id:'culture', name:'影院与文化馆', weight:14, cap:1150, fee:2100, commission:7, setup:14500, interests:{文娱:690, 节庆:360, 奇闻:450}}
];

function normalizeCity(value) {
  const trimmed = String(value ?? '').trim();
  return /^[\p{Script=Han}A-Za-z0-9]{1,8}$/u.test(trimmed) ? trimmed : null;
}

function validPaperName(name) {
  return typeof name === 'string' && name.trim().length > 0 &&
    Array.from(name).length <= PAPER_NAME_LIMIT && !/[\p{Cc}\p{Zl}\p{Zp}]/u.test(name);
}

function newspaperName(record) {
  return record.paperName || DEFAULT_PAPER_NAME;
}

function rivalPaperName(campaign) {
  const player = newspaperName(campaign).normalize('NFKC').replace(/\s+/gu, '').replace(/[》」』）)]+$/u, '');
  return RIVAL_PAPERS.find(name => name !== player && !player.endsWith(name.slice(-2)));
}

function validCover(value) {
  return typeof value === 'string' && value.length <= COVER_DATA_LIMIT &&
    /^data:image\/jpeg;base64,\/[0-9A-Za-z+/]+={0,2}$/.test(value);
}

function changeCover(campaign, cover) {
  if (campaign.phase !== 'desk' || (cover !== null && !validCover(cover))) return null;
  return {...campaign, cover};
}

function cityText(text, city) {
  return text.replaceAll(DEFAULT_CITY, city || DEFAULT_CITY);
}

function firstSaturday(year) {
  const first = new Date(Date.UTC(year, 0, 1));
  return first.getTime() + ((6 - first.getUTCDay() + 7) % 7) * 86400000;
}

function yearIssueCount(year) {
  return Math.ceil((Date.UTC(year + 1, 0, 1) - firstSaturday(year)) / WEEK_MS);
}

function issueWeek(index, year) {
  if (year) {
    const date = new Date(firstSaturday(year) + index * WEEK_MS).toISOString().slice(0, 10);
    const season = WEEKS.find(week => week.date === date);
    return {date, name:index === 0 ? '创刊号' : season?.name || '周六版',
      deadline:season?.deadline || '22:30', note:'', tastes:season?.tastes || {}};
  }
  return WEEKS[index] || {
    date:new Date(FIRST_ISSUE_AT + index * WEEK_MS).toISOString().slice(0, 10),
    name:'周六版', deadline:'22:30', note:'', tastes:{}
  };
}

function weekDates(index, year) {
  const saturday = issueWeek(index, year).date;
  const friday = new Date(Date.parse(saturday + 'T00:00:00Z') - 86400000).toISOString().slice(0, 10);
  return {friday, saturday};
}

function newCampaign(seed, city = DEFAULT_CITY, cityReady = false, paperName = cityReady ? DEFAULT_PAPER_NAME : null, newsLibrary = false, year = null) {
  const starterChannels = CHANNELS.filter(channel => !channel.setup).map(channel => channel.id);
  const campaign = {
    version:SAVE_VERSION, revision:0, seed, city, cityReady, paperName, week:0, phase:'desk',
    ...(newsLibrary || year ? {newsLibrary:true} : {}),
    ...(year ? {year, annual:{ids:[], availability:{}}, pressure:newPressureState()} : {}),
    focus:null, headline:null, support:null, copies:DEFAULT_PRINT, reports:{}, clock:DESK_START, trips:[], editions:[],
    originals:[], cover:null, briefs:[], stash:[],
    staff:REPORTERS.slice(0, 2).map(reporter => reporter.id),
    unlocked:[...starterChannels], active:[...starterChannels], priority:null, ad:null,
    ledger:[{issue:1, label:'报社启动金', cents:STARTING_CASH}],
    ending:null, market:{streak:0, captured:[], lastCapture:null}
  };
  return year ? prepareAnnualSlate(campaign) : {...campaign, focus:storySlate(campaign)[0].id};
}

let libraryDraw;

function librarySlate(campaign) {
  if (campaign.year) return campaign.annual.ids.map(id => libraryStory(STORIES.find(story => story.id === id)));
  if (libraryDraw?.seed !== campaign.seed) {
    const seasonal = STORIES.filter(story => story.date);
    const evergreen = STORIES.filter(story => !story.date)
      .map(story => ({story, order:randomAt(campaign.seed, 'evergreen/' + story.id)}))
      .sort((a, b) => a.order - b.order || a.story.id.localeCompare(b.story.id))
      .map(entry => entry.story);
    libraryDraw = {seed:campaign.seed, seasonal, evergreen};
  }
  const date = issueWeek(campaign.week).date;
  const {seasonal, evergreen} = libraryDraw;
  const fixed = seasonal.filter(story => story.date === date);
  const offset = campaign.week * CANDIDATES_PER_ISSUE - seasonal.filter(story => story.date < date).length;
  const drawn = Array.from({length:CANDIDATES_PER_ISSUE - fixed.length},
    (_, slot) => evergreen[(offset + slot) % evergreen.length]);
  return [...fixed, ...drawn].map(libraryStory);
}

function libraryStory(story) {
  return {...story, library:true, headline:story.title, tip:story.lead, image:libraryPhotoId(story), strength:story.salesFactor * 8};
}

function unusedEvergreens(campaign) {
  const published = new Set(campaign.editions.filter(edition => edition.issue <= campaign.week)
    .flatMap(edition => [edition.storyId, edition.supportId]));
  return STORIES.filter(story => !story.date && !published.has(story.id));
}

function canUseTwoEvergreens(campaign) {
  const futureWeeks = yearIssueCount(campaign.year) - campaign.week - 1;
  return unusedEvergreens(campaign).length - 2 >= futureWeeks + EVERGREEN_RESERVE;
}

function annualPairFits(campaign, first, second) {
  return !campaign.year || !first?.library || Boolean(first.date) || !second?.library ||
    Boolean(second.date) || canUseTwoEvergreens(campaign);
}

function prepareAnnualSlate(campaign) {
  const {year, week, seed, annual} = campaign;
  const date = issueWeek(week, year).date;
  const published = new Set(campaign.editions.flatMap(edition => [edition.storyId, edition.supportId]));
  const fixed = STORIES.filter(story => story.date === date && !published.has(story.id));
  const eligible = unusedEvergreens(campaign).filter(story =>
    (annual.availability[story.id]?.availableAt ?? 0) <= week);
  const drawn = eligible.map(story => {
    const recent = annual.availability[story.id]?.offered === week - 1;
    return {id:story.id, recent, order:randomAt(seed, date + '/desk/' + story.id)};
  }).sort((a, b) => Number(a.recent) - Number(b.recent) || a.order - b.order || a.id.localeCompare(b.id))
    .slice(0, CANDIDATES_PER_ISSUE - fixed.length);
  const ids = [...fixed.map(story => story.id), ...drawn.map(story => story.id)];
  return {...campaign, annual:{...annual, ids}, focus:ids[0] || null};
}

function markAnnualOffers(campaign, published) {
  const {year, week, annual} = campaign;
  if (!year) return {};
  const availability = {...annual.availability};
  for (const id of annual.ids) {
    if (published.has(id)) delete availability[id];
    else availability[id] = {offered:week, availableAt:availability[id]?.offered === week - 1 ?
      week + 1 + STORY_COOLDOWN_ISSUES : week + 1};
  }
  return {annual:{...annual, availability}};
}

function storySlate(campaign) {
  const originals = (campaign.originals || []).map(draft => ({
    ...draft, original:true, tip:Array.from(draft.body[0]).slice(0, 65).join('') +
      (Array.from(draft.body[0]).length > 65 ? '…' : ''),
    image:campaign.newsLibrary ? null : ORIGINAL_TOPICS[draft.section], strength:440
  }));
  if (campaign.newsLibrary) return [...librarySlate(campaign), ...originals];
  const late = lateLead(campaign);
  const stories = WEEKS[campaign.week].stories.filter(story => story.id !== late.id || campaign.clock >= late.at);
  const previous = campaign.editions.find(edition => edition?.issue === campaign.week);
  const lead = READER_LEADS.get(previous?.nextLead);
  return [...(lead ? [lead.story] : []), ...stories, ...originals];
}

function getStory(campaign, id) {
  return storySlate(campaign).find(story => story.id === id);
}

function canRunSupport(campaign, story) {
  return story && story.id !== campaign.headline &&
    (!story.original || originalFitsSupport(story)) &&
    annualPairFits(campaign, getStory(campaign, campaign.headline), story);
}

function originalFitsSupport(story) {
  return Array.from(story.body.join('　')).length <= ORIGINAL_SUPPORT_LIMIT;
}

function originalFields(section, headline, text) {
  const title = String(headline ?? '').trim().replace(/\s+/gu, ' ');
  const body = String(text ?? '').split(/\r?\n/).map(line => line.trim().replace(/\s+/gu, ' ')).filter(Boolean);
  if (!Object.hasOwn(ORIGINAL_TOPICS, section) || !title || Array.from(title).length > ORIGINAL_TITLE_LIMIT ||
      !body.length || body.length > 6 || Array.from(body.join('')).length > ORIGINAL_BODY_LIMIT ||
      /\p{Cc}/u.test(title + body.join(''))) return null;
  return {section, headline:title, body};
}

function saveOriginal(campaign, id, fields) {
  if (campaign.phase !== 'desk') return null;
  const originals = campaign.originals || [];
  if (id) {
    if (!originals.some(draft => draft.id === id) || (campaign.support === id && !originalFitsSupport(fields))) return null;
    return {...campaign, focus:id, originals:originals.map(draft => draft.id === id ? {id, ...fields} : draft)};
  }
  const slots = Array.from({length:ORIGINAL_LIMIT}, (_, index) => 'original-' + (index + 1));
  const slot = slots.find(candidate => !originals.some(draft => draft.id === candidate));
  return slot ? {...campaign, focus:slot, originals:[...originals, {id:slot, ...fields}]} : null;
}

function removeOriginal(campaign, id) {
  if (campaign.phase !== 'desk' || !campaign.originals?.some(draft => draft.id === id)) return null;
  return {...campaign, originals:campaign.originals.filter(draft => draft.id !== id),
    focus:campaign.focus === id ? (campaign.newsLibrary ? librarySlate(campaign)[0].id : WEEKS[campaign.week].stories[0].id) : campaign.focus,
    headline:campaign.headline === id ? null : campaign.headline,
    support:campaign.support === id ? null : campaign.support};
}

function storyText(story, text, city) {
  return story.original ? text : cityText(text, city);
}

function placeStory(campaign, id, placement) {
  if (campaign.phase !== 'desk') return null;
  const story = getStory(campaign, id);
  if (!story) return null;
  if (placement === 'headline') {
    const support = campaign.support === id || !annualPairFits(campaign, story, getStory(campaign, campaign.support)) ? null : campaign.support;
    return {...campaign, headline:id, support,
      briefs:(campaign.briefs || []).filter(brief => brief !== id)};
  }
  if (placement !== 'support' || !canRunSupport(campaign, story)) return null;
  return {...campaign, support:campaign.support === id ? null : id,
    briefs:(campaign.briefs || []).filter(brief => brief !== id)};
}

function briefLimit(campaign) {
  return campaign.ad?.placement === 'front' ? 2 : 3;
}

function briefCandidates(campaign) {
  if (campaign.newsLibrary) return [];
  const current = storySlate(campaign).filter(story => !story.original && campaign.reports[story.id]?.visited &&
    story.id !== campaign.headline && story.id !== campaign.support).map(story => ({
      id:story.id, section:story.section, title:storyCopy(story, campaign.reports[story.id]).title,
      flash:story.flash, fromWeek:campaign.week, stored:false
    }));
  const stored = (campaign.stash || []).filter(item => item.fromWeek === campaign.week - 1 &&
    item.id !== campaign.headline && item.id !== campaign.support && !current.some(story => story.id === item.id))
    .map(item => ({...item, stored:true}));
  return [...current, ...stored];
}

function selectedBriefs(campaign) {
  const choices = briefCandidates(campaign);
  return (campaign.briefs || []).slice(0, briefLimit(campaign)).map(id => choices.find(item => item.id === id)).filter(Boolean);
}

function toggleBrief(campaign, id) {
  if (campaign.phase !== 'desk') return null;
  const briefs = campaign.briefs || [];
  if (briefs.includes(id)) return {...campaign, briefs:briefs.filter(item => item !== id)};
  if (briefs.length >= briefLimit(campaign) || !briefCandidates(campaign).some(item => item.id === id)) return null;
  return {...campaign, briefs:[...briefs, id]};
}

function briefDemand(campaign, channel) {
  return Math.min(75, selectedBriefs(campaign).reduce((sum, item) =>
    sum + Math.min(30, (channel.interests[item.section] || 0) * .06) * (item.stored ? .5 : 1), 0));
}

function validCopies(copies) {
  return Number.isInteger(copies) && copies >= MIN_PRINT && copies <= MAX_PRINT;
}

function cashOf(campaign) {
  return campaign.ledger.reduce((cash, row) => cash + row.cents, 0);
}

function soldOf(campaign) {
  return campaign.editions.reduce((sold, edition) => sold + edition.sold, 0);
}

function withEntries(campaign, entries) {
  const issue = campaign.week + 1;
  return {...campaign, ledger:[...campaign.ledger, ...entries.filter(row => row.cents).map(row => ({...row, issue}))]};
}

function reporterById(id) {
  return REPORTERS.find(reporter => reporter.id === id);
}

function channelById(id) {
  return CHANNELS.find(channel => channel.id === id);
}

function deskDeadline(week, year) {
  const [hour, minute] = issueWeek(week, year).deadline.split(':').map(Number);
  return (hour < 18 ? hour + 24 : hour) * 60 + minute;
}

function clockText(minutes) {
  const hh = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
  const mm = String(minutes % 60).padStart(2, '0');
  return (minutes >= 1440 ? '次日 ' : '') + hh + ':' + mm;
}

function lateLead(campaign) {
  const {week, seed} = campaign;
  const id = WEEKS[week].stories[Math.floor(randomAt(seed, week + '/late-lead') * 4)].id;
  const at = 20 * 60 + 5 + Math.floor(randomAt(seed, week + '/late-time') * 41);
  return {id, at};
}

function rivalCallTime(campaign) {
  return 20 * 60 + 30 + Math.floor(randomAt(campaign.seed, campaign.week + '/rival-time') * 61);
}

function overtimeSteps(campaign) {
  return Math.ceil(Math.max(0, campaign.clock - deskDeadline(campaign.week, campaign.year)) / DESK_STEP);
}

function canSpendDeskTime(campaign, minutes) {
  return campaign.phase === 'desk' && campaign.clock + minutes <= deskDeadline(campaign.week, campaign.year) + MAX_OVERTIME;
}

const RISK_FIELD_NOTES = {
  'bus-goose':'车上几个人都记得鹅伸出过脖子。票是谁掏的钱，他们各有各的说法。',
  'draft-fare':'记者抄回了售票窗上的旧价牌。来电附的复印件只拍到了标题，文号还没对过。',
  'factory-ban':'门房记得广播响过，车铺也有人听见。送到报社的记录只抄了中间一句。'
};

function availableReporters(campaign) {
  return campaign.staff.filter(id => !campaign.trips.some(trip => trip.reporter === id)).map(reporterById);
}

function visitCost(reporter) {
  return Math.round((9 - reporter.reach) * DESK_UNIT / 2);
}

function verifyCost(report) {
  return reporterById(report?.id)?.verify >= 4 ? DESK_UNIT : 2 * DESK_UNIT;
}

function assignStory(campaign, storyId, reporterId) {
  const story = getStory(campaign, storyId);
  const reporter = availableReporters(campaign).find(item => item.id === reporterId);
  if (!story || story.original || !reporter || campaign.reports[storyId]?.visited ||
      campaign.trips.some(trip => trip.story === storyId)) return null;
  const minutes = visitCost(reporter);
  if (!canSpendDeskTime(campaign, minutes)) return null;
  return {...campaign, trips:[...campaign.trips, {story:storyId, reporter:reporterId, at:campaign.clock + minutes}]};
}

function advanceDesk(campaign, at) {
  if (!Number.isInteger(at) || at <= campaign.clock || !canSpendDeskTime(campaign, at - campaign.clock)) return null;
  let next = {...campaign, clock:at, trips:campaign.trips.filter(trip => trip.at > at)};
  const returns = campaign.trips.filter(trip => trip.at <= at).sort((a, b) => a.at - b.at);
  for (const trip of returns) next = reportStory(next, trip);
  return next;
}

function waitForPhone(campaign) {
  const deadline = deskDeadline(campaign.week);
  const end = deadline + MAX_OVERTIME;
  const events = [rivalCallTime(campaign), lateLead(campaign).at, ...campaign.trips.map(trip => trip.at), deadline];
  const fallback = campaign.clock < deadline ? deadline : Math.min(end, campaign.clock + DESK_STEP);
  const upcoming = events.filter(at => at > campaign.clock);
  return advanceDesk(campaign, upcoming.length ? Math.min(...upcoming, end) : fallback);
}

function withReport(campaign, storyId, report) {
  return {...campaign, reports:{...campaign.reports, [storyId]:report}};
}

function reporterFits(reporter, story) {
  return Boolean(reporter?.specialties.includes(story.section));
}

function reportTier(campaign, story, reporter) {
  const fit = reporterFits(reporter, story);
  const miss = .42 - reporter.reach * .035 - (fit ? .18 : 0);
  const scoop = .14 + reporter.reach * .025 + (fit ? .20 : 0);
  const roll = randomAt(campaign.seed, WEEKS[campaign.week].date + '/' + story.id + '/field/' + reporter.id);
  return roll < miss ? 'miss' : roll < miss + scoop ? 'scoop' : 'regular';
}

function reportWork(report) {
  if (!report?.visited) return 0;
  if (report.tier === 'miss') return 80;
  return (report.tier === 'scoop' ? 1900 : 1000) + reporterById(report.id).write * 20;
}

function fieldReport(story, report) {
  if (!report?.visited) return [];
  if (report.tier === 'miss') return story.miss.report;
  if (story.risk && !report.verified) return [RISK_FIELD_NOTES[story.id], ...(report.tier === 'scoop' ? story.scoop.report : [])];
  if (report.rumor && !report.verified) return [...story.report, rumorFieldNote(story)];
  return report.tier === 'scoop' ? [...story.report, ...story.scoop.report] : story.report;
}

function reportStory(campaign, trip) {
  const reporter = reporterById(trip.reporter);
  const story = getStory(campaign, trip.story);
  const report = campaign.reports[story.id] || {};
  const drawnTier = reportTier(campaign, story, reporter);
  const rumor = drawnTier === 'scoop' && reporter.verify <= 2 &&
    randomAt(campaign.seed, WEEKS[campaign.week].date + '/' + story.id + '/rumor/' + reporter.id) < .45;
  // 电话核对早于现场采访时，不能替后来带回的转述背书。
  const previousCheck = rumor ? {...report, verified:false, checkResult:undefined} : report;
  const tier = previousCheck.checkResult === 'deflated' && drawnTier === 'scoop' ? 'regular' : drawnTier;
  return withReport(campaign, story.id, {
    ...previousCheck, id:reporter.id, name:reporter.name, visited:true, lastWork:'visit',
    tier, rumor, returnedAt:trip.at,
    angle:angleAvailable({...previousCheck, visited:true}, report.angle) ? report.angle : 'scene'
  });
}

function verifyStory(campaign, storyId) {
  const story = getStory(campaign, storyId);
  const before = campaign.reports[storyId];
  if (!story || story.original || before?.verified) return null;
  const next = advanceDesk(campaign, campaign.clock + verifyCost(before));
  if (!next) return null;
  const report = next.reports[storyId] || {};
  const uncertain = Boolean(story.risk || report.rumor);
  const confirmed = !uncertain || randomAt(campaign.seed, WEEKS[campaign.week].date + '/' + story.id + '/check') < .55;
  return withReport(next, storyId, {...report, verified:true, checkResult:confirmed ? 'confirmed' : 'deflated',
    tier:!confirmed && report.tier === 'scoop' ? 'regular' : report.tier, lastWork:'verify'});
}

function followStory(campaign, storyId) {
  const story = getStory(campaign, storyId);
  const report = campaign.reports[storyId];
  if (!story || story.original || !report?.visited || report.followed) return null;
  const next = advanceDesk(campaign, campaign.clock + DESK_UNIT);
  return next && withReport(next, storyId, {...report, followed:true, tier:report.tier === 'miss' ? 'regular' : report.tier, lastWork:'follow'});
}

function angleAvailable(report, angle) {
  return angle === 'news' || (angle === 'scene' && Boolean(report?.visited)) || (angle === 'check' && Boolean(report?.verified));
}

function chooseAngle(campaign, storyId, angle) {
  const story = getStory(campaign, storyId);
  const report = campaign.reports[storyId] || {};
  if (campaign.phase !== 'desk' || !story || story.original || !angleAvailable(report, angle)) return null;
  return withReport(campaign, storyId, {...report, angle});
}

function staffLimit() {
  return STAFF_LIMIT;
}

function channelLimit() {
  return CHANNEL_LIMIT;
}

function changeStaff(campaign, id, hiring) {
  const reporter = reporterById(id);
  if (!reporter || campaign.phase !== 'desk') return null;
  const present = campaign.staff.includes(id);
  if (hiring ? present || campaign.staff.length >= staffLimit(campaign) : !present || campaign.staff.length <= 1) return null;
  if (!hiring && campaign.trips.some(trip => trip.reporter === id)) return null;
  const cost = hiring ? reporter.hire : Math.ceil(reporter.salary / 2);
  if (cashOf(campaign) < cost) return null;
  const staff = hiring ? [...campaign.staff, id] : campaign.staff.filter(other => other !== id);
  return withEntries({...campaign, staff}, [{label:(hiring ? '招聘费 · ' : '解聘结算 · ') + reporter.name, cents:-cost}]);
}

function changeChannel(campaign, id) {
  const channel = channelById(id);
  if (!channel || campaign.phase !== 'desk' || campaign.market.captured.includes(id)) return null;
  if (campaign.active.includes(id)) {
    if (campaign.active.length === 1) return null;
    return {...campaign, active:campaign.active.filter(other => other !== id), priority:campaign.priority === id ? null : campaign.priority};
  }
  const open = campaign.unlocked.includes(id);
  if (campaign.active.length >= channelLimit(campaign)) return null;
  if (!open && cashOf(campaign) < channel.setup) return null;
  return withEntries({...campaign, active:[...campaign.active, id], unlocked:open ? campaign.unlocked : [...campaign.unlocked, id]},
    open ? [] : [{label:'开拓渠道 · ' + channel.name, cents:-channel.setup}]);
}

function printLimit(campaign) {
  return Math.min(MAX_PRINT, campaign.active.reduce((total, id) => total + channelById(id).cap, 0));
}

function fixedEntries(campaign, deliver) {
  const salaries = campaign.staff.reduce((total, id) => total + reporterById(id).salary, 0);
  const delivery = deliver ? campaign.active.reduce((total, id) => total + channelById(id).fee, 0) : 0;
  return [{label:'记者工资', cents:-salaries}, {label:'编辑部日常', cents:-OFFICE_CENTS}, {label:'发行配送', cents:-delivery}];
}

function pressQuote(campaign, copies) {
  const expenses = [{label:'印刷费', cents:-copies * PRINT_CENTS}, ...fixedEntries(campaign, true)];
  return {expenses, total:expenses.reduce((total, row) => total - row.cents, 0)};
}

function minimumViablePressCost(campaign) {
  // 留下周薪最低的一人。解聘结算低于省下的一期工资，已开通的渠道可免费切换。
  const staff = campaign.staff.map(reporterById).sort((a, b) => a.salary - b.salary);
  const channel = campaign.unlocked.filter(id => !campaign.market?.captured.includes(id))
    .map(channelById).filter(item => item.cap >= MIN_PRINT)
    .reduce((cheapest, item) => item.fee < cheapest.fee ? item : cheapest);
  const severance = staff.slice(1).reduce((sum, reporter) => sum + Math.ceil(reporter.salary / 2), 0);
  return pressQuote({staff:[staff[0].id], active:[channel.id]}, MIN_PRINT).total + severance;
}

function closeIfInsolvent(campaign) {
  if (campaign.phase !== 'desk' || cashOf(campaign) >= minimumViablePressCost(campaign)) return campaign;
  return {...campaign, phase:'complete', ending:'insolvent', trips:[]};
}

function randomAt(seed, key) {
  let value = seed ^ 0x811c9dc5;
  for (const char of key) value = Math.imul(value ^ char.charCodeAt(0), 0x01000193);
  value = Math.imul(value ^ (value >>> 16), 0x7feb352d);
  value = Math.imul(value ^ (value >>> 15), 0x846ca68b);
  return ((value ^ (value >>> 16)) >>> 0) / 4294967296;
}

function rivalForWeek(campaign) {
  const choices = RIVAL_WEEKS[campaign.week % RIVAL_WEEKS.length];
  const choice = Math.floor(randomAt(campaign.seed, campaign.week + '/rival') * choices.length);
  const outlets = [...new Set([...choices[choice][2], ...campaign.market.captured])];
  const name = rivalPaperName(campaign);
  const story = weightedRivalStory(librarySlate(campaign), randomAt(campaign.seed, campaign.week + '/rival-library'));
  if (!story) return {name, storyId:null, title:'本期无头条回单', weight:'轻', outlets};
  const additional = CHANNELS.filter(channel => !outlets.includes(channel.id)).sort((a, b) =>
    (b.interests[story.section] || 0) - (a.interests[story.section] || 0) || b.cap - a.cap);
  let capacity = outlets.reduce((sum, id) => sum + channelById(id).cap, 0);
  const target = rivalSalesTarget(campaign, story.weight);
  for (const channel of additional) {
    if (capacity >= target) break;
    outlets.push(channel.id);
    capacity += channel.cap;
  }
  return {name, storyId:story.id, title:cityText(story.title, campaign.city), weight:story.weight, outlets};
}

function rivalSalesTarget(campaign, weight) {
  const seedDraw = randomAt(campaign.seed, campaign.year + '/rival-circulation');
  const base = RIVAL_BASE_RATIO[0] + seedDraw * (RIVAL_BASE_RATIO[1] - RIVAL_BASE_RATIO[0]);
  return Math.round(RIVAL_BENCHMARK_SOLD * base * RIVAL_WEIGHT_SALES[weight]);
}

function rivalCoverage(campaign, rival) {
  const target = rivalSalesTarget(campaign, rival.weight);
  const markets = rival.outlets.map(channelById);
  const copies = allocateCopies(markets, target, null);
  return markets.map((channel, index) => ({
    name:channel.name, sold:copies[index], competing:campaign.active.includes(channel.id)
  }));
}

function advanceMarket(campaign, edition, issue) {
  const {streak, captured} = campaign.market;
  const weaker = edition.rival.weight && WEIGHT_SALES_BONUS[edition.weight] < WEIGHT_SALES_BONUS[edition.rival.weight];
  const streakGoal = captured.length ? RIVAL_FURTHER_CAPTURE_STREAK : RIVAL_CAPTURE_STREAK;
  const nextStreak = weaker ? Math.min(streakGoal, streak + 1) : 0;
  const eligible = (edition.rival.outlets || []).filter(id => campaign.active.includes(id));
  const takeover = nextStreak === streakGoal && captured.length < RIVAL_MAX_CAPTURED && campaign.active.length > 1 ?
    eligible.map(channelById).sort((a, b) => b.weight - a.weight || a.id.localeCompare(b.id))[0] : null;
  if (!takeover) return {...campaign, market:{...campaign.market, streak:nextStreak}};
  const {id} = takeover;
  const next = {...campaign, active:campaign.active.filter(channel => channel !== id),
    priority:campaign.priority === id ? null : campaign.priority,
    market:{streak:0, captured:[...captured, id], lastCapture:{id, issue, wins:streakGoal}}};
  return {...next, copies:Math.min(campaign.copies, printLimit(next))};
}

function weightedRivalStory(slate, roll) {
  const total = slate.reduce((sum, story) => sum + RIVAL_WEIGHT_PREFERENCES[story.weight], 0);
  let draw = roll * total;
  return slate.find(story => (draw -= RIVAL_WEIGHT_PREFERENCES[story.weight]) < 0);
}

function knownRival(campaign) {
  return campaign.newsLibrary || campaign.clock >= rivalCallTime(campaign) ? rivalForWeek(campaign) : null;
}

function issueAdOffers(week) {
  return AD_SLATES[week % AD_SLATES.length];
}

function adById(id) {
  return AD_OFFERS.find(offer => offer.id === id);
}

function adValue(offer, placement, campaign) {
  const revenue = Math.round(offer.amount * (placement === 'front' ? 1.5 : 1));
  return campaign?.year ? adjustedAdRevenue(campaign, revenue) : revenue;
}

function adNeedsCheck(selection) {
  if (!selection) return false;
  const offer = adById(selection.id);
  return offer.clearance === 'missing' || (offer.clearance === 'review' && !selection.checked);
}

function chooseAd(campaign, id, placement) {
  if (campaign.phase !== 'desk' || !issueAdOffers(campaign.week).includes(id) || !['inside', 'front'].includes(placement)) return null;
  return {...campaign, ad:{id, placement, checked:campaign.ad?.id === id && campaign.ad.checked},
    briefs:(campaign.briefs || []).slice(0, placement === 'front' ? 2 : 3)};
}

function reviewAd(campaign) {
  if (!campaign.ad || campaign.ad.checked ||
      adById(campaign.ad.id).clearance === 'ready') return null;
  const next = campaign.newsLibrary ? campaign : advanceDesk(campaign, campaign.clock + DESK_UNIT);
  return next && {...next, ad:{...campaign.ad, checked:true}};
}

function adForEdition(selection, city, campaign) {
  if (!selection) return null;
  const offer = adById(selection.id);
  return {id:offer.id, category:offer.category, name:cityText(offer.name, city),
    lines:offer.lines.map(line => cityText(line, city)), placement:selection.placement, paid:adValue(offer, selection.placement, campaign)};
}

function storyCopy(story, report) {
  if (story.original) return {title:story.headline, brief:story.body[0]};
  if (story.library) return {title:story.title, brief:story.lead};
  const note = DESK_NOTES[story.id];
  const corrected = story.risk && report?.verified;
  const copy = corrected ? story.risk : story;
  const angle = report?.angle || 'news';
  const chosenTitle = story.risk && !corrected ? '' :
    angle === 'scene' ? note.sceneTitle : angle === 'check' ? note.checkTitle : '';
  return {title:corrected && report.checkResult === 'deflated' ? story.risk.title :
    report?.tier === 'miss' && !corrected ? story.headline : report?.tier === 'scoop' ? story.scoop.title :
    chosenTitle || (corrected ? copy.title : story.headline), brief:copy.brief};
}

function storyBody(story, report) {
  if (story.original || story.library) return story.body;
  const note = DESK_NOTES[story.id];
  const copy = storyCopy(story, report);
  const field = fieldReport(story, report);
  const verified = verificationCopy(story, report);
  const follow = report?.followed ? [note.follow] : [];
  if (report?.angle === 'scene') return [...field.slice(0, 1), copy.brief, note.context, ...field.slice(1), ...verified, ...follow];
  if (report?.angle === 'check') return [...verified, copy.brief, note.context, ...field, ...follow];
  return [copy.brief, note.context, ...field, ...verified, ...follow];
}

function editionDraft(campaign, story) {
  const {week:index, city, ad, reports} = campaign;
  const week = issueWeek(index, campaign.year);
  const report = reports[story.id];
  const support = campaign.support === story.id ? null : getStory(campaign, campaign.support);
  const local = text => cityText(text, city);
  const special = story.id === 'millennium';
  const copy = storyCopy(story, report);
  const angle = PAPER_ANGLES.find(item => item.id === report?.angle) || PAPER_ANGLES[0];
  const secondary = [];
  if (support) {
    const supportReport = reports[support.id];
    const supportCopy = storyCopy(support, supportReport);
    const text = support.library ? support.short :
      storyBody(support, supportReport).slice(0, support.original ? undefined : 2).join(support.original ? '　' : '');
    secondary.push({title:storyText(support, supportCopy.title, city), text:storyText(support, text, city),
      ...(support.original ? {original:true} : {})});
  }
  return {
    issue:index + 1, name:week.name, date:week.date, section:story.section, storyId:story.id, city,
    paperName:newspaperName(campaign), cover:campaign.cover || null,
    flashes:selectedBriefs(campaign).map(item => ({id:item.id, section:item.section, text:local(item.flash), stored:item.stored})),
    angle:angle.label, title:storyText(story, copy.title, city),
    subtitle:story.original || story.library ? '' : local(special && angle.id === 'news' ? '广场钟声敲过零点，街坊一起迎接新年' :
      story.risk && report?.verified ? copy.brief : story.tip),
    image:story.image, body:(story.library ? [story.lead.replace(/^本报讯\s*/u, ''), ...story.body] :
      storyBody(story, report)).map(text => storyText(story, text, city)),
    adInfo:adForEdition(ad, city, campaign), supportId:support?.id || null,
    ...(campaign.year ? {replies:repliesForIssue(campaign).map(item => ({...item, text:local(item.text)}))} : {}),
    side:campaign.newsLibrary ? {items:[]} : special ? {title:'跨年夜，谁还醒着', items:[
      {title:'修表铺留灯到零点', text:'钟楼响起第一声时，广场东侧的修表铺还亮着灯。老师傅把一排刚上好弦的钟摆齐，请进店的街坊听哪个走得最准。关门前有位老主顾送来一只多年没上弦的怀表。'},
      {title:'车站值班室照常开门', text:'售票员翻过台历，把昨夜剩下的票根扎成一捆。窗外有人问首班车几点开，她照着时刻表念了一遍，又把旧台历留给候车的人垫包。'}
    ]} : {title:'采编摘记', items:[{title:storyText(story, copy.title, city),
      text:story.original ? story.body[0] : local(DESK_NOTES[story.id].context)}]},
    secondary
  };
}

function allocateCopies(channels, copies, priority) {
  const amount = channels.map(() => 0);
  const weights = channels.map(channel => channel.weight + (channel.id === priority ? 19 : 0));
  let remaining = copies;
  while (remaining > 0) {
    const open = channels.map((channel, index) => channel.cap > amount[index] ? index : -1).filter(index => index >= 0);
    if (!open.length) break;
    const weightSum = open.reduce((sum, index) => sum + weights[index], 0);
    const round = remaining;
    for (const index of open) {
      const n = Math.min(channels[index].cap - amount[index], Math.floor(round * weights[index] / weightSum));
      amount[index] += n;
      remaining -= n;
    }
    if (remaining === round) {
      const index = open.sort((a, b) => weights[b] - weights[a])[0];
      amount[index]++;
      remaining--;
    }
  }
  return amount;
}

function editionCorrections(campaign, stories) {
  const date = issueWeek(campaign.week, campaign.year).date;
  return stories.filter(story => story.risk && randomAt(campaign.seed, date + '/' + story.id + '/exposed') < story.risk.probability)
    .map(story => ({storyId:story.id, text:cityText(story.risk.correction, campaign.city)}));
}

function adWithdrawalNotice(campaign) {
  if (!adNeedsCheck(campaign.ad)) return null;
  const {id, placement} = campaign.ad;
  const offer = adById(id);
  const chance = AD_WITHDRAWAL_UNCHECKED[offer.clearance] + (placement === 'front' ? AD_WITHDRAWAL_UNCHECKED.front : 0);
  return randomAt(campaign.seed, campaign.week + '/ad/' + id) < chance ?
    cityText(offer.name, campaign.city) + '的刊登材料未齐，广告已撤下，本期未入账。' : null;
}

function standReason(components, stockout, details = {}) {
  const items = Object.entries(components).filter(([key]) => key !== 'base');
  const negative = items.filter(([, value]) => value < 0).sort((a, b) => a[1] - b[1]);
  const positive = items.filter(([, value]) => value > 0).sort((a, b) => b[1] - a[1]);
  const [key, value] = !stockout && negative.length ? negative[0] :
    positive[0] || negative[0] || ['base', components.base];
  return {key, value, ...details, detail:details[key] || ''};
}

function newsWeightBonus(campaign, headline, support, clash) {
  let repeat = 0;
  for (const edition of campaign.editions.slice(-2).reverse()) {
    if (edition.issue !== campaign.week - repeat || edition.section !== headline.section) break;
    repeat++;
  }
  const lead = WEIGHT_SALES_BONUS[headline.weight ?? '轻'] * SAME_SECTION_MULTIPLIERS[repeat];
  const extra = WEIGHT_SALES_BONUS[support?.weight ?? '轻'] * SUPPORT_WEIGHT_SHARE;
  return (lead + extra) * (clash ? CLASH_WEIGHT_SHARE : 1);
}

function saleResult(campaign, story, copies) {
  const week = issueWeek(campaign.week, campaign.year);
  const channels = CHANNELS.filter(channel => campaign.active.includes(channel.id));
  const allocated = allocateCopies(channels, copies, campaign.priority);
  const key = week.date + '/' + story.id;
  const lastSold = campaign.editions.at(-1)?.sold || 0;
  const luck = (randomAt(campaign.seed, key + '/demand') - .5) * EDITION_NOISE;
  const support = getStory(campaign, campaign.support);
  const rival = rivalForWeek(campaign);
  const clash = rival.storyId === story.id;
  const weightBonus = newsWeightBonus(campaign, story, support, clash);
  const rivalStands = rivalCoverage(campaign, rival);
  const base = BASE_DEMAND + Math.min(campaign.week, EARLY_DEMAND_WEEKS) * EARLY_DEMAND_STEP + story.strength;
  const loyalty = Math.min(LOYALTY_DEMAND_CAP, Math.floor(lastSold * LOYALTY_SALES_SHARE));
  const captureLoss = -RIVAL_CAPTURE_DEMAND * campaign.market.captured.length;
  const capturedWeight = campaign.market.captured.reduce((sum, id) => sum + channelById(id).weight, 0);
  const ownWeight = channels.reduce((sum, channel) => sum + channel.weight, 0);
  const reallocated = 1 + capturedWeight * RIVAL_READER_TRANSFER / ownWeight;

  const stands = channels.map((channel, index) => {
    const printed = allocated[index];
    const local = (randomAt(campaign.seed, key + '/' + channel.id) - .5) * STAND_NOISE;
    const supportInterest = channel.interests[support?.section] || 0;
    const contest = rival.outlets.includes(channel.id) ? -(clash ? RIVAL_CLASH_DEMAND : RIVAL_SHARED_DEMAND) : 0;
    const unweighted = {base, topic:(week.tastes[story.section] || 0) + (channel.interests[story.section] || 0),
      rival:contest + captureLoss, support:Math.min(210, supportInterest * .25), luck:luck + local, loyalty};
    const baseline = Object.values(unweighted).reduce((sum, n) => sum + n, 0);
    if (weightBonus) unweighted.weight = Math.max(0, baseline) * weightBonus;
    const components = Object.fromEntries(Object.entries(unweighted).map(([key, value]) =>
      [key, value * channel.weight / 100 * reallocated]));
    const rawDemand = Object.values(components).reduce((sum, value) => sum + value, 0);
    const requests = Math.max(1, Math.round(rawDemand));
    const sold = Math.min(printed, requests);
    const stockout = printed > 0 && requests >= printed;
    const time = 495 + Math.round(495 * Math.min(1, printed / requests) ** 3);
    const minute = String(time % 60).padStart(2, '0');
    const reason = standReason(components, stockout, {section:story.section,
      topicLocal:channel.interests[story.section] || 0, topicWeek:week.tastes[story.section] || 0,
      rivalName:rival.name, rival:clash ? 'clash' : 'competing', supportSection:support?.section || ''});
    const stand = {id:channel.id, name:channel.name, printed, sold, stockout, requests, rawDemand, components, reason,
      timeMinutes:stockout ? time : null, deliveryAt:480,
      time:stockout ? Math.floor(time / 60) + ':' + minute : null, revenue:sold * (PRICE_CENTS - channel.commission)};
    stand.phone = standPhoneCall(stand, campaign.seed, key + '/' + channel.id);
    return stand;
  }).sort((a, b) => (a.timeMinutes ?? Infinity) - (b.timeMinutes ?? Infinity));
  const sold = stands.reduce((sum, stand) => sum + stand.sold, 0);
  const revenue = stands.reduce((sum, stand) => sum + stand.revenue, 0);
  return {printed:copies, sold, returned:copies - sold, revenue, stands,
    rival:{name:rival.name, title:rival.title, weight:rival.weight, outlets:rival.outlets, clash, stands:rivalStands}};
}

function reprintCost(copies) {
  return copies ? copies * REPRINT_CENTS + REPRINT_DELIVERY_CENTS : 0;
}

function reprintCalls(edition) {
  return edition.stands.filter(stand => stand.stockout && stand.requests > stand.printed).map(stand => {
    const shortage = stand.requests - stand.printed;
    const tier = shortage < 150 ? 0 : shortage < 400 ? 1 : shortage < 800 ? 2 : 3;
    const capacity = Math.floor(channelById(stand.id).cap * 1.5) - stand.printed;
    return {id:stand.id, name:stand.name, time:stand.time, tier, options:REPRINT_BATCHES.filter(n => n <= capacity)};
  });
}

function settleReprint(campaign, orders) {
  const edition = campaign.editions.at(-1);
  const finalIssue = campaign.year && campaign.phase === 'complete' && edition?.issue === yearIssueCount(campaign.year);
  if ((campaign.phase !== 'sales' && !finalIssue) || edition?.reprint !== null || !orders || typeof orders !== 'object') return null;
  const calls = reprintCalls(edition);
  if (Object.keys(orders).some(id => !calls.some(call => call.id === id && call.options.includes(orders[id])))) return null;
  const cost = calls.reduce((sum, call) => sum + reprintCost(orders[call.id] || 0), 0);
  if (cost > cashOf(campaign)) return null;

  const stands = edition.stands.map(stand => {
    const copies = orders[stand.id] || 0;
    if (!copies) return stand;
    const retention = Math.max(.12, .98 - (stand.timeMinutes - 8 * 60 - 15) / 600);
    const sold = Math.min(copies, Math.floor((stand.requests - stand.printed) * retention));
    const revenue = sold * (PRICE_CENTS - channelById(stand.id).commission);
    return {...stand, reprint:{copies, sold, returned:copies - sold, revenue}};
  });
  const reprint = stands.reduce((total, stand) => {
    if (stand.reprint) {
      total.printed += stand.reprint.copies;
      total.sold += stand.reprint.sold;
      total.revenue += stand.reprint.revenue;
    }
    return total;
  }, {printed:0, sold:0, revenue:0, cost});
  const gross = reprint.sold * PRICE_CENTS;
  const updated = {...edition, stands, reprint, sold:edition.sold + reprint.sold,
    returned:edition.returned + reprint.printed - reprint.sold, revenue:edition.revenue + reprint.revenue,
    cost:edition.cost + cost, net:edition.net + reprint.revenue - cost};
  return withEntries({...campaign, editions:[...campaign.editions.slice(0, -1), updated]}, [
    {label:'加急补印费', cents:-reprint.printed * REPRINT_CENTS},
    {label:'补送配送费', cents:reprint.printed * REPRINT_CENTS - cost},
    {label:'补印报款', cents:gross},
    {label:'补印代售费', cents:reprint.revenue - gross}
  ]);
}

function publishIssue(campaign) {
  if (campaign.phase !== 'desk' || !campaign.headline || pendingPressure(campaign) ||
      !validCopies(campaign.copies) || campaign.copies > printLimit(campaign)) return null;
  const quote = pressQuote(campaign, campaign.copies);
  const story = getStory(campaign, campaign.headline);
  if (!story || quote.total > cashOf(campaign)) return null;
  const stories = [story, getStory(campaign, campaign.support)].filter(Boolean);
  const sales = saleResult(campaign, story, campaign.copies);
  const draft = editionDraft(campaign, story);
  const adNotice = adWithdrawalNotice(campaign);
  const adInfo = adNotice ? null : draft.adInfo;
  const ad = adInfo?.paid || 0;
  const corrections = editionCorrections(campaign, stories);
  const edition = {...draft, ...sales, adInfo, adNotice, corrections, reprint:null, cost:quote.total, ad,
    weight:story.weight ?? '轻', pressure:choosePublicationPressure(campaign, stories),
    net:sales.revenue + ad - quote.total, cashBeforeSales:cashOf(campaign) - quote.total + ad};
  const gross = sales.sold * PRICE_CENTS;
  const pressure = {...campaign.pressure, credibility:credibilityAfter(campaign.pressure.credibility,
    CREDIBILITY_CHANGE.falseReport * corrections.length)};
  const updated = withEntries({...campaign, ...markAnnualOffers(campaign, new Set(stories.map(item => item.id))),
    phase:'sales', cover:null, pressure, editions:[...campaign.editions, edition]},
    [...quote.expenses, {label:adInfo ? '广告 · ' + adInfo.name : '版面广告', cents:ad},
      {label:'首日报款', cents:gross}, {label:'渠道代售费', cents:sales.revenue - gross}]);
  const settled = reprintCalls(edition).length ? updated : settleReprint(updated, {});
  return draft.issue === yearIssueCount(campaign.year) ? finishYear(settled) : settled;
}

function finishYear(campaign) {
  return applyPublicationPressure({...campaign, phase:'complete', ending:'year'}, null);
}

function annualSummary(campaign) {
  const count = campaign.ending === 'year' ? yearIssueCount(campaign.year) : campaign.week + 1;
  const curve = Array(count).fill(0);
  const weights = {重:0, 中:0, 轻:0};
  let rivalSold = 0;
  let best;
  for (const edition of campaign.editions) {
    curve[edition.issue - 1] = edition.sold;
    weights[edition.weight]++;
    if (!best || edition.sold > best.sold) best = edition;
    rivalSold += edition.rival.stands.reduce((sum, stand) => sum + stand.sold, 0);
  }
  return {curve, weights, best, rivalSold, ...annualAwardResults(campaign)};
}

function nextIssue(campaign) {
  const published = campaign.editions.at(-1);
  if (campaign.phase !== 'sales' || !published || published.reprint === null) return null;
  if (campaign.week + 1 === yearIssueCount(campaign.year)) return finishYear(campaign);
  const week = campaign.week + 1;
  const next = prepareAnnualSlate({...campaign, week, phase:'desk', headline:null, support:null,
    ad:null, originals:[], cover:null});
  return closeIfInsolvent(applyPublicationPressure(advanceMarket(next, published, week + 1), published));
}

function validEditionSales(edition, pendingAllowed) {
  if (!validCopies(edition.printed) || !Number.isInteger(edition.net) || !Array.isArray(edition.stands)) return false;
  let firstPrint = 0;
  let firstSold = 0;
  let reprintCopies = 0;
  let reprintSold = 0;
  let reprintRevenue = 0;
  let cost = 0;
  for (const stand of edition.stands) {
    const channel = channelById(stand?.id);
    if (!channel || !['printed','sold','requests'].every(key => Number.isInteger(stand[key]) && stand[key] >= 0) ||
        stand.printed > channel.cap || stand.sold !== Math.min(stand.printed, stand.requests) ||
        (stand.stockout && !Number.isInteger(stand.timeMinutes))) return false;
    firstPrint += stand.printed;
    firstSold += stand.sold;
    const result = stand.reprint;
    if (!result) continue;
    if (!stand.stockout || stand.requests <= stand.printed || !REPRINT_BATCHES.includes(result.copies) || result.copies === 0 ||
        stand.printed + result.copies > Math.floor(channel.cap * 1.5) || !Number.isInteger(result.sold) ||
        result.sold < 0 || result.sold > result.copies || result.returned !== result.copies - result.sold ||
        result.revenue !== result.sold * (PRICE_CENTS - channel.commission)) return false;
    reprintCopies += result.copies;
    reprintSold += result.sold;
    reprintRevenue += result.revenue;
    cost += reprintCost(result.copies);
  }
  if (firstPrint !== edition.printed || firstSold + reprintSold !== edition.sold ||
      edition.returned !== firstPrint + reprintCopies - edition.sold) return false;
  if (edition.reprint === null) return pendingAllowed && cost === 0 && reprintCalls(edition).length > 0;
  return edition.reprint?.printed === reprintCopies && edition.reprint.sold === reprintSold &&
    edition.reprint.revenue === reprintRevenue && edition.reprint.cost === cost;
}

function validAnnualDesk(saved) {
  const {annual, year, week, phase, editions} = saved;
  if (!CAMPAIGN_YEARS.includes(year) || !saved.newsLibrary || week >= yearIssueCount(year) ||
      !annual || !Array.isArray(annual.ids) || annual.ids.length > CANDIDATES_PER_ISSUE ||
      new Set(annual.ids).size !== annual.ids.length || !annual.availability ||
      typeof annual.availability !== 'object' || Array.isArray(annual.availability)) return false;
  const date = issueWeek(week, year).date;
  const previousIds = new Set(editions.filter(edition => edition?.issue <= week)
    .flatMap(edition => [edition.storyId, edition.supportId]));
  return annual.ids.every(id => STORIES.some(story => story.id === id && (!story.date || story.date === date)) &&
    !previousIds.has(id)) &&
    Object.entries(annual.availability).every(([id, entry]) =>
      STORIES.some(story => story.id === id) && Number.isInteger(entry?.offered) && entry.offered <= week &&
      entry.offered >= 0 && [entry.offered + 1, entry.offered + 1 + STORY_COOLDOWN_ISSUES].includes(entry.availableAt)) &&
    (phase !== 'desk' || annual.ids.every(id => (annual.availability[id]?.availableAt ?? 0) <= week));
}

function restoreCampaign(saved) {
  if (saved?.version !== SAVE_VERSION || !CAMPAIGN_YEARS.includes(saved.year)) return null;
  if (saved.market) return validSave(saved) ? closeIfInsolvent(saved) : null;
  // 保留 C 阶段 v7 的账本、已签发报纸与选稿。旧处分造成的中断可继续经营。
  const {career, ...previous} = saved;
  if (!career || !Array.isArray(previous.editions) || !Array.isArray(previous.ledger)) return null;
  const editions = previous.editions.map(edition => {
    const {penalties = [], ...record} = edition;
    const corrections = penalties.filter(item => item.storyId).map(item => ({
      storyId:item.storyId, text:cityText(item.correction, edition.city)
    }));
    return {...record, corrections};
  });
  const last = editions.at(-1);
  const yearEnd = last?.issue === yearIssueCount(saved.year);
  const ending = yearEnd ? 'year' : career.ending === 'insolvent' ? 'insolvent' : null;
  const phase = ending ? 'complete' : last?.issue === saved.week + 1 ? 'sales' : 'desk';
  let campaign = {...previous, editions, phase, ending, market:{streak:0, captured:[], lastCapture:null}};
  if (phase === 'desk' && career.missed?.includes(saved.week + 1)) {
    const prepaid = -previous.ledger.filter(row => row.issue === saved.week + 1 &&
      ['记者工资','编辑部日常'].includes(row.label)).reduce((sum, row) => sum + row.cents, 0);
    if (prepaid > 0) campaign = withEntries(campaign, [{label:'恢复出刊 · 退回本期预扣费用', cents:prepaid}]);
  }
  return validSave(campaign) ? closeIfInsolvent(campaign) : null;
}

function validMarket(campaign) {
  const {market, active, week} = campaign;
  return market && Number.isInteger(market.streak) && market.streak >= 0 && market.streak <= week &&
    Array.isArray(market.captured) && market.captured.length < CHANNELS.length &&
    new Set(market.captured).size === market.captured.length &&
    market.captured.every(id => channelById(id) && !active.includes(id)) &&
    (market.lastCapture === null || (market.captured.includes(market.lastCapture?.id) &&
      Number.isInteger(market.lastCapture.issue) && market.lastCapture.issue > 1 && market.lastCapture.issue <= week + 1 &&
      Number.isInteger(market.lastCapture.wins) && market.lastCapture.wins > 0));
}

function validSave(saved) {
  if (!saved || saved.version !== SAVE_VERSION || !normalizeCity(saved.city) || typeof saved.cityReady !== 'boolean' ||
      (saved.cityReady ? !validPaperName(saved.paperName) : saved.paperName !== null) ||
      (saved.cover != null && !validCover(saved.cover)) ||
      (saved.originals != null && !validOriginals(saved.originals)) ||
      !Number.isInteger(saved.seed) || !Number.isInteger(saved.revision) || !Number.isInteger(saved.week) || saved.week < 0 ||
      !['desk', 'sales', 'complete'].includes(saved.phase) ||
      !Array.isArray(saved.editions) || !Array.isArray(saved.briefs) || !Array.isArray(saved.stash) ||
      !validAnnualDesk(saved) || !validPressureState(saved) ||
      !Number.isInteger(saved.clock) || saved.clock < DESK_START || saved.clock > deskDeadline(saved.week, saved.year) + MAX_OVERTIME ||
      saved.briefs.length > briefLimit(saved) || new Set(saved.briefs).size !== saved.briefs.length ||
      !saved.stash.every(item => item && typeof item.id === 'string' && typeof item.title === 'string' &&
        typeof item.flash === 'string' && Array.from(item.flash).length <= 40 && typeof item.section === 'string' &&
        Number.isInteger(item.fromWeek) && item.fromWeek >= 0 && item.fromWeek <= saved.week) ||
      (saved.focus !== null ? !getStory(saved, saved.focus) : !saved.year || storySlate(saved).length > 0) ||
      (saved.headline !== null && !getStory(saved, saved.headline)) ||
      !validCopies(saved.copies) || !saved.reports ||
      (saved.support != null && !canRunSupport(saved, getStory(saved, saved.support))) ||
      !Array.isArray(saved.trips) || (saved.phase !== 'desk' && saved.trips.length > 0) ||
      !saved.trips.every((trip, index) => trip && Array.isArray(saved.staff) && saved.staff.includes(trip.reporter) &&
        getStory(saved, trip.story) && !getStory(saved, trip.story).original && !saved.reports[trip.story]?.visited &&
        Number.isInteger(trip.at) && trip.at > saved.clock && trip.at <= deskDeadline(saved.week, saved.year) + MAX_OVERTIME &&
        saved.trips.findIndex(other => other?.reporter === trip.reporter || other?.story === trip.story) === index) ||
      (saved.ad !== null && (!adById(saved.ad?.id) || !['inside','front'].includes(saved.ad.placement))) ||
      !Object.entries(saved.reports).every(([id, report]) => getStory(saved, id) && !getStory(saved, id).original &&
        report && (!report.visited || (reporterById(report.id) && ['miss','regular','scoop'].includes(report.tier))) &&
        (!report.verified || ['confirmed','deflated'].includes(report.checkResult))) ||
      !Array.isArray(saved.staff) || saved.staff.length < 1 || !saved.staff.every(reporterById) ||
      !Array.isArray(saved.active) || saved.active.length < 1 || !saved.active.every(channelById) ||
      !Array.isArray(saved.unlocked) || !saved.unlocked.every(channelById) || !saved.active.every(id => saved.unlocked.includes(id)) ||
      !Array.isArray(saved.ledger) ||
      !saved.ledger.every(row => Number.isInteger(row.cents) && Number.isInteger(row.issue)) ||
      !validMarket(saved) ||
      (saved.phase === 'complete' ? !['year','insolvent'].includes(saved.ending) : saved.ending !== null)) return false;
  if (saved.phase === 'desk' && !saved.briefs.every(id => briefCandidates(saved).some(item => item.id === id))) return false;
  if (saved.phase === 'sales' && saved.editions.at(-1)?.issue !== saved.week + 1) return false;
  if (saved.ending === 'year' && saved.editions.at(-1)?.issue !== yearIssueCount(saved.year)) return false;
  return saved.editions.every((edition, index) => Number.isInteger(edition?.issue) &&
    edition.issue > (saved.editions[index - 1]?.issue || 0) &&
    edition.issue <= saved.week + 1 && edition.date === issueWeek(edition.issue - 1, saved.year).date &&
    validPaperName(edition.paperName) &&
    (edition.cover == null || validCover(edition.cover)) &&
    (edition.nextLead == null || READER_LEADS.has(edition.nextLead)) &&
    typeof edition.title === 'string' && typeof edition.subtitle === 'string' &&
    (edition.image === null || Object.hasOwn(PHOTOS, edition.image) || LIBRARY_PHOTOS.has(edition.image)) &&
    Array.isArray(edition.body) && edition.body.length > 0 && edition.body.every(line => typeof line === 'string') &&
    edition.side && Array.isArray(edition.side.items) && Array.isArray(edition.secondary) &&
    Array.isArray(edition.corrections) && edition.corrections.every(item =>
      typeof item?.storyId === 'string' && typeof item.text === 'string') &&
    (Object.hasOwn(WEIGHT_SALES_BONUS, edition.weight) && validPublicationPressure(edition.pressure) &&
      Array.isArray(edition.replies) && edition.replies.every(item =>
        ['刊发更正','对方回应'].includes(item?.label) && typeof item.text === 'string')) &&
    validEditionSales(edition, index === saved.editions.length - 1 &&
      (saved.phase === 'sales' || (saved.year && saved.phase === 'complete' && edition.issue === yearIssueCount(saved.year)))));
}

function validOriginals(drafts) {
  return Array.isArray(drafts) && drafts.length <= ORIGINAL_LIMIT && drafts.every((draft, index) =>
    draft && /^original-[1-3]$/.test(draft.id) && drafts.findIndex(item => item?.id === draft.id) === index &&
    Array.isArray(draft.body) && draft.body.every(line => typeof line === 'string') &&
    originalFields(draft.section, draft.headline, draft.body.join('\n')));
}
