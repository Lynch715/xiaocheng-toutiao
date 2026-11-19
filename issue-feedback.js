function feedbackWeightedIndex(weights, roll) {
  let cursor = weights.reduce((sum, weight) => sum + weight, 0) * roll;
  return weights.findIndex(weight => (cursor -= weight) < 0);
}

function feedbackStoryFacts(story, slot, title) {
  return {id:story.id, slot, title, section:story.section,
    weight:story.weight ?? '轻', risk:story.publicationRisk ?? '无',
    ...(story.followUp ? {followUp:story.followUp} : {})};
}

function streetVoices(campaign, edition, stories) {
  const config = FEEDBACK_CONFIG.street;
  const past = campaign.editions.flatMap(item => item.feedback?.street || []);
  const used = new Set(past.map(line => line.id));
  const heard = new Set(past.map(line => line.text));
  const keyword = Array.from(edition.title.split(/[，、；：]/u)[0]).slice(0, config.headlineCharacters).join('');
  const headline = stories[0];
  const slots = stories.flatMap(story => Array(config.bySlot[story.slot]).fill(story));
  while (slots.length < config.minLines) slots.push(headline);
  return slots.map((story, index) => {
    const section = Object.hasOwn(STREET_VOICES, story.section) ? story.section : '民生';
    const groups = STREET_VOICES[section].map(group => group.split('｜'));
    const weights = [...config.weight[story.weight]];
    weights[2] += config.risk[story.risk] || 0;
    const key = edition.issue + '/street/' + index;
    const mood = feedbackWeightedIndex(weights, randomAt(campaign.seed, key + '/mood'));
    const moods = [mood, ...groups.keys()].filter((value, i, list) => list.indexOf(value) === i);
    const firstSpeaker = Math.floor(randomAt(campaign.seed, key + '/person') * STREET_SPEAKERS.length);
    // 先抽未出现过的原话。题材高度集中的年份，再让街坊结合自己的见报场景开口。
    for (const contextual of [false, true]) {
      for (const group of moods) {
        const lines = groups[group];
        const base = Math.floor(randomAt(campaign.seed, key + '/line') * lines.length);
        for (let offset = 0; offset < lines.length; offset++) {
          const index = (base + offset) % lines.length;
          const line = lines[index].replaceAll('{headline}', keyword);
          for (let i = 0; i < STREET_SPEAKERS.length; i++) {
            const speaker = (firstSpeaker + i) % STREET_SPEAKERS.length;
            const id = [section, group, index, speaker].join('/') + (contextual ? '/scene' : '');
            const text = contextual ? STREET_CONTEXTS[speaker] + line : line;
            if (used.has(id) || heard.has(text)) continue;
            used.add(id);
            heard.add(text);
            return {id, slot:story.slot, section, person:STREET_SPEAKERS[speaker], mood:group, text};
          }
        }
      }
    }
    // 连续数年只刊一种题材时，把当天的头条和旧话放在一起，仍能听清街坊在谈哪一期。
    const speaker = STREET_SPEAKERS[firstSpeaker];
    const line = groups[mood][index % groups[mood].length].replaceAll('{headline}',keyword);
    return {id:edition.issue + '/读报/' + index,slot:story.slot,section,person:speaker,mood,
      text:'第' + edition.issue + '期我翻到《' + keyword + '》。' + STREET_CONTEXTS[firstSpeaker] + line};
  });
}

function retailDispatch(edition) {
  return (edition.stands || []).filter(stand => stand.sold > 0 || stand.printed > 0).map(stand =>
    ({id:stand.id,name:stand.name,sold:stand.sold + (stand.reprint?.sold || 0)}));
}

function circulationChange(edition, previous, earlier, copies = item => item.sold) {
  const sold = copies(edition);
  const last = previous ? copies(previous) : 0;
  const rules = FEEDBACK_CONFIG.highlights;
  const priorRecord = earlier.findLast(item => item.feedback?.record);
  const priorHigh = earlier.reduce((high,item) => Math.max(high,copies(item)),0);
  // 要刷新实售最高值，也要和上一张纪录剪报拉开时间、销量两道间隔。
  const marked = priorRecord || earlier[0];
  const record = Boolean(marked && sold > priorHigh && edition.issue - marked.issue >= rules.recordGap &&
    sold >= copies(marked) * rules.recordFactor);
  return {sold,percent:last > 0 ? (sold - last) * 100 / last : null,record};
}

function firstIssueFeedback(campaign, edition, headline) {
  const stories = [feedbackStoryFacts(headline, 'headline', edition.title), ...edition.secondary.flatMap(side => {
    const story = getStory(campaign, campaign[side.slot]);
    return story ? [feedbackStoryFacts(story, side.slot, side.title)] : [];
  })];
  return {stories, street:streetVoices(campaign, edition, stories)};
}

function pageScore(campaign, edition, stories) {
  const rules = FEEDBACK_CONFIG.score;
  const bySlot = new Map(stories.map(story => [story.slot, story]));
  let news = Math.round(Object.entries(rules.slots).reduce((sum, [slot, weight]) =>
    sum + weight * (rules.news[bySlot.get(slot)?.weight] || 0), 0));
  const weightSum = stories.reduce((sum, story) => sum + rules.slots[story.slot], 0);
  let safety = Math.round(stories.reduce((sum, story) =>
    sum + rules.slots[story.slot] * rules.safe[story.risk], 0) / (weightSum || 1));
  if (roundEnabled(campaign)) {
    for (const story of stories) {
      const reporter = signingReporter(campaign,story);
      if (!reporter) continue;
      const starting = reporterById(reporter.id);
      const share = rules.slots[story.slot];
      news += (reporter.write - starting.write) * FEEDBACK_CONFIG.career.writeScore * share;
      safety += (reporter.verify - starting.verify) * FEEDBACK_CONFIG.career.verifyScore * share;
    }
    news = Math.min(100,Math.round(news));
    safety = Math.min(100,Math.round(safety));
  }
  const variety = rules.mix[new Set(stories.map(story => story.section)).size] ?? 0;
  const history = campaign.editions.filter(item => item.issue < edition.issue);
  const previous = history.slice(Math.max(0, history.length + 1 - rules.weeks));
  const sections = [...previous.flatMap(item => item.feedback?.stories?.map(story => story.section) || [item.section]),
    ...stories.map(story => story.section)];
  const counts = new Map();
  for (const section of sections) counts.set(section, (counts.get(section) || 0) + 1);
  const entropy = [...counts.values()].reduce((sum, count) => {
    const fraction = count / sections.length;
    return sum - fraction * Math.log(fraction);
  }, 0);
  const balance = Math.min(100, Math.round(100 * entropy / Math.log(Math.min(rules.balancedTopics, Math.max(2, sections.length)))));
  const parts = {news, variety, balance, safety};
  const total = Math.round(Object.entries(rules.weights).reduce((sum, [key, weight]) => sum + parts[key] * weight, 0));
  return {...parts, total, grade:rules.grades.find(([, threshold]) => total >= threshold)[0]};
}

function issueReaderMail(campaign, edition, stories, score) {
  const rules = FEEDBACK_CONFIG.readers;
  const draw = key => randomAt(campaign.seed, edition.issue + '/mail/' + key);
  const count = rules.counts[Math.floor(draw('count') * rules.counts.length)];
  const sources = READER_MAIL_SOURCES;
  const firstMood = score.total < rules.badScore ? 2 : 0;
  const extraMood = score.total >= rules.goodScore ? 0 : score.total < rules.badScore ? 2 : 1;
  const lines = [];
  for (let i = 0; i < count; i++) {
    const story = stories[i % stories.length];
    const library = (READER_MAIL[story.section] || READER_MAIL.民生).split('｜');
    const doubt = story.risk === rules.highRisk && draw(i + '/doubt') < rules.highRiskChance;
    const mood = i === 0 ? firstMood : i === 1 ? 2 - firstMood : doubt ? 2 : extraMood;
    const [start, end] = rules.toneRanges[mood];
    const candidates = library.slice(start, end).filter(line => !lines.some(item => item.text === line));
    const pool = candidates.length ? candidates : library.slice(start, end);
    const n = Math.floor(draw(i + '/text') * pool.length);
    const [source, person] = sources[(Math.floor(draw('sender') * sources.length) + i) % sources.length];
    lines.push({source, person, section:story.section, mood, text:pool[n]});
  }
  if (draw('warm') < rules.warmChance) {
    const text = WARM_READER_MAIL[Math.floor(draw('warm-text') * WARM_READER_MAIL.length)];
    lines[lines.findIndex(line => line.mood === 0)] = {source:'读者来信', person:'一位老读者', mood:0, warm:true, text};
  }
  return lines;
}

function issueSyndication(campaign, edition, stories) {
  const rules = FEEDBACK_CONFIG.syndication;
  const influence = campaign.editions.at(-1)?.feedback?.influence?.level ?? 0;
  return stories.flatMap(story => {
    const weight = rules.weight[story.weight];
    if (weight < rules.minWeight) return [];
    const reporter = roundEnabled(campaign) ? signingReporter(campaign,story) : null;
    const contacts = reporter ? (reporter.reach - reporterById(reporter.id).reach) * FEEDBACK_CONFIG.career.reachReprint : 0;
    const outlets = rules.outlets.filter(([name, unlock, required, chance]) =>
      influence >= unlock && weight >= required &&
      randomAt(campaign.seed, edition.issue + '/syndication/' + story.slot + '/' + name) < chance + contacts).map(([name]) => name);
    return outlets.length ? [{id:story.id, slot:story.slot, title:story.title, outlets}] : [];
  });
}

function cityBenchmark(campaign, edition, earlier) {
  const modern = roundEnabled(campaign);
  const rules = modern ? {...FEEDBACK_CONFIG.rival,...FEEDBACK_CONFIG.careerRival} : FEEDBACK_CONFIG.rival;
  const priorYear = earlier.at(-1);
  const spring = modern && priorYear && priorYear.date.slice(0,4) !== edition.date.slice(0,4);
  if (modern) earlier = earlier.filter(item => item.date.slice(0,4) === edition.date.slice(0,4));
  const previous = earlier.at(-1)?.feedback?.rival;
  if (previous?.closed) return {...previous,sold:0,ratio:0,headline:null,events:[]};
  const previousRatios = [...earlier.slice(Math.max(0, earlier.length + 1 - rules.leadWeeks)).map(item => item.feedback?.rival?.ratio ?? 1)];
  const trend = ratio => [...previousRatios, ratio];
  const draw = key => randomAt(campaign.seed, edition.issue + '/benchmark/' + key);
  // 对标销量以对手当期真实铺货回单为底，再叠加季节与早期增长，避免同一家报纸出现两套数字。
  const real = (edition.rival?.stands || []).reduce((sum, stand) => sum + (stand.baseSold ?? stand.sold), 0);
  const base = Math.round((real || rules.base) + Math.sin(2 * Math.PI * earlier.length / yearIssueCount(Number(edition.date.slice(0,4)))) * rules.season +
    Math.min(earlier.length, rules.earlyWeeks) * rules.earlyGrowth + (draw('swing') * 2 - 1) * rules.swing);
  const priorAdjustment = previous?.adjustment || 0;
  const trialRatio = edition.sold / Math.max(1, base + priorAdjustment);
  const consecutive = test => previousRatios.length === rules.leadWeeks - 1 && trend(trialRatio).every(test);
  const adjustment = Math.max(-rules.maxLoss, Math.min(rules.maxGain, priorAdjustment +
    (consecutive(ratio => ratio >= rules.leadRatio) ? -rules.weaken : consecutive(ratio => ratio < rules.slumpRatio) ? rules.recover : 0)));
  const sold = Math.max(1, base + adjustment);
  const ratio = edition.sold / sold;
  const wins = ratio >= rules.thinRatio ? (previous?.wins || 0) + 1 : 0;
  const strong = ratio >= rules.closeRatio ? (previous?.strong || 0) + 1 : 0;
  const events = spring ? [priorYear.feedback?.rival?.closed ? 'entry' : 'spring'] : [];
  const milestones = {...previous?.milestones};
  for (const [key, achieved] of [
    ['overtake', edition.sold > sold], ['redesign', ratio >= rules.redesignRatio], ['thin', wins >= rules.thinWeeks],
    ['close', earlier.length + 1 >= rules.earliestClose && strong >= rules.closeWeeks && Boolean(milestones.thin || wins >= rules.thinWeeks)]
  ]) {
    if (achieved && !milestones[key]) {
      milestones[key] = edition.issue;
      events.push(key);
    }
  }
  const headline = draw('news') < rules.headlineChance ? (modern ? edition.rival?.title :
    BENCHMARK_HEADLINES[Math.floor(draw('headline') * BENCHMARK_HEADLINES.length)]) || null : null;
  return {sold, ratio, adjustment, wins, strong, closed:Boolean(milestones.close), milestones, events, headline};
}

function advertiserQuote(campaign, edition, earlier) {
  const rules = FEEDBACK_CONFIG.walkIn;
  if (edition.issue >= campaignIssueCount(campaign)) return null;
  const last = [...earlier, edition].slice(-rules.weeks);
  if (last.length < rules.weeks) return null;
  const average = last.reduce((sum, item) => sum + item.sold, 0) / rules.weeks;
  const draw = key => randomAt(campaign.seed, edition.issue + '/walkin/' + key);
  if (average <= rules.minAverage || draw('chance') >= rules.chance) return null;
  const {id} = WALK_IN_ADVERTISERS[Math.floor(draw('ad') * WALK_IN_ADVERTISERS.length)];
  return {id, slot:draw('slot') < rules.supportChance ? 'support' : 'third', cents:
    Math.round((rules.minimumCents + (average - rules.minAverage) * rules.centsPerCopy) / rules.roundTo) * rules.roundTo};
}

function incomingQuote(campaign) {
  return campaign?.editions?.findLast(edition => edition.issue === campaign.week)?.feedback?.quote ?? null;
}

function slotOfferAllowed(campaign, slot, id) {
  const quote = incomingQuote(campaign);
  return issueAdOffers(campaign.week).includes(id) || (quote?.slot === slot && quote.id === id);
}

function salesFeedback(campaign, edition) {
  const earlier = campaign.editions.filter(item => item.issue < edition.issue);
  const feedback = {...edition.feedback, rival:cityBenchmark(campaign, edition, earlier),
    quote:edition.feedback.quote?.accepted ? edition.feedback.quote : advertiserQuote(campaign, edition, earlier)};
  let signed = {...edition, feedback};
  // 本报和对手各用一张回单。将对手竞争、季节带来的销量变化落实到每个实际铺售网点。
  if (edition.rival?.stands?.length && roundEnabled(campaign)) {
    const original = edition.rival.stands.map(stand => ({...stand,baseSold:stand.baseSold ?? stand.sold}));
    const total = original.reduce((sum,stand) => sum + stand.baseSold,0);
    let carry = 0;
    const stands = original.map(stand => {
      const before = Math.round(carry);
      carry += total ? feedback.rival.sold * stand.baseSold / total : 0;
      return {...stand,sold:Math.round(carry) - before};
    });
    signed = {...signed,rival:{...edition.rival,stands}};
  }
  const awards = isAnnualIssue(campaign,edition.issue) ?
    annualAwardResults({...campaign,editions:[...earlier,signed],pressure:{...campaign.pressure,credibility:feedback.trust}}) : null;
  const growth = longTermFeedback(earlier,signed,awards);
  const record = circulationChange({...signed, feedback:{...feedback,...growth}},earlier.at(-1),earlier,issueCirculation).record;
  const press = pressBreakthrough(signed,earlier,record);
  return {...signed,feedback:{...feedback,...growth,...(awards ? {awards} : {}),record,...press}};

}

function pressBreakthrough(edition,earlier,record) {
  const rules = FEEDBACK_CONFIG.highlights;
  const allSold = Boolean(edition.stands?.length && edition.stands.every(stand => stand.printed > 0 && stand.sold === stand.printed));
  const rival = edition.feedback.rival;
  const recent = earlier.slice(-rules.leadLookback).filter(item =>
    item.rival?.name === edition.rival?.name && item.date.slice(0,4) === edition.date.slice(0,4));
  const overtake = rival.sold > 0 && rival.ratio >= rules.largeLead &&
    recent.some(item => item.feedback?.rival?.sold > item.sold) &&
    !recent.some(item => item.feedback?.rival?.ratio >= rules.largeLead);
  // 售罄只有在敢印、又卖出近期新高时才算爆款，少印卖光不算；两次爆款之间留出间隔。
  const sold = edition.stands?.reduce((sum, stand) => sum + stand.sold, 0) ?? 0;
  const printed = edition.stands?.reduce((sum, stand) => sum + stand.printed, 0) ?? 0;
  const averageSold = earlier.slice(-rules.selloutAverageWeeks).reduce((sum, item) => sum + item.sold, 0) /
    Math.max(1, Math.min(rules.selloutAverageWeeks, earlier.length));
  const peak = Math.max(0, ...earlier.slice(-rules.selloutPeakWeeks).map(item => item.sold));
  const lastHit = earlier.findLast(item => item.feedback?.hitReasons?.includes('sellout'));
  const bold = earlier.length > 0 && printed >= averageSold * rules.selloutBold && sold >= peak &&
    (!lastHit || edition.issue - lastHit.issue >= rules.selloutGap);
  const hitReasons = [allSold && bold && 'sellout',record && 'record',overtake && 'overtake'].filter(Boolean);
  return {allSold,hitReasons,pressHit:hitReasons.length > 0};
}

function buildIssueFeedback(campaign, edition, headline, credibility) {
  const {stories, street} = firstIssueFeedback(campaign, edition, headline);
  const score = pageScore(campaign, edition, stories);
  const followUps = dueReportFollowUps(campaign, edition);
  const trust = credibilityAfter(credibility, followUps.reduce((sum, item) => sum + item.reputation, 0));
  const feedback = {stories,street,score,trust,mail:issueReaderMail(campaign,edition,stories,score),
    syndication:issueSyndication(campaign,edition,stories),followUps};
  if (roundEnabled(campaign)) {
    feedback.extra = extraResult(campaign,edition);
    feedback.meeting = meetingAfterIssue(campaign,edition,stories,trust);
    feedback.trust = credibilityAfter(trust,feedback.meeting.rewards.trust);
    feedback.coverage = coverageFor(campaign,edition);
    feedback.networkChanges = campaign.ledger.filter(row => row.issue === edition.issue &&
      /^(网点升级|开拓网点|开拓渠道)/u.test(row.label)).map(row =>
      ({kind:row.label.startsWith('网点升级') ? 'upgrade' : 'opened',text:row.label.replace('开拓渠道','开拓网点')}));
    feedback.reporters = reportersAfterIssue(campaign,{...edition,feedback});
  }
  return salesFeedback(campaign,{...edition,feedback});
}

function dueReportFollowUps(campaign, edition) {
  return campaign.editions.filter(item => item.issue < edition.issue).flatMap(printed =>
    (printed.feedback?.stories || []).flatMap(story => {
      const later = story.followUp;
      if (!later || printed.issue + later.delayWeeks !== edition.issue) return [];
      return [{...later, text:cityText(later.text, printed.city), issue:printed.issue,
        storyId:story.id, slot:story.slot, title:story.title, section:story.section, date:printed.date}];
    }));
}

function followUpReputation(edition) {
  return (edition.feedback?.followUps || []).reduce((sum, item) => sum + item.reputation, 0);
}

function issueCirculation(edition) {
  return edition.sold + (edition.feedback?.subscribers?.count ?? 0);
}

function issueSyndicationCount(edition) {
  return (edition.feedback?.syndication || []).reduce((sum, item) => sum + item.outlets.length, 0);
}

function influenceLevel(points) {
  return FEEDBACK_CONFIG.influence.levels.findLastIndex(([, threshold]) => points >= threshold);
}

function subscriberResult(previous, edition) {
  const rules = FEEDBACK_CONFIG.subscribers;
  const data = edition.feedback;
  const prior = previous?.feedback?.subscribers;
  const grade = data.score.grade;
  const complaints = (data.followUps || []).filter(item => item.type === 'negative').length;
  const poor = grade === rules.poorGrade ? (prior?.poor ?? 0) + 1 : 0;
  const loss = complaints * rules.complaintLoss + (poor >= rules.poorWeeks ? rules.poorLoss : 0);
  const growth = Math.max(rules.minGrowth, Math.round(rules.gradeGain[grade] + (data.trust - rules.neutralTrust) * rules.trustFactor));
  const count = prior?.count ?? rules.initial;
  // 集体订报按代收网点当期实售计，不再按订户总数复利滚动，避免订户指数式暴涨。
  const groupSold = (edition.stands || []).filter(stand => rules.groupChannels.includes(stand.id))
    .reduce((sum, stand) => sum + stand.sold, 0);
  const confidence = Math.max(0, Math.min(1, (data.trust - rules.groupTrustFloor) / (rules.groupTrustFull - rules.groupTrustFloor)));
  const groupGain = loss ? 0 : Math.min(rules.maxGroupGain, Math.floor(groupSold * rules.groupRate[grade] * confidence));
  const delta = (loss ? -Math.min(count,loss,rules.maxLoss) : growth + groupGain) + (data.extra?.subscribers || 0);
  return {count:count + delta, delta, poor, groupGain};
}

function readerProfile(earlier, edition) {
  const rules = FEEDBACK_CONFIG.profile;
  const month = edition.date.slice(0, 7);
  if (earlier.at(-1)?.date.slice(0, 7) === month) return null;
  const sections = [...earlier, edition].slice(-rules.weeks).flatMap(item =>
    item.feedback?.stories?.map(story => story.section) || [item.section]);
  const groups = [...new Set(sections)].map(section => {
    const rate = sections.filter(value => value === section).length * 100 / sections.length;
    return {section, percent:Math.floor(rate), remainder:rate % 1};
  });
  const remaining = 100 - groups.reduce((sum, item) => sum + item.percent, 0);
  [...groups].sort((a, b) => b.remainder - a.remainder).slice(0, remaining).forEach(item => item.percent++);
  const rows = groups.map(({section, percent}) => ({section, percent})).sort((a, b) => b.percent - a.percent);
  const prior = earlier.findLast(item => item.feedback?.profile)?.feedback.profile;
  const changes = [...new Set([...rows.map(row => row.section), ...(prior?.rows || []).map(row => row.section)])]
    .map(section => ({section, delta:(rows.find(row => row.section === section)?.percent ?? 0) -
      (prior?.rows.find(row => row.section === section)?.percent ?? 0)}))
    .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return {month, rows, change:prior && Math.abs(changes[0]?.delta) >= rules.notableChange ? changes[0] : null};
}

function feedbackBadgeDefinitions() {
  const {growthStreaks, gradeStreaks, calmStreaks, circulation, reward} = FEEDBACK_CONFIG.badges;
  const lines = (key, values, name, description) => values.map(value =>
    ({key:key + ':' + value, name:name(value), description:description(value), reward:reward[key]}));
  return [
    ...lines('growth', growthStreaks, n => n + ' 周连涨', n => '连续 ' + n + ' 周零售销量上涨'),
    ...lines('grade', gradeStreaks, n => n + ' 周好版面', n => '连续 ' + n + ' 周版面评分 A 级或以上'),
    ...lines('calm', [...calmStreaks,...FEEDBACK_CONFIG.longBadges.calm], n => n + ' 周无异议', n => '连续 ' + n + ' 周未收到负面报道后续'),
    ...lines('circulation', [...circulation,...FEEDBACK_CONFIG.longBadges.circulation], n => '单期破 ' + n / 10000 + ' 万', n => '单期零售与订户合计突破 ' + n + ' 份'),
    ...[
      ['extra','第一张号外','首次刊出号外'],['extra-sold','号外全卖光','一期号外售罄'],
      ['station-three','第一座发行站','首次把网点升为发行站'],['all-kiosks','全城报刊亭','十一个网点都升到二级以上'],
      ['half-city','满城报声','覆盖过半城区街区'],['whole-city','走遍全城','覆盖所有可送报的城区街区'],
      ['three-routes','三路会师','打通大学城、乡镇供销站和省城三条发行线'],
      ['all-contested','夺下争夺街区','在所有同点铺报的网点赢过对手'],
      ['nine-counties','九县传阅','全省九个县市都有读者'],['all-rail','铁路沿线全亮','全国铁路沿线均有读者'],
      ['meeting','例会满堂红','一个月完成全部三项目标']
    ].map(([key,name,description]) => ({key,name,description,reward:FEEDBACK_CONFIG.longBadges.reward})),
    {key:'syndicated', name:'同行看见了', description:'稿件首次被同行转载', reward:reward.syndicated},
    {key:'national', name:'见于央媒', description:'稿件首次被央媒转载', reward:reward.national},
    {key:'overtake', name:'同城反超', description:'零售销量首次超过同城对手', reward:reward.overtake},
    {key:'closed', name:'独占全城', description:'同城对手宣布停刊', reward:reward.closed},
    ...lines('influence', FEEDBACK_CONFIG.influence.levels.map((_, index) => index).slice(1),
      n => '影响力 · ' + FEEDBACK_CONFIG.influence.levels[n][0], n => '影响力达到' + FEEDBACK_CONFIG.influence.levels[n][0])
  ];
}

function longTermFeedback(earlier, edition, awards = null) {
  const data = edition.feedback;
  const last = earlier.at(-1);
  const subscribers = data.subscribers ?? subscriberResult(last, edition);
  const circulation = edition.sold + subscribers.count;
  const rules = FEEDBACK_CONFIG.influence;
  const before = last?.feedback?.influence?.points ?? 0;
  const signals = {
    sales:Math.min(rules.maxBasePoints, Math.floor(circulation / rules.copiesPerPoint)) +
      Math.min(rules.maxBoostPoints, Math.floor(Math.max(0, circulation - rules.boostStart) / rules.boostCopiesPerPoint)) +
      Math.min(rules.maxRetailPoints, Math.floor(Math.max(0, edition.sold - rules.retailBoostStart) / rules.retailBoostCopies)),
    syndication:issueSyndicationCount(edition) * rules.syndicationPoints,
    followUps:(data.followUps || []).reduce((sum, item) => sum + item.influence, 0),
    awards:(awards?.nominations.length ?? 0) * rules.awardPoints,
    winner:awards?.winner ? rules.winnerPoints : 0
  };
  const modern = Boolean(data.coverage);
  let carry = last?.feedback?.influence?.carry || 0;
  if (modern) {
    const change = FEEDBACK_CONFIG.careerInfluence;
    // 不足一点的发行与转载贡献结转到下期，避免长期办本地小报总是被取整。
    const editorial = issueSyndicationCount(edition) * change.syndicationPoints * change.yearScale;
    const retail = change.base + Math.min(change.maxRetailPoints,edition.sold / change.retailUnit) +
      Math.min(change.maxSubPoints,subscribers.count / change.subUnit) +
      Math.max(0,Object.keys(data.coverage.active).length - 4) * change.expansionPoints;
    const fractional = carry + retail * change.yearScale + editorial;
    signals.syndication = Math.floor(editorial);
    signals.sales = Math.floor(fractional) - signals.syndication;
    carry = Number((fractional - Math.floor(fractional)).toFixed(5));
    signals.followUps = Math.round(signals.followUps * change.followupFactor);
    signals.awards = (awards?.nominations.length || 0) * change.awardPoints;
    signals.winner = awards?.winner ? change.winnerPoints : 0;
    signals.extra = data.extra?.influence || 0;
    signals.meeting = data.meeting.rewards.influence;
  }
  let points = Math.max(0,before + Object.values(signals).reduce((sum,n) => sum + n,0));
  const national = rules.levels.at(-1)[1];
  if (modern && before < national && points >= national &&
      Object.keys(data.coverage.active).length < FEEDBACK_CONFIG.network.minNationalStands) {
    signals.local = national - 1 - points;
    points = national - 1;
  }
  const level = influenceLevel(points);
  const previousLevel = last?.feedback?.influence?.level ?? 0;
  const previousStreak = last?.feedback?.streaks || {};
  const streaks = {
    growth:last && edition.sold > last.sold ? (previousStreak.growth || 0) + 1 : 0,
    grade:FEEDBACK_CONFIG.badges.goodGrades.includes(data.score.grade) ? (previousStreak.grade || 0) + 1 : 0,
    calm:!(data.followUps || []).some(item => item.type === 'negative') ? (previousStreak.calm || 0) + 1 : 0
  };
  const milestones = FEEDBACK_CONFIG.badges;
  const past = new Set(earlier.flatMap(item => item.feedback?.badges || []));
  const badges = [
    ...[['growth',milestones.growthStreaks], ['grade',milestones.gradeStreaks], ['calm',modern ? [...milestones.calmStreaks,...FEEDBACK_CONFIG.longBadges.calm] : milestones.calmStreaks]]
      .flatMap(([key, values]) => values.filter(value => streaks[key] >= value).map(value => key + ':' + value)),
    ...(modern ? [...milestones.circulation,...FEEDBACK_CONFIG.longBadges.circulation] : milestones.circulation).filter(value => circulation > value).map(value => 'circulation:' + value),
    ...(modern ? roundBadges(edition,points) : []),
    ...(data.syndication.length ? ['syndicated'] : []),
    ...(data.syndication.some(item => item.outlets.includes(FEEDBACK_CONFIG.syndication.outlets.at(-1)[0])) ? ['national'] : []),
    ...(data.rival.events.includes('overtake') ? ['overtake'] : []),
    ...(data.rival.events.includes('close') ? ['closed'] : []),
    ...rules.levels.map((_, index) => index).filter(index => index > 0 && index <= level).map(index => 'influence:' + index)
  ].filter(key => !past.has(key));
  return {subscribers, circulation, influence:{points, level, signals, ...(modern ? {carry} : {}), promoted:level > previousLevel}, streaks, badges,
    profile:readerProfile(earlier, edition)};
}

function reportData(campaign) {
  const editions = campaign.editions;
  const latest = editions.at(-1)?.feedback;
  const total = editions.reduce((sum, edition) => sum + issueCirculation(edition), 0);
  const best = editions.reduce((highest, edition) =>
    !highest || issueCirculation(edition) > issueCirculation(highest) ? edition : highest, null);
  const followUps = editions.flatMap(edition => edition.feedback?.followUps || []);
  const impact = item => item.influence * FEEDBACK_CONFIG.annual.impactWeight + item.reputation * FEEDBACK_CONFIG.annual.reputationWeight;
  const most = followUps.filter(item => item.type === 'positive').sort((a, b) =>
    impact(b) - impact(a) || a.issue - b.issue)[0];
  const syndication = editions.reduce((sum, edition) => sum + issueSyndicationCount(edition), 0);
  const rivalTotal = editions.reduce((sum, issue) => sum + (issue.feedback?.rival?.sold || 0), 0);
  const rival = latest?.rival;
  const profile = editions.findLast(edition => edition.feedback?.profile)?.feedback.profile;
  const level = latest?.influence?.level ?? 0;
  const titles = [];
  if (campaign.ending === 'year') {
    if (rival?.closed) titles.push(rivalPaperName(campaign) + '终结者');
    if (level >= FEEDBACK_CONFIG.annual.provincialTitleLevel &&
        soldOf(campaign) >= rivalTotal * FEEDBACK_CONFIG.annual.leadingRetailRatio) titles.push('全省第一都市报');
  }
  return {total, best, most, syndication, followUps:followUps.length, rival, rivalTotal, profile, titles,
    subscribers:latest?.subscribers?.count ?? FEEDBACK_CONFIG.subscribers.initial,
    influence:latest?.influence ?? {points:0, level:0}};
}

function restoreIssueFeedback(campaign) {
  if (campaign.editions.every(edition => edition.feedback?.influence)) {
    const last = campaign.editions.at(-1);
    if (campaign.ending === 'year' && last && last.feedback.influence.signals.winner == null) {
      return {...campaign, editions:[...campaign.editions.slice(0, -1), salesFeedback(campaign, last)]};
    }
    return campaign;
  }
  // 用合订本重建显示数据；过去的账目、刊后处分和口碑不改写。
  const editions = [];
  for (const entry of campaign.editions) {
    if (entry.feedback?.influence) {
      editions.push(entry);
      continue;
    }
    const prior = {...campaign, editions};
    const recoverStory = (id, slot, title, section, weight) => {
      const story = STORIES.find(item => item.id === id);
      return feedbackStoryFacts(story || {id, section, weight}, slot, title);
    };
    const fallback = [recoverStory(entry.storyId, 'headline', entry.title, entry.section, entry.weight)];
    for (const [index, item] of entry.secondary.entries()) {
      const slot = item.slot || SECONDARY_SLOTS[index];
      const id = slot === 'third' ? entry.thirdId : entry.supportId;
      if (id) fallback.push(recoverStory(id, slot, item.title, entry.section, '轻'));
    }
    const old = entry.feedback || {};
    const stories = old.stories || fallback;
    const score = old.score || pageScore(prior, entry, stories);
    const feedback = {...old, stories, score,
      street:old.street || streetVoices(prior, entry, stories),
      mail:old.mail || issueReaderMail(prior, entry, stories, score),
      syndication:old.syndication || issueSyndication(prior, entry, stories),
      followUps:old.followUps || dueReportFollowUps(prior, entry),
      trust:old.trust ?? campaign.pressure.credibility};
    editions.push(salesFeedback(prior, {...entry, feedback}));
  }
  return {...campaign, editions};
}

// 老合订本按原订的刊期读到年末；三年制从创刊号开始记录设备、记者和月度例会。
function roundEnabled(campaign) {
  return Boolean(campaign?.year && campaignIssueCount(campaign) > 53);
}

function roundDefaults(campaign) {
  return {equipment:0, channelGrades:{}, extraOrder:null, ...campaign};
}

function validRoundState(campaign) {
  const {equipment = 0, channelGrades = {}, extraOrder = null} = campaign;
  return Number.isInteger(equipment) && equipment >= 0 && equipment <= FEEDBACK_CONFIG.equipment.items.length &&
    channelGrades && typeof channelGrades === 'object' && !Array.isArray(channelGrades) &&
    Object.entries(channelGrades).every(([id, grade]) => campaign.unlocked?.includes(id) &&
      Number.isInteger(grade) && grade >= 1 && grade <= FEEDBACK_CONFIG.network.names.length) &&
    (!extraOrder || Number.isInteger(extraOrder.issue) && extraOrder.issue > 0 && extraOrder.issue <= campaign.week + 1 &&
      (extraOrder.copies === 0 || FEEDBACK_CONFIG.extra.batches.includes(extraOrder.copies)) &&
      FEEDBACK_CONFIG.extra.events.some(event => event.date === issueWeek(extraOrder.issue - 1,campaign).date));
}

function channelGrade(campaign, id) { return campaign.channelGrades?.[id] ?? 1; }

function channelRadius(campaign, id) { return FEEDBACK_CONFIG.network.radii[channelGrade(campaign, id) - 1]; }

function effectiveChannel(campaign, id) {
  const channel = channelById(id);
  const index = channelGrade(campaign, id) - 1;
  if (!index || !channel) return channel;
  const rules = FEEDBACK_CONFIG.network;
  return {...channel, cap:Math.round(channel.cap * rules.cap[index]), weight:channel.weight * rules.weight[index]};
}

function upgradeCost(campaign, id) {
  const grade = channelGrade(campaign, id);
  const rate = FEEDBACK_CONFIG.network.costPerWeight[grade - 1];
  return channelById(id) && rate ? Math.round(channelById(id).weight * rate) : 0;
}

function upgradeChannel(campaign, id) {
  if (!roundEnabled(campaign) || campaign.phase !== 'desk' || !campaign.active.includes(id)) return null;
  const cost = upgradeCost(campaign, id);
  if (!cost || cost + minimumViablePressCost(campaign) > cashOf(campaign)) return null;
  return withEntries({...campaign, channelGrades:{...campaign.channelGrades,[id]:channelGrade(campaign, id) + 1}},
    [{label:'网点升级 · ' + channelById(id).name,cents:-cost}]);
}

function buyEquipment(campaign) {
  const level = campaign.equipment || 0;
  const item = FEEDBACK_CONFIG.equipment.items[level];
  if (!roundEnabled(campaign) || campaign.phase !== 'desk' || !item || cashOf(campaign) < item.cost + minimumViablePressCost(campaign)) return null;
  return withEntries({...campaign,equipment:level + 1}, [{label:'设备 · ' + item.name,cents:-item.cost}]);
}

const EQUIPMENT_EFFECTS = FEEDBACK_CONFIG.equipment.items.reduce((levels, item) => {
  levels.push({...levels.at(-1), ...item.effects});
  return levels;
}, [{}]);

function equipmentEffects(owner) {
  return EQUIPMENT_EFFECTS[owner.equipment ?? 0] ?? EQUIPMENT_EFFECTS[0];
}

function equipmentPrintLimit(campaign) {
  return equipmentEffects(campaign).maxCopies ?? MAX_PRINT;
}
function equipmentBatches(edition) {
  return equipmentEffects(edition).reprintBatches ?? REPRINT_BATCHES;
}
function equipmentPhotoBonus(campaign, layout) {
  return layout === 'photo' ? equipmentEffects(campaign).photoBonus ?? 0 : 0;
}

function specialEventFor(campaign) {
  if (!roundEnabled(campaign)) return null;
  const date = issueWeek(campaign.week,campaign).date;
  return FEEDBACK_CONFIG.extra.events.find(event => event.date === date) || null;
}

function extraCost(copies) {
  const rules = FEEDBACK_CONFIG.extra;
  return copies ? copies * rules.printCents + rules.deliveryCents : 0;
}

function orderExtra(campaign, copies) {
  if (campaign.phase !== 'desk' || !specialEventFor(campaign) || campaign.extraOrder?.issue === campaign.week + 1 ||
      copies !== 0 && !FEEDBACK_CONFIG.extra.batches.includes(copies)) return null;
  const cost = extraCost(copies);
  if (cost && cashOf(campaign) < cost + minimumViablePressCost(campaign)) return null;
  return withEntries({...campaign,extraOrder:{issue:campaign.week + 1,copies}},
    [{label:'号外印刷配送',cents:-cost}]);
}

function extraResult(campaign, edition) {
  const event = specialEventFor(campaign);
  if (!event) return null;
  const rules = FEEDBACK_CONFIG.extra;
  const copies = campaign.extraOrder?.issue === edition.issue ? campaign.extraOrder.copies : 0;
  const demand = rules.baseDemand + campaign.active.length * rules.readersPerStand +
    Math.floor(randomAt(campaign.seed,event.date + '/extra') * rules.demandSwing);
  const sold = Math.min(copies,demand);
  return {...event,issue:edition.issue,copies,sold,cost:extraCost(copies),revenue:sold * rules.priceCents,
    subscribers:Math.floor(sold / rules.copiesPerSubscriber),influence:Math.floor(sold / rules.copiesPerPoint),
    rival:!copies && !rivalHasClosed(campaign) && randomAt(campaign.seed,event.date + '/extra/rival') < rules.rivalChance};
}

let deliveryGround, deliveryRings;
function cityDeliveryCells() {
  if (deliveryGround) return deliveryGround;
  const rules = FEEDBACK_CONFIG.network;
  const rings = new Map();
  const ground = [];
  for (let row = 0; row < rules.height; row++) for (let col = 0; col < rules.width; col++) {
    if (col === 10 && row !== 0 && row !== 7) continue;
    const cell = [col,row];
    const distances = Object.entries(CHANNEL_HEX).map(([id,hex]) => [id,hexDistance(hex,cell)]);
    if (!distances.some(([,n]) => n <= rules.radii.at(-1))) continue;
    const index = ground.length;
    ground.push(cell);
    for (const [id,n] of distances) {
      for (const radius of new Set(rules.radii)) {
        const key = id + '/' + radius;
        if (!rings.has(key)) rings.set(key,[]);
        if (n <= radius) rings.get(key).push(index);
      }
    }
  }
  deliveryRings = rings;
  return deliveryGround = ground;
}

function coverageFor(campaign, edition) {
  const total = cityDeliveryCells().length;
  const rules = FEEDBACK_CONFIG.network;
  const active = Object.fromEntries(campaign.active.map(id => [id,channelGrade(campaign,id)]));
  const own = new Set(campaign.active.flatMap(id => deliveryRings.get(id + '/' + channelRadius(campaign,id)) || []));
  const rival = new Set((edition.rival?.outlets || []).flatMap(id => deliveryRings.get(id + '/' + rules.radii[0]) || []));
  const contested = Array.from(own).filter(index => rival.has(index)).length;
  const count = own.size;
  const prior = campaign.editions.at(-1)?.feedback?.coverage;
  const high = Math.max(prior?.high || 0,count);
  return {active,count,total,high,contested,grades:{...campaign.channelGrades},unlocked:[...campaign.unlocked],milestone:prior && Math.floor(high / rules.step) >
    Math.floor(prior.high / rules.step) ? Math.floor(high / rules.step) * rules.step : 0};
}

function monthlyMeeting(campaign) {
  if (!roundEnabled(campaign)) return null;
  const month = issueWeek(campaign.week,campaign).date.slice(0,7);
  const prior = campaign.editions.at(-1)?.feedback?.meeting;
  if (prior?.month === month) {
    const card = prior.cards.find(item => item.kind === 'coverage');
    if (campaign.phase !== 'desk' || !card || card.done) return prior;
    const area = coverageFor(campaign,{}).count;
    const progress = Math.min(card.goal,Math.max(card.progress,area - card.start));
    return {...prior,cards:prior.cards.map(item => item === card ? {...card,progress,done:progress >= card.goal} : item)};
  }
  const rules = FEEDBACK_CONFIG.meeting;
  const last = campaign.editions.slice(-rules.lookback);
  const average = last.length ? last.reduce((sum,item) => sum + item.stands.reduce((n,s) => n + s.sold,0),0) /
    last.length : rules.openingSales;
  const limit = factor => Math.max(rules.step,Math.round(average * factor / rules.step) * rules.step);
  const topics = [...new Set((last.length ? last.flatMap(item => item.feedback?.stories || []) : librarySlate(campaign))
    .map(story => story.section))].sort();
  const topic = topics[Math.floor(randomAt(campaign.seed,month + '/topic') * topics.length)] || '民生';
  const specs = [
    {kind:'topics',goal:rules.topicGoal,label:'刊出 ' + rules.topicGoal + ' 类题材'},
    {kind:'sales',goal:rules.salesGoal,limit:limit(rules.retailFactor),label:'两期首日零售达到 ' + limit(rules.retailFactor) + ' 份'},
    {kind:'topic',goal:rules.hardGoal,topic,label:'刊出 ' + rules.hardGoal + ' 篇' + topic + '报道'}
  ];
  const priorTrust = last.length ? Math.round(last.reduce((n,item) => n + (item.feedback?.trust ?? STARTING_CREDIBILITY),0) / last.length) : STARTING_CREDIBILITY;
  if (randomAt(campaign.seed,month + '/trust') < rules.trustChance) {
    const limit = Math.min(100,priorTrust + rules.trustRise);
    specs[0] = {kind:'trust',goal:rules.trustGoal,limit,label:'两期口碑达到 ' + limit + ' 点'};
  }
  const area = last.at(-1)?.feedback?.coverage;
  const expanding = last.some(item => item.feedback?.networkChanges?.length);
  if (area && expanding && area.count + rules.coverageGoal <= area.total &&
      randomAt(campaign.seed,month + '/coverage') < rules.coverageChance) {
    specs[2] = {kind:'coverage',goal:rules.coverageGoal,start:area.count,label:'城区新增覆盖 ' + rules.coverageGoal + ' 格'};
  }
  return {month,closed:false,topics:[],cards:specs.map((card,i) => ({...card,progress:0,done:false,
    difficulty:rules.difficulties[i],reward:rules.rewards[i]}))};
}

function meetingAfterIssue(campaign,edition,stories,trust) {
  const previous = monthlyMeeting(campaign);
  const topics = [...new Set([...previous.topics,...stories.map(story => story.section)])];
  const firstSold = edition.stands.reduce((n,s) => n + s.sold,0);
  const closed = isAnnualIssue(campaign,edition.issue) ||
    issueWeek(campaign.week + 1,campaign).date.slice(0,7) !== previous.month;
  const cards = previous.cards.map(card => {
    let current = card.progress;
    if (card.kind === 'topics') current = topics.length;
    if (card.kind === 'sales') current += Number(firstSold >= card.limit);
    if (card.kind === 'trust') current += Number(trust >= card.limit);
    if (card.kind === 'topic') current += stories.filter(story => story.section === card.topic).length;
    if (card.kind === 'coverage') current = Math.max(current,coverageFor(campaign,edition).count - card.start);
    const progress = Math.min(card.goal,current);
    return {...card,progress,done:progress >= card.goal};
  });
  const rewards = cards.reduce((sum,card) => {
    if (closed && card.done) for (const key of Object.keys(sum)) sum[key] += card.reward[key];
    return sum;
  },{cash:0,influence:0,trust:0});
  return {...previous,topics,cards,closed,rewards,badge:closed && cards.every(card => card.done)};
}

function applyRoundReceipts(campaign) {
  const edition = campaign.editions.at(-1);
  const data = edition?.feedback;
  if (!data?.meeting || data.receiptsPosted) return campaign;
  const rewards = data.meeting.rewards;
  const updated = {...edition,feedback:{...data,receiptsPosted:true}};
  return withEntries({...campaign,editions:[...campaign.editions.slice(0,-1),updated],
    pressure:{...campaign.pressure,credibility:credibilityAfter(campaign.pressure.credibility,rewards.trust)}},
    [{label:'号外报款',cents:data.extra?.revenue || 0},{label:'月度例会奖金',cents:rewards.cash}]);
}

function careerAt(id,xp,totalContributions) {
  const base = reporterById(id);
  if (!base) return null;
  const rules = FEEDBACK_CONFIG.career;
  const career = {...base,level:0,xp,title:'驻点记者',progress:xp,needed:rules.thresholds[0],totalContributions};
  for (const [index,threshold] of rules.thresholds.entries()) {
    if (xp < threshold) break;
    const skill = [...rules.skills.slice(index % rules.skills.length),...rules.skills.slice(0,index % rules.skills.length)]
      .find(([key]) => career[key] < rules.maxSkill);
    if (!skill) break;
    const [key,label,title] = skill;
    career[key]++;
    Object.assign(career,{level:index + 1,title,skill:label,progress:xp - threshold,
      needed:(rules.thresholds[index + 1] ?? threshold) - threshold});
    if (rules.skills.every(([key]) => career[key] === rules.maxSkill)) career.needed = 0;
  }
  if (!career.needed) career.progress = 0;
  return career;
}

function reporterCareer(campaign,id) {
  const totals = campaign.editions?.at(-1)?.feedback?.reporters?.totals?.[id];
  return careerAt(id,totals?.xp || 0,totals?.stories || 0);
}

function signingReporter(campaign,story) {
  if (story.id?.startsWith('original-')) return null;
  const assigned = campaign.reports?.[story.id]?.id;
  if (assigned && campaign.staff.includes(assigned)) return reporterCareer(campaign,assigned);
  const team = campaign.staff.map(id => reporterCareer(campaign,id));
  const specialists = team.filter(person => person.specialties.includes(story.section));
  const pool = specialists.length ? specialists : team;
  return pool[Math.floor(randomAt(campaign.seed,story.id + '/byline') * pool.length)] || null;
}

function reportersAfterIssue(campaign,edition) {
  const rules = FEEDBACK_CONFIG.career;
  const {stories,syndication,followUps} = edition.feedback;
  const totals = {...campaign.editions.at(-1)?.feedback?.reporters?.totals};
  const byline = {};
  const points = new Map();
  const adopted = new Map();
  const add = (id,n) => points.set(id,(points.get(id) || 0) + n);
  for (const story of stories) {
    const person = signingReporter(campaign,story);
    if (!person) continue;
    const id = person.id;
    byline[story.id] = id;
    adopted.set(id,(adopted.get(id) || 0) + 1);
    add(id,rules.publication + (person.specialties.includes(story.section) ? rules.specialty : 0) +
      (syndication.find(item => item.id === story.id)?.outlets.length || 0) * rules.syndication);
  }
  for (const later of followUps.filter(item => item.type === 'positive')) {
    const prior = campaign.editions.find(item => item.issue === later.issue);
    const id = prior?.feedback?.reporters?.byline?.[later.storyId];
    if (id) add(id,rules.followup);
  }
  const gains = [],promotions = [];
  for (const [id,xp] of points) {
    const prev = reporterCareer(campaign,id);
    const contribution = adopted.get(id) || 0;
    const next = careerAt(id,prev.xp + xp,prev.totalContributions + contribution);
    totals[id] = {xp:next.xp,stories:next.totalContributions};
    gains.push({id,xp,stories:contribution});
    if (next.level > prev.level) promotions.push({id,name:next.name,title:next.title,level:next.level,skill:next.skill});
  }
  return {byline,gains,promotions,totals};
}

function yearRoundSummary(editions) {
  const months = [],extras = [],frames = [],events = [],careers = new Map();
  for (const item of editions) {
    const data = item.feedback || {};
    if (data.meeting?.closed) months.push(data.meeting);
    if (data.extra?.copies) extras.push(data.extra);
    if (data.coverage) frames.push({issue:item.issue,active:data.coverage.active,count:data.coverage.count});
    for (const gain of data.reporters?.gains || []) {
      const score = careers.get(gain.id) || {id:gain.id,name:reporterById(gain.id)?.name,xp:0,stories:0};
      score.xp += gain.xp;
      score.stories += gain.stories;
      careers.set(gain.id,score);
    }
    const place = (kind,text,priority) => events.push({issue:item.issue,kind,text,priority});
    for (const milestone of data.rival?.events || []) {
      const name = item.rival?.name || '同城报';
      if (milestone === 'overtake') place('lead','本报零售首次反超《' + name + '》',3);
      if (milestone === 'redesign' || milestone === 'spring') place('redesign','《' + name + '》改版',3);
      if (milestone === 'close') place('close','《' + name + '》宣布停刊',6);
      if (milestone === 'entry') place('entry','《' + name + '》创刊发行',4);
    }
    if (data.influence?.promoted) place('influence','发行范围扩大至' + FEEDBACK_CONFIG.influence.levels[data.influence.level][0],5);
    if (data.extra?.copies) place('extra','号外刊出 · ' + data.extra.title,5);
    if (data.awards?.winner) place('award','省好新闻奖 · ' + data.awards.winner.title,7);
    for (const event of data.networkChanges || []) place(event.kind,event.text,2);
  }
  // 先保留各类大事，再按稀有程度补足；按刊期还原时间顺序。
  const selected = new Set();
  const ranked = [...events].sort((a,b) => b.priority - a.priority || a.issue - b.issue);
  const kinds = new Set();
  for (const event of ranked) if (!kinds.has(event.kind)) {selected.add(event);kinds.add(event.kind);}
  for (const event of ranked) {
    if (selected.size >= FEEDBACK_CONFIG.highlights.timelineLimit) break;
    selected.add(event);
  }
  const timeline = [...selected].sort((a,b) => a.issue - b.issue).map(({issue,text}) => ({issue,text}));
  const reporter = [...careers.values()].sort((a,b) => b.xp - a.xp || b.stories - a.stories || a.id.localeCompare(b.id))[0] || null;
  return {months,extras,frames,timeline,reporter};
}

function roundBadges(edition,points) {
  const {coverage,extra,meeting} = edition.feedback;
  const active = coverage.active;
  const shared = (edition.rival?.stands || []).filter(stand => stand.competing);
  const conquered = shared.length > 0 && shared.every(rival => {
    const ours = edition.stands.find(stand => stand.name === rival.name);
    return ours && ours.sold + (ours.reprint?.sold || 0) > rival.sold;
  });
  const levels = FEEDBACK_CONFIG.influence.levels;
  const geography = FEEDBACK_CONFIG.network;
  const provincialShare = (points - levels[1][1]) / (levels[3][1] - levels[1][1]);
  const badges = [];
  for (const [key,earned] of [
    ['extra',extra?.copies],['extra-sold',extra?.copies && extra.sold === extra.copies],
    ['station-three',Object.values(coverage.grades).some(grade => grade >= 3)],
    ['all-kiosks',CHANNELS.every(channel => (coverage.grades[channel.id] || 1) >= 2)],
    ['half-city',coverage.count > coverage.total / 2],['whole-city',coverage.count === coverage.total],
    ['three-routes',['culture','college','workers','rural','devzone','county','capital'].every(id => coverage.unlocked.includes(id))],
    ['all-contested',conquered],['nine-counties',Math.ceil(geography.provinceTiles * provincialShare) >= geography.ninthCountyTile],
    ['all-rail',points >= levels.at(-1)[1]],['meeting',meeting.badge]
  ]) if (earned) badges.push(key);
  return badges;
}
