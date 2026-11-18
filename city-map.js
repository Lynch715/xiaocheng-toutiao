// 发行地图：三张六边形格子图。
// 城区：每个在营网点覆盖周围两圈格子，新网点必须落在覆盖区内或紧挨覆盖区（规则见 model.js 的 CHANNEL_HEX）。
// 全省：江洲省按县划分格子，影响力越高点亮的格子越多。全国：铁路干线串起城市格，只画格子不画行政边界。
const SQ3 = Math.sqrt(3);
const HEX_NEIGHBORS = [[0, 1], [-1, 1], [-1, 0], [0, -1], [1, -1], [1, 0]]; // 与六条边一一对应（轴向坐标）

const CITY_GRID = {cols:16, rows:11, size:25.2, ox:22.8, oy:40};
const CITY_MAP = {
  nodes:{
    station:{district:'火车站'}, shops:{district:'人民路商业街'}, market:{district:'东门'}, homes:{district:'纺织厂家属区'},
    culture:{district:'文化宫一带'}, workers:{district:'城西'}, rural:{district:'南郊公路'}, college:{district:'北郊大学城'},
    devzone:{district:'河东开发区'}, county:{district:'国道出城口 · 往三河县'}, capital:{district:'铁路东站 · 往江州'}
  },
  oldtown:[6, 4], bridge:[10, 7]
};

const PROVINCE_GRID = {cols:14, rows:9, size:28.4, ox:26, oy:34, center:[7, 4]};
const PROVINCE_SEATS = [
  {id:'home', name:'临渡', hex:[6, 5], home:true},
  {id:'county', name:'三河县', hex:[8, 5], channel:'county'},
  {id:'capital', name:'江州', hex:[9, 2], channel:'capital', capital:true},
  {id:'qinggang', name:'青岗县', hex:[4, 2]},
  {id:'liuqiao', name:'柳桥市', hex:[6, 1]},
  {id:'baisha', name:'白沙县', hex:[3, 6]},
  {id:'nanpo', name:'南坡县', hex:[6, 7]},
  {id:'dongtan', name:'东滩县', hex:[10, 6]},
  {id:'shimen', name:'石门县', hex:[11, 3]}
];

const NATION_GRID = {cols:18, rows:11, size:22.4, ox:21, oy:30, center:[9, 5]};
const NATION_CITIES = [
  {id:'beijing', name:'北京', hex:[10, 1], central:true}, {id:'shenyang', name:'沈阳', hex:[13, 0]},
  {id:'xian', name:'西安', hex:[6, 4]}, {id:'zhengzhou', name:'郑州', hex:[9, 4]}, {id:'chengdu', name:'成都', hex:[4, 6]},
  {id:'wuhan', name:'武汉', hex:[9, 6]}, {id:'nanjing', name:'南京', hex:[12, 5]}, {id:'shanghai', name:'上海', hex:[14, 5]},
  {id:'changsha', name:'长沙', hex:[8, 8]}, {id:'guangzhou', name:'广州', hex:[9, 10]}, {id:'home', name:'江洲', hex:[11, 7], home:true}
];
const NATION_LINES = [['shenyang','beijing'],['beijing','zhengzhou'],['zhengzhou','wuhan'],['wuhan','changsha'],['changsha','guangzhou'],
  ['zhengzhou','xian'],['xian','chengdu'],['beijing','nanjing'],['nanjing','shanghai'],['wuhan','home'],['home','nanjing'],
  ['home','shanghai'],['home','changsha'],['chengdu','wuhan']];

let mapScale = 'city';
let mapSelection = null;

function hexCenter(grid, [col, row]) {
  return [grid.ox + grid.size * SQ3 * (col + .5 * (row & 1)), grid.oy + grid.size * 1.5 * row];
}

function hexCorner(cx, cy, size, index) {
  const angle = Math.PI / 180 * (30 + 60 * index);
  return [cx + size * Math.cos(angle), cy + size * Math.sin(angle)];
}

const polygonCache = new WeakMap();
function hexPolygon(grid, hex, inset = .95) {
  let cache = polygonCache.get(grid);
  if (!cache) { cache = new Map(); polygonCache.set(grid,cache); }
  const key = hex.join(',') + '/' + inset;
  if (cache.has(key)) return cache.get(key);
  const [cx, cy] = hexCenter(grid, hex);
  const pts = Array.from({length:6}, (_, index) => hexCorner(cx, cy, grid.size * inset, index).map(n => n.toFixed(1)).join(',')).join(' ');
  cache.set(key,pts);
  return pts;
}

function hexNeighbor([col, row], index) {
  const [q, r] = hexCube([col, row]);
  const [dq, dr] = HEX_NEIGHBORS[index];
  const nr = r + dr;
  return [q + dq + (nr - (nr & 1)) / 2, nr];
}

const gridCache = new WeakMap();
function gridCells(grid) {
  if (gridCache.has(grid)) return gridCache.get(grid);
  const cells = [];
  for (let row = 0; row < grid.rows; row++) for (let col = 0; col < grid.cols; col++) cells.push([col, row]);
  gridCache.set(grid,cells);
  return cells;
}

const hexKey = ([col, row]) => col + ',' + row;
const sameHex = (a, b) => a[0] === b[0] && a[1] === b[1];

function mapLevelNames() {
  return FEEDBACK_CONFIG.influence.levels.map(([name]) => name);
}

function mapRivalOutlets(campaign) {
  if (rivalHasClosed(campaign)) return [];
  const known = campaign.phase === 'desk' ? knownRival(campaign) : null;
  const last = campaign.editions.at(-1);
  return known?.outlets || (last?.rival?.name === rivalPaperName(campaign) && Number(last.date.slice(0,4)) === currentYear(campaign) ? last.rival.outlets : []) || [];
}

function mapStandSales(campaign) {
  const sales = new Map();
  const last = campaign.editions.at(-1);
  for (const outlet of last ? retailDispatch(last, campaign.seed) : []) if (outlet.id) sales.set(outlet.id, outlet.sold);
  return sales;
}

function channelMapState(campaign, channel) {
  if (!rivalHasClosed(campaign) && campaign.market.captured.includes(channel.id)) return 'captured';
  if (campaign.active.includes(channel.id)) return 'active';
  if (campaign.unlocked.includes(channel.id)) return 'paused';
  if (channelLocked(campaign, channel)) return 'locked';
  return channelConnected(campaign, channel) ? 'available' : 'remote';
}

const MAP_STATE_LABELS = {active:'在营', paused:'暂停配送', available:'可开拓', remote:'未连通', locked:'未解锁', captured:'对手占据'};

function syndicationTally(campaign) {
  const tally = new Map();
  for (const edition of campaign.editions) for (const item of edition.feedback?.syndication || []) {
    for (const name of item.outlets) tally.set(name, (tally.get(name) || 0) + 1);
  }
  return tally;
}

function cityTerrain([col, row]) {
  if (sameHex([col, row], CITY_MAP.bridge)) return 'bridge';
  if (col === 10) return row === 0 ? 'bridge' : 'river';
  if (row === 0) return 'rail';
  if (hexDistance([col, row], CITY_MAP.oldtown) <= 1) return 'oldtown';
  if (col === 0 || row === 10 || (col >= 14 && row >= 9)) return 'field';
  return 'land';
}

function cityCoverage(campaign) {
  // 返回每格的覆盖情况：本报覆盖距离、对手是否覆盖、是否为可扩张的边缘。
  const own = campaign.active.map(id => ({hex:CHANNEL_HEX[id],radius:channelRadius(campaign,id)}));
  const rival = [...new Set([...mapRivalOutlets(campaign), ...(rivalHasClosed(campaign) ? [] : campaign.market.captured)])].map(id => CHANNEL_HEX[id]).filter(Boolean);
  const cover = new Map();
  for (const cell of gridCells(CITY_GRID)) {
    const ownDistance = Math.min(Infinity, ...own.map(({hex}) => hexDistance(hex, cell)));
    const rivalDistance = Math.min(Infinity, ...rival.map(hex => hexDistance(hex, cell)));
    const edge = Math.min(Infinity,...own.map(({hex,radius}) => hexDistance(hex,cell)-radius));
    cover.set(hexKey(cell), {own:edge <= 0, core:ownDistance <= 1,
      rival:rivalDistance <= CHANNEL_COVER_RADIUS, frontier:edge === 1});
  }
  return cover;
}

function cityMapMarkup(campaign, selected, interactive = true) {
  const sales = mapStandSales(campaign);
  const rivalOutlets = mapRivalOutlets(campaign);
  const rivalMark = Array.from(rivalPaperName(campaign))[0];
  const cover = cityCoverage(campaign);
  const targets = new Set(CHANNELS.filter(channel => channelMapState(campaign, channel) === 'available').map(channel => hexKey(CHANNEL_HEX[channel.id])));
  const cells = gridCells(CITY_GRID).map(cell => {
    const terrain = cityTerrain(cell);
    const state = cover.get(hexKey(cell));
    const water = terrain === 'river';
    const cls = ['hex', 'hex-' + terrain,
      !water && state.own && state.rival ? 'hex-contested' : !water && state.own ? (state.core ? 'hex-own-core' : 'hex-own') :
        !water && state.rival ? 'hex-rival' : !water && state.frontier ? 'hex-frontier' : '',
      targets.has(hexKey(cell)) ? 'hex-target' : ''].filter(Boolean).join(' ');
    return '<polygon class="' + cls + '" points="' + hexPolygon(CITY_GRID, cell) + '"/>';
  }).join('');
  const [ox, oy] = hexCenter(CITY_GRID, [5, 5]);
  const river = hexCenter(CITY_GRID, [10, 3]);
  const labels = '<text class="hex-area-label" x="' + ox.toFixed(0) + '" y="' + (oy + 5).toFixed(0) + '" text-anchor="middle">老城</text>' +
    '<text class="hex-water-label" x="' + river[0].toFixed(0) + '" y="' + river[1].toFixed(0) + '" text-anchor="middle">渡</text>' +
    '<text class="hex-water-label" x="' + river[0].toFixed(0) + '" y="' + (river[1] + 40).toFixed(0) + '" text-anchor="middle">江</text>' +
    '<text class="hex-small-label" x="96" y="18">铁路</text><text class="hex-small-label" x="' + (hexCenter(CITY_GRID, CITY_MAP.bridge)[0] - 28).toFixed(0) +
    '" y="' + (hexCenter(CITY_GRID, CITY_MAP.bridge)[1] + 4).toFixed(0) + '" text-anchor="end">临渡大桥</text>';
  const pins = CHANNELS.map(channel => {
    const hex = CHANNEL_HEX[channel.id];
    if (!hex) return '';
    const [x, y] = hexCenter(CITY_GRID, hex);
    const state = channelMapState(campaign, channel);
    const grade = channelGrade(campaign,channel.id);
    const sold = state === 'active' ? sales.get(channel.id) || 0 : 0;
    const size = state === 'active' ? Math.round(28 + 16 * Math.sqrt(Math.min(1, sold / 2200))) : 26;
    const rival = rivalOutlets.includes(channel.id) && state !== 'captured';
    const below = (hex[1] <= 1 ? ' label-below' : '') + (hex[0] >= 14 ? ' label-left' : hex[0] <= 1 ? ' label-right' : '');
    const shortName = {capital:'省城',county:'邻县',devzone:'开发区',college:'大学城',station:'车站',shops:'百货',market:'菜场',homes:'家属区',culture:'文化馆',workers:'城西',rural:'乡镇'};
    const label = '<span class="map-pin-label' + below + '"><b>' + h(interactive ? channel.name : shortName[channel.id] || channel.name) + '</b><i>' +
      (state === 'active' && sold ? number(sold) + ' 份' : MAP_STATE_LABELS[state]) + '</i></span>';
    const tag = interactive ? 'button' : 'span';
    return '<' + tag + (interactive ? ' type="button"' : '') + ' class="map-pin grade-' + grade + ' map-' + state + (selected === channel.id ? ' selected' : '') +
      (rival ? ' contested' : '') + '" style="left:' + (x / 7.2).toFixed(2) + '%;top:' + (y / 4.6).toFixed(2) + '%;--size:' + size + 'px"' +
      (interactive ? ' data-action="map-select" data-id="' + channel.id + '" aria-pressed="' + (selected === channel.id) +
        '" aria-label="' + h(channel.name + '，' + CITY_MAP.nodes[channel.id].district + '，' + MAP_STATE_LABELS[state] +
        (sold ? '，上期实售 ' + sold + ' 份' : '') + (rival ? '，对手也在此铺货' : '')) + '"' : ' aria-hidden="true"') + '>' +
      '<span class="map-dot">' + (state === 'locked' ? '锁' : state === 'captured' ? h(rivalMark) : grade === 3 ? '站' : grade === 2 ? '亭' : '报') + '</span>' +
      (rival ? '<span class="map-rival-flag" aria-hidden="true">' + h(rivalMark) + '</span>' : '') + label + '</' + tag + '>';
  }).join('');
  return '<div class="map-canvas hex-map city-map"><svg viewBox="0 0 720 460" aria-hidden="true" preserveAspectRatio="none">' +
    '<defs><pattern id="hex-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">' +
    '<rect width="6" height="6" class="hatch-bg"/><line x1="0" y1="0" x2="0" y2="6" class="hatch-line"/></pattern></defs>' +
    '<rect class="hex-ground" width="720" height="460"/><g class="hex-cells">' + cells + '</g>' + labels + '</svg>' + pins + '</div>';
}

function countyBorders(grid, cells, owner) {
  // 在不同县之间、以及省界外缘画边线。
  const inside = new Set(cells.map(hexKey));
  const edges = {outer:[], inner:[]};
  for (const cell of cells) {
    const [cx, cy] = hexCenter(grid, cell);
    for (let index = 0; index < 6; index++) {
      const other = hexNeighbor(cell, index);
      const outside = !inside.has(hexKey(other));
      if (!outside && (owner.get(hexKey(other)) === owner.get(hexKey(cell)) || hexKey(other) < hexKey(cell))) continue;
      const [x1, y1] = hexCorner(cx, cy, grid.size, index);
      const [x2, y2] = hexCorner(cx, cy, grid.size, (index + 1) % 6);
      edges[outside ? 'outer' : 'inner'].push('M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + 'L' + x2.toFixed(1) + ' ' + y2.toFixed(1));
    }
  }
  return '<path class="hex-border-inner" d="' + edges.inner.join('') + '"/><path class="hex-border-outer" d="' + edges.outer.join('') + '"/>';
}

function blobCells(grid, radius, seeds, salt) {
  // 以中心为圆心的不规则格子群；种子格一定包含在内。
  return gridCells(grid).filter(cell => {
    const distance = hexDistance(cell, grid.center);
    const wobble = ((cell[0] * 7 + cell[1] * 13 + salt) % 5);
    return distance <= radius - 1 || (distance === radius && wobble !== 0) || (distance === radius + 1 && wobble === 2) ||
      seeds.some(seed => sameHex(seed, cell));
  });
}

function influenceProgressBetween(points, from, to) {
  return Math.max(0, Math.min(1, (points - from) / Math.max(1, to - from)));
}

function provinceState(campaign) {
  const points = campaign.editions.at(-1)?.feedback?.influence?.points ?? 0;
  const levels = FEEDBACK_CONFIG.influence.levels;
  const tally = syndicationTally(campaign);
  const provincial = ['省电视台', '省报'].reduce((sum, name) => sum + (tally.get(name) || 0), 0);
  const cells = blobCells(PROVINCE_GRID, 5, PROVINCE_SEATS.map(seat => seat.hex), 3);
  const owner = new Map(cells.map(cell => [hexKey(cell), PROVINCE_SEATS.reduce((best, seat) =>
    hexDistance(seat.hex, cell) < hexDistance(best.hex, cell) ? seat : best).id]));
  const home = PROVINCE_SEATS[0].hex;
  const ordered = [...cells].sort((a, b) => hexDistance(a, home) - hexDistance(b, home) || a[1] - b[1] || a[0] - b[0]);
  const lit = new Set(ordered.slice(0, Math.ceil(ordered.length * influenceProgressBetween(points, levels[1][1], levels[3][1]))).map(hexKey));
  const ours = new Set(PROVINCE_SEATS.filter(seat => seat.home || (seat.channel && campaign.active.includes(seat.channel))).map(seat => seat.id));
  return {cells, owner, lit, ours, provincial};
}

function provinceTable(campaign) {
  const {cells, owner, lit, ours} = provinceState(campaign);
  const rows = PROVINCE_SEATS.map(seat => {
    const mine = cells.filter(cell => owner.get(hexKey(cell)) === seat.id);
    const covered = ours.has(seat.id) ? mine.length : mine.filter(cell => lit.has(hexKey(cell))).length;
    const channel = seat.channel && channelById(seat.channel);
    const status = seat.home ? '本报' : channel ? '发行站' + MAP_STATE_LABELS[channelMapState(campaign, channel)] : covered ? '有读者' : '未覆盖';
    return '<tr><th scope="row">' + h(seat.name) + '</th><td class="num">' + covered + ' / ' + mine.length + '</td><td class="bar-cell"><span class="hbar"><i style="width:' +
      (covered * 100 / Math.max(1, mine.length)).toFixed(0) + '%"></i></span></td><td class="nowrap">' + h(status) + '</td></tr>';
  }).join('');
  return '<div class="map-card"><h3>各县覆盖</h3><table class="grid-table compact"><thead><tr><th scope="col">县市</th><th scope="col" class="num">格</th>' +
    '<th scope="col">覆盖</th><th scope="col">发行</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="map-card-note">影响力从「' + mapLevelNames()[1] + '」涨到「' + mapLevelNames()[3] + '」的过程中，报纸由临渡向外逐格铺开；邻县、省城开设发行站后整县点亮。</p></div>';
}

function provinceMapMarkup(campaign, compact = false) {
  const level = influenceLevelOf(campaign);
  const {cells, owner, lit, ours, provincial} = provinceState(campaign);
  const polygons = cells.map(cell => {
    const county = owner.get(hexKey(cell));
    const cls = ours.has(county) ? 'hex-own-core' : lit.has(hexKey(cell)) ? 'hex-own' : 'hex-dark';
    return '<polygon class="hex hex-land ' + cls + '" points="' + hexPolygon(PROVINCE_GRID, cell, .97) + '"/>';
  }).join('');
  const seats = PROVINCE_SEATS.map(seat => {
    const [x, y] = hexCenter(PROVINCE_GRID, seat.hex);
    const channel = seat.channel && channelById(seat.channel);
    const state = channel ? channelMapState(campaign, channel) : null;
    const reached = ours.has(seat.id) || lit.has(hexKey(seat.hex));
    const note = seat.home ? '本报' : state === 'active' ? '发行站在营' : channel ? MAP_STATE_LABELS[state] : reached ? '有读者' : '';
    const extra = seat.capital && provincial ? '省级媒体转载 ' + provincial + ' 次' : '';
    return '<g class="hex-seat' + (reached ? ' lit' : '') + (seat.home ? ' home' : '') + (ours.has(seat.id) ? ' ours' : '') + '">' +
      '<rect x="' + (x - 5) + '" y="' + (y - 5) + '" width="10" height="10"/>' +
      '<text x="' + x.toFixed(0) + '" y="' + (y - 10).toFixed(0) + '" text-anchor="middle">' + h(seat.name) + '</text>' +
      (note && !compact ? '<text class="hex-note" x="' + x.toFixed(0) + '" y="' + (y + 20).toFixed(0) + '" text-anchor="middle">' + h(note) + '</text>' : '') +
      (extra && !compact ? '<text class="hex-note accent" x="' + x.toFixed(0) + '" y="' + (y + 33).toFixed(0) + '" text-anchor="middle">' + h(extra) + '</text>' : '') + '</g>';
  }).join('');
  return '<div class="map-canvas hex-map province-map"><svg viewBox="0 0 720 460" role="img" aria-label="江洲省各县发行格">' +
    '<rect class="hex-ground" width="720" height="460"/><g class="hex-cells">' + polygons + '</g>' + countyBorders(PROVINCE_GRID, cells, owner) + seats +
    '<text class="hex-caption" x="24" y="448">江洲省 · 已覆盖 ' + cells.filter(cell => ours.has(owner.get(hexKey(cell))) || lit.has(hexKey(cell))).length + ' / ' + cells.length + ' 格</text></svg>' +
    (level >= 1 || compact ? '' : '<p class="map-lock">影响力达到「' + mapLevelNames()[1] + '」后，报纸开始走出临渡。</p>') + '</div>';
}

function nationState(campaign) {
  const level = influenceLevelOf(campaign);
  const points = campaign.editions.at(-1)?.feedback?.influence?.points ?? 0;
  const levels = FEEDBACK_CONFIG.influence.levels;
  const tally = syndicationTally(campaign);
  const central = tally.get(FEEDBACK_CONFIG.syndication.outlets.at(-1)[0]) || 0;
  const web = tally.get('江洲门户网') || 0;
  const cells = blobCells(NATION_GRID, 7, NATION_CITIES.map(city => city.hex), 1);
  const home = NATION_CITIES.find(city => city.home).hex;
  const ordered = [...cells].sort((a, b) => hexDistance(a, home) - hexDistance(b, home) || a[1] - b[1] || a[0] - b[0]);
  const share = level >= 4 ? 1 : influenceProgressBetween(points, levels[2][1], levels[4][1]) * .92;
  const lit = new Set(ordered.slice(0, Math.max(1, Math.ceil(ordered.length * share))).map(hexKey));
  const centralHex = NATION_CITIES.find(city => city.central).hex;
  if (central) lit.add(hexKey(centralHex));
  return {level,central,web,cells,home,lit};
}

function nationMapMarkup(campaign, compact = false) {
  const {level,central,web,cells,home,lit} = nationState(campaign);
  const polygons = cells.map(cell => {
    const cls = sameHex(cell, home) ? 'hex-own-core' : lit.has(hexKey(cell)) ? 'hex-own' : 'hex-dark';
    return '<polygon class="hex hex-land ' + cls + '" points="' + hexPolygon(NATION_GRID, cell, .96) + '"/>';
  }).join('');
  const byId = new Map(NATION_CITIES.map(city => [city.id, city]));
  const isLit = city => city.home || lit.has(hexKey(city.hex)) || (city.central && central > 0);
  const lines = NATION_LINES.map(([a, b]) => {
    const [x1, y1] = hexCenter(NATION_GRID, byId.get(a).hex), [x2, y2] = hexCenter(NATION_GRID, byId.get(b).hex);
    return '<line class="' + (isLit(byId.get(a)) && isLit(byId.get(b)) ? 'lit' : '') + '" x1="' + x1.toFixed(1) + '" y1="' + y1.toFixed(1) +
      '" x2="' + x2.toFixed(1) + '" y2="' + y2.toFixed(1) + '"/>';
  }).join('');
  const towns = NATION_CITIES.map(city => {
    const [x, y] = hexCenter(NATION_GRID, city.hex);
    const note = city.home ? (web ? '门户网转载 ' + web + ' 次' : '本省') : city.central && central ? '央媒转载 ' + central + ' 次' : '';
    return '<g class="hex-seat' + (isLit(city) ? ' lit' : '') + (city.home ? ' home ours' : '') + '">' +
      (city.central ? '<path class="hex-star" d="M' + x.toFixed(1) + ' ' + (y - 8).toFixed(1) +
        ' l2.4 5 5.4 .6 -4 3.7 1.1 5.3 -4.9 -2.8 -4.9 2.8 1.1 -5.3 -4 -3.7 5.4 -.6z"/>' :
        '<rect x="' + (x - 5) + '" y="' + (y - 5) + '" width="10" height="10"/>') +
      '<text x="' + x.toFixed(0) + '" y="' + (y - 11).toFixed(0) + '" text-anchor="middle">' + h(city.name) + '</text>' +
      (note && !compact ? '<text class="hex-note accent" x="' + x.toFixed(0) + '" y="' + (y + 21).toFixed(0) + '" text-anchor="middle">' + h(note) + '</text>' : '') + '</g>';
  }).join('');
  return '<div class="map-canvas hex-map nation-map"><svg viewBox="0 0 720 460" role="img" aria-label="全国铁路干线发行格，点亮的格子有本报读者">' +
    '<rect class="hex-ground" width="720" height="460"/><g class="hex-cells">' + polygons + '</g><g class="hex-rail">' + lines + '</g>' + towns +
    '<text class="hex-caption" x="24" y="448">铁路干线 · 已覆盖 ' + lit.size + ' / ' + cells.length + ' 格</text></svg>' +
    (level >= 2 || compact ? '' : '<p class="map-lock">影响力达到「' + mapLevelNames()[2] + '」后，报纸随铁路走出江洲。</p>') + '</div>';
}

function nationTable(campaign) {
  const {central,home,lit} = nationState(campaign);
  const rows = [...NATION_CITIES].sort((a, b) => hexDistance(a.hex, home) - hexDistance(b.hex, home)).map(city => {
    const reached = city.home || lit.has(hexKey(city.hex));
    return '<tr><th scope="row">' + h(city.name) + '</th><td class="num">' + hexDistance(city.hex, home) + '</td><td>' +
      '<span class="chip ' + (reached ? 'chip-active' : 'chip-locked') + '">' + (city.home ? '本省' : reached ? '有读者' : '未到') + '</span>' +
      (city.central && central ? '<span class="chip chip-available">央媒转载 ' + central + '</span>' : '') + '</td></tr>';
  }).join('');
  return '<div class="map-card"><h3>沿线城市</h3><table class="grid-table compact"><thead><tr><th scope="col">城市</th><th scope="col" class="num">距离</th>' +
    '<th scope="col">状态</th></tr></thead><tbody>' + rows + '</tbody></table>' +
    '<p class="map-card-note">影响力从「' + mapLevelNames()[2] + '」涨到「' + mapLevelNames()[4] + '」的过程中，报纸沿铁路由近及远铺开。</p></div>';
}

function connectingChannels(channel) {
  const spot = CHANNEL_HEX[channel.id];
  return CHANNELS.filter(other => other.id !== channel.id && CHANNEL_HEX[other.id] && hexDistance(CHANNEL_HEX[other.id], spot) <= CHANNEL_REACH);
}

function mapChannelCard(campaign, id) {
  const channel = effectiveChannel(campaign,id);
  if (!channel) return '<div class="map-card map-card-empty"><h3>选择发行网点</h3><p>绿色格子是本报的发行覆盖区，红色是对手的，' +
    '斜线格是两家争夺的街区。虚线描边的格子紧挨覆盖区，那里的网点才能开拓。</p><p>点一个网点，查看销量、读者偏好，并直接开拓、暂停或设为重点配送。</p></div>';
  const state = channelMapState(campaign, channel);
  const editable = campaign.phase === 'desk';
  const cash = cashOf(campaign);
  const sold = mapStandSales(campaign).get(id) || 0;
  const rival = mapRivalOutlets(campaign).includes(id);
  const headline = campaign.phase === 'desk' && campaign.headline ? getStory(campaign, campaign.headline) : null;
  const maxInterest = Math.max(...Object.values(channel.interests));
  const interests = Object.entries(channel.interests).sort((a, b) => b[1] - a[1]).map(([topic, value]) =>
    '<li><span>' + h(topic) + '</span><meter min="0" max="' + maxInterest + '" value="' + value + '"></meter><b>' + value + '</b></li>').join('');
  const appeal = headline ? channel.interests[headline.section] || 0 : null;
  let controls;
  if (state === 'captured') controls = '<p class="map-card-note">《' + h(rivalPaperName(campaign)) + '》接手了这里。对手停刊后会重新开放。</p>';
  else if (state === 'locked') controls = '<p class="map-card-note">影响力达到「' + h(mapLevelNames()[channelRequiredLevel(campaign,channel)]) +
    '」' + (campaign.issueCount === 156 && ['county','capital'].includes(id) ? '，且进入第二年' : '') + '后可开拓，开拓费 ' + money(channel.setup) + ' 元。</p>';
  else if (state === 'remote') controls = '<p class="map-card-note">发行线还没铺到这里。可先开通相邻网点，或将附近网点升为发行站。相邻网点有' +
    h(connectingChannels(channel).map(other => other.name).join('、')) + '。</p>';
  else {
    const active = state === 'active';
    const focus = campaign.priority === id;
    const disabled = !editable || (state === 'available' && cash < channel.setup) ||
      (active ? campaign.active.length === 1 : campaign.active.length >= channelLimit(campaign));
    const paused = {...campaign, active:campaign.active.filter(base => base !== id)};
    const dependants = active ? CHANNELS.filter(other => !campaign.unlocked.includes(other.id) &&
      channelConnected(campaign,other) && !channelConnected(paused,other)) : [];
    controls = '<div class="report-buttons">' + (active ? '<button type="button" class="soft' + (focus ? ' accent' : '') +
      '" aria-pressed="' + focus + '" data-action="priority" data-id="' + id + '"' + (editable ? '' : ' disabled') + '>' +
      (focus ? '已重点配送' : '设为重点配送') + '</button>' : '') +
      '<button type="button" class="' + (state === 'available' ? 'issue' : 'soft') + '" data-action="channel" data-id="' + id + '"' +
      (disabled ? ' disabled' : '') + '>' + (active ? '暂停配送' : state === 'paused' ? '恢复配送' : '开拓 · ' + money(channel.setup) + ' 元') +
      '</button>' + (active ? upgradeButton(campaign,id) : '') + '</div>' + (editable ? (state === 'available' && cash < channel.setup ? '<p class="map-card-note">现金不足以开拓。</p>' : '') :
        '<p class="map-card-note">下期采编开始后可调整网点。</p>') +
      (dependants.length ? '<p class="map-card-note">暂停后，' + h(dependants.map(other => other.name).join('、')) + '将失去开拓线路。已开通的其他网点照常配送。</p>' : '');
  }
  return '<div class="map-card"><p class="map-card-kicker">' + h(CITY_MAP.nodes[id]?.district || '') + ' · ' + MAP_STATE_LABELS[state] + '</p>' +
    '<h3>' + h(channel.name) + '</h3>' + (campaign.unlocked.includes(id) && campaign.issueCount === 156 ?
      '<p>' + FEEDBACK_CONFIG.network.names[channelGrade(campaign,id)-1] + ' · 在营时覆盖 ' + channelRadius(campaign,id) + ' 圈</p>' : '') +
    '<dl class="map-card-stats">' + (state === 'active' ? '<div><dt>上期实售</dt><dd>' + number(sold) + '</dd></div>' : '') +
    '<div><dt>容量</dt><dd>' + number(channel.cap) + '</dd></div><div><dt>配送费</dt><dd>' + money(channel.fee) + '</dd></div>' +
    '<div><dt>代售/份</dt><dd>' + money(channel.commission) + '</dd></div><div><dt>开拓费</dt><dd>' + money(channel.setup) + '</dd></div></dl>' +
    (rival ? '<p class="map-card-note rival">《' + h(rivalPaperName(campaign)) + '》' + (campaign.phase === 'desk' ? '本期' : '上期') +
      '也在这里铺货，两家抢同一拨读者。</p>' : '') +
    '<h4>读者偏好 · 题材需求加成</h4><ul class="map-interests">' + interests + '</ul>' +
    (headline ? '<p class="map-card-note">本期头条「' + h(headline.section) + '」在这里' +
      (appeal >= 450 ? '很有号召力。' : appeal >= 250 ? '有一些读者。' : appeal > 0 ? '反响一般。' : '不太对胃口。') + '</p>' : '') +
    controls + '</div>';
}

function mapScaleFor(level) {
  return level >= 3 ? 'nation' : level >= 2 ? 'province' : 'city';
}

function influenceView() {
  const data = reportData(game);
  const levels = FEEDBACK_CONFIG.influence.levels;
  const sources = FEEDBACK_CONFIG.syndication.outlets;
  const level = data.influence.level;
  const scale = ['city', 'province', 'nation'].includes(mapScale) ? mapScale : 'city';
  if (mapSelection && !channelById(mapSelection)) mapSelection = null;
  const sales = mapStandSales(game);
  const total = [...sales.values()].reduce((sum, value) => sum + value, 0);
  const cover = cityCoverage(game);
  const land = cityDeliveryCells();
  const ownCells = land.filter(cell => cover.get(hexKey(cell)).own).length;
  const rivalCells = land.filter(cell => cover.get(hexKey(cell)).rival).length;
  const contested = land.filter(cell => cover.get(hexKey(cell)).own && cover.get(hexKey(cell)).rival).length;
  const openable = CHANNELS.filter(channel => channelMapState(game, channel) === 'available');
  const tabs = [['city', '城区', 0], ['province', '全省', 1], ['nation', '全国', 2]].map(([key, label, needed]) =>
    '<button type="button" class="soft' + (scale === key ? ' accent' : '') + '" aria-pressed="' + (scale === key) +
    '" data-action="map-scale" data-id="' + key + '">' + label + (level < needed ? ' · 未到' : '') + '</button>').join('');
  const body = scale === 'province' ? '<div class="city-map-layout"><div class="map-scroll">' + provinceMapMarkup(game) + '</div>' + provinceTable(game) + '</div>' :
    scale === 'nation' ? '<div class="city-map-layout"><div class="map-scroll">' + nationMapMarkup(game) + '</div>' + nationTable(game) + '</div>' :
    '<div class="city-map-layout"><div class="map-scroll">' + cityMapMarkup(game, mapSelection) + '</div>' + mapChannelCard(game, mapSelection) + '</div>' +
    '<p class="map-card-note">城区只计可配送街区。暂停网点会收回它的覆盖圈，其他在营网点继续送报。</p><p class="map-legend"><span class="key-own">本报覆盖</span><span class="key-rival">对手覆盖</span><span class="key-contested-hex">争夺街区</span>' +
    '<span class="key-frontier">可扩张边缘</span><span class="key-active">在营网点</span><span class="key-available">可开拓</span>' +
    '<span class="key-remote">未连通</span><span class="key-locked">未解锁</span></p>';
  return pageHeader('发行地图', newspaperName(game) + ' · ' + game.city + ' · ' + levels[level][0]) +
    '<dl class="metric-row"><div><dt>影响力</dt><dd>' + h(levels[level][0]) + ' ' + number(data.influence.points) + '</dd></div>' +
    '<div><dt>在营网点</dt><dd>' + game.active.length + ' / ' + channelLimit(game) + '</dd></div>' +
    '<div><dt>城区覆盖</dt><dd>' + ownCells + ' / ' + land.length + ' 格</dd></div><div><dt>对手覆盖</dt><dd>' + rivalCells + ' 格</dd></div>' +
    '<div><dt>争夺街区</dt><dd>' + contested + ' 格</dd></div><div><dt>上期零售</dt><dd>' + (total ? number(total) + ' 份' : '—') + '</dd></div>' +
    '<div><dt>可开拓</dt><dd>' + (openable.length ? openable.length + ' 处' : '暂无') + '</dd></div></dl>' +
    '<section class="panel influence-panel map-panel">' +
    '<div class="map-head"><div>' + influenceProgress(data.influence) +
    (openable.length ? '<p class="weekly-highlight">可开拓：' + h(openable.map(channel => channel.name).join('、')) + '</p>' : '') +
    '</div><nav class="map-tabs" aria-label="地图范围">' + tabs + '</nav></div>' + body +
    '<ol class="influence-keys">' + levels.map(([label, points], index) =>
      '<li class="' + (index <= level ? 'reached' : '') + '"><b>' + h(label) + '</b><span>' +
      number(points) + ' 点</span><span>' + h([...sources.filter(([, tier]) => tier === index).map(([name]) => name + '可转载'),
        ...CHANNELS.filter(channel => channel.level && channelRequiredLevel(game,channel) === index).map(channel => channel.name + '可开拓')].join('、') || '全线点亮') +
      (index <= level ? '' : ' · 待解锁') + '</span></li>').join('') + '</ol></section>';
}

function influenceRings(level, campaign = game) {
  // 升级演出用的小地图：全市看城区，全省看江洲，周边省份与全国看铁路线。
  const scale = mapScaleFor(level);
  const map = scale === 'nation' ? nationMapMarkup(campaign, true) : scale === 'province' ? provinceMapMarkup(campaign, true) :
    cityMapMarkup(campaign, null, false);
  const unlocked = CHANNELS.filter(channel => channel.level && channelRequiredLevel(campaign,channel) === level && !channelLocked(campaign,channel));
  return '<div class="map-reveal map-reveal-' + scale + '">' + map +
    (unlocked.length ? '<p class="map-reveal-note">新网点可开拓：' + h(unlocked.map(channel => channel.name).join('、')) + '</p>' : '') + '</div>';
}
