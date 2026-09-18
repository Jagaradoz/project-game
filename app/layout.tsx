import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';

import './globals.css';

/**
 * Self-hosted by next/font, so there is no render-blocking request to Google and
 * no layout shift when the face swaps in. One geometric sans for chrome and
 * headlines -- weight does the hierarchy, not a second sports face.
 */
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-plus-jakarta',
  display: 'swap',
});

const DESCRIPTION =
  'A webcam exercise game. Step, lean and jog in place to control the runner -- ' +
  'all pose detection happens in your browser, and no video ever leaves your device.';

export const metadata: Metadata = {
  title: {
    default: 'Trail Runner - Webcam Exercise Game',
    template: '%s | Trail Runner',
  },
  description: DESCRIPTION,
  applicationName: 'Trail Runner',
  icons: {
    icon: [
      { url: '/favicon.ico', sizes: 'any' },
      { url: '/icon.svg', type: 'image/svg+xml' },
      { url: '/icon.png', type: 'image/png', sizes: '512x512' },
    ],
    apple: [
      { url: '/apple-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    siteName: 'Trail Runner',
    title: 'Trail Runner - Webcam Exercise Game',
    description: DESCRIPTION,
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Trail Runner - Webcam Exercise Game',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Trail Runner - Webcam Exercise Game',
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0a0c0f',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={plusJakarta.variable}>
      <body className="m-0 min-h-dvh antialiased">{children}</body>
    </html>
  );
}
