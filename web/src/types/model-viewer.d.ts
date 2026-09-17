import type { DetailedHTMLProps, HTMLAttributes } from 'react';

/**
 * `<model-viewer>` is a custom element, so React needs to be told it exists.
 * React 19 resolves intrinsic elements through the `react` module's own JSX
 * namespace rather than the old global one.
 */
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'model-viewer': DetailedHTMLProps<
        HTMLAttributes<HTMLElement> & {
          src?: string;
          poster?: string;
          alt?: string;
          ar?: boolean;
          'camera-controls'?: boolean;
          'shadow-intensity'?: string;
          loading?: 'auto' | 'lazy' | 'eager';
        },
        HTMLElement
      >;
    }
  }
}

export {};
