'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccessibility } from '@/components/providers/accessibility-provider';
import type { MachineAsset } from '@/lib/types';

/**
 * The 3D machine viewer, and the anchor for "tap a part, ask about it".
 *
 * `<model-viewer>` rather than three.js/react-three-fiber: far smaller payload,
 * native GLB + Draco + KTX2, declarative hotspots, and AR on Android for free.
 * three.js is reserved for true simulation behaviour, which is roadmap.
 *
 * The performance budget is a hard constraint. The module is imported lazily so
 * none of it is fetched until a lesson that needs it actually opens, and on a
 * weak device or network the pre-rendered still is shown instead of live 3D.
 */

/** How long to wait for a model before showing the 2D path instead. */
const MODEL_LOAD_DEADLINE_MS = 6000;

export interface MachineViewerProps {
  asset: MachineAsset;
  /** Fired when a worker taps a component — carries the hotspot into the tutor. */
  onPartSelected?: (hotspotId: string) => void;
}

export function MachineViewer({ asset, onPartSelected }: MachineViewerProps) {
  const { prefer2D } = useAccessibility();
  const [ready, setReady] = useState(false);
  // Keyed by URL rather than a boolean, so switching lessons clears the failure
  // by derivation. Resetting it in an effect would be a setState-in-effect,
  // which this codebase lints against.
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const failed = failedUrl === asset.glbUrl;
  const viewerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (prefer2D) return;
    let cancelled = false;
    void import('@google/model-viewer').then(
      () => {
        if (!cancelled) setReady(true);
      },
      () => {
        if (!cancelled) setFailedUrl(asset.glbUrl);
      }
    );
    return () => {
      cancelled = true;
    };
  }, [prefer2D, asset.glbUrl]);

  /**
   * Fall back to 2D if the model errors OR simply never arrives.
   *
   * Two reasons this is a deadline and not just an error listener:
   * <model-viewer> dispatches a plain CustomEvent('error') that React's
   * synthetic onError does not cover and that can fire before a listener
   * attaches; and on a 2g connection the realistic failure is not an error at
   * all, it is a fetch that never finishes. Either way the worker must end up
   * with the tappable list rather than an empty frame — the hotspots are
   * positioned against the mesh, so no mesh means no tap-a-part.
   */
  useEffect(() => {
    const element = viewerRef.current;
    if (!element) return;

    const url = asset.glbUrl;
    const fail = () => setFailedUrl(url);

    const timer = setTimeout(() => {
      if (!(element as HTMLElement & { loaded?: boolean }).loaded) fail();
    }, MODEL_LOAD_DEADLINE_MS);

    const onLoad = () => clearTimeout(timer);
    element.addEventListener('error', fail);
    element.addEventListener('load', onLoad);

    return () => {
      clearTimeout(timer);
      element.removeEventListener('error', fail);
      element.removeEventListener('load', onLoad);
    };
  }, [ready, asset.glbUrl]);

  // A model that 404s or times out must not strand the worker: <model-viewer>
  // positions hotspots against the loaded mesh, so without one they collapse to
  // zero size and "tap a part" silently stops working. Falling back to the 2D
  // list keeps the interaction alive on a flaky network, which is the normal
  // case here — not an edge case.
  if (prefer2D || failed || !ready) {
    return (
      <div className="machine-viewer machine-viewer--fallback">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={asset.posterUrl} alt={asset.name} loading="lazy" />
        <ul>
          {asset.hotspots.map((hotspot) => (
            <li key={hotspot.id}>
              <button type="button" onClick={() => onPartSelected?.(hotspot.id)}>
                {hotspot.label}
              </button>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <model-viewer
      className="machine-viewer"
      src={asset.glbUrl}
      poster={asset.posterUrl}
      alt={asset.name}
      camera-controls
      loading="lazy"
      ref={viewerRef}
    >
      {asset.hotspots.map((hotspot) => (
        <button
          key={hotspot.id}
          type="button"
          slot={`hotspot-${hotspot.id}`}
          data-position={hotspot.position}
          data-normal={hotspot.normal}
          onClick={() => onPartSelected?.(hotspot.id)}
        >
          {hotspot.label}
        </button>
      ))}
    </model-viewer>
  );
}
