'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import {
  Maximize2,
  Minimize2,
  RotateCcw,
  ExternalLink,
  Play,
  Pause,
  ShieldCheck,
  ChevronLeft,
} from 'lucide-react';

import { Exploded3DView } from './exploded-3d-view';

export interface ModularSimData {
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
  voltages: string[];
  labels: string[];
  dimensions: { width: number; height: number; viewbox?: string };
  semantic_colors: Record<string, string>;
  component_count: number;
  key_components: Array<{ id: string; name: string; type: string; layer: string }>;
  pumps: string[];
  valves: string[];
  cylinders: string[];
  flow_lines: string[];
}

export function ModularSimulationViewer({ sim }: { sim: ModularSimData }) {
  const is3DModel =
    sim.id === '2253' ||
    sim.id === '724' ||
    sim.id === '180' ||
    sim.title.toLowerCase().includes('bent axis') ||
    sim.title.toLowerCase().includes('pilot controller');

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [flowDirection, setFlowDirection] = useState<'forward' | 'neutral' | 'reverse'>('forward');
  const [flowSpeed, setFlowSpeed] = useState<number>(1.0);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [iframeKey, setIframeKey] = useState<number>(0);
  const [activeViewMode, setActiveViewMode] = useState<'schematic' | 'exploded'>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('view') === 'exploded') return 'exploded';
      if (params.get('view') === 'schematic') return 'schematic';
    }
    return is3DModel ? 'exploded' : 'schematic';
  });
  const [selectedComponent, setSelectedComponent] = useState<string | null>(
    sim.labels[0] || sim.key_components[0]?.name || 'Primary Pressure Port'
  );

  const defaultPsi = sim.pressures[0]?.value || 1500;
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const reloadSimulation = () => {
    setIframeKey((prev) => prev + 1);
    setIsPlaying(true);
  };

  const togglePlay = () => {
    const nextState = !isPlaying;
    setIsPlaying(nextState);
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { action: nextState ? 'play' : 'stop' },
        '*'
      );
    }
  };

  const setDirection = (dir: 'forward' | 'neutral' | 'reverse') => {
    setFlowDirection(dir);
    if (!isPlaying) {
      setIsPlaying(true);
      iframeRef.current?.contentWindow?.postMessage({ action: 'play' }, '*');
    }
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { action: 'setFlowState', state: dir },
        '*'
      );
    }
  };

  const setSpeedMultiplier = (spd: number) => {
    setFlowSpeed(spd);
    if (iframeRef.current?.contentWindow) {
      iframeRef.current.contentWindow.postMessage(
        { action: 'setSpeed', speed: spd },
        '*'
      );
    }
  };

  return (
    <div className={`min-h-screen bg-[#F8FAFC] pb-16 text-slate-900 ${isFullscreen ? 'fixed inset-0 z-50 overflow-auto bg-white' : ''}`}>
      {/* Top Header */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur-xs px-4 sm:px-6 py-3.5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              href="/learn"
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 transition-colors"
            >
              <ChevronLeft className="size-4" />
              <span>Back to Modules</span>
            </Link>

            <span className="text-slate-300">|</span>

            <div>
              <div className="flex items-center gap-2">
                <span className="rounded-md bg-blue-50 text-[#0B57D0] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider">
                  Twin #{sim.id}
                </span>
                <span className="text-xs font-semibold text-slate-500 hidden sm:inline">
                  {sim.topic} &bull; {sim.session}
                </span>
              </div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 leading-tight">
                {sim.title}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switcher Pill */}
            <div className="flex rounded-xl bg-slate-100 p-1 text-xs font-bold border border-slate-200/80 mr-2">
              <button
                type="button"
                onClick={() => setActiveViewMode('schematic')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                  activeViewMode === 'schematic'
                    ? 'bg-white text-[#0B57D0] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span className={`size-1.5 rounded-full ${activeViewMode === 'schematic' ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                <span>Schematic Circuit</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveViewMode('exploded')}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 transition-all ${
                  activeViewMode === 'exploded'
                    ? 'bg-white text-[#0B57D0] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Exploded / 3D CAD</span>
                <span className="rounded bg-blue-100 px-1 py-0.2 text-[9px] text-[#0B57D0] font-mono">BOM</span>
              </button>
            </div>

            {/* Play / Pause Top Button */}
            <button
              type="button"
              onClick={togglePlay}
              title={isPlaying ? 'Pause Simulation Flow' : 'Resume Simulation Flow'}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-all shadow-xs ${
                isPlaying
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-300 hover:bg-emerald-100'
                  : 'bg-amber-50 text-amber-700 border border-amber-300 hover:bg-amber-100'
              }`}
            >
              {isPlaying ? <Pause className="size-3.5 fill-current" /> : <Play className="size-3.5 fill-current" />}
              <span>{isPlaying ? 'Pause' : 'Play'}</span>
            </button>

            <button
              type="button"
              onClick={reloadSimulation}
              title="Reset Simulation"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              <RotateCcw className="size-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </button>

            <button
              type="button"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen Simulation'}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
            >
              {isFullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              <span className="hidden sm:inline">{isFullscreen ? 'Exit' : 'Full'}</span>
            </button>

            <a
              href={`/api/simulation-player/${sim.id}`}
              target="_blank"
              rel="noopener noreferrer"
              title="Open Standalone Player"
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 shadow-xs"
            >
              <ExternalLink className="size-3.5" />
              <span className="hidden sm:inline">Pop Out</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Simulation Workspace */}
      <main className={`mx-auto px-4 sm:px-6 pt-6 ${isFullscreen ? 'max-w-none' : 'max-w-7xl'}`}>
        {activeViewMode === 'exploded' ? (
          /* Exploded & 3D Disassembly View with Interactive BOM */
          <Exploded3DView sim={sim} />
        ) : (
          /* Schematic & Live Physics Circuit View */
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className={`${isFullscreen ? 'lg:col-span-3' : 'lg:col-span-2'} space-y-4`}>
          <div className="relative rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-xs">
            {/* Canvas Header Bar */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/90 px-4 sm:px-5 py-3 text-xs">
              <div className="flex items-center gap-3">
                <span className="flex items-center gap-1.5 font-bold text-slate-800">
                  <span className={`size-2 rounded-full ${isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                  {isPlaying ? 'Live Interactive Physics Twin' : 'Physics Simulation Paused'}
                </span>
                <span className="rounded bg-slate-200/80 px-2 py-0.5 font-mono text-[10px] text-slate-600 hidden sm:inline">
                  {sim.dimensions.width} &times; {sim.dimensions.height}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[11px] font-medium text-slate-500">
                <span className="text-blue-700 bg-blue-50 px-2 py-0.5 rounded font-semibold text-[11px]">
                  &bull; Click and drag levers, valves, or use the flow controller below
                </span>
              </div>
            </div>

            {/* Authentic Running TakeAndMake Physics Simulator Canvas */}
            <div className={`relative w-full bg-slate-950 overflow-hidden ${isFullscreen ? 'h-[85vh]' : 'h-[540px] sm:h-[620px] lg:h-[680px]'}`}>
              <iframe
                key={iframeKey}
                ref={iframeRef}
                src={`/api/simulation-player/${sim.id}`}
                title={sim.title}
                className="w-full h-full border-0 bg-white"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              />
            </div>

            {/* Interactive Simulation Operating Console */}
            <div className="border-t border-slate-200 bg-slate-50/80 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Left: Play / Stop Toggle and Flow Presets */}
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className={`inline-flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-bold shadow-xs transition-all ${
                      isPlaying
                        ? 'bg-rose-600 text-white hover:bg-rose-700 active:scale-95'
                        : 'bg-emerald-600 text-white hover:bg-emerald-700 active:scale-95'
                    }`}
                  >
                    {isPlaying ? (
                      <>
                        <Pause className="size-3.5 fill-current" />
                        <span>Stop Flow</span>
                      </>
                    ) : (
                      <>
                        <Play className="size-3.5 fill-current" />
                        <span>Play Flow</span>
                      </>
                    )}
                  </button>

                  <span className="h-6 w-px bg-slate-300 mx-1 hidden sm:inline-block" />

                  {/* Swashplate / Direction Presets */}
                  <div className="inline-flex rounded-xl bg-white p-1 border border-slate-200 text-xs shadow-2xs">
                    <button
                      type="button"
                      onClick={() => setDirection('forward')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                        flowDirection === 'forward'
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Forward (+Qmax)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirection('neutral')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                        flowDirection === 'neutral'
                          ? 'bg-slate-800 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Neutral (Idle)
                    </button>
                    <button
                      type="button"
                      onClick={() => setDirection('reverse')}
                      className={`px-3 py-1.5 rounded-lg font-bold transition-all ${
                        flowDirection === 'reverse'
                          ? 'bg-amber-600 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Reverse (-Qmax)
                    </button>
                  </div>
                </div>

                {/* Right: Flow Speed Multiplier & Reset */}
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-semibold text-slate-500">Speed:</span>
                  <div className="inline-flex rounded-lg bg-white p-0.5 border border-slate-200 text-[11px] font-semibold">
                    {[0.5, 1.0, 2.0].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setSpeedMultiplier(spd)}
                        className={`px-2 py-1 rounded font-mono ${
                          flowSpeed === spd
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={reloadSimulation}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 shadow-2xs ml-1"
                  >
                    <RotateCcw className="size-3" />
                    <span>Reset</span>
                  </button>
                </div>
              </div>

              {/* Status & Diagnostic Ribbon */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-[11px] text-slate-600">
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-slate-700">Loop Status:</span>
                  <span className={`inline-flex items-center gap-1 font-bold ${isPlaying ? 'text-emerald-700' : 'text-amber-700'}`}>
                    <span className={`size-2 rounded-full ${isPlaying ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
                    {isPlaying ? 'Fluid Flow Active (60 FPS)' : 'Loop Paused (Static Hold)'}
                  </span>
                  <span className="text-slate-300">&bull;</span>
                  <span className="font-mono text-slate-700">
                    Mode: <strong className="text-slate-900">{flowDirection === 'forward' ? 'Port A (3000 PSI) -> CW Motor' : flowDirection === 'reverse' ? 'Port B (3000 PSI) -> CCW Motor' : 'Neutral Zero Displacement (260 PSI Charge Idle)'}</strong>
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="rounded bg-blue-50 text-blue-800 px-2 py-0.5 font-semibold text-[10px]">
                    Hot Oil Shuttle: Active Flushing
                  </span>
                  <span className="rounded bg-rose-50 text-rose-800 px-2 py-0.5 font-semibold text-[10px]">
                    Cross-Port Relief: 3000 PSI
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Description & Operating Instructions */}
          {!isFullscreen && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
              <h3 className="text-sm font-bold text-slate-900 mb-2">
                System Specifications & Engineering Overview
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {sim.description}
              </p>

              <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3 pt-4 border-t border-slate-100 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Unit System</span>
                  <span className="font-semibold text-slate-800">{sim.unit_system}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Component Nodes</span>
                  <span className="font-semibold text-slate-800">{sim.component_count} Vector Elements</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Estimated Study Time</span>
                  <span className="font-semibold text-slate-800">~{Math.round(sim.average_time / 60) || 5} Minutes</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase">Fluid Specification</span>
                  <span className="font-semibold text-slate-800">ISO VG 46 Mineral</span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Column: Component Inspector & Verified SOP */}
        {!isFullscreen && (
          <div className="space-y-4">
            {/* Active Component Inspector */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <span className="text-xs font-bold text-slate-900">Component Inspector</span>
                <span className="rounded bg-blue-50 text-[#0B57D0] px-2 py-0.5 text-[10px] font-bold uppercase">
                  Digital Twin Inspector
                </span>
              </div>

              <div className="mt-4">
                <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Selected Circuit Node
                </span>
                <h4 className="text-base font-bold text-[#0B57D0] mt-0.5">
                  {selectedComponent}
                </h4>
              </div>

              <div className="mt-4 space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Live Operating Pressure:</span>
                  <span className="font-mono font-bold text-slate-900">{defaultPsi} PSI</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Circuit Status:</span>
                  <span className="font-semibold text-emerald-600">Nominal Calibration</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100">
                  <span className="text-slate-500">Component Nodes:</span>
                  <span className="font-mono font-bold text-slate-900">{sim.component_count} Active</span>
                </div>
              </div>

              {/* Quick Inspection Switcher */}
              <div className="mt-5">
                <span className="text-[11px] font-bold text-slate-700 block mb-2">
                  Circuit Callouts ({sim.labels.length || sim.key_components.length}):
                </span>
                <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto pr-1">
                  {(sim.labels.length > 0 ? sim.labels : sim.key_components.map((c) => c.name)).map((comp) => (
                    <button
                      key={comp}
                      type="button"
                      onClick={() => setSelectedComponent(comp)}
                      className={`rounded-lg px-2.5 py-1 text-left text-xs transition-all ${
                        selectedComponent === comp
                          ? 'bg-[#0B57D0] text-white font-bold'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {comp}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Plant SOP & Troubleshooting Procedure */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs">
              <h4 className="text-xs font-bold text-slate-900 mb-3 flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-600" />
                <span>Standard Operating Procedure (SOP)</span>
              </h4>

              <ol className="space-y-3 text-xs text-slate-600">
                <li className="flex items-start gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-[10px] text-slate-700">
                    1
                  </span>
                  <span>
                    Confirm primary mechanical isolation and test relief valve cracking pressure ({defaultPsi} PSI).
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-[10px] text-slate-700">
                    2
                  </span>
                  <span>
                    Interact with the directional spool lever to verify positive seal seating and verify zero external leakage.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-slate-100 font-bold text-[10px] text-slate-700">
                    3
                  </span>
                  <span>
                    Observe fluid stream arrows and verify return pressure drops below 50 PSI before sign-off.
                  </span>
                </li>
              </ol>
            </div>
          </div>
        )}
      </div>
    )}
  </main>
</div>
);
}
