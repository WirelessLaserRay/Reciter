import { db } from "@/lib/db";
import { useDeckStore } from "@/stores/useDeckStore";
import { extractPhoneticFromText } from "@/lib/phonetic";
import { splitMeaningText, isPhrase } from "@/lib/meaning";
import { parseAPKG } from "@/lib/apkg-parser";

export type HubCategory = "all" | "anki_hub" | "exam" | "study_abroad" | "general" | "major";

export interface HubCardSample {
  front: string;
  pos?: string;
  back: string;
  phonetic?: string;
  example?: string;
  example_cn?: string;
  tags?: string[];
}

export interface HubDeckMeta {
  id: string;
  name: string;
  format?: "json" | "apkg";
  category: "anki_hub" | "exam" | "study_abroad" | "general" | "major";
  categoryLabel: string;
  tags: string[];
  wordCount: number;
  difficulty: number; // 1-5 颗星
  description: string;
  source: string;
  builtin?: boolean;
  localPath?: string;
  remoteUrls?: string[];
  sampleWords: HubCardSample[];
  author?: string;
}

/** 外部开放词库平台与生态索引 */
export interface OpenPlatformResource {
  id: string;
  title: string;
  subtitle: string;
  category: "Anki 生态" | "开源词典库" | "学术语料";
  tags: string[];
  description: string;
  url: string;
  guide: string;
}

export const OPEN_PLATFORMS: OpenPlatformResource[] = [
  {
    id: "ankiweb",
    title: "AnkiWeb 官方共享牌组广场",
    subtitle: "全球最大的 Anki 记忆库与闪卡生态",
    category: "Anki 生态",
    tags: ["Anki官方", "全学科", "全球多语种", "开源免费"],
    description:
      "汇聚全球学习者分享的数十万个经典牌组，覆盖英语日常口语、专业八级、医学解剖、司法考试、计算机与世界地理。下载 .apkg 格式文件后即可在 Reciter 中直接导入。",
    url: "https://ankiweb.net/shared/decks/",
    guide: "在 AnkiWeb 搜索并下载 .apkg 文件，直接拖入 Reciter 导入页或词库广场自定义导入。",
  },
  {
    id: "ankichina",
    title: "AnkiChina 中文记忆库社区",
    subtitle: "国内规模最大的 Anki 学习者互助交流圈",
    category: "Anki 生态",
    tags: ["中文社区", "考研升学", "四六级", "考证记忆"],
    description:
      "针对国内考试（中高考、大学英语四六级、考研英语一/二、教师资格证、CPA、法考）深度定制的双语记忆库与高效发音包，适合中国应试与技能提升场景。",
    url: "https://www.ankichina.net/",
    guide: "可在社区中获取精品 Anki 牌组分享链接，下载 .apkg 后在 Reciter 快速加载。",
  },
  {
    id: "qwerty",
    title: "Qwerty Learner 词典静态仓库",
    subtitle: "结构化标准开放单词库集群",
    category: "开源词典库",
    tags: ["GitHub开源", "大纲规范", "程序员代码词库"],
    description:
      "知名开源背单词打字项目 RealKai42/qwerty-learner 的基础词库。包含权威中高考、四六级、专四专八、雅思托福、计算机编程核心词，结构严谨轻量。",
    url: "https://github.com/RealKai42/qwerty-learner",
    guide: "Reciter 词库广场已深度接入该仓库 CDN 全量镜像，本广场所有词书均支持一键秒拉。",
  },
  {
    id: "ecdict",
    title: "Skywind ECDICT 简明英汉全量词典",
    subtitle: "77 万词条权威开源综合英汉词库",
    category: "开源词典库",
    tags: ["77万词条", "柯林斯星级", "COCA词频", "大纲分类"],
    description:
      "由 Skywind3000 开源并长期维护的顶级英汉词典，收录超过 77 万词条，包含详细词根、柯林斯星级、BNC 词频与考试标记，是背单词与语料解析的工业级基石。",
    url: "https://github.com/skywind3000/ECDICT",
    guide: "适合高级用户导出专属语料词单并在 Reciter 导入层自定义分隔符批量入库。",
  },
];

const CDN_BASE_JSDELIVR = "https://cdn.jsdelivr.net/gh/RealKai42/qwerty-learner@master/public/dicts/";
const CDN_BASE_FASTLY = "https://fastly.jsdelivr.net/gh/RealKai42/qwerty-learner@master/public/dicts/";
const CDN_BASE_GITHUB = "https://raw.githubusercontent.com/RealKai42/qwerty-learner/master/public/dicts/";

function makeQwertyUrls(filename: string): string[] {
  return [
    `${CDN_BASE_JSDELIVR}${filename}`,
    `${CDN_BASE_FASTLY}${filename}`,
    `${CDN_BASE_GITHUB}${filename}`,
  ];
}

/** 词库广场精选词库索引清单（全量真实词条） */
export const HUB_DECKS: HubDeckMeta[] = [
  // ==================== Anki 记忆库精选专区 ====================
  {
    id: "anki_daily_spoken",
    name: "Anki精选：地道英语高频口语情景闪卡",
    format: "apkg",
    category: "anki_hub",
    categoryLabel: "Anki 记忆库",
    tags: ["Anki", "APKG", "地道口语", "交际表达"],
    wordCount: 15,
    difficulty: 2,
    description:
      "纯正 Anki 2.0 原生牌组（.apkg 格式），精选日常生活与海外交流中最高频的地道短语与成语，搭配场景化例句与美音音标，体验 Anki 格式无缝兼容。",
    source: "Anki 精选",
    builtin: true,
    localPath: "decks/anki_daily_spoken.apkg",
    sampleWords: [
      {
        front: "Break a leg!",
        pos: "",
        back: "祝你好运！（演出或比赛前鼓励语）",
        phonetic: "/breɪk ə leɡ/",
        example: "Break a leg at your presentation today!",
        tags: ["口语", "习语"],
      },
      {
        front: "Call it a day",
        pos: "",
        back: "今天就到此为止吧，收工",
        phonetic: "/kɔːl ɪt ə deɪ/",
        example: "We've made good progress, let's call it a day.",
        tags: ["口语", "工作"],
      },
      {
        front: "Under the weather",
        pos: "",
        back: "身体略感不适，有点小病",
        phonetic: "/ˈʌndər ðə ˈweðər/",
        example: "I'm feeling a bit under the weather today.",
        tags: ["口语", "日常"],
      },
    ],
  },
  {
    id: "anki_programmer_terms",
    name: "Anki精选：全栈开发者核心技术术语与黑话",
    format: "apkg",
    category: "anki_hub",
    categoryLabel: "Anki 记忆库",
    tags: ["Anki", "APKG", "全栈架构", "技术黑话", "工程规范"],
    wordCount: 20,
    difficulty: 3,
    description:
      "面向现代程序员制作的 Anki 专业牌组，涵盖幂等性、并发/并行、中间件、垃圾回收与内存优化等核心计算机术语与架构实践。",
    source: "Anki 精选",
    builtin: true,
    localPath: "decks/anki_programmer_terms.apkg",
    sampleWords: [
      {
        front: "Idempotent",
        pos: "adj.",
        back: "幂等的（多次执行结果与单次执行完全相同）",
        phonetic: "/aɪˈdempətənt/",
        example: "RESTful PUT and DELETE requests should be strictly idempotent.",
        tags: ["架构", "HTTP"],
      },
      {
        front: "Deprecated",
        pos: "adj.",
        back: "已废弃的，不建议使用的",
        phonetic: "/ˈdeprəkeɪtɪd/",
        example: "@deprecated Use newAsyncMethod() instead in v2.0.",
        tags: ["工程", "代码"],
      },
      {
        front: "Middleware",
        pos: "n.",
        back: "中间件，介于操作系统/框架与应用之间的组件",
        phonetic: "/ˈmɪdlweə/",
        example: "The authentication middleware verifies user JWT tokens before routing.",
        tags: ["后端", "架构"],
      },
    ],
  },

  // ==================== 升学与考试 (Exam) ====================
  {
    id: "kaoyan_core",
    name: "考研英语历年真题核心词 (3700+全量词)",
    category: "exam",
    categoryLabel: "考研升学",
    tags: ["考研", "真题高频", "全量词库"],
    wordCount: 3728,
    difficulty: 4,
    description:
      "包含考研英语历年真题 3,728 个完整高频核心词，覆盖大纲核心词汇、熟词生义与长难句关键意群。支持本地离线秒开导入。",
    source: "官方内置",
    builtin: true,
    localPath: "decks/kaoyan_core.json",
    remoteUrls: makeQwertyUrls("KaoYan_3_T.json"),
    sampleWords: [
      {
        front: "advocate",
        pos: "vt.",
        back: "提倡，主张；拥护",
        phonetic: "/ˈædvəkeɪt/",
        example: "Many experts advocate a healthy diet and regular physical exercise.",
        tags: ["考研", "核心"],
      },
      {
        front: "compromise",
        pos: "vi.",
        back: "妥协，折中；vt. 危及，损害",
        phonetic: "/ˈkɒmprəmaɪz/",
        example: "They were unwilling to compromise on such vital principles.",
        tags: ["考研", "熟词生义"],
      },
      {
        front: "diminish",
        pos: "vi.",
        back: "变小，减少；vt. 贬低，轻视",
        phonetic: "/dɪˈmɪnɪʃ/",
        example: "The passage of time did not diminish the intensity of his memory.",
        tags: ["考研", "重点"],
      },
    ],
  },
  {
    id: "cet4_core",
    name: "大学英语四级 (CET-4) 核心词 (2600+全量词)",
    category: "exam",
    categoryLabel: "大学四六级",
    tags: ["四级", "大纲重点", "全量词库"],
    wordCount: 2607,
    difficulty: 2,
    description:
      "大学英语四级考纲标准词汇全量收录，共 2,607 词。包含标准美英双音标、精炼释义与考点短语。支持本地离线秒开导入。",
    source: "官方内置",
    builtin: true,
    localPath: "decks/cet4_core.json",
    remoteUrls: makeQwertyUrls("CET4_T.json"),
    sampleWords: [
      {
        front: "abandon",
        pos: "vt.",
        back: "放弃，遗弃；抛弃",
        phonetic: "/əˈbændən/",
        tags: ["四级", "核心"],
      },
      {
        front: "barrier",
        pos: "n.",
        back: "障碍，屏障；界线",
        phonetic: "/ˈbæriə/",
        tags: ["四级", "核心"],
      },
      {
        front: "cancel",
        pos: "vt.",
        back: "取消，撤销；删去",
        phonetic: "/'kænsl/",
        tags: ["四级", "大纲"],
      },
    ],
  },
  {
    id: "cet6_core",
    name: "大学英语六级 (CET-6) 高频核心词 (2300+全量词)",
    category: "exam",
    categoryLabel: "大学四六级",
    tags: ["六级", "高分冲刺", "进阶词汇"],
    wordCount: 2345,
    difficulty: 3,
    description:
      "精炼六级核心难词、新增词与易混短语，共 2,345 词。帮助四级已过考生突破六级阅读长难句与听力生僻词。",
    source: "开源社区",
    remoteUrls: makeQwertyUrls("CET6_T.json"),
    sampleWords: [
      {
        front: "deteriorate",
        pos: "vi.",
        back: "恶化，变坏；退化",
        phonetic: "/dɪˈtɪəriəreɪt/",
        tags: ["六级", "核心"],
      },
      {
        front: "plausible",
        pos: "adj.",
        back: "貌似有理的；华而不实的",
        phonetic: "/ˈplɔːzəbl/",
        tags: ["六级", "高频"],
      },
      {
        front: "paradox",
        pos: "n.",
        back: "矛盾，反论；似非而是的说法",
        phonetic: "/ˈpærədɒks/",
        tags: ["六级", "重点"],
      },
    ],
  },
  {
    id: "gaokao_3500",
    name: "高考英语考纲核心 3500 词 (3800+全量词)",
    category: "exam",
    categoryLabel: "考研升学",
    tags: ["高考", "考纲标准", "中学必背"],
    wordCount: 3893,
    difficulty: 2,
    description:
      "教育部高考英语大纲规定词汇，涵盖初高中所有必修单词与常见固定短语，共 3,893 完整词条，打牢英文底层地基。",
    source: "开源社区",
    remoteUrls: makeQwertyUrls("GaoKao_3500.json"),
    sampleWords: [
      {
        front: "appreciate",
        pos: "vt.",
        back: "感激；欣赏，鉴赏",
        phonetic: "/əˈpriːʃieɪt/",
        tags: ["高考"],
      },
      {
        front: "consequence",
        pos: "n.",
        back: "结果，后果；重要性",
        phonetic: "/ˈkɒnsɪkwəns/",
        tags: ["高考"],
      },
      {
        front: "distinguish",
        pos: "vt.",
        back: "区分，辨别；使出众",
        phonetic: "/dɪˈstɪŋɡwɪʃ/",
        tags: ["高考"],
      },
    ],
  },
  {
    id: "tem4_core",
    name: "英语专业四级 (TEM-4) 核心词汇 (4000+全量词)",
    category: "exam",
    categoryLabel: "大学四六级",
    tags: ["专四", "英语专业", "专业考试"],
    wordCount: 4025,
    difficulty: 4,
    description:
      "全国英语专业四级统考真题高频核心词库，涵盖语言学、文学阅读、精读与听写核心词，词汇量全面扎实。",
    source: "开源社区",
    remoteUrls: makeQwertyUrls("Level4luan_2_T.json"),
    sampleWords: [
      {
        front: "articulate",
        pos: "vt.",
        back: "明确表达；清晰发音；adj. 表达清晰的",
        phonetic: "/ɑːˈtɪkjuleɪt/",
        tags: ["专四", "核心"],
      },
      {
        front: "benevolent",
        pos: "adj.",
        back: "仁慈的，乐善好施的",
        phonetic: "/bəˈnevələnt/",
        tags: ["专四", "高频"],
      },
      {
        front: "conspicuous",
        pos: "adj.",
        back: "显眼的，引人注目的",
        phonetic: "/kənˈspɪkjuəs/",
        tags: ["专四", "重点"],
      },
    ],
  },
  {
    id: "tem8_core",
    name: "英语专业八级 (TEM-8) 冲刺词汇 (12000+全量词)",
    category: "exam",
    categoryLabel: "大学四六级",
    tags: ["专八", "英语顶峰", "高难词汇"],
    wordCount: 12197,
    difficulty: 5,
    description:
      "国内最高等级英语专业八级词库，覆盖学术社论、文学原著、高级同义辨析与生僻学术词，全面挑战最高水平。",
    source: "开源社区",
    remoteUrls: makeQwertyUrls("Level8luan_2_T.json"),
    sampleWords: [
      {
        front: "aberration",
        pos: "n.",
        back: "偏离常规，异常现象；偏差",
        phonetic: "/ˌæbəˈreɪʃn/",
        tags: ["专八"],
      },
      {
        front: "ephemeral",
        pos: "adj.",
        back: "短暂的，朝生暮死的",
        phonetic: "/ɪˈfemərəl/",
        tags: ["专八"],
      },
      {
        front: "ubiquitous",
        pos: "adj.",
        back: "普遍存在的，无处不在的",
        phonetic: "/juːˈbɪkwɪtəs/",
        tags: ["专八"],
      },
    ],
  },

  // ==================== 出国与留学 (Study Abroad) ====================
  {
    id: "toefl_core",
    name: "托福 (TOEFL) 核心重点词汇 (4200+全量词)",
    category: "study_abroad",
    categoryLabel: "出国留学",
    tags: ["托福", "北美留学", "学科交叉"],
    wordCount: 4264,
    difficulty: 4,
    description:
      "涵盖北美托福听力与阅读常考的自然科学、天文学、地质学、社会历史与艺术等核心学科词汇，共 4,264 词。",
    source: "开源社区",
    remoteUrls: makeQwertyUrls("TOEFL_3_T.json"),
    sampleWords: [
      {
        front: "catastrophe",
        pos: "n.",
        back: "大灾难，灾祸",
        phonetic: "/kəˈtæstrəfi/",
        tags: ["托福", "地学"],
      },
      {
        front: "hibernate",
        pos: "vi.",
        back: "冬眠，蛰伏",
        phonetic: "/ˈhaɪbəneɪt/",
        tags: ["托福", "生物"],
      },
      {
        front: "sediment",
        pos: "n.",
        back: "沉淀物，沉积物",
        phonetic: "/ˈsedɪmənt/",
        tags: ["托福", "地质"],
      },
    ],
  },
  {
    id: "ielts_core",
    name: "雅思 (IELTS) 核心学术高频词 (3500+全量词)",
    category: "study_abroad",
    categoryLabel: "出国留学",
    tags: ["雅思", "学术类A类", "听说读写"],
    wordCount: 3575,
    difficulty: 4,
    description:
      "针对雅思学术类（A类）阅读与大作文精准提炼，包含学术动词、地道逻辑连接短语与图表写作必备词汇。",
    source: "开源社区",
    remoteUrls: makeQwertyUrls("IELTS_3_T.json"),
    sampleWords: [
      {
        front: "coherent",
        pos: "adj.",
        back: "连贯的，条理清晰的",
        phonetic: "/kəʊˈhɪərənt/",
        tags: ["雅思", "写作"],
      },
      {
        front: "fluctuate",
        pos: "vi.",
        back: "波动，起伏不定",
        phonetic: "/ˈflʌktʃueɪt/",
        tags: ["雅思", "小作文"],
      },
      {
        front: "prevalent",
        pos: "adj.",
        back: "流行的，盛行的，普遍的",
        phonetic: "/ˈprevələnt/",
        tags: ["雅思", "阅读"],
      },
    ],
  },
  {
    id: "gre_3000",
    name: "GRE 核心 3000 词精选 (3040全量词)",
    category: "study_abroad",
    categoryLabel: "出国留学",
    tags: ["GRE", "要你命3000", "词汇巅峰"],
    wordCount: 3040,
    difficulty: 5,
    description:
      "GRE 填空与阅读必备攻坚词库，覆盖学术逻辑、哲学思辨、精准修饰词与经典反义对立意群，冲击 325+ 高分。",
    source: "开源社区",
    remoteUrls: makeQwertyUrls("GRE3000_3_T.json"),
    sampleWords: [
      {
        front: "anomaly",
        pos: "n.",
        back: "异常，反常的事物",
        phonetic: "/əˈnɒməli/",
        tags: ["GRE"],
      },
      {
        front: "lucid",
        pos: "adj.",
        back: "清晰易懂的；神志清醒的",
        phonetic: "/ˈluːsɪd/",
        tags: ["GRE"],
      },
      {
        front: "venerate",
        pos: "vt.",
        back: "崇敬，敬仰",
        phonetic: "/ˈvenəreɪt/",
        tags: ["GRE"],
      },
    ],
  },
  {
    id: "gmat_core",
    name: "GMAT 商业逻辑核心词汇 (3000全量词)",
    category: "study_abroad",
    categoryLabel: "出国留学",
    tags: ["GMAT", "商科申请", "商业分析"],
    wordCount: 3000,
    difficulty: 4,
    description:
      "专为全球顶级商学院 GMAT 考试提炼，强化批判性推理（CR）、数据充分性与商业学术阅读核心词汇。",
    source: "开源社区",
    remoteUrls: makeQwertyUrls("GMAT_3_T.json"),
    sampleWords: [
      {
        front: "deterrent",
        pos: "n.",
        back: "威慑因素；遏制物",
        phonetic: "/dɪˈterənt/",
        tags: ["GMAT"],
      },
      {
        front: "scrutiny",
        pos: "n.",
        back: "周密审查，仔细检查",
        phonetic: "/ˈskruːtəni/",
        tags: ["GMAT"],
      },
      {
        front: "untenable",
        pos: "adj.",
        back: "站不住脚的，难以防守的",
        phonetic: "/ʌnˈtenəbl/",
        tags: ["GMAT"],
      },
    ],
  },

  // ==================== 权威通用 (General) ====================
  {
    id: "oxford_5000",
    name: "牛津 5000 核心交际词 (Oxford 5000 全量词)",
    category: "general",
    categoryLabel: "日常通用",
    tags: ["牛津权威", "CEFR标准", "高频交际"],
    wordCount: 5000,
    difficulty: 3,
    description:
      "牛津大学语言学家联合研发的扩展核心词汇表（CEFR A1-C1），覆盖全球现代英语书面与口语 90% 以上表达场景。",
    source: "Oxford 权威",
    remoteUrls: makeQwertyUrls("Oxford5000.json"),
    sampleWords: [
      {
        front: "essential",
        pos: "adj.",
        back: "必不可少的，极其重要的；本质的",
        phonetic: "/ɪˈsenʃl/",
        tags: ["Oxford 5000", "B1"],
      },
      {
        front: "perspective",
        pos: "n.",
        back: "视角，看法；透视法",
        phonetic: "/pəˈspektɪv/",
        tags: ["Oxford 5000", "B2"],
      },
      {
        front: "maintain",
        pos: "vt.",
        back: "维持，保持；维修；坚持主张",
        phonetic: "/meɪnˈteɪn/",
        tags: ["Oxford 5000", "B2"],
      },
    ],
  },
  {
    id: "longman_3000",
    name: "朗文当代交际 3000 词 (Longman 3000 全量词)",
    category: "general",
    categoryLabel: "日常通用",
    tags: ["朗文词典", "高频交际", "口语书面双标"],
    wordCount: 3000,
    difficulty: 2,
    description:
      "基于庞大朗文语料库统计出的前 3000 个最常用口语与书面单词，是英国与国际英语学习者公认的高性价比词库。",
    source: "Longman 权威",
    remoteUrls: makeQwertyUrls("Longman_Communication_3000.json"),
    sampleWords: [
      {
        front: "crucial",
        pos: "adj.",
        back: "至关重要的，决定性的",
        phonetic: "/ˈkruːʃl/",
        tags: ["Longman 3000"],
      },
      {
        front: "demonstrate",
        pos: "vt.",
        back: "证明，证实；演示，说明",
        phonetic: "/ˈdemənstreɪt/",
        tags: ["Longman 3000"],
      },
      {
        front: "guarantee",
        pos: "vt.",
        back: "保证，担保；n. 保修单",
        phonetic: "/ˌɡærənˈtiː/",
        tags: ["Longman 3000"],
      },
    ],
  },
  {
    id: "word_roots",
    name: "英语核心词根词缀速记精讲 (800+ 词组)",
    category: "general",
    categoryLabel: "日常通用",
    tags: ["构词法", "词根词缀", "快速扩词"],
    wordCount: 855,
    difficulty: 3,
    description:
      "从词源与构词法本质出发，归纳常见前缀（如 un-, dis-, re-）与核心词根（如 bio, spect, tract），掌握批量记单词的核心法则。",
    source: "开源社区",
    remoteUrls: makeQwertyUrls("word_roots1.json"),
    sampleWords: [
      {
        front: "spect",
        pos: "词根",
        back: "看，观察 (如 inspect 检查, prospect 前景)",
        tags: ["词根"],
      },
      {
        front: "tract",
        pos: "词根",
        back: "拉，拖 (如 attract 吸引, contract 合同)",
        tags: ["词根"],
      },
      {
        front: "vert / vers",
        pos: "词根",
        back: "转，转向 (如 convert 转变, reverse 反转)",
        tags: ["词根"],
      },
    ],
  },
  {
    id: "coca_20000",
    name: "COCA 现代美语最高频 20000 词选",
    category: "general",
    categoryLabel: "日常通用",
    tags: ["COCA语料", "当代美语", "终极词库"],
    wordCount: 20000,
    difficulty: 4,
    description:
      "基于当代美国英语语料库（COCA 10亿词级）统计筛选出的前 20,000 个高频词，是进阶学习者构建母语级词汇储备的终极宝典。",
    source: "COCA 语料",
    remoteUrls: makeQwertyUrls("coca20000.json"),
    sampleWords: [
      {
        front: "infrastructure",
        pos: "n.",
        back: "基础设施，公共建设",
        phonetic: "/ˈɪnfrəstrʌktʃə/",
        tags: ["COCA", "社会"],
      },
      {
        front: "sustainable",
        pos: "adj.",
        back: "可持续的，可维持的",
        phonetic: "/səˈsteɪnəbl/",
        tags: ["COCA", "环境"],
      },
      {
        front: "incentive",
        pos: "n.",
        back: "激励，鼓励；刺激因素",
        phonetic: "/ɪnˈsentɪv/",
        tags: ["COCA", "经济"],
      },
    ],
  },

  // ==================== 专业领域 (Major) ====================
  {
    id: "coder_words",
    name: "程序员常用计算机技术英文核心词 (1700全量词)",
    category: "major",
    categoryLabel: "专业英语",
    tags: ["计算机", "编程代码", "技术文档", "全量词库"],
    wordCount: 1700,
    difficulty: 2,
    description:
      "涵盖变量命名、架构设计、技术文档、报错日志、网络协议与算法中最高频的计算机专业词汇与常见工程缩写。",
    source: "开源社区",
    remoteUrls: makeQwertyUrls("it-words.json"),
    sampleWords: [
      {
        front: "deprecated",
        pos: "adj.",
        back: "已废弃的，不赞成使用的",
        phonetic: "/ˈdeprəkeɪtɪd/",
        tags: ["编程", "架构"],
      },
      {
        front: "asynchronous",
        pos: "adj.",
        back: "异步的，非同步的",
        phonetic: "/eɪˈsɪŋkrənəs/",
        tags: ["编程", "网络"],
      },
      {
        front: "middleware",
        pos: "n.",
        back: "中间件，介于操作系统与应用程序之间的软件",
        phonetic: "/ˈmɪdlweə/",
        tags: ["编程", "架构"],
      },
    ],
  },
  {
    id: "bec_business",
    name: "剑桥商务英语 (BEC) 核心高频词 (2700+全量词)",
    category: "major",
    categoryLabel: "专业英语",
    tags: ["商务职场", "BEC", "外企沟通", "全量词库"],
    wordCount: 2753,
    difficulty: 3,
    description:
      "涵盖商务谈判、合同协议、财务报表、跨境贸易、市场营销和跨国职场交流的核心高频商务词汇，共 2,753 词。",
    source: "开源社区",
    remoteUrls: makeQwertyUrls("BEC_2_T.json"),
    sampleWords: [
      {
        front: "acquisition",
        pos: "n.",
        back: "收购；获得物，购置的资产",
        phonetic: "/ˌækwɪˈzɪʃn/",
        tags: ["商务", "金融"],
      },
      {
        front: "dividend",
        pos: "n.",
        back: "红利，股息；回报",
        phonetic: "/ˈdɪvɪdend/",
        tags: ["商务", "财务"],
      },
      {
        front: "negotiation",
        pos: "n.",
        back: "谈判，磋商，交涉",
        phonetic: "/nɪˌɡəʊʃiˈeɪʃn/",
        tags: ["商务", "外企"],
      },
    ],
  },
];

/** 将第三方（如 Qwerty Learner 格式）或通用 JSON 数据统一清洗为 Reciter 卡片结构 */
export function normalizeRawCards(rawArray: any[]): HubCardSample[] {
  const normalized: HubCardSample[] = [];
  for (const item of rawArray) {
    if (!item || typeof item !== "object") continue;
    const front = String(item.name || item.word || item.front || "").trim();
    if (!front) continue;

    let back = "";
    if (Array.isArray(item.trans)) {
      back = item.trans.join("；");
    } else if (typeof item.back === "string") {
      back = item.back;
    } else if (typeof item.meaning === "string") {
      back = item.meaning;
    } else if (typeof item.definition === "string") {
      back = item.definition;
    }
    back = back.trim();
    if (!back) back = front;

    let phonetic = String(
      item.usphone || item.ukphone || item.phonetic || extractPhoneticFromText(front) || ""
    ).trim();
    if (phonetic && !phonetic.startsWith("/") && !phonetic.startsWith("[")) {
      phonetic = `/${phonetic}/`;
    }

    const example = typeof item.example === "string" ? item.example.trim() : "";
    const exampleCn = typeof item.example_cn === "string" ? item.example_cn.trim() : "";
    const tags = Array.isArray(item.tags)
      ? item.tags.map(String)
      : typeof item.tags === "string"
        ? item.tags.split(/[,;]/).map((s: string) => s.trim()).filter(Boolean)
        : [];

    normalized.push({
      front,
      back,
      phonetic,
      example,
      example_cn: exampleCn,
      tags,
    });
  }
  return normalized;
}

/**
 * 一键下载/导入词库广场词书（支持 JSON 词库与 Anki .apkg 牌组）
 */
export async function importHubDeck(
  meta: HubDeckMeta,
  onProgress?: (msg: string) => void
): Promise<{ deckId: number; count: number; name: string }> {
  onProgress?.(`正在准备获取【${meta.name}】数据...`);

  let loadedCards: HubCardSample[] = [];

  if (meta.format === "apkg") {
    // ==================== APKG 格式处理 ====================
    let apkgBuffer: ArrayBuffer | null = null;

    // 1. 本地内置资源尝试加载
    if (meta.localPath) {
      try {
        const base = import.meta.env.BASE_URL || "";
        const url = `${base.replace(/\/$/, "")}/${meta.localPath.replace(/^\//, "")}`;
        onProgress?.("正在读取本地 Anki 牌组文件...");
        const res = await fetch(url);
        if (res.ok) {
          apkgBuffer = await res.arrayBuffer();
        }
      } catch {}
    }

    // 2. 远程加载
    if (!apkgBuffer && meta.remoteUrls && meta.remoteUrls.length > 0) {
      for (const remoteUrl of meta.remoteUrls) {
        try {
          onProgress?.(`正在拉取远程 Anki 牌组 (${new URL(remoteUrl).hostname})...`);
          const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(15000) });
          if (res.ok) {
            apkgBuffer = await res.arrayBuffer();
            if (apkgBuffer && apkgBuffer.byteLength > 0) break;
          }
        } catch {}
      }
    }

    if (!apkgBuffer) {
      throw new Error(`未能获取 Anki 牌组【${meta.name}】数据，请检查网络连接后重试`);
    }

    onProgress?.("正在轻量解包并解析 Anki SQLite 数据库...");
    const parsed = await parseAPKG(apkgBuffer, meta.name);
    if (parsed.cards.length === 0) {
      const warn = parsed.warnings.join("；") || "未找到卡片记录";
      throw new Error(`解析 Anki 牌组失败: ${warn}`);
    }

    for (const c of parsed.cards) {
      loadedCards.push({
        front: c.front,
        back: c.back,
        phonetic: c.phonetic,
        example: c.markdown,
        tags: c.tags,
      });
    }
  } else {
    // ==================== JSON 格式处理 ====================
    // 1. 本地内置加载（秒开，离线可用）
    if (meta.localPath) {
      try {
        const base = import.meta.env.BASE_URL || "";
        const url = `${base.replace(/\/$/, "")}/${meta.localPath.replace(/^\//, "")}`;
        onProgress?.("正在从本地内置资源快速加载...");
        const res = await fetch(url);
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json) && json.length > 0) {
            loadedCards = normalizeRawCards(json);
          }
        }
      } catch {}
    }

    // 2. 远程开源 CDN 镜像拉取
    if (loadedCards.length === 0 && meta.remoteUrls && meta.remoteUrls.length > 0) {
      for (const remoteUrl of meta.remoteUrls) {
        try {
          const host = new URL(remoteUrl).hostname;
          onProgress?.(`正在从镜像源拉取全量词库 (${host})...`);
          const res = await fetch(remoteUrl, { signal: AbortSignal.timeout(15000) });
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json) && json.length > 0) {
              loadedCards = normalizeRawCards(json);
              if (loadedCards.length > 0) break;
            }
          }
        } catch {}
      }
    }

    if (loadedCards.length === 0) {
      throw new Error(
        `获取词库【${meta.name}】远程数据失败，所有镜像节点连接超时。请检查网络后重试。`
      );
    }
  }

  if (loadedCards.length === 0) {
    throw new Error(`未能获取词库【${meta.name}】的有效词条数据`);
  }

  // 写入数据库
  const folder = meta.format === "apkg" ? "Anki记忆库" : "官方词库";
  const targetDeckName = await db.getUniqueDeckName(meta.name, folder);
  const deckId = await db.createDeck(targetDeckName, meta.description, undefined, folder);

  const total = loadedCards.length;
  onProgress?.(`正在写入本地词库 (0/${total})...`);

  const existingSet = new Set<string>();

  for (let i = 0; i < total; i++) {
    const card = loadedCards[i];
    const isPhraseWord = isPhrase(card.front);
    const finalBack = card.pos && !isPhraseWord ? `${card.pos} ${card.back}` : card.back;
    const meaning = splitMeaningText(finalBack, card.front);
    const markdown = card.example
      ? card.example_cn
        ? `${card.example}\n\n${card.example_cn}`
        : card.example
      : card.example_cn || "";

    const tags = card.tags && card.tags.length > 0 ? card.tags : meta.tags;

    await db.upsertCard(
      {
        deckId,
        front: card.front,
        back: finalBack,
        phonetic: card.phonetic || extractPhoneticFromText(card.front),
        markdown,
        sourceType: meta.format === "apkg" ? "manual" : "json",
        tags,
        meaningPrimary: meaning.primary,
        meaningSecondary: meaning.secondary,
      },
      existingSet
    );

    // 每 100 词汇报一次进度，并微小休眠让渡 UI 主线程
    if ((i + 1) % 100 === 0 || i === total - 1) {
      onProgress?.(`正在写入本地词库 (${i + 1}/${total})...`);
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  await useDeckStore.getState().refresh();

  return {
    deckId,
    count: total,
    name: targetDeckName,
  };
}

/**
 * 支持从用户自定义的任意在线 URL（.json 或 .apkg）拉取并导入为新词库
 */
export async function importFromCustomUrl(
  urlStr: string,
  customDeckName?: string,
  onProgress?: (msg: string) => void
): Promise<{ deckId: number; count: number; name: string }> {
  onProgress?.("正在解析并连接目标资源...");
  const trimmedUrl = urlStr.trim();
  if (!trimmedUrl.startsWith("http://") && !trimmedUrl.startsWith("https://")) {
    throw new Error("请输入以 http:// 或 https:// 开头的有效网络直链");
  }

  const isApkg = /\.apkg(\?.*)?$/i.test(trimmedUrl);
  const guessedName =
    customDeckName?.trim() ||
    decodeURIComponent(trimmedUrl.split("/").pop()?.replace(/(\.json|\.apkg)(\?.*)?$/i, "") || "") ||
    (isApkg ? "Anki 在线导入" : "在线导入词库");

  if (isApkg) {
    onProgress?.("正在下载在线 Anki 牌组包...");
    const res = await fetch(trimmedUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`下载失败 (HTTP ${res.status}): ${res.statusText}`);
    const buffer = await res.arrayBuffer();

    onProgress?.("正在解包并解析 Anki 牌组...");
    const parsed = await parseAPKG(buffer, guessedName);
    if (parsed.cards.length === 0) throw new Error("Anki 牌组内未提取到有效卡片");

    const folder = "Anki记忆库";
    const targetDeckName = await db.getUniqueDeckName(guessedName, folder);
    const deckId = await db.createDeck(targetDeckName, `从在线直链导入: ${trimmedUrl}`, undefined, folder);

    const total = parsed.cards.length;
    const existingSet = new Set<string>();

    for (let i = 0; i < total; i++) {
      const c = parsed.cards[i];
      await db.upsertCard(
        {
          deckId,
          front: c.front,
          back: c.back,
          phonetic: c.phonetic,
          markdown: c.markdown,
          sourceType: "manual",
          tags: c.tags,
          meaningPrimary: c.meaningPrimary,
          meaningSecondary: c.meaningSecondary,
        },
        existingSet
      );
      if ((i + 1) % 50 === 0 || i === total - 1) {
        onProgress?.(`正在写入本地词库 (${i + 1}/${total})...`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await useDeckStore.getState().refresh();
    return { deckId, count: total, name: targetDeckName };
  } else {
    onProgress?.("正在拉取在线 JSON 词库...");
    const res = await fetch(trimmedUrl, { signal: AbortSignal.timeout(30000) });
    if (!res.ok) throw new Error(`下载失败 (HTTP ${res.status}): ${res.statusText}`);
    const json = await res.json();
    if (!Array.isArray(json)) throw new Error("在线数据格式不匹配：必须为包含卡片对象的 JSON 数组");

    const normalized = normalizeRawCards(json);
    if (normalized.length === 0) throw new Error("未能从在线数据中解析出有效词条");

    const folder = "网络词库";
    const targetDeckName = await db.getUniqueDeckName(guessedName, folder);
    const deckId = await db.createDeck(targetDeckName, `从在线直链导入: ${trimmedUrl}`, undefined, folder);

    const total = normalized.length;
    const existingSet = new Set<string>();

    for (let i = 0; i < total; i++) {
      const card = normalized[i];
      const isPhraseWord = isPhrase(card.front);
      const finalBack = card.pos && !isPhraseWord ? `${card.pos} ${card.back}` : card.back;
      const meaning = splitMeaningText(finalBack, card.front);

      await db.upsertCard(
        {
          deckId,
          front: card.front,
          back: finalBack,
          phonetic: card.phonetic || extractPhoneticFromText(card.front),
          markdown: card.example,
          sourceType: "json",
          tags: card.tags,
          meaningPrimary: meaning.primary,
          meaningSecondary: meaning.secondary,
        },
        existingSet
      );
      if ((i + 1) % 100 === 0 || i === total - 1) {
        onProgress?.(`正在写入本地词库 (${i + 1}/${total})...`);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    await useDeckStore.getState().refresh();
    return { deckId, count: total, name: targetDeckName };
  }
}
