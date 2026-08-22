/** 每日一句：英文名言 / 写作实用句子，按日期轮换（本地库，无需网络） */
interface DailyQuote {
  text: string;
  author: string;
}

const QUOTES: DailyQuote[] = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "It does not matter how slowly you go as long as you do not stop.", author: "Confucius" },
  { text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", author: "Winston Churchill" },
  { text: "Believe you can and you're halfway there.", author: "Theodore Roosevelt" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Quality is not an act, it is a habit.", author: "Aristotle" },
  { text: "The best time to plant a tree was 20 years ago. The second best time is now.", author: "Chinese Proverb" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "The future belongs to those who believe in the beauty of their dreams.", author: "Eleanor Roosevelt" },
  { text: "In the middle of difficulty lies opportunity.", author: "Albert Einstein" },
  { text: "Happiness is not something ready made. It comes from your own actions.", author: "Dalai Lama" },
  { text: "The only limit to our realization of tomorrow will be our doubts of today.", author: "Franklin D. Roosevelt" },
  { text: "What we achieve inwardly will change outer reality.", author: "Plutarch" },
  { text: "A journey of a thousand miles begins with a single step.", author: "Lao Tzu" },
  { text: "Well done is better than well said.", author: "Benjamin Franklin" },
  { text: "The mind is everything. What you think you become.", author: "Buddha" },
  { text: "Strive not to be a success, but rather to be of value.", author: "Albert Einstein" },
  { text: "Simplicity is the ultimate sophistication.", author: "Leonardo da Vinci" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "Whether you think you can or you think you can't, you're right.", author: "Henry Ford" },
];

/** 根据日期取当日句子（按年内天数轮换，跨年自然切换） */
export function getDailyQuote(date: Date = new Date()): DailyQuote {
  const start = new Date(date.getFullYear(), 0, 0);
  const day = Math.floor((date.getTime() - start.getTime()) / 86_400_000);
  return QUOTES[day % QUOTES.length];
}
