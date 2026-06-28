import type { Metadata, Viewport } from 'next'
import Script from 'next/script'
import './globals.css'

export const metadata: Metadata = {
  title: 'Sudoku',
  description: 'Classic 9×9 Sudoku — generate, play, and peek!',
  manifest: '/manifest.json',
  // iOS PWA
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Sudoku',
  },
  icons: {
    // iOS home-screen icons
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    // Browser favicon / Android
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  themeColor: '#0f1117',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        {/* iOS PWA */}
        <meta name="mobile-web-app-capable" content="yes" />
        {/* Android / Chrome — links the manifest with CORS so Samsung Internet can read it */}
        <link rel="manifest" href="/manifest.json" crossOrigin="use-credentials" />
        {/* Android Chrome toolbar colour (duplicates viewport themeColor for older Chrome) */}
        <meta name="theme-color" content="#0f1117" />
      </head>
      <body>
        {children}

        {/* Register service worker + cache all Next.js chunks for full offline support */}
        <Script id="sw-register" strategy="afterInteractive">{`
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function () {
              navigator.serviceWorker.register('/sw.js').then(function(reg) {
                console.log('SW registered:', reg.scope);
                // Collect all same-origin JS/CSS URLs already loaded and send to SW to cache
                reg.active && sendChunks(reg.active);
                reg.addEventListener('updatefound', function() {
                  var newWorker = reg.installing;
                  newWorker && newWorker.addEventListener('statechange', function() {
                    if (newWorker.state === 'activated') sendChunks(newWorker);
                  });
                });
              }).catch(function(err) {
                console.log('SW registration failed:', err);
              });
            });

            function sendChunks(worker) {
              var urls = Array.from(document.querySelectorAll('link[rel=stylesheet],script[src]'))
                .map(function(el) { return el.href || el.src; })
                .filter(function(u) { return u && u.startsWith(location.origin); });
              worker.postMessage({ type: 'CACHE_URLS', urls: urls });
            }
          }
        `}</Script>
      </body>
    </html>
  )
}
