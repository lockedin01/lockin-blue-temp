'use client';

import { useEffect, useState } from 'react';
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

export interface MachineViewerProps {
  asset: MachineAsset;
  /** Fired when a worker taps a component — carries the hotspot into the tutor. */
  onPartSelected?: (hotspotId: string) => void;
}

export function MachineViewer({ asset, onPartSelected }: MachineViewerProps) {
  const { prefer2D } = useAccessibility();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (prefer2D) return;
    let cancelled = false;
    void import('@google/model-viewer').then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [prefer2D]);

  if (prefer2D || !ready) {
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
