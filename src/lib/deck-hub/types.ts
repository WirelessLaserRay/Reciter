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
