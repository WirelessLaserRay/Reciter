import { describe, it, expect } from "vitest";
import {
  parseCSV,
  parseJSON,
  parseTextInput,
  parseImportFile,
} from "@/lib/importer";
import { parseMarkdown } from "@/lib/markdown-parser";

describe("importer.ts - 多格式词库解析与导入引擎", () => {
  it("parseImportFile - 根据文件名后缀选择解析器", () => {
    const resMd = parseImportFile("vocab.md", "# Deck\n- word: meaning");
    expect(resMd.format).toBe("markdown");

    const resCsv = parseImportFile("words.csv", "front,back\napple,苹果");
    expect(resCsv.format).toBe("csv");

    const resJson = parseImportFile("data.json", '[{"front":"apple","back":"苹果"}]');
    expect(resJson.format).toBe("json");
  });

  it("parseTextInput - 自动探测内容类型", () => {
    const resJson = parseTextInput('[{"front":"apple","back":"苹果"}]');
    expect(resJson.format).toBe("json");

    const resCsv = parseTextInput("word,meaning\napple,苹果");
    expect(resCsv.format).toBe("csv");
  });

  it("parseMarkdown - 列表项冒号及破折号解析与章节标签", () => {
    const md = `
# 英语词库
## 四级词库
### 核心词汇
- abandon: vt. 放弃，抛弃
- ability — n. 能力，本领
- **apple**: n. 苹果 ==水果==
    `;
    const res = parseMarkdown(md);
    expect(res.cards.length).toBe(3);
    expect(res.cards[0].front).toBe("abandon");
    expect(res.cards[0].back).toContain("放弃");
    expect(res.cards[0].tags).toContain("核心词汇");

    expect(res.cards[1].front).toBe("ability");
    expect(res.cards[1].back).toContain("能力");

    expect(res.cards[2].front).toBe("apple");
    expect(res.cards[2].isKey).toBe(true);
    expect(res.cards[2].highlights).toContain("水果");
  });

  it("parseCSV - 解析带表头与别名的 CSV 文本", () => {
    const csv = `word,translation,tags,isKey
abandon,vt. 放弃,cet4,1
ability,n. 能力,cet4,0
`;
    const res = parseCSV(csv, "默认词库");
    expect(res.cards.length).toBe(2);
    expect(res.cards[0].front).toBe("abandon");
    expect(res.cards[0].back).toBe("vt. 放弃");
    expect(res.cards[0].isKey).toBe(true);
    expect(res.cards[0].tags).toContain("cet4");
  });

  it("parseJSON - 扁平数组与嵌套包装对象", () => {
    // 1. 扁平数组
    const json1 = JSON.stringify([
      { front: "apple", back: "苹果" },
      { word: "banana", definition: "香蕉" },
    ]);
    const res1 = parseJSON(json1);
    expect(res1.cards.length).toBe(2);
    expect(res1.cards[0].front).toBe("apple");
    expect(res1.cards[1].front).toBe("banana");
    expect(res1.cards[1].back).toContain("香蕉");

    // 2. 根对象包含 words/cards 列表
    const json2 = JSON.stringify({
      deck: "水果词典",
      cards: [
        { name: "orange", trans: "橙子" },
        { term: "peach", meaning: "桃子" },
      ],
    });
    const res2 = parseJSON(json2);
    expect(res2.cards.length).toBe(2);
    expect(res2.cards[0].front).toBe("orange");
    expect(res2.cards[0].back).toContain("橙子");
    expect(res2.cards[1].front).toBe("peach");

    // 3. 键值对字典格式
    const json3 = JSON.stringify({
      apple: "苹果",
      banana: "香蕉",
    });
    const res3 = parseJSON(json3);
    expect(res3.cards.length).toBe(2);
    expect(res3.cards.find((c) => c.front === "apple")?.back).toContain("苹果");
  });
});
