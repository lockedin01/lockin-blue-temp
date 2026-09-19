'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ChevronLeft,
  CheckCircle2,
  Play,
  Bookmark,
  Search,
  Gauge,
  Sliders,
  Sparkles,
  ArrowRight,
  Layers,
  Zap,
  Truck,
  Factory,
  Cpu,
  Wind,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { type TradeTrack } from '@/data/curriculum';

interface DisciplineMeta {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const DISCIPLINE_META: Record<string, DisciplineMeta> = {
  hydraulics: { label: 'Hydraulics & Fluid Power', icon: Gauge, color: '#0B57D0' },
  electrical: { label: 'Industrial Electrical & Sensors', icon: Zap, color: '#D97706' },
  mobile: { label: 'Mobile Heavy Equipment', icon: Truck, color: '#E11D48' },
  stationary: { label: 'Stationary Plant Machinery', icon: Factory, color: '#059669' },
  automation: { label: 'Automation & PLC Controllers', icon: Cpu, color: '#7C3AED' },
  pneumatics: { label: 'Pneumatic Systems', icon: Wind, color: '#0284C7' },
};

function SimThumbnail({ url, title }: { url?: string; title: string }) {
  const [error, setError] = useState(false);

  if (!url || error) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center bg-slate-900 p-2 text-center text-slate-400">
        <Sliders className="size-6 text-slate-500 mb-1" />
        <span className="text-[10px] font-mono uppercase tracking-wider text-slate-400">Vector Twin</span>
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

export function TradeSyllabusView({
  trade,
  tradeId,
}: {
  trade: TradeTrack;
  tradeId: string;
}) {
  const [saved, setSaved] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSessionSeq, setSelectedSessionSeq] = useState<number | null>(null);

  const meta = DISCIPLINE_META[tradeId] || {
    label: trade.name,
    icon: Layers,
    color: '#0B57D0',
  };
  const Icon = meta.icon;

  const allModules = useMemo(
    () => trade.stages.flatMap((stage) => stage.items),
    [trade]
  );

  const totalMinutes = useMemo(
    () => allModules.reduce((sum) => sum + 15, 0),
    [allModules]
  );
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  // Filter stages and items based on search query or selected session filter
  const filteredStages = useMemo(() => {
    return trade.stages
      .filter((stage) => {
        if (selectedSessionSeq !== null && stage.seq !== selectedSessionSeq) {
          return false;
        }
        if (!searchQuery.trim()) return true;
        const q = searchQuery.toLowerCase();
        const stageMatch = stage.title.toLowerCase().includes(q) || stage.description.toLowerCase().includes(q);
        const itemMatch = stage.items.some(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.description?.toLowerCase().includes(q) ||
            item.meta?.toLowerCase().includes(q)
        );
        return stageMatch || itemMatch;
      })
      .map((stage) => {
        if (!searchQuery.trim()) return stage;
        const q = searchQuery.toLowerCase();
        const matchingItems = stage.items.filter(
          (item) =>
            item.title.toLowerCase().includes(q) ||
            item.description?.toLowerCase().includes(q) ||
            item.meta?.toLowerCase().includes(q)
        );
        return {
          ...stage,
          items: matchingItems.length > 0 ? matchingItems : stage.items,
        };
      });
  }, [trade, searchQuery, selectedSessionSeq]);

  const firstModule = allModules[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      {/* Back Breadcrumb */}
      <div className="flex items-center gap-2 mb-6">
        <Link
          href="/learn"
          className="inline-flex items-center gap-1 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="size-4" />
          <span>Back to All Learning Disciplines</span>
        </Link>
      </div>

      {/* Trade Hero Card */}
      <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-gradient-to-br from-card via-card to-primary/5 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
                <Sparkles className="size-3.5" />
                ACCREDITED INDUSTRIAL TRACK
              </span>
              <span className="rounded-full border border-border bg-muted/60 px-3 py-1 text-xs font-medium text-foreground">
                Digital Twin: {trade.digitalTwin}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <div
                className="flex size-12 items-center justify-center rounded-xl text-white shadow-xs shrink-0"
                style={{ backgroundColor: meta.color }}
              >
                <Icon className="size-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
                {trade.name}
              </h1>
            </div>

            <p className="text-sm leading-relaxed text-muted-foreground sm:text-base">
              {trade.description}
            </p>

            {/* Quick Metrics */}
            <div className="flex flex-wrap items-center gap-4 text-xs sm:text-sm font-medium text-muted-foreground pt-1">
              <span className="flex items-center gap-1.5 text-foreground">
                <span className="size-2 rounded-full bg-blue-500" />
                {trade.stages.length} Plant Sessions
              </span>
              <span>&bull;</span>
              <span className="flex items-center gap-1.5 text-foreground">
                <span className="size-2 rounded-full bg-emerald-500" />
                {allModules.length} Interactive Simulations
              </span>
              <span>&bull;</span>
              <span>~{hours}h {minutes > 0 ? `${minutes}m` : ''} Total Hands-On</span>
              <span>&bull;</span>
              <span>Industry: {trade.industry}</span>
            </div>
          </div>

          {/* Action CTAs */}
          <div className="flex flex-col sm:flex-row lg:flex-col gap-3 shrink-0">
            {firstModule && (
              <Button
                render={<Link href={`/simulation/${firstModule.lessonId}`} />}
                size="xl"
                className="gap-2 shadow-xs"
              >
                <Play className="size-4 fill-current" />
                <span>Launch Session 01 Simulation</span>
              </Button>
            )}

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="default"
                className="flex-1 gap-2"
                aria-pressed={saved}
                onClick={() => setSaved((s) => !s)}
              >
                <Bookmark className={saved ? 'size-4 fill-primary text-primary' : 'size-4'} />
                <span>{saved ? 'Track Saved' : 'Save Track'}</span>
              </Button>

              <Link
                href="/library"
                className="inline-flex items-center justify-center rounded-xl border border-border bg-background px-4 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              >
                Open Full Catalog
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Session Filter Bar & Search */}
      <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={`Search across ${trade.stages.length} sessions and ${allModules.length} simulations...`}
            className="h-11 w-full rounded-xl border border-border bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/30"
          />
        </div>

        {/* Clear Filters */}
        {(searchQuery || selectedSessionSeq !== null) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedSessionSeq(null);
            }}
            className="text-xs font-semibold text-primary hover:underline self-center"
          >
            Show all {trade.stages.length} sessions
          </button>
        )}
      </div>

      {/* Quick Session Jumper Pills */}
      <div className="mt-4 flex gap-2 overflow-x-auto pb-2 scrollbar-none">
        <button
          onClick={() => setSelectedSessionSeq(null)}
          className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all ${
            selectedSessionSeq === null
              ? 'bg-foreground text-background shadow-xs'
              : 'border border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
          }`}
        >
          All Sessions ({trade.stages.length})
        </button>

        {trade.stages.map((stage) => {
          const active = selectedSessionSeq === stage.seq;
          return (
            <button
              key={stage.seq}
              onClick={() => setSelectedSessionSeq(stage.seq)}
              className={`shrink-0 flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all ${
                active
                  ? 'bg-foreground text-background shadow-xs font-semibold'
                  : 'border border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground'
              }`}
            >
              <span className="font-mono text-[10px]">S{String(stage.seq).padStart(2, '0')}</span>
              <span className="truncate max-w-[160px]">{stage.title}</span>
              <span className="rounded-full bg-muted/80 px-1 text-[10px] font-mono">
                {stage.items.length}
              </span>
            </button>
          );
        })}
      </div>

      {/* Categorized Sessions Syllabus */}
      <div className="mt-8 flex flex-col gap-8">
        {filteredStages.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border py-16 text-center">
            <Sliders className="size-10 text-muted-foreground/50 mb-3" />
            <h3 className="text-base font-semibold text-foreground">No sessions match your search</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              Try searching for different component or session keywords.
            </p>
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedSessionSeq(null);
              }}
              className="mt-4 rounded-lg bg-primary/10 px-4 py-2 text-xs font-semibold text-primary hover:bg-primary/20"
            >
              Reset Search
            </button>
          </div>
        ) : (
          filteredStages.map((stage) => (
            <section
              key={stage.seq}
              className="overflow-hidden rounded-2xl border border-border bg-card shadow-xs transition-all hover:border-border/80"
            >
              {/* Session Header */}
              <div className="flex flex-col gap-2 border-b border-border/70 bg-muted/20 p-5 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded-md bg-primary/10 px-2 py-0.5 font-mono text-xs font-bold text-primary">
                      SESSION {String(stage.seq).padStart(2, '0')}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {stage.items.length} Interactive Simulations
                    </span>
                  </div>
                  <h2 className="mt-1 text-lg font-bold text-foreground">
                    {stage.title}
                  </h2>
                  <p className="mt-1 text-xs text-muted-foreground leading-relaxed sm:text-sm">
                    {stage.description}
                  </p>
                </div>

                {stage.items[0] && (
                  <Link
                    href={`/simulation/${stage.items[0].lessonId}`}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-background px-3.5 py-2 text-xs font-bold text-foreground shadow-xs hover:border-primary hover:text-primary transition-colors shrink-0 self-start sm:self-center"
                  >
                    <Play className="size-3.5 fill-current" />
                    <span>Launch Session</span>
                  </Link>
                )}
              </div>

              {/* Simulation Modules Grid */}
              <div className="p-5">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  {stage.items.map((item, idx) => {
                    const isDone = item.status === 'completed';
                    const isInProgress = item.status === 'in-progress';

                    return (
                      <div
                        key={item.id}
                        className="group flex flex-col overflow-hidden rounded-xl border border-border/80 bg-background transition-all hover:border-primary/60 hover:shadow-sm"
                      >
                        {/* Interactive Vector Schematic Preview */}
                        <div className="relative aspect-video w-full overflow-hidden bg-slate-950">
                          <SimThumbnail url={item.thumbnail_url} title={item.title} />

                          {/* Hover Play Overlay */}
                          <Link
                            href={`/simulation/${item.lessonId}`}
                            className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-4 text-center z-10"
                          >
                            <div className="flex size-10 items-center justify-center rounded-full bg-primary text-white shadow-lg transform transition-transform group-hover:scale-110">
                              <Play className="size-5 fill-white translate-x-0.5" />
                            </div>
                            <span className="text-xs font-bold text-white">Launch Simulation</span>
                          </Link>

                          {/* Pressure / Telemetry Badge */}
                          {item.pressures && item.pressures.length > 0 && (
                            <span className="absolute top-2 right-2 rounded-md bg-black/75 backdrop-blur-xs px-2 py-0.5 font-mono text-[10px] font-bold text-blue-300 z-0">
                              {item.pressures[0].value} {item.pressures[0].unit}
                            </span>
                          )}

                          {/* Step Index Badge */}
                          <span className="absolute bottom-2 left-2 rounded-md bg-black/70 backdrop-blur-xs px-1.5 py-0.5 font-mono text-[10px] font-medium text-slate-300 z-0">
                            #{String(idx + 1).padStart(2, '0')}
                          </span>
                        </div>

                        {/* Card Info & Details */}
                        <div className="flex flex-1 flex-col justify-between p-4">
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <h3 className="text-sm font-semibold text-foreground line-clamp-2 group-hover:text-primary transition-colors">
                                {item.title}
                              </h3>
                              {isDone ? (
                                <CheckCircle2 className="size-4 shrink-0 text-emerald-500" />
                              ) : isInProgress ? (
                                <span className="size-2 rounded-full bg-primary shrink-0 mt-1" />
                              ) : null}
                            </div>

                            <p className="mt-1.5 text-xs text-muted-foreground line-clamp-2">
                              {item.description || item.meta}
                            </p>
                          </div>

                          {/* Card Footer Actions */}
                          <div className="mt-4 flex items-center justify-between border-t border-border/40 pt-3 text-xs">
                            <span className="font-mono text-[11px] text-muted-foreground">
                              {item.component_count ? `${item.component_count} parts` : 'Live telemetry'}
                            </span>

                            <Link
                              href={`/simulation/${item.lessonId}`}
                              className="inline-flex items-center gap-1 font-bold text-primary group-hover:translate-x-0.5 transition-transform"
                            >
                              <span>Simulate</span>
                              <ArrowRight className="size-3" />
                            </Link>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
