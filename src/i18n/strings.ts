/**
 * Every user-facing string, in both languages, in one place.
 *
 * The English is the source of truth; the Japanese is a rewrite rather than a
 * translation, because the whole point of the site is that the explanation
 * sounds like a person talking. A literal translation of an English sentence
 * about billing reads like AWS's own docs, which is what we're here to avoid.
 */
export const LANGS = ['en', 'ja'] as const;
export type Lang = (typeof LANGS)[number];

export const DEFAULT_LANG: Lang = 'en';

/** Prefix for a path in the given language. English is unprefixed. */
export const localePath = (lang: Lang, path = '/') =>
  lang === DEFAULT_LANG ? path : `/${lang}${path}`;

/** Strip a locale prefix so the switcher can point at the same page. */
export const stripLocale = (pathname: string) => {
  for (const l of LANGS) {
    if (l === DEFAULT_LANG) continue;
    if (pathname === `/${l}` || pathname === `/${l}/`) return '/';
    if (pathname.startsWith(`/${l}/`)) return pathname.slice(l.length + 1);
  }
  return pathname;
};

export const LANG_NAME: Record<Lang, string> = { en: 'EN', ja: '日本語' };

interface MeterCopy {
  name: string;
  test: string;
  counts: string;
  trap: string;
  onTheBill: string;
}

interface Strings {
  htmlLang: string;
  siteTitle: string;
  siteDescription: string;
  markTop: string;
  markBottom: string;
  skip: string;
  nav: { home: string; topics: string; services: string };
  footerPrices: string;
  footerDisclaimer: string;

  meters: Record<'time' | 'egress' | 'calls', MeterCopy>;
  meterHeads: { counts: string; trap: string; bill: string };

  hero: {
    eyebrow: string;
    headA: string;
    headB: string;
    lede: string;
    rigHead: string;
    capElapsed: string;
    capAccrued: string;
    rigFoot: string;
    rigAssume: string;
  };

  sections: { meters: string; reading: string; topics: string };

  reading: {
    lede: string;
    diagramCaption: string;
    note: string;
    nodeClient: string;
    nodeIgw: string;
    nodeIgwSub: string;
    hopIn: string;
    hopOut: string;
  };

  /** Words baked into the diagram components. */
  diagram: { free: string; noCharge: string; meter: string; idle: string; nothing: string; rings: string };

  topicsLede: string;
  checked: string;
  categories: Record<
    'compute' | 'storage' | 'database' | 'networking' | 'security' | 'integration' | 'management' | 'analytics',
    string
  >;
  services: {
    title: string;
    lede: string;
    freeNote: string;
    trapHead: string;
    billOnHead: string;
    billOnHint: string;
    sameShapeHead: string;
    sameShapeHint: string;
    sourcesHead: string;
    mediumConfidence: string;
    filterAll: string;
    filterFree: string;
    count: string;
  };
  oneLiner: string;
  a11y: { billed: string; notBilled: string };
}

export const STRINGS: Record<Lang, Strings> = {
  en: {
    htmlLang: 'en',
    siteTitle: 'AWS Bill Explained',
    siteDescription:
      'Every AWS bill is three meters. Learn the three and pricing pages become a lookup.',
    markTop: 'AWS Bill',
    markBottom: 'Explained',
    skip: 'Skip to content',
    nav: { home: 'The three meters', topics: 'Topics', services: 'Services' },
    footerPrices:
      "Prices are us-east-1, on-demand, checked against AWS's own documentation on the date shown on each page. Rates move and vary by region, so take the meters home rather than the numbers — which meter turns is the part that stays true.",
    footerDisclaimer: 'An unofficial explainer. Not affiliated with Amazon Web Services.',

    meters: {
      time: {
        name: 'Time',
        test: 'Does the thing exist?',
        counts: 'Capacity × duration. Instances bill per second, storage bills per GB-month.',
        trap: 'It runs whether or not you use it. Forgetting to delete costs more than forgetting to stop.',
        onTheBill: 'BoxUsage, Hours, GB-Mo',
      },
      egress: {
        name: 'Egress',
        test: 'Did bytes cross a boundary on the way out?',
        counts: 'Gigabytes leaving. Everything arriving is free.',
        trap: '"Out" is not only the internet. Crossing an Availability Zone counts, and bills both ways.',
        onTheBill: 'DataTransfer-Out-Bytes',
      },
      calls: {
        name: 'Calls',
        test: 'Did you invoke the API?',
        counts: 'The number of API operations. Payload size and direction are irrelevant.',
        trap: 'Most services do not have this meter at all. EC2, IAM and STS charge nothing per call.',
        onTheBill: 'Requests',
      },
    },
    meterHeads: { counts: 'Counts', trap: 'Gets missed', bill: 'On the bill' },

    hero: {
      eyebrow: 'How an AWS bill is built',
      headA: 'Every bill is',
      headB: 'three meters',
      lede: "AWS documents pricing one service at a time, so every new service looks like a new billing model to learn. It isn't. Three meters exist. A service either has a given meter or it doesn't — and once you can name which, a pricing page stops being a lesson and becomes a lookup.",
      rigHead:
        'Since you opened this page, one t3.micro somebody forgot to terminate has been turning its meter.',
      capElapsed: 'Elapsed',
      capAccrued: 'Accrued, USD',
      rigFoot:
        'You sent no requests. You moved no data. The meter ran anyway — that is the whole of meter one, and it is the one that quietly dominates most bills.',
      rigAssume:
        't3.micro on-demand at $0.0104/hour, us-east-1. EBS and the public IPv4 address would each add their own line.',
    },

    sections: { meters: 'The three meters', reading: 'Reading a diagram here', topics: 'Topics' },

    reading: {
      lede: 'One rule holds across every picture on this site: lit means billed, dim means free. You can find the money before you read a word. Here is the simplest case — a request arrives, a response leaves.',
      diagramCaption:
        'EC2 serving a 1 GB response to the internet. The request in is dark; only the response out glows.',
      note: 'The lamp on the EC2 box is the other half of the story: that box was turning meter one before the request arrived, and keeps turning it after the response is sent.',
      nodeClient: 'Client',
      nodeIgw: 'Internet Gateway',
      nodeIgwSub: 'no charge',
      hopIn: 'Request (inbound)',
      hopOut: 'Response, 1 GB (outbound)',
    },

    diagram: {
      free: 'free',
      noCharge: 'no charge',
      meter: 'Meter',
      idle: 'idle',
      nothing: 'Nothing here turns a meter.',
      rings: 'The centre is free. Every ring you cross outward is a toll gate.',
    },

    topicsLede: 'Each page opens with the model, then earns it.',
    checked: 'Checked',
    oneLiner: 'In one line',
    categories: {
      compute: 'Compute',
      storage: 'Storage',
      database: 'Database',
      networking: 'Networking',
      security: 'Security & identity',
      integration: 'Integration',
      management: 'Management',
      analytics: 'Analytics & AI',
    },
    services: {
      title: 'Every service, by meter',
      lede: 'Which meters a service turns, and the one thing people get wrong about each. No rates — those move; the meters do not.',
      freeNote: 'This service turns no meters of its own. Read the trap below for what it makes you pay for elsewhere.',
      trapHead: 'What gets missed',
      billOnHead: 'Find it on your bill',
      billOnHint: 'Filter Cost Explorer or your Cost and Usage Report by these usage types. A usage type with no region prefix means us-east-1.',
      sameShapeHead: 'Bills the same way',
      sameShapeHint: 'These services turn exactly the same meters, so what you learn here transfers.',
      sourcesHead: 'Checked against',
      mediumConfidence: 'Classified with medium confidence — the meter set could not be fully confirmed from primary AWS documentation. Verify against the sources before acting on it.',
      filterAll: 'All',
      filterFree: 'Free',
      count: 'services',
    },
    a11y: { billed: 'billed', notBilled: 'not billed' },
  },

  ja: {
    htmlLang: 'ja',
    siteTitle: 'AWS Bill Explained',
    siteDescription:
      'AWS の請求書で回っているメーターは3つだけ。3つ覚えれば、料金ページは勉強ではなく参照になる。',
    markTop: 'AWS Bill',
    markBottom: 'Explained',
    skip: '本文へスキップ',
    nav: { home: '3つのメーター', topics: 'トピック', services: 'サービス' },
    footerPrices:
      '価格は us-east-1 のオンデマンドを基準に、各ページ記載の日付時点で AWS の一次情報を確認した値。レートは変わるしリージョンでも違うので、金額そのものではなく「どのメーターが回るか」を持ち帰ってほしい。そこは変わらない。',
    footerDisclaimer: 'AWS 公式とは無関係の非公式な解説。',

    meters: {
      time: {
        name: '稼働時間',
        test: 'それは「存在している」か？',
        counts: '量 × 時間。インスタンスは秒単位、ストレージは GB-month。',
        trap: '使っていなくても回る。止め忘れより「消し忘れ」のほうが高くつく。',
        onTheBill: 'BoxUsage, Hours, GB-Mo',
      },
      egress: {
        name: '外向き転送',
        test: 'バイトが境界を「外に」越えたか？',
        counts: '出ていったギガバイト。入ってくる分は無料。',
        trap: '「外」はインターネットだけじゃない。AZ を跨げばそれも境界で、しかも往復で課金される。',
        onTheBill: 'DataTransfer-Out-Bytes',
      },
      calls: {
        name: 'API 回数',
        test: 'API を「呼んだ」か？',
        counts: '呼んだ回数。サイズも方向も関係ない。',
        trap: 'そもそもこのメーターを持たないサービスが多い。EC2・IAM・STS は呼び放題で無料。',
        onTheBill: 'Requests',
      },
    },
    meterHeads: { counts: '数えているもの', trap: '見落とすところ', bill: '請求書での名前' },

    hero: {
      eyebrow: 'AWS の請求書の成り立ち',
      headA: '回っているメーターは',
      headB: '3つだけ',
      lede: 'AWS の料金はサービスごとに書かれている。だから新しいサービスを触るたびに課金の仕組みを覚え直す羽目になる。実際はそうじゃない。メーターは3種類しかなく、各サービスはそのどれを持っているかが違うだけだ。どれが回るか言えるようになれば、料金ページは勉強ではなく参照になる。',
      rigHead:
        'あなたがこのページを開いてから、消し忘れられた t3.micro が 1 台、メーターを回し続けている。',
      capElapsed: '経過',
      capAccrued: '発生額 (USD)',
      rigFoot:
        'リクエストは送っていない。データも動かしていない。それでもメーターは回った。これが1本目のメーターの全部で、たいていの請求書を静かに支配しているのもこれだ。',
      rigAssume:
        't3.micro オンデマンド $0.0104/時 (us-east-1) 換算。EBS と パブリック IPv4 はそれぞれ別に計上される。',
    },

    sections: { meters: '3つのメーター', reading: '図の読み方', topics: 'トピック' },

    reading: {
      lede: 'このサイトの図は全部ひとつのルールで描いてある。光っていれば課金、暗ければ無料。文章を読む前に、どこで金が出ているか分かる。まずは一番単純な形 — リクエストが来て、レスポンスが出ていく。',
      diagramCaption:
        'EC2 が 1GB のレスポンスをインターネットに返すところ。行きは暗く、帰りだけが光る。',
      note: 'EC2 の箱についているランプが話の残り半分。あの箱はリクエストが来る前から1本目のメーターを回していて、レスポンスを返した後も回し続ける。',
      nodeClient: 'クライアント',
      nodeIgw: 'Internet Gateway',
      nodeIgwSub: '無料',
      hopIn: 'リクエスト (inbound)',
      hopOut: 'レスポンス 1GB (outbound)',
    },

    diagram: {
      free: '無料',
      noCharge: '無料',
      meter: '課金メーター',
      idle: '回らない',
      nothing: 'このやり取りで回るメーターはゼロ。',
      rings: '内側は無料。リングを1枚外に越えるたびに関所がある。',
    },

    topicsLede: '各ページはまず結論のモデルを渡してから、その根拠に降りていく。',
    checked: '確認日',
    oneLiner: 'ひとことで言うと',
    categories: {
      compute: 'コンピュート',
      storage: 'ストレージ',
      database: 'データベース',
      networking: 'ネットワーク',
      security: 'セキュリティ・認証認可',
      integration: '連携・メッセージング',
      management: '管理・可観測性',
      analytics: '分析・AI',
    },
    services: {
      title: '全サービスをメーターで引く',
      lede: 'どのメーターが回るか、そしてそのサービスで一番よく間違えられる点。金額は載せない — 動くから。メーターは動かない。',
      freeNote: 'このサービス自体はメーターを回さない。下の「見落とすところ」に、どこに金が移るかを書いてある。',
      trapHead: '見落とすところ',
      billOnHead: '請求書での探し方',
      billOnHint: 'Cost Explorer や CUR をこの usage type で絞り込む。リージョン接頭辞がないものは us-east-1 を指す。',
      sameShapeHead: '同じ回り方をするサービス',
      sameShapeHint: '回るメーターが完全に同じなので、ここで理解したことがそのまま使える。',
      sourcesHead: '裏取りに使った一次情報',
      mediumConfidence: '確度は中。AWS の一次情報だけではメーターの組み合わせを確定できなかった。判断に使う前に出典を確認してほしい。',
      filterAll: 'すべて',
      filterFree: '無料',
      count: '件',
    },
    a11y: { billed: '課金される', notBilled: '課金されない' },
  },
};

export const t = (lang: Lang) => STRINGS[lang];
