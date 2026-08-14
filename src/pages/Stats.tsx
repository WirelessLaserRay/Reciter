import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BarChart3, CalendarClock, Loader2, TrendingUp } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { HeatmapGrid } from "@/components/stats/HeatmapGrid";
import { getFutureDue, getHeatmapData, getLastNDays, type DailyPoint } from "@/lib/stats";
import { useDbStore } from "@/stores/useDbStore";

const DAYS = 30;

export default function Stats() {
  const dbReady = useDbStore((s) => s.ready);
  const [loading, setLoading] = useState(true);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [future, setFuture] = useState<{ date: string; count: number }[]>([]);
  const [heatmap, setHeatmap] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!dbReady) return;
    (async () => {
      try {
        const [d, f, h] = await Promise.all([getLastNDays(DAYS), getFutureDue(7), getHeatmapData(365)]);
        setDaily(d);
        setFuture(f);
        setHeatmap(h);
      } catch (e) {
        setError(String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [dbReady]);

  const totalReviewed = daily.reduce((a, p) => a + p.reviewCount, 0);
  const totalNew = daily.reduce((a, p) => a + p.newCount, 0);
  const validRetention = daily.filter((p) => p.retention !== null);
  const avgRetention =
    validRetention.length > 0
      ? validRetention.reduce((a, p) => a + (p.retention ?? 0), 0) / validRetention.length
      : null;

  const chartData = daily.map((p) => ({
    date: p.date.slice(5),
    新学: p.newCount,
    复习: p.reviewCount,
    保留率: p.retention === null ? null : Math.round(p.retention * 100),
  }));
  const futureData = future.map((f) => ({ date: f.date, 预期: f.count }));

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <div>
        <h2 className="text-2xl font-bold">学习统计</h2>
        <p className="text-sm text-muted-foreground">复习趋势 · 记忆保留率 · 预期复习量 · 热力图</p>
      </div>

      {loading && (
        <Card>
          <CardContent className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            加载统计数据…
          </CardContent>
        </Card>
      )}

      {error && (
        <Card>
          <CardContent className="py-6 text-sm text-destructive">{error}</CardContent>
        </Card>
      )}

      {!loading && !error && (
        <>
          {/* 概览 */}
          <div className="grid grid-cols-3 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <BarChart3 className="size-3.5" />
                  近 {DAYS} 天复习
                </div>
                <div className="mt-1 text-2xl font-bold">{totalReviewed}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <TrendingUp className="size-3.5" />
                  近 {DAYS} 天新学
                </div>
                <div className="mt-1 text-2xl font-bold">{totalNew}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarClock className="size-3.5" />
                  平均保留率
                </div>
                <div className="mt-1 text-2xl font-bold">
                  {avgRetention === null ? "—" : (avgRetention * 100).toFixed(0) + "%"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 复习量趋势 */}
          <Card>
            <CardHeader>
              <CardTitle>复习量趋势（近 {DAYS} 天）</CardTitle>
              <CardDescription>新学与复习的每日数量</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="新学" stackId="a" fill="var(--chart-1)" radius={[0, 0, 0, 0]} />
                  <Bar dataKey="复习" stackId="a" fill="var(--chart-2)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 记忆保留率 */}
          <Card>
            <CardHeader>
              <CardTitle>记忆保留率（近 {DAYS} 天）</CardTitle>
              <CardDescription>每日正确率 = 1 − 忘记次数 / 复习次数</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={chartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis domain={[0, 100]} fontSize={11} tickLine={false} axisLine={false} />
                  <Tooltip />
                  <Line
                    type="monotone"
                    dataKey="保留率"
                    stroke="var(--chart-3)"
                    strokeWidth={2}
                    dot={false}
                    connectNulls
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 未来 7 天预期复习量 */}
          <Card>
            <CardHeader>
              <CardTitle>未来 7 天预期复习量</CardTitle>
              <CardDescription>按 FSRS due 日期统计</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={futureData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="date" fontSize={11} tickLine={false} axisLine={false} />
                  <YAxis fontSize={11} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="预期" fill="var(--chart-4)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* 热力图 */}
          <Card>
            <CardHeader>
              <CardTitle>学习热力图</CardTitle>
              <CardDescription>365 天每日复习量（GitHub 贡献图风格，自定义 CSS Grid 实现）</CardDescription>
            </CardHeader>
            <CardContent>
              <HeatmapGrid data={heatmap} days={365} />
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
