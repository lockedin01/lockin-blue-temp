'use client';

import { useReducedMotion } from 'framer-motion';

import KineticTextGrid from '@/components/visual/kinetic-text';
import { useMinWidth } from '@/components/visual/use-min-width';
import { useAccessibility } from '@/components/providers/accessibility-provider';

/**
 * Brand moment for the sign-in screen.
 *
 * The kinetic grid runs 25 infinitely-looping clip-path animations — the most
 * expensive thing rendered anywhere in the app. It is gated three ways, because
 * the people least able to afford it are exactly this product's users:
 *
 *   viewport   — checked in JS, not just `hidden lg:block`. A CSS-hidden element
 *                still mounts and still animates; the work just goes unpainted.
 *   prefer2D   — accessibility mode, or the device's own saveData/2g signal
 *   reduced-motion — Framer Motion drives inline styles from JS, so the CSS
 *                media query in globals.css cannot stop it
 *
 * Any of the three falls back to the same wordmark, held still. The viewport
 * check reads through useSyncExternalStore with a `false` server snapshot, so
 * the grid is never in the SSR output and there is no hydration mismatch.
 */
export function BrandPanel({ text }: { text: string }) {
  const { prefer2D } = useAccessibility();
  const reducedMotion = useReducedMotion();

  const isWide = useMinWidth(1024);

  const font = {
    fontWeight: 700,
    fontSize: 40,
    letterSpacing: '-0.02em',
    lineHeight: 1,
  } as const;

  if (!isWide || prefer2D || reducedMotion) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-primary">
        <span className="text-primary-foreground" style={{ ...font, fontSize: 44 }}>
          {text}
        </span>
      </div>
    );
  }

  return (
    <KineticTextGrid
      text={text}
      font={font}
      textColor="#ffffff"
      backgroundColor="#1c3d5a"
      rowCount={5}
      repeatCount={5}
      rowGap={18}
      wordGap={28}
      horizontalShiftPx={70}
      zoomScalePct={112}
    />
  );
}
