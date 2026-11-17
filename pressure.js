const PUBLICATION_PRESSURE_CHANCE = {无:0, 低:.08, 中:.25, 高:.50};
const STARTING_CREDIBILITY = 65;
const AD_WITHDRAWAL_ISSUES = 3;
const AD_WITHDRAWAL_REDUCTION = .35;
const COMPLAINT_COST_CENTS = 5500;
const PRESSURE_REVIEW_CHANCE = .65;
const CREDIBILITY_CHANGE = {correction:-8, reply:2, confirmed:9, unresolved:-3, falseReport:-10};
const AWARD_MIN_CREDIBILITY = 50;
const AWARD_NOMINATION_LIMIT = 3;
const AWARD_MISSED_LIMIT = 3;
const AWARD_TYPE_SCORE = {调查曝光:85, 风险批评:85, 社会矛盾:60, 硬新闻:35, 其他:10};
const AWARD_HEAVY_BONUS = 12;
const AWARD_CONFIRMED_RISK_BONUS = 16;

function newPressureState() {
  return {credibility:STARTING_CREDIBILITY, events:[], adUntil:0};
}

function choosePublicationPressure(campaign, stories) {
  for (const story of [...stories].sort((a, b) =>
    PUBLICATION_PRESSURE_CHANCE[b.publicationRisk ?? '无'] - PUBLICATION_PRESSURE_CHANCE[a.publicationRisk ?? '无'])) {
    const chance = PUBLICATION_PRESSURE_CHANCE[story.publicationRisk ?? '无'];
    if (!chance || randomAt(campaign.seed, campaign.year + '/' + campaign.week + '/pressure/' + story.id) >= chance) continue;
    return {storyId:story.id, title:story.title,
      ...(story.pressure || {kind:'complaint', target:'报道当事方'})};
  }
  return null;
}

function credibilityAfter(current, change) {
  return Math.max(0, Math.min(100, current + change));
}

function pendingPressure(campaign) {
  return campaign.pressure?.events.find(event => event.kind === 'government' && event.status === 'pending');
}

function applyPublicationPressure(campaign, published) {
  if (!campaign.year) return campaign;
  const issue = campaign.week + 1;
  let {credibility, events, adUntil} = campaign.pressure;
  events = events.map(event => {
    if (event.status !== 'stand' || event.reviewAt > issue && campaign.phase !== 'complete') return event;
    const confirmed = randomAt(campaign.seed, campaign.year + '/review/' + event.issue + '/' + event.storyId) <
      PRESSURE_REVIEW_CHANCE;
    const status = confirmed ? 'confirmed' : 'unresolved';
    credibility = credibilityAfter(credibility, CREDIBILITY_CHANGE[status]);
    return {...event, status, resolved:issue};
  });
  const earned = published?.pressure;
  if (earned && !events.some(event => event.issue === published.issue)) {
    events.push({...earned, issue:published.issue, arrived:issue, status:earned.kind === 'government' ? 'pending' : 'applied'});
    if (earned.kind === 'advertiser') adUntil = Math.max(adUntil, issue + AD_WITHDRAWAL_ISSUES - 1);
  }
  const next = {...campaign, pressure:{credibility, events, adUntil}};
  return earned?.kind === 'complaint' && !campaign.pressure.events.some(event => event.issue === published.issue) ?
    withEntries(next, [{label:'投诉处理 · 核对资料及通讯费', cents:-COMPLAINT_COST_CENTS}]) : next;
}

function respondToPressure(campaign, response) {
  const pending = pendingPressure(campaign);
  if (!pending || campaign.phase !== 'desk' || !['correction','stand','reply'].includes(response)) return null;
  const issue = campaign.week + 1;
  const events = campaign.pressure.events.map(event => event === pending ?
    {...event, status:response, ...(response === 'stand' ? {reviewAt:issue + 1} : {resolved:issue})} : event);
  return {...campaign, pressure:{...campaign.pressure, events,
    credibility:credibilityAfter(campaign.pressure.credibility, CREDIBILITY_CHANGE[response] ?? 0)}};
}

function adjustedAdRevenue(campaign, revenue) {
  return campaign?.pressure?.adUntil >= campaign.week + 1 ?
    Math.round(revenue * (1 - AD_WITHDRAWAL_REDUCTION)) : revenue;
}

function repliesForIssue(campaign) {
  return campaign.pressure.events.filter(event => event.resolved === campaign.week + 1 &&
    ['correction','reply'].includes(event.status)).map(event => ({
    label:event.status === 'correction' ? '刊发更正' : '对方回应',
    text:event.status === 'correction' ? '本报对《' + event.title + '》有关争议表述予以更正，待材料核齐后另报。' :
      event.target + '就《' + event.title + '》来电称，有关情况仍在核对，处理结论将另行提供。'
  }));
}

function annualAwardResults(campaign) {
  const credible = campaign.pressure.credibility >= AWARD_MIN_CREDIBILITY;
  const ranked = campaign.editions.map(edition => {
    const {storyId, issue, title, weight} = edition;
    const story = STORIES.find(item => item.id === storyId);
    const category = story?.awardType || '其他';
    const response = campaign.pressure.events.find(event => event.issue === issue && event.storyId === storyId);
    const confirmed = story?.publicationRisk === '高' && response?.status === 'confirmed';
    const corrected = response?.status === 'correction' || (edition.corrections || []).some(item => item.storyId === storyId);
    const score = AWARD_TYPE_SCORE[category] + (weight === '重' ? AWARD_HEAVY_BONUS : 0) +
      (confirmed ? AWARD_CONFIRMED_RISK_BONUS : 0);
    return {issue, title, score, corrected};
  }).sort((a, b) => b.score - a.score || a.issue - b.issue);
  const nominations = ranked.slice(0, AWARD_NOMINATION_LIMIT)
    .filter(item => credible && !item.corrected).map(item => item.title);
  const missed = ranked.slice(AWARD_NOMINATION_LIMIT, AWARD_NOMINATION_LIMIT + AWARD_MISSED_LIMIT)
    .map((item, index) => ({title:item.title, rank:AWARD_NOMINATION_LIMIT + index + 1,
      reason:item.corrected ? '刊发过更正' : !credible ? '公信力不足' : '评分排在年度提名名额之外'}));
  return {nominations, missed};
}

function validPublicationPressure(entry) {
  return entry === null || Boolean(entry && ['advertiser','government','complaint'].includes(entry.kind) &&
    STORIES.some(story => story.id === entry.storyId) && typeof entry.title === 'string' && typeof entry.target === 'string');
}

function validPressureState(campaign) {
  const state = campaign.pressure;
  if (!state || !Number.isInteger(state.credibility) || state.credibility < 0 || state.credibility > 100 ||
      !Number.isInteger(state.adUntil) || state.adUntil < 0 || !Array.isArray(state.events)) return false;
  return state.events.every((event, index) => validPublicationPressure(event) && event &&
    Number.isInteger(event.issue) && event.issue > 0 && state.events.findIndex(item => item?.issue === event.issue) === index &&
    event.arrived === event.issue + 1 && event.arrived <= campaign.week + 1 &&
    ['pending','applied','stand','correction','reply','confirmed','unresolved'].includes(event.status) &&
    (event.status !== 'stand' || event.reviewAt === event.arrived + 1));
}
