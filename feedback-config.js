// 出刊反馈的时间、权重和门槛集中在这里；不改动原有发行、广告和采编参数。
const FEEDBACK_CONFIG = {
  campaign:{
    // 周六见报。逐年重订房租、记者周薪和每份纸张印刷费，金额单位为分。
    prices:[{office:1, salary:1, paper:20}, {office:1.025, salary:1.04, paper:21}, {office:1.06, salary:1.09, paper:22}],
    // 原有对手换版后加印；新进分印版以降价吸客，都市晚报善于争夺铺货点。
    rivalStyles:[['河西晚报','江岸日报','本地晚报'],['江洲晨讯','省城晨讯','低价分印版'],['临渡都市晚报','沿江都市报','抢占网点']],
    // 年度送评卷宗至少十二篇调查或批评头条：版面 A 等以上，且获转载、正面后续或异议复核确认。
    provincialPrize:{series:12, grades:['A','S']},
    redesign:1.05, priceWar:1.07,
    // 长局累计零售里程碑及报社积分。
    lifetimeSales:[[250000,60],[500000,100],[750000,140],[1000000,180]],
    // 按实际公历月份计算本地读者题材偏好；历史节庆当周另有专稿。
    seasons:[{节庆:180,交通:120},{节庆:230,民生:90},{教育:140,街巷:85},{体育:100,消费:100},
      {交通:150,文娱:120},{教育:160,体育:140},{交通:150,科技:100},{文娱:140,民生:90},
      {教育:190,消费:100},{节庆:170,交通:120},{民生:130,消费:120},{跨年:195,街巷:110}]
  },
  press: {
    // 四幕共 7.8 秒，发行回单逐个展示本期真实网点。
    times:[1800, 4600, 6800, 7800],
    counterFinish:.88
  },
  street: {
    // 权重按「正面、中性、负面」排列，重稿引起更多关注，高风险会多些质疑。
    weight:{重:[60,29,11], 中:[39,46,15], 轻:[26,54,20]},
    risk:{无:0, 低:3, 中:13, 高:24},
    bySlot:{headline:2, support:1, third:1},
    minLines:3, headlineCharacters:14
  }
};

Object.assign(FEEDBACK_CONFIG, {
  // 头条占新闻分量的一半；广告或空位不算新闻题材。
  score:{
    slots:{headline:.50, support:.28, third:.22},
    news:{重:100, 中:75, 轻:48}, safe:{无:100, 低:88, 中:68, 高:44},
    mix:[0, 48, 78, 100], weeks:4, balancedTopics:5,
    weights:{news:.38, variety:.25, balance:.21, safety:.16},
    grades:[['S',90], ['A',79], ['B',63], ['C',0]]
  },
  // 每封来信按赞许、留言、批评分段取材；每期保留两种立场，其余位置随评分和风险变化。
  readers:{counts:[2,3,4], warmChance:.05, goodScore:79, badScore:63, highRisk:'高', highRiskChance:.42,
    toneRanges:[[0,3],[3,7],[7,10]]},
  syndication:{
    weight:{重:100, 中:62, 轻:25}, minWeight:62,
    // 从地方电台到央媒；每档除了影响力，还要求达到该机构的稿件分量。
    outlets:[
      ['本市电台',0,62,.38], ['省电视台',1,100,.25], ['省报',2,62,.19],
      ['江洲门户网',3,100,.19], ['央媒',3,100,.22]
    ]
  },
  // 近四周零售过线才抽报价；金额单位为分，二条与三条各半。
  walkIn:{weeks:4, supportChance:.5, minAverage:4200, chance:.55, minimumCents:17500, centsPerCopy:4, roundTo:500},
  // 连续领先或落后调整对手销量；改版、缩版、停刊各有独立门槛。
  rival:{
    base:3720, season:190, swing:220, earlyGrowth:8, earlyWeeks:18,
    leadWeeks:3, leadRatio:1.17, slumpRatio:.91, weaken:95, recover:100,
    maxLoss:1700, maxGain:650, redesignRatio:1.5, thinRatio:2, thinWeeks:4,
    closeRatio:1.84, closeWeeks:7, earliestClose:36, headlineChance:.30
  }
});

Object.assign(FEEDBACK_CONFIG, {
  // 每份发行量计入零售与订阅；提名按篇计分，年度获奖作品另计加分。
  influence:{
    levels:[['小城',0], ['全市',78], ['全省',210], ['周边省份',385], ['全国',500]],
    copiesPerPoint:1300, boostStart:5700, boostCopiesPerPoint:850, retailBoostStart:5000, retailBoostCopies:225,
    // 每期发行带来的影响力分三项各设上限，铺满新网点也不会一两个月冲到全国。
    maxBasePoints:7, maxBoostPoints:3, maxRetailPoints:4,
    syndicationPoints:2, awardPoints:9, winnerPoints:5, revealMs:1450
  },
  // 评分和口碑决定订户增量；连续差评或负面后续触发小幅流失。
  subscribers:{
    poorGrade:'C', initial:620, gradeGain:{S:99, A:68, B:38, C:12}, neutralTrust:65, trustFactor:.65,
    minGrowth:4, poorWeeks:3, poorLoss:12, complaintLoss:8, maxLoss:28,
    // 报亭以外的发行点可代收集体订报单。按这些网点首日实售的一定比例新增，补印不重复拉订户。
    groupChannels:['workers','rural','culture','devzone','county'],
    groupRate:{S:.06, A:.05, B:.035, C:0}, groupTrustFloor:35, groupTrustFull:60,
    maxGroupGain:240
  },
  // 每次换月以最近若干期题材统计读者占比；变动按百分点计。
  profile:{
    weeks:12, notableChange:1,
    colors:['#8c412c','#50705a','#8c733e','#5d6c88','#964f65','#586d71','#806c58','#666399','#677a46','#935d38','#526980']
  },
  // 连续增长、好版面、无异议和发行里程碑，各档在同一局只颁一次。
  badges:{
    goodGrades:['S','A'], growthStreaks:[3,5,10], gradeStreaks:[4,8], calmStreaks:[8,16,26,52],
    circulation:[10000,15000,20000,25000],
    reward:{growth:20, grade:25, calm:15, circulation:35, syndicated:20, national:50, overtake:30, closed:65, influence:30}
  },
  // 省奖从原有提名作品中择优；年度影响报道按后续影响力和口碑合计排序。
  annual:{winnerMinScore:85, provincialTitleLevel:2, leadingRetailRatio:1.1, impactWeight:1, reputationWeight:1}
});

// 三年版的号外按该条消息发生后的首个周六发行。份数、成本和奖励均独立于正刊。
Object.assign(FEEDBACK_CONFIG, {
  extra:{
    batches:[600,1200,2000], printCents:19, deliveryCents:2200, priceCents:45, baseDemand:600,
    readersPerStand:80, demandSwing:750, copiesPerPoint:380, copiesPerSubscriber:28, rivalChance:.58,
    events:[
      {date:'2000-09-23',title:'悉尼赛场传来首金，陶璐娜夺冠',call:'射击决赛的剪报刚贴上橱窗，孩子们就围了过来。'},
      {date:'2001-07-14',title:'北京赢得二〇〇八年夏季奥运会举办权',call:'钟楼下的报童举起号外，排在队尾的人也跟着念出了头条。'},
      {date:'2001-12-15',title:'中国正式成为世界贸易组织成员',call:'百货柜台留了两份号外，一份贴在玻璃上，一份送进采购室。'},
      {date:'2002-06-08',title:'中国男足首次登上世界杯决赛圈赛场',call:'球场门口的报贩一手递报，一手指着版上的两队名单。'},
      {date:'2003-10-18',title:'神舟五号航天员杨利伟平安返回',call:'书报亭把号外悬在门楣上，等车的乘客踮着脚往前看。'}
    ]
  },
  // 网点升级按原有零售能力定价；提升容量和读者需求，第三级把覆盖推出一圈。
  network:{names:['报摊','报刊亭','发行站'],cap:[1,1.32,1.68],weight:[1,1.25,1.55],radii:[2,2,3],
    costPerWeight:[390,480],width:16,height:11,step:10,minNationalStands:8,
    // 按省图由近及远，77格中的第65格进入最远的石门县。
    provinceTiles:77,ninthCountyTile:65},
  // 设备只买一次，按印厂安装顺序开放。金额单位为分。
  equipment:{items:[{name:'套红报头',cost:46000},{name:'彩色头版图片',cost:87000},{name:'扩印设备',cost:160000}],
    photoBonus:[0,.015,.035,.035], maxCopies:24000,reprintBatches:[0,250,500,1000,1500,2000]},
  // 经验随刊用、专长、转载和积极后续累积。每次升一级添一点能力，单项最高五点。
  career:{publication:3,specialty:2,syndication:2,followup:3,thresholds:[35,115,250,480,780,1050],
    writeScore:1,verifyScore:1,reachReprint:.008,
    skills:[['reach','跑线','跑街能手'],['write','写稿','笔杆子'],['verify','核实','查证好手']],maxSkill:5},
  // 月初用前四期的平均首日零售量订任务；当月最后一期支付例会红利。
  meeting:{lookback:4,openingSales:3800,retailFactor:1.01,step:50,
    topicGoal:2,salesGoal:2,hardGoal:2,trustGoal:2,trustRise:1,trustChance:.34,coverageGoal:3,coverageChance:.55,rewards:[{cash:3000,influence:0,trust:0},{cash:0,influence:0,trust:1},{cash:0,influence:2,trust:0}],
    difficulties:['易','中','难']},
  highlights:{recordGap:6,recordFactor:1.045,largeLead:1.55,leadLookback:3,hitMs:1000, replayMs:10000, timelineLimit:12},
  // 稳定的本地发行每周约两三点；县外网点和销售面能扩大传播范围，全国档要求至少八个在营网点。
  // 长局中的各家报纸，持续接近两倍的销量差距才会停刊。
  careerRival:{thinRatio:1.95,closeRatio:2.18,maxLoss:1150},
  careerInfluence:{yearScale:.58,retailUnit:2500,subUnit:10500,maxSubPoints:1.35,maxRetailPoints:4.2,syndicationPoints:.45,
    followupFactor:.36,awardPoints:2,winnerPoints:2,base:.35,expansionPoints:.04},
  longBadges:{calm:[104,156],circulation:[30000,40000],reward:35}
});
