'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Search,
  ArrowRight,
  Gauge,
  Zap,
  Truck,
  Factory,
  Cpu,
  Wind,
  Layers,
  Play,
  CheckCircle2,
  Sparkles,
  Sliders,
  ExternalLink,
} from 'lucide-react';

import { TRADES_CATALOG, type TradeTrack } from '@/data/curriculum';

interface DisciplineMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  badgeBg: string;
  badgeBorder: string;
}

const DISCIPLINE_META: Record<string, DisciplineMeta> = {
  hydraulics: {
    label: 'Hydraulics & Fluid Power',
    icon: Gauge,
    color: '#0B57D0',
    badgeBg: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
    badgeBorder: 'border-blue-200 dark:border-blue-900/50',
  },
  electrical: {
    label: 'Industrial Electrical & Sensors',
    icon: Zap,
    color: '#D97706',
    badgeBg: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    badgeBorder: 'border-amber-200 dark:border-amber-900/50',
  },
  mobile: {
    label: 'Mobile Heavy Equipment',
    icon: Truck,
    color: '#E11D48',
    badgeBg: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
    badgeBorder: 'border-rose-200 dark:border-rose-900/50',
  },
  stationary: {
    label: 'Stationary Plant Machinery',
    icon: Factory,
    color: '#059669',
    badgeBg: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    badgeBorder: 'border-emerald-200 dark:border-emerald-900/50',
  },
  automation: {
    label: 'Automation & PLC Controllers',
    icon: Cpu,
    color: '#7C3AED',
    badgeBg: 'bg-purple-500/10 text-purple-600 dark:text-purple-400',
    badgeBorder: 'border-purple-200 dark:border-purple-900/50',
  },
  pneumatics: {
    label: 'Pneumatic Systems',
    icon: Wind,
    color: '#0284C7',
    badgeBg: 'bg-sky-500/10 text-sky-600 dark:text-sky-400',
    badgeBorder: 'border-sky-200 dark:border-sky-900/50',
  },
};

function moduleCount(trade: TradeTrack): number {
  return trade.stages.reduce((sum, stage) => sum + stage.items.length, 0);
}

function estimatedHours(trade: TradeTrack): number {
  return Math.max(1, Math.round((moduleCount(trade) * 15) / 60));
}

function SimThumbnail({ url, title }: { url?: string; title: string }) {
  const [error, setError] = useState(false);

  if (!url || error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 p-2 text-center text-slate-400">
        <Sliders className="size-6 text-slate-500 mb-1" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Live Schematic</span>
      </div>
    );
  }

  return (
    <img
      src={url}
      alt={title}
      loading="lazy"
      onError={() => setError(true)}
      className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
    />
  );
}

export default function LearnPage() {
  const [query, setQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const trades = Object.values(TRADES_CATALOG);

  const totalSimulations = useMemo(
    () => trades.reduce((sum, t) => sum + moduleCount(t), 0),
    [trades]
  );
  const totalSessions = useMemo(
    () => trades.reduce((sum, t) => sum + t.stages.length, 0),
    [trades]
  );

  const filteredTrades = useMemo(() => {
    return trades.filter((trade) => {
      const matchesCategory = !activeCategory || trade.id === activeCategory;
      if (!matchesCategory) return false;

      if (!query.trim()) return true;
      const q = query.toLowerCase();
      const inTrade =
        trade.name.toLowerCase().includes(q) ||
        trade.description.toLowerCase().includes(q) ||
        trade.digitalTwin.toLowerCase().includes(q);

      const inSessions = trade.stages.some(
        (st) =>
          st.title.toLowerCase().includes(q) ||
          st.items.some((item) => item.title.toLowerCase().includes(q))
      );

      return inTrade || inSessions;
    });
  }, [trades, activeCategory, query]);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Header Banner */}
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="size-3.5" />
                INDUSTRIAL TRAINING & DIGITAL TWINS
              </span>
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Categorized Learning Modules & Simulations
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              Explore {totalSimulations} interactive schematic digital twins organized across {totalSessions} plant sessions and {trades.length} engineering disciplines.
            </p>
          </div>

          {/* Quick Library Link Button */}
          <Link
            href="/library"
            className="group inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/90 hover:shadow-md shrink-0"
          >
            <Sliders className="size-4" />
            <span>Open All 495 Simulations</span>
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>

        {/* Stats Metrics Ribbon */}
        <div className="mt-6 grid grid-cols-2 gap-3 border-t border-border/60 pt-6 sm:grid-cols-4">
          <div className="rounded-xl border border-border/40 bg-card/60 p-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Total Simulations</span>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{totalSimulations}</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/60 p-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Plant Sessions</span>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{totalSessions}</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/60 p-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Trade Disciplines</span>
            <p className="text-xl font-bold text-foreground sm:text-2xl">{trades.length}</p>
          </div>
          <div className="rounded-xl border border-border/40 bg-card/60 p-3">
            <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Schematic Twins</span>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 sm:text-2xl">100% Vector</p>
          </div>
        </div>
      </div>

      {/* Search & Filter Controls */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search disciplines, sessions (e.g. Load Sense, Hydrostatic, 3000 PSI)..."
            className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>

        {query && (
          <button
            onClick={() => setQuery('')}
            className="text-xs font-medium text-muted-foreground hover:text-foreground self-center"
          >
            Clear search
          </button>
        )}
      </div>

      {/* Discipline Tabs */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => setActiveCategory(null)}
          className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
            activeCategory === null
              ? 'bg-foreground text-background shadow-xs'
              : 'border border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
          }`}
        >
          All Disciplines ({totalSimulations})
        </button>

        {trades.map((trade) => {
          const meta = DISCIPLINE_META[trade.id];
          const count = moduleCount(trade);
          const active = activeCategory === trade.id;
          return (
            <button
              key={trade.id}
              onClick={() => setActiveCategory(trade.id)}
              className={`shrink-0 flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold transition-all ${
                active
                  ? 'bg-foreground text-background shadow-xs'
                  : 'border border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              }`}
            >
              {meta?.icon && <meta.icon className="size-3.5" />}
              <span>{meta?.label || trade.name}</span>
              <span className="rounded-full bg-muted/80 px-1.5 py-0.5 text-[10px] font-mono">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Main Disciplines & Categorized Sessions List */}
      <div className="mt-8 flex flex-col gap-10">
        {filteredTrades.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
            <Sliders className="size-10 text-muted-foreground/50 mb-3" />
            <h3 className="text-base font-semibold text-foreground">No matching modules found</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try adjusting your search terms or clearing the active category filter.
            </p>
            <button
              onClick={() => {
                setQuery('');
                setActiveCategory(null);
              }}
              className="mt-4 rounded-lg bg-primary/10 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          filteredTrades.map((trade) => {
            const meta = DISCIPLINE_META[trade.id] || {
              label: trade.name,
              icon: Layers,
              color: '#0B57D0',
              badgeBg: 'bg-primary/10 text-primary',
              badgeBorder: 'border-primary/20',
            };
            const Icon = meta.icon;
            const simTotal = moduleCount(trade);
            const hours = estimatedHours(trade);

            // Filter stages if query matches
            const matchingStages = trade.stages.filter((stage) => {
              if (!query.trim()) return true;
              const q = query.toLowerCase();
              return (
                stage.title.toLowerCase().includes(q) ||
                stage.items.some((item) => item.title.toLowerCase().includes(q))
              );
            });

            return (
              <section
                key={trade.id}
                className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all hover:border-border/80"
              >
                {/* Trade Banner */}
                <div className="flex flex-col gap-4 border-b border-border/80 p-6 sm:flex-row sm:items-center sm:justify-between bg-muted/20">
                  <div className="flex items-start gap-3.5">
                    <div
                      className="flex size-12 items-center justify-center rounded-xl text-white shadow-xs shrink-0"
                      style={{ backgroundColor: meta.color }}
                    >
                      <Icon className="size-6" />
                    </div>
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-lg font-bold text-foreground sm:text-xl">{trade.name}</h2>
                        <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${meta.badgeBg} ${meta.badgeBorder}`}>
                          {trade.digitalTwin}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground sm:text-sm">
                        {trade.description}
                      </p>
                      <div className="mt-2 flex flex-wrap items-center gap-4 text-xs font-medium text-muted-foreground">
                        <span>{trade.stages.length} Industrial Sessions</span>
                        <span>&bull;</span>
                        <span>{simTotal} Simulation Modules</span>
                        <span>&bull;</span>
                        <span>~{hours} Hours Total</span>
                      </div>
                    </div>
                  </div>

                  <Link
                    href={`/learn/${trade.id}`}
                    className="group inline-flex items-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-bold text-foreground shadow-xs transition-colors hover:border-primary hover:text-primary shrink-0 self-start sm:self-center"
                  >
                    <span>View Full Syllabus ({trade.stages.length} Sessions)</span>
                    <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
                  </Link>
                </div>

                {/* Categorized Sessions Preview */}
                <div className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                      Plant Sessions & Featured Simulations
                    </h3>
                    <Link
                      href={`/learn/${trade.id}`}
                      className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <span>See all {trade.stages.length} sessions</span>
                      <ArrowRight className="size-3" />
                    </Link>
                  </div>

                  {/* Stage List / Grid */}
                  <div className="space-y-6">
                    {matchingStages.slice(0, 3).map((stage) => (
                      <div
                        key={stage.seq}
                        className="rounded-xl border border-border/60 bg-background/50 p-4"
                      >
                        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between pb-3 border-b border-border/40">
                          <div className="flex items-center gap-2">
                            <span className="rounded-md bg-muted px-2 py-0.5 font-mono text-[10px] font-bold text-muted-foreground">
                              SESSION {String(stage.seq).padStart(2, '0')}
                            </span>
                            <h4 className="text-sm font-semibold text-foreground">
                              {stage.title}
                            </h4>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {stage.items.length} Simulations
                          </span>
                        </div>

                        {/* Interactive Simulations Grid */}
                        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                          {stage.items.slice(0, 3).map((item) => (
                            <Link
                              key={item.id}
                              href={`/simulation/${item.lessonId}`}
                              className="group flex flex-col overflow-hidden rounded-xl border border-border/80 bg-card transition-all hover:border-primary/60 hover:shadow-sm"
                            >
                              {/* Simulation Thumbnail */}
                              <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                                <SimThumbnail url={item.thumbnail_url} title={item.title} />
                                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2.5">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-white">
                                    <Play className="size-3 fill-white" /> Launch Digital Twin
                                  </span>
                                </div>
                                {item.pressures && item.pressures.length > 0 && (
                                  <span className="absolute top-2 right-2 rounded-md bg-black/70 backdrop-blur-xs px-1.5 py-0.5 font-mono text-[10px] font-bold text-blue-300">
                                    {item.pressures[0].value} {item.pressures[0].unit}
                                  </span>
                                )}
                              </div>

                              {/* Content */}
                              <div className="p-3 flex flex-col justify-between flex-1">
                                <div>
                                  <p className="text-xs font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                                    {item.title}
                                  </p>
                                  <p className="mt-1 text-[11px] text-muted-foreground">
                                    {item.meta}
                                  </p>
                                </div>

                                <div className="mt-3 flex items-center justify-between border-t border-border/40 pt-2 text-[11px]">
                                  <span className="font-mono text-muted-foreground text-[10px]">
                                    {item.component_count ? `${item.component_count} components` : 'Interactive circuit'}
                                  </span>
                                  <span className="font-semibold text-primary group-hover:translate-x-0.5 transition-transform flex items-center gap-0.5">
                                    Simulate &rarr;
                                  </span>
                                </div>
                              </div>
                            </Link>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Footer Action for Trade */}
                  {trade.stages.length > 3 && (
                    <div className="mt-4 text-center">
                      <Link
                        href={`/learn/${trade.id}`}
                        className="inline-flex items-center gap-2 rounded-xl bg-muted/60 px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors"
                      >
                        <span>+ {trade.stages.length - 3} more plant sessions in {trade.name}</span>
                        <ArrowRight className="size-3" />
                      </Link>
                    </div>
                  )}
                </div>
              </section>
            );
          })
        )}
      </div>
    </main>
  );
}
