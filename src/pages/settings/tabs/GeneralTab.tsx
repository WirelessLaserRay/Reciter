import { useEffect, useState } from "react";
import { Palette, BookOpen, Volume2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useThemeStore, THEME_PRESETS } from "@/stores/useThemeStore";
import { useDbStore } from "@/stores/useDbStore";
import { getTTSSource, saveTTSSource, type TTSSource } from "@/lib/tts";
import { getVocabStandard, saveVocabStandard, type VocabStandard } from "@/lib/vocab";
import { getAutoPronounceEnabled, saveAutoPronounceEnabled } from "@/lib/study-prefs";
import { cn } from "@/lib/utils";

const TTS_SOURCE_OPTIONS: {
  value: TTSSource;
  label: string;
  tag: string;
  desc: string;
  badgeClass: string;
}[] = [
  {
    value: "auto",
    label: "智能优选 (Auto)",
    tag: "推荐",
    desc: "有道极速优先，网络异常时无感回退系统 TTS，兼顾速度与稳定性",
    badgeClass: "border-primary/20 bg-primary/10 text-primary",
  },
  {
    value: "system",
    label: "系统语音引擎 (Web Speech)",
    tag: "离线可用",
    desc: "调用 Windows / 浏览器内置语音库，完全离线运行且支持任意长句朗读",
    badgeClass: "border-emerald-500/20 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  },
  {
    value: "youdao",
    label: "网易有道词典 TTS",
    tag: "国内直连",
    desc: "针对四六级与考研单词优化的高保真英/美真人发音，国内网络响应极快",
    badgeClass: "border-sky-500/20 bg-sky-500/10 text-sky-600 dark:text-sky-400",
  },
  {
    value: "google",
    label: "Google 翻译 TTS",
    tag: "国际权威",
    desc: "标准美式与英式发音，语调自然纯正（需能稳定访问谷歌网络服务）",
    badgeClass: "border-amber-500/20 bg-amber-500/10 text-amber-600 dark:text-amber-400",
  },
];

const VOCAB_STANDARD_OPTIONS: {
  value: VocabStandard;
  label: string;
  tag: string;
  desc: string;
}[] = [
  {
    value: "CET4",
    label: "大学英语四级 (CET-4)",
    tag: "核心基准",
    desc: "覆盖四级大纲约 4,500 核心词汇，适合巩固基础与稳健起步",
  },
  {
    value: "CET6",
    label: "大学英语六级 (CET-6)",
    tag: "进阶跃升",
    desc: "覆盖六级大纲约 5,500 进阶词汇，提升阅读理解深度与词汇广度",
  },
  {
    value: "考研",
    label: "考研英语",
    tag: "考研大纲",
    desc: "全国硕士研究生招生考试大纲词汇基准",
  },
  {
    value: "专业英语",
    label: "专业英语",
    tag: "学术专精",
    desc: "英语专业四八级与高难度学术词汇基准",
  },
];

interface GeneralTabProps {
  onSaved?: () => void;
}

export default function GeneralTab({ onSaved }: GeneralTabProps) {
  const theme = useThemeStore((s) => s.theme);
  const setTheme = useThemeStore((s) => s.setTheme);
  const dbReady = useDbStore((s) => s.ready);

  const [vocabStandard, setVocabStandard] = useState<VocabStandard>("考研");
  const [ttsSource, setTtsSource] = useState<TTSSource>("auto");
  const [autoPronounceEnabled, setAutoPronounceEnabled] = useState(true);

  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      const [vs, tts, ape] = await Promise.all([
        getVocabStandard(),
        getTTSSource(),
        getAutoPronounceEnabled(),
      ]);
      setVocabStandard(vs);
      setTtsSource(tts);
      setAutoPronounceEnabled(ape);
    })().catch(() => {});
  }, [dbReady]);

  const handleVocabStandardChange = async (v: VocabStandard) => {
    setVocabStandard(v);
    if (!dbReady) return;
    await saveVocabStandard(v);
    onSaved?.();
  };

  const handleTTSSourceChange = async (v: TTSSource) => {
    setTtsSource(v);
    if (!dbReady) return;
    await saveTTSSource(v);
    onSaved?.();
  };

  const handleAutoPronounceChange = async (v: boolean) => {
    setAutoPronounceEnabled(v);
    if (!dbReady) return;
    await saveAutoPronounceEnabled(v);
    onSaved?.();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Palette className="size-4 text-primary" />
            主题配色
          </CardTitle>
          <CardDescription>选择应用视觉配色，右上角按钮可快速切换明暗</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {THEME_PRESETS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTheme(t.id)}
                className={
                  "group overflow-hidden rounded-lg border text-left transition-all " +
                  (theme === t.id
                    ? "border-primary ring-2 ring-ring/40"
                    : "border-border hover:bg-accent")
                }
              >
                <span
                  className="flex h-14 items-center gap-2 px-3"
                  style={{ backgroundColor: t.background }}
                >
                  <span
                    className="size-4 rounded-full"
                    style={{ backgroundColor: t.primary }}
                  />
                  <span
                    className="text-xs font-medium"
                    style={{ color: t.primary }}
                  >
                    Aa
                  </span>
                </span>
                <span className="block border-t px-3 py-2">
                  <span className="block text-sm font-medium">{t.label}</span>
                  <span className="block text-xs text-muted-foreground">{t.description}</span>
                </span>
              </button>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            选择后立即生效并自动保存。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BookOpen className="size-4 text-primary" />
            词汇基准标准
          </CardTitle>
          <CardDescription>控制词库扫描拆分、生词识别标定与每日一文 AI 出题难度</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Select
            value={vocabStandard}
            onValueChange={(v) => handleVocabStandardChange(v as VocabStandard)}
          >
            <SelectTrigger className="w-full sm:w-80">
              <SelectValue>
                {(() => {
                  const cur = VOCAB_STANDARD_OPTIONS.find((o) => o.value === vocabStandard) ?? VOCAB_STANDARD_OPTIONS[0];
                  return (
                    <div className="flex items-center gap-2 truncate">
                      <span className="font-medium text-foreground">{cur.label}</span>
                      <span className="text-[11px] px-1.5 py-0.5 rounded border border-primary/20 bg-primary/10 text-primary font-normal">
                        {cur.tag}
                      </span>
                    </div>
                  );
                })()}
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="w-full sm:w-80">
              {VOCAB_STANDARD_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="py-2 px-2.5">
                  <div className="flex flex-col gap-0.5 text-left w-full pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground text-sm">{opt.label}</span>
                      <span className="text-[10px] px-1.5 py-0.2 rounded border border-primary/20 bg-primary/10 text-primary font-normal">
                        {opt.tag}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground leading-snug whitespace-normal break-words">
                      {opt.desc}
                    </span>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            当前基准：{vocabStandard === "CET4" ? "四级" : vocabStandard === "CET6" ? "六级" : vocabStandard === "考研" ? "考研英语" : "专业英语"}。
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Volume2 className="size-4 text-primary" />
            语音发音 (TTS)
          </CardTitle>
          <CardDescription>学习卡片单词与例句朗读的发音服务来源</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="space-y-2">
            <Label htmlFor="tts-source">发音来源</Label>
            <Select value={ttsSource} onValueChange={(v) => void handleTTSSourceChange(v as TTSSource)}>
              <SelectTrigger id="tts-source" className="w-full sm:w-[420px]">
                <SelectValue>
                  {(() => {
                    const cur = TTS_SOURCE_OPTIONS.find((o) => o.value === ttsSource) ?? TTS_SOURCE_OPTIONS[0];
                    return (
                      <div className="flex items-center gap-2 truncate">
                        <span className="font-medium text-foreground">{cur.label}</span>
                        <span className={cn("text-[11px] px-1.5 py-0.5 rounded border font-normal", cur.badgeClass)}>
                          {cur.tag}
                        </span>
                      </div>
                    );
                  })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="w-full sm:w-[420px]">
                {TTS_SOURCE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} className="py-2.5 px-3">
                    <div className="flex flex-col gap-0.5 text-left w-full pr-2">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground text-sm">{opt.label}</span>
                        <span className={cn("text-[10px] px-1.5 py-0.2 rounded border font-normal", opt.badgeClass)}>
                          {opt.tag}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground leading-snug whitespace-normal break-words">
                        {opt.desc}
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground leading-relaxed">
              系统 TTS 离线可用且支持无限长例句（推荐）；有道 TTS 适合国内单词极速发音；Google TTS 适合单词发音。
            </p>
          </div>

          <div className="flex items-center justify-between pt-3 border-t">
            <div className="space-y-0.5">
              <Label>学习时自动朗读单词</Label>
              <p className="text-xs text-muted-foreground">
                切换到新单词卡片时自动播放发音，强化听觉联想记忆
              </p>
            </div>
            <Switch
              checked={autoPronounceEnabled}
              onCheckedChange={handleAutoPronounceChange}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
