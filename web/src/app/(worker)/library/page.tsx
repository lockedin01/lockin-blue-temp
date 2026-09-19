'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import Image from 'next/image';

import simulationsData from '@/data/simulations-modular-registry.json';
import { useI18n } from '@/i18n/provider';
import { LOCALES, LOCALE_LABELS, type Locale } from '@/i18n/config';

interface SimulationCardItem {
  id: string;
  slug: string;
  title: string;
  topic: string;
  topic_slug: string;
  session: string;
  session_slug: string;
  average_time: number;
  thumbnail_url: string;
  type: string;
  description: string;
  unit_system: string;
  pressures: Array<{ value: number; unit: string; confidence: string }>;
  component_count: number;
  labels: string[];
}

const TOPICS = [
  'All Disciplines',
  'Hydraulics',
  'Electrical',
  'Mobile',
  'Stationary',
  'Automation Controllers',
  'Pneumatics',
  'Training Systems',
];

export default function LibraryPage() {
  const { locale, setLocale } = useI18n();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTopic, setSelectedTopic] = useState('All Disciplines');
  const [page, setPage] = useState(1);
  const pageSize = 18;

  const simulationsList = useMemo(() => {
    return Object.values(simulationsData) as SimulationCardItem[];
  }, []);

  // Filtered simulations
  const filteredSimulations = useMemo(() => {
    return simulationsList.filter((item) => {
      // Topic filter
      if (selectedTopic !== 'All Disciplines' && item.topic !== selectedTopic) {
        return false;
      }

      // Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(query);
        const matchesSession = item.session.toLowerCase().includes(query);
        const matchesTopic = item.topic.toLowerCase().includes(query);
        const matchesDescription = item.description.toLowerCase().includes(query);
        const matchesLabels = item.labels.some((l) => l.toLowerCase().includes(query));
        if (!matchesTitle && !matchesSession && !matchesTopic && !matchesDescription && !matchesLabels) {
          return false;
        }
      }

      return true;
    });
  }, [simulationsList, selectedTopic, searchQuery]);

  const totalPages = Math.ceil(filteredSimulations.length / pageSize) || 1;
  const paginatedList = filteredSimulations.slice((page - 1) * pageSize, page * pageSize);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    setPage(1);
  };

  const handleTopicChange = (top: string) => {
    setSelectedTopic(top);
    setPage(1);
  };

  return (
    <main className="min-h-screen bg-[#F8FAFC] pb-16">
      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href="/plan"
              className="inline-flex items-center gap-2 text-sm font-bold text-slate-700 hover:text-[#0B57D0] transition-colors"
            >
              <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span>Back to Roadmap</span>
            </Link>
            <span className="text-slate-300">|</span>
            <div className="flex items-center gap-2">
              <span className="text-sm font-bold text-slate-900">
                Interactive Simulation Catalog
              </span>
              <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-bold text-[#0B57D0]">
                {simulationsList.length} Simulations
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4">
            {/* Quick Locale Selector */}
            <div className="inline-flex items-center rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-2xs">
              {LOCALES.map((code) => (
                <button
                  key={code}
                  type="button"
                  onClick={() => setLocale(code as Locale)}
                  className={`rounded-lg px-2.5 py-1 font-semibold transition-all ${
                    locale === code
                      ? 'bg-[#0B57D0] text-white'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {LOCALE_LABELS[code]}
                </button>
              ))}
            </div>

            <Link
              href="/worker-file"
              className="rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-800 px-3 py-1 text-xs font-bold shadow-2xs transition-all inline-flex items-center gap-1.5"
            >
              <svg className="size-3.5 text-[#0B57D0]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <span>Worker File</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <div className="mx-auto max-w-7xl px-6 pt-8 space-y-6">
        {/* Banner */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase tracking-wider text-[#0B57D0]">
              Modular Vocational Dataset &bull; Lunchbox Sessions
            </span>
            <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 mt-1">
              Industrial Digital Twin Simulations
            </h1>
            <p className="mt-2 text-sm text-slate-600 leading-relaxed">
              Every simulation below is an authentic, independent digital twin model calibrated directly from industrial machinery. No video placeholders — select any circuit to launch its live schematic, pressure telemetry, and component inspector.
            </p>
          </div>

          {/* Metrics */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center min-w-28">
              <span className="text-2xl font-black text-[#0B57D0] block">{simulationsList.length}</span>
              <span className="text-[10px] font-bold uppercase text-slate-500">Live Sims</span>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-center min-w-28">
              <span className="text-2xl font-black text-slate-900 block">86</span>
              <span className="text-[10px] font-bold uppercase text-slate-500">Sessions</span>
            </div>
          </div>
        </div>

        {/* Live Search & Filter Bar */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs space-y-4">
          {/* Search Input */}
          <div className="relative w-full">
            <svg
              className="pointer-events-none absolute left-4 top-3.5 size-5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => handleSearchChange(e.target.value)}
              placeholder="Search 495 simulations by keyword (e.g. Load Sense, Parker L90LS, Rexroth A10VO, gear pump, relief valve, air brakes)..."
              className="w-full rounded-xl border border-slate-200 bg-slate-50/70 py-3 pl-11 pr-4 text-sm font-medium text-slate-900 placeholder:text-slate-400 focus:border-[#0B57D0] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#0B57D0] transition-all"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => handleSearchChange('')}
                className="absolute right-3.5 top-3 text-xs font-semibold text-slate-400 hover:text-slate-600"
              >
                Clear
              </button>
            )}
          </div>

          {/* Discipline Filters */}
          <div className="flex flex-wrap gap-1.5 pt-1">
            {TOPICS.map((top) => (
              <button
                key={top}
                type="button"
                onClick={() => handleTopicChange(top)}
                className={`rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all ${
                  selectedTopic === top
                    ? 'bg-[#0B57D0] text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                {top}
              </button>
            ))}
          </div>
        </div>

        {/* Results Metadata */}
        <div className="flex items-center justify-between text-xs text-slate-500 px-1">
          <span>
            Showing <strong>{filteredSimulations.length}</strong> matching simulations
            {selectedTopic !== 'All Disciplines' && ` in ${selectedTopic}`}
            {searchQuery && ` matching "${searchQuery}"`}
          </span>
          <span>
            Page {page} of {totalPages}
          </span>
        </div>

        {/* 3x3 Industrial Simulations Grid (Matching Lunchbox Sessions Gallery) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {paginatedList.map((item) => {
            const timeMinutes = Math.round(item.average_time / 60) || 1;
            const timeLabel =
              timeMinutes === 1
                ? '1 Minute'
                : timeMinutes < 1
                ? 'A Few Seconds'
                : `${timeMinutes} Minutes`;

            return (
              <div
                key={item.id}
                className="group flex flex-col justify-between rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs hover:border-[#0B57D0]/60 hover:shadow-md transition-all"
              >
                {/* Simulation Thumbnail */}
                <Link
                  href={`/simulation/${item.id}`}
                  className="relative block aspect-[16/10] w-full bg-slate-100 overflow-hidden border-b border-slate-100 cursor-pointer"
                >
                  <Image
                    src={item.thumbnail_url}
                    alt={item.title}
                    fill
                    className="object-contain p-3 transition-transform duration-300 group-hover:scale-105"
                    unoptimized
                  />
                  <div className="absolute top-2.5 right-2.5">
                    <span className="rounded-md bg-slate-900/80 backdrop-blur-xs text-white px-2 py-0.5 text-[10px] font-mono font-bold">
                      #{item.id}
                    </span>
                  </div>
                </Link>

                {/* Simulation Details */}
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 group-hover:text-[#0B57D0] transition-colors line-clamp-2">
                      <Link href={`/simulation/${item.id}`}>
                        {item.title}
                      </Link>
                    </h3>

                    <p className="mt-1 text-xs text-slate-500 line-clamp-1">
                      {item.session} &bull; {item.topic}
                    </p>

                    {item.pressures && item.pressures.length > 0 && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] font-mono text-slate-600">
                        <span className="size-1.5 rounded-full bg-[#E53935]" />
                        <span>Rating: {item.pressures[0].value} {item.pressures[0].unit}</span>
                      </div>
                    )}
                  </div>

                  {/* Card Footer: Time Logged & Launch Button */}
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <span className="text-[9px] uppercase tracking-wider text-slate-400 font-bold block">
                        TIME LOGGED
                      </span>
                      <span className="text-xs font-semibold text-slate-700">
                        {timeLabel}
                      </span>
                    </div>

                    <Link
                      href={`/simulation/${item.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-slate-100 group-hover:bg-[#0B57D0] group-hover:text-white px-3.5 py-1.5 text-xs font-bold text-slate-800 transition-all shadow-2xs"
                    >
                      <span>Launch Twin</span>
                      <span>&rarr;</span>
                    </Link>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 pt-6">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              &larr; Previous
            </button>

            <span className="text-xs font-semibold text-slate-600 px-3">
              Page {page} of {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition-colors"
            >
              Next &rarr;
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
