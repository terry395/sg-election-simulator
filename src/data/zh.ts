/**
 * Chinese names for the mock Lianhe Zaobao article: parties, and the places constituency names are
 * built from (GE2025 names, URA planning areas and neighbourhoods, auto-draw direction words).
 * Anything not listed stays in English, as Chinese newspapers do for unfamiliar names.
 */

export const ZH_PARTY: Record<string, { full: string; short: string }> = {
  PAP: { full: '人民行动党', short: '行动党' },
  WP: { full: '工人党', short: '工人党' },
  PSP: { full: '新加坡前进党', short: '前进党' },
  SDP: { full: '新加坡民主党', short: '民主党' },
  RDU: { full: '红点联合党', short: '红点联合党' },
  SDA: { full: '新加坡民主联盟', short: '民主联盟' },
  SPP: { full: '新加坡人民党', short: '人民党' },
  PAR: { full: '人民改革联盟', short: '改革联盟' },
  SUP: { full: '新加坡联合党', short: '联合党' },
  PPP: { full: '人民力量党', short: '人民力量党' },
  NSP: { full: '国民团结党', short: '国民团结党' },
  IND: { full: '独立人士', short: '独立人士' },
}

/** place names, keyed in lower case; multi-word keys are matched before single words */
const PLACES: Record<string, string> = {
  'admiralty': '海军部',
  'alexandra': '亚历山大',
  'aljunied': '阿裕尼',
  'anchorvale': '安谷',
  'ang mo kio': '宏茂桥',
  'balestier': '马里士他',
  'bangkit': '万吉',
  'bedok': '勿洛',
  'bedok reservoir': '勿洛蓄水池',
  'bencoolen': '明古连',
  'bendemeer': '明地迷亚',
  'bidadari': '比达达利',
  'bishan': '碧山',
  'boat quay': '驳船码头',
  'boon keng': '文庆',
  'boon lay': '文礼',
  'braddell': '布莱德',
  'braddell heights': '布莱德岭',
  'bugis': '武吉士',
  'bukit batok': '武吉巴督',
  'bukit gombak': '武吉甘柏',
  'bukit ho swee': '河水山',
  'bukit merah': '红山',
  'bukit panjang': '武吉班让',
  'bukit timah': '武吉知马',
  'changi': '樟宜',
  'cheng san': '静山',
  'chinatown': '牛车水',
  'choa chu kang': '蔡厝港',
  'chua chu kang': '蔡厝港',
  'clementi': '金文泰',
  'commonwealth': '联邦',
  'compassvale': '康埔桦',
  'dairy farm': '牛奶场',
  'dover': '多佛',
  'east coast': '东海岸',
  'everton park': '爱佛顿园',
  'farrer': '花拉',
  'fernvale': '芬维尔',
  'geylang': '芽笼',
  'geylang bahru': '芽笼峇鲁',
  'ghim moh': '锦茂',
  'gombak': '甘柏',
  'henderson': '亨德森',
  'holland': '荷兰',
  'hong kah': '丰加',
  'hougang': '后港',
  'jalan besar': '惹兰勿刹',
  'jalan kayu': '惹兰加由',
  'joo seng': '裕成',
  'jurong': '裕廊',
  'jurong east': '裕廊东',
  'jurong west': '裕廊西',
  'kaki bukit': '加基武吉',
  'kallang': '加冷',
  'kallang bahru': '加冷峇鲁',
  'kampong bugis': '甘榜武吉士',
  'kampong ubi': '甘榜乌美',
  'katong': '加东',
  'keat hong': '吉丰',
  'kebun bahru': '哥本峇鲁',
  'kebun baru': '哥本峇鲁',
  'kembangan': '景万岸',
  'kent ridge': '肯特岗',
  'khatib': '卡迪',
  'kim keat': '金吉',
  'kovan': '高文',
  'lavender': '劳明达',
  'lim chu kang': '林厝港',
  'little india': '小印度',
  'lorong ah soo': '罗弄亚苏',
  'lorong chuan': '罗弄泉',
  'loyang': '罗央',
  'macpherson': '麦波申',
  'mandai': '万礼',
  'marine parade': '马林百列',
  'marsiling': '马西岭',
  'marymount': '玛丽蒙',
  'mei chin': '美珍',
  'mountbatten': '蒙巴登',
  'nee soon': '义顺',
  'newton': '纽顿',
  'novena': '诺维娜',
  'one north': '纬壹',
  'orchard': '乌节',
  'outram': '欧南',
  'pasir panjang': '巴西班让',
  'pasir ris': '巴西立',
  'paya lebar': '巴耶利峇',
  'pei chun': '培群',
  'pioneer': '先驱',
  'potong pasir': '波东巴西',
  'punggol': '榜鹅',
  'queenstown': '女皇镇',
  'radin mas': '拉丁马士',
  'redhill': '红山',
  'river valley': '里峇峇利',
  'rochor': '梧槽',
  'seletar': '实里达',
  'sembawang': '三巴旺',
  'sengkang': '盛港',
  'senja': '森嘉',
  'sentosa': '圣淘沙',
  'serangoon': '实龙岗',
  'siglap': '实乞纳',
  'simei': '四美',
  'simpang': '新邦',
  'sungei kadut': '双溪加株',
  'tai seng': '大成',
  'taman jurong': '达曼裕廊',
  'tampines': '淡滨尼',
  'tampines changkat': '淡滨尼长吉',
  'tanglin': '东陵',
  'tanjong pagar': '丹戎巴葛',
  'tanjong rhu': '丹戎禺',
  'teban': '德万',
  'teck whye': '德惠',
  'telok blangah': '直落布兰雅',
  'tengah': '登加',
  'thomson': '汤申',
  'tiong bahru': '中峇鲁',
  'toa payoh': '大巴窑',
  'toh guan': '卓源',
  'tuas': '大士',
  'ubi': '乌美',
  'ulu pandan': '乌鲁班丹',
  'upper thomson': '汤申上段',
  'west coast': '西海岸',
  'whampoa': '黄埔',
  'woodlands': '兀兰',
  'xilin': '锡林',
  'yew tee': '油池',
  'yio chu kang': '杨厝港',
  'yishun': '义顺',
  'yuhua': '裕华',
  'yunnan': '云南',
}

/** descriptor words that follow a place name */
const WORDS: Record<string, string> = {
  'north-east': '东北',
  'north-west': '西北',
  'south-east': '东南',
  'south-west': '西南',
  north: '北',
  south: '南',
  east: '东',
  west: '西',
  central: '中',
  'town centre': '市镇中心',
  centre: '中心',
  heights: '岭',
  hill: '山',
  hills: '山',
  park: '园',
  gardens: '花园',
  garden: '花园',
  view: '景',
  vale: '谷',
  crescent: '弯',
  drive: '道',
  road: '路',
  rise: '坡',
  upper: '上',
}

/** Greedy longest match over the words of one name part; null if any word is unknown. */
function translatePart(part: string): string | null {
  const words = part.toLowerCase().split(/\s+/).filter(Boolean)
  let out = ''
  let i = 0
  while (i < words.length) {
    let hit: string | null = null
    for (let j = words.length; j > i; j--) {
      const key = words.slice(i, j).join(' ')
      const zh = PLACES[key] ?? WORDS[key]
      if (zh) { hit = zh; i = j; break }
    }
    if (!hit) return null
    out += hit
  }
  return out
}

/** "Marine Parade-Braddell Heights" → "马林百列-布莱德岭"; unknown parts stay in English. */
export function zhPlace(name: string): string {
  return name
    .split(/\s*[-–]\s*/)
    .map((p) => translatePart(p) ?? p)
    .join('-')
}

/** "Sengkang", GRC → "盛港集选区" */
export function zhSeat(name: string, type: 'SMC' | 'GRC'): string {
  const base = zhPlace(name.replace(/ (GRC|SMC)$/i, ''))
  return `${base}${/[A-Za-z]$/.test(base) ? ' ' : ''}${type === 'GRC' ? '集选区' : '单选区'}`
}

/** Chinese names of well-known figures, as Chinese-language media write them */
export const ZH_PEOPLE: Record<string, string> = {
  'Lawrence Wong': '黄循财',
  'Lee Hsien Loong': '李显龙',
  'Gan Kim Yong': '颜金勇',
  'K. Shanmugam': '尚穆根',
  'Chan Chun Sing': '陈振声',
  'Ong Ye Kung': '王乙康',
  'Vivian Balakrishnan': '维文',
  'Grace Fu': '傅海燕',
  'Masagos Zulkifli': '马善高',
  'Josephine Teo': '杨莉明',
  'Desmond Lee': '李智陞',
  'Indranee Rajah': '英兰妮',
  'Edwin Tong': '唐振辉',
  'Tan See Leng': '陈诗龙',
  'Chee Hong Tat': '徐芳达',
  'Ng Chee Meng': '黄志明',
  'Sim Ann': '沈颖',
  'Zaqy Mohamad': '扎奇',
  'Seah Kian Peng': '佘健平',
  'Pritam Singh': '毕丹星',
  'Sylvia Lim': '林瑞莲',
  'Gerald Giam': '严燕松',
  'He Ting Ru': '何廷儒',
  'Jamus Lim': '林志蔚',
  'Louis Chua': '蔡庆威',
  'Dennis Tan': '陈立峰',
  'Tan Cheng Bock': '陈清木',
  'Leong Mun Wai': '梁文辉',
  'Hazel Poa': '潘丽萍',
  'Chee Soon Juan': '徐顺全',
  'Paul Tambyah': '淡比亚',
  'Lim Tean': '林鼎',
  'Goh Meng Seng': '吴明盛',
}

/** demographic groups by swing id */
export const ZH_GROUP: Record<string, string> = {
  a0: '21至34岁的年轻选民',
  a1: '35至49岁的选民',
  a2: '50至64岁的选民',
  a3: '65岁及以上的年长选民',
  e0: '华族选民',
  e1: '马来族选民',
  e2: '印度族选民',
  e3: '其他种族选民',
  h0: '一至三房式组屋居民',
  h1: '四房式组屋居民',
  h2: '五房式组屋和执行共管公寓居民',
  h3: '私人公寓居民',
  h4: '有地住宅居民',
}
