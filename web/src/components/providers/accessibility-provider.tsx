'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useSyncExternalStore,
  type ReactNode,
} from 'react';

/**
 * Accessibility mode: icon-forward, reduced text, larger type — for workers with
 * low textual or digital literacy.
 *
 * It also forces the 2D path for machine models: live 3D is the most expensive
 * thing on the page, and the same users are the most likely to be on a low-end
 * device or a metered connection.
 *
 * Preference is read through useSyncExternalStore rather than an effect, so the
 * server snapshot is well-defined and there are no cascading renders on mount.
 */

const STORAGE_KEY = 'a11y-mode';

const listeners = new Set<() => void>();
let cached: boolean | null = null;

function readPreference(): boolean {
  if (cached === null) {
    try {
      cached = localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // private mode or blocked storage — the default is fine
      cached = false;
    }
  }
  return cached;
}

function writePreference(enabled: boolean) {
  cached = enabled;
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // not worth failing the interaction over
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}

/** The device's own data-saver signal, honoured alongside the explicit toggle. */
function readSaveData(): boolean {
  const connection = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  return Boolean(connection?.saveData) || /2g/.test(connection?.effectiveType ?? '');
}

interface AccessibilityValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
  /** True when live 3D should be skipped in favour of pre-rendered stills. */
  prefer2D: boolean;
}

const AccessibilityContext = createContext<AccessibilityValue | null>(null);

export function AccessibilityProvider({ children }: { children: ReactNode }) {
  const enabled = useSyncExternalStore(subscribe, readPreference, () => false);
  const saveData = useSyncExternalStore(subscribe, readSaveData, () => false);

  useEffect(() => {
    document.documentElement.dataset.a11y = enabled ? 'on' : 'off';
  }, [enabled]);

  const setEnabled = useCallback((next: boolean) => writePreference(next), []);

  return (
    <AccessibilityContext.Provider
      value={{ enabled, setEnabled, prefer2D: enabled || saveData }}
    >
      {children}
    </AccessibilityContext.Provider>
  );
}

export function useAccessibility(): AccessibilityValue {
  const context = useContext(AccessibilityContext);
  if (!context) {
    throw new Error('useAccessibility must be used inside AccessibilityProvider');
  }
  return context;
}
