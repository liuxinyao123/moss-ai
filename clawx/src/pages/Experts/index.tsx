import { useEffect, useMemo, useState } from 'react';
import { Search, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { cn } from '@/lib/utils';
import { hostApiFetch } from '@/lib/host-api';
import { useAgentsStore } from '@/stores/agents';

type Expert = {
  key: string;
  name: string;
  category: string;
  title: string;
  description: string;
  tags: string[];
};

type SkillExpertAgent = {
  agentId: string;
  name: string;
  workspace?: string;
  headline?: string;
};

type Category = { key: string; label: string };

const categories: Category[] = [
  { key: 'all', label: '全部' },
  { key: '设计', label: '设计' },
  { key: '工程技术', label: '工程技术' },
  { key: '市场营销', label: '市场营销' },
  { key: '付费媒体', label: '付费媒体' },
  { key: '销售', label: '销售' },
  { key: '产品', label: '产品' },
  { key: '项目管理', label: '项目管理' },
  { key: '质量测试', label: '质量测试' },
];

function hashHue(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function Avatar({ seed, label }: { seed: string; label: string }) {
  const hue = hashHue(seed);
  const bg = `hsl(${hue} 70% 55% / 0.22)`;
  const fg = `hsl(${hue} 62% 34% / 1)`;
  const initials = (label || seed).trim().slice(0, 1).toUpperCase();
  return (
    <div
      className="h-12 w-12 rounded-2xl flex items-center justify-center border border-black/5 dark:border-white/10 shadow-sm"
      style={{ background: bg, color: fg }}
      aria-label={label}
      title={label}
    >
      <span className="text-base font-semibold">{initials}</span>
    </div>
  );
}

export function Experts() {
  const fetchAgents = useAgentsStore((s) => s.fetchAgents);
  const agents = useAgentsStore((s) => s.agents);

  const [experts, setExperts] = useState<Expert[]>([]);
  const [skillExperts, setSkillExperts] = useState<SkillExpertAgent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [category, setCategory] = useState<string>('all');
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const resp = await hostApiFetch<{ success: boolean; experts: Expert[]; error?: string }>('/api/experts/automotive');
        if (!resp.success) throw new Error(resp.error || '加载专家列表失败');
        if (!cancelled) setExperts(resp.experts || []);
        const se = await hostApiFetch<{ success: boolean; experts: SkillExpertAgent[]; error?: string }>('/api/experts/skill-experts');
        if (se?.success && !cancelled) setSkillExperts(se.experts || []);
        await fetchAgents();
      } catch (e) {
        if (!cancelled) setError(String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [fetchAgents]);

  const existingNames = useMemo(() => new Set(agents.map((a) => a.name)), [agents]);

  const categoryCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const ex of experts) {
      counts[ex.category] = (counts[ex.category] || 0) + 1;
    }
    return counts;
  }, [experts]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return experts.filter((ex) => {
      if (category !== 'all' && ex.category !== category) return false;
      if (!q) return true;
      const hay = [
        ex.name,
        ex.title,
        ex.description,
        ex.category,
        ...(ex.tags || []),
      ].join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [experts, category, query]);

  const leaderboard = useMemo(() => {
    const scored = experts.map((ex) => {
      const created = existingNames.has(ex.name) ? 1000 : 0;
      const tagScore = (ex.tags?.length || 0) * 10;
      const base = (hashHue(ex.key) % 50);
      return { ex, score: created + tagScore + base };
    });
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.ex);
  }, [experts, existingNames]);

  const createExpert = async (key: string) => {
    try {
      setBusyKey(key);
      setError(null);
      const resp = await hostApiFetch<{ success: boolean; agentId?: string; error?: string }>('/api/experts/automotive/create', {
        method: 'POST',
        body: JSON.stringify({ key }),
      });
      if (!resp.success) throw new Error(resp.error || '创建专家失败');
      await fetchAgents();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusyKey((prev) => (prev === key ? null : prev));
    }
  };

  return (
    <div className="h-full overflow-auto bg-[#f3f0e8] text-foreground dark:bg-background">
      <div className="p-6">
        <div className="flex items-start justify-between gap-6">
          <div className="min-w-0">
            <h1 className="text-[22px] font-semibold tracking-tight mb-1">专家中心</h1>
            <p className="text-sm text-muted-foreground">
              按行业分类浏览专家，一键创建对应智能体并自动注入人设。
            </p>
          </div>

          <div className="relative w-[420px] max-w-[50vw]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索专家 / 技能 / 标签 / 领域..."
            className="pl-9 bg-white/70 border-black/10 shadow-sm dark:bg-background"
          />
        </div>
      </div>

        <div className="mt-4">
          <Tabs value={category} onValueChange={setCategory}>
            <TabsList className="bg-transparent p-0 h-auto gap-2">
              {categories.map((c) => {
                const count = c.key === 'all' ? experts.length : (categoryCounts[c.key] || 0);
                return (
                  <TabsTrigger
                    key={c.key}
                    value={c.key}
                    className={cn(
                      'rounded-xl px-3 py-2 text-sm',
                      'bg-white/0 shadow-none',
                      'data-[state=active]:bg-white/60 data-[state=active]:shadow-sm',
                      'border border-transparent data-[state=active]:border-black/10',
                      'text-foreground/70 data-[state=active]:text-foreground',
                      'hover:bg-white/40'
                    )}
                  >
                    {c.label}
                    <span className="ml-1 text-xs text-muted-foreground">({count})</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </Tabs>
        </div>

        {error && (
          <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-3 text-sm text-red-500">
            {error}
          </div>
        )}

        <div className="mt-4 grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-4">
          <div className="min-w-0">
            {!loading && skillExperts.length > 0 && (
              <div className="mb-6">
                <div className="flex items-end justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-[16px] font-semibold">技能专家</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      由“技能转专家”生成的人设，已注入到对应 Agents。
                    </div>
                  </div>
                  <div className="text-xs text-muted-foreground shrink-0">
                    共 {skillExperts.length} 个
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                  {skillExperts.map((a) => (
                    <Card
                      key={a.agentId}
                      className={cn(
                        'rounded-2xl border border-black/5 dark:border-white/10',
                        'bg-white/65 dark:bg-card',
                        'shadow-[0_10px_30px_rgba(0,0,0,0.06)] hover:shadow-[0_14px_40px_rgba(0,0,0,0.08)]',
                        'transition-all'
                      )}
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <Avatar seed={a.agentId} label={a.name} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[15px] font-semibold truncate">{a.name}</div>
                            <div className="text-xs text-muted-foreground truncate mt-0.5">{a.agentId}</div>
                            {a.headline && (
                              <div className="mt-2 text-sm text-foreground/80 line-clamp-2 leading-relaxed">
                                {a.headline}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {loading && <div className="text-sm text-muted-foreground">加载中…</div>}
            {!loading && experts.length === 0 && (
              <div className="text-sm text-muted-foreground">暂无专家模板。</div>
            )}

            {!loading && experts.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {filtered.map((ex) => {
                  const already = existingNames.has(ex.name);
                  const busy = busyKey === ex.key;
                  return (
                    <Card
                      key={ex.key}
                      className={cn(
                        'rounded-2xl border border-black/5 dark:border-white/10',
                        'bg-white/65 dark:bg-card',
                        'shadow-[0_10px_30px_rgba(0,0,0,0.06)] hover:shadow-[0_14px_40px_rgba(0,0,0,0.08)]',
                        'transition-all'
                      )}
                    >
                      <div className="p-4">
                        <div className="flex items-start gap-3">
                          <Avatar seed={ex.key} label={ex.name} />
                          <div className="min-w-0 flex-1">
                            <div className="text-[15px] font-semibold truncate">{ex.name}</div>
                            <div className="text-xs text-muted-foreground truncate mt-0.5">{ex.title}</div>
                            <div className="mt-2 flex items-center gap-2">
                              <span className="inline-flex items-center rounded-full bg-black/5 dark:bg-white/10 px-2 py-0.5 text-[11px] text-foreground/80">
                                {ex.category}
                              </span>
                              <span className={cn(
                                'text-[11px]',
                                already ? 'text-emerald-600 dark:text-emerald-400' : 'text-muted-foreground'
                              )}>
                                {already ? '已创建到 Agents' : '未创建'}
                              </span>
                            </div>
                          </div>
                        </div>

                        <div className="mt-3 text-sm text-foreground/80 line-clamp-2 leading-relaxed">
                          {ex.description}
                        </div>

                        <div className="mt-3 flex flex-wrap gap-2">
                          {(ex.tags || []).slice(0, 4).map((tag) => (
                            <span
                              key={tag}
                              className="inline-flex items-center rounded-full border border-black/10 dark:border-white/10 bg-white/40 dark:bg-background/40 px-2 py-0.5 text-[11px] text-muted-foreground"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>

                        <div className="mt-4 flex items-center justify-end">
                          <Button
                            size="sm"
                            className={cn(
                              'rounded-xl px-4 shadow-sm',
                              already ? 'opacity-70' : ''
                            )}
                            variant={already ? 'secondary' : 'default'}
                            disabled={already || busy}
                            onClick={() => createExpert(ex.key)}
                          >
                            {already ? '已存在' : (busy ? '创建中…' : '创建专家')}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}

            {!loading && experts.length > 0 && filtered.length === 0 && (
              <div className="text-sm text-muted-foreground">没有匹配的专家。</div>
            )}
          </div>

          <div className="hidden lg:block">
            <div className="sticky top-4">
              <Card className="rounded-2xl border border-black/5 dark:border-white/10 bg-gradient-to-b from-amber-500/15 via-white/55 to-white/35 dark:from-amber-500/10 dark:via-card dark:to-card shadow-[0_10px_30px_rgba(0,0,0,0.06)]">
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Trophy className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                    <div className="text-sm font-semibold">专家排行榜</div>
                  </div>
                  <div className="text-xs text-muted-foreground mb-3">
                    基于“已创建优先 + 模板热度”生成（后续可接入真实使用数据）。
                  </div>

                  <div className="space-y-2">
                    {leaderboard.map((ex, idx) => {
                      const created = existingNames.has(ex.name);
                      const top = idx === 0;
                      return (
                        <div
                          key={ex.key}
                          className={cn(
                            'flex items-center gap-2 rounded-xl border px-2.5 py-2',
                            top
                              ? 'border-amber-500/30 bg-amber-500/10'
                              : 'border-black/5 dark:border-white/10 bg-white/45 dark:bg-background/20'
                          )}
                        >
                          <div className={cn(
                            'w-11 text-xs font-semibold',
                            top ? 'text-amber-700 dark:text-amber-300' : 'text-muted-foreground'
                          )}>
                            No.{idx + 1}
                          </div>
                          <div className="scale-[0.92] origin-left">
                            <Avatar seed={ex.key} label={ex.name} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{ex.name}</div>
                            <div className="text-xs text-muted-foreground truncate">
                              {ex.category}{created ? ' · 已创建' : ''}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

