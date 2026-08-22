/** 每日一句：英文名言 / 写作实用句子，按日期轮换（本地库，无需网络） */
interface DailyQuote {
  text: string;
  translation: string;
  author: string;
}

const QUOTES: DailyQuote[] = [
  { text: "The secret of getting ahead is getting started.", translation: "领先的秘诀就是开始行动。", author: "Mark Twain" },
  { text: "It does not matter how slowly you go as long as you do not stop.", translation: "只要不停下，走得慢也没关系。", author: "Confucius" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", translation: "成功不是终点，失败也并非末日；最重要的是继续前行的勇气。", author: "Winston Churchill" },
  { text: "Believe you can and you're halfway there.", translation: "相信自己能行，你就已经成功了一半。", author: "Theodore Roosevelt" },
  { text: "The only way to do great work is to love what you do.", translation: "做出伟大工作的唯一方法就是热爱你所做的事。", author: "Steve Jobs" },
  { text: "Quality is not an act, it is a habit.", translation: "优秀不是一种行为，而是一种习惯。", author: "Aristotle" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", translation: "种树最好的时间是二十年前，其次是现在。", author: "Chinese Proverb" },
  { text: "Don't watch the clock; do what it does. Keep going.", translation: "别盯着时钟，学它一直走下去。", author: "Sam Levenson" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", translation: "未来属于那些相信自己梦想之美的人。", author: "Eleanor Roosevelt" },
  { text: "In the middle of difficulty lies opportunity.", translation: "困难之中蕴藏机遇。", author: "Albert Einstein" },
  { text: "Happiness is not something ready made. It comes from your own actions.", translation: "幸福不是现成的东西，它来自你自己的行动。", author: "Dalai Lama" },
  { text: "The only limit to our realization of tomorrow will be our doubts of today.", translation: "实现明天理想的唯一限制，是我们今天的疑虑。", author: "Franklin D. Roosevelt" },
  { text: "What we achieve inwardly will change outer reality.", translation: "我们内心的成就终将改变外在的现实。", author: "Plutarch" },
  { text: "A journey of a thousand miles begins with a single step.", translation: "千里之行，始于足下。", author: "Lao Tzu" },
  { text: "Well done is better than well said.", translation: "做得好胜过说得好。", author: "Benjamin Franklin" },
  { text: "The mind is everything. What you think you become.", translation: "心念即一切；你想成为什么，就会成为什么。", author: "Buddha" },
  { text: "Strive not to be a success, but rather to be of value.", translation: "不要追求成功，而要努力成为有价值的人。", author: "Albert Einstein" },
  { text: "Simplicity is the ultimate sophistication.", translation: "简单是终极的复杂。", author: "Leonardo da Vinci" },
  { text: "Action is the foundational key to all success.", translation: "行动是一切成功的基础。", author: "Pablo Picasso" },
  { text: "Whether you think you can or you think you can't, you're right.", translation: "无论你认为自己能行还是不行，你都是对的。", author: "Henry Ford" },
];

/** 根据日期取当日句子（按年内天数轮换，跨年自然切换） */
export function getDailyQuote(date: Date = new Date()): DailyQuote {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return QUOTES[day % QUOTES.length];
}
