import { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TTFoodie',
    short_name: 'TTFoodie',
    description: 'Find the nearest MRT for trending TikTok food spots.',
    start_url: '/',
    display: 'standalone',
    background_color: '#F7F3EC',
    theme_color: '#C8471A',
    icons: [
      {
        src: '/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        src: '/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
  }
}
