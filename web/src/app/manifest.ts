import type { MetadataRoute } from 'next';

/**
 * Installable PWA. The target device is a low-to-mid-end Android phone on
 * unreliable network, so this is the delivery mechanism, not an enhancement.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'SkillBridge — Vocational Training',
    short_name: 'SkillBridge',
    description:
      'Voice-first vocational training for industrial maintenance workers, in your own language.',
    start_url: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a0a0a',
    theme_color: '#0a0a0a',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      {
        src: '/icons/icon-maskable-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
