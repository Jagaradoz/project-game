import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Trail Runner - Webcam Exercise Game',
  description:
    'เว็บไซต์เกมออกกำลังกายผ่านเว็บแคม - ควบคุมเกมด้วยการเคลื่อนไหวร่างกาย โดยประมวลผลภาพทั้งหมดบนเบราว์เซอร์ของผู้เล่น',
  icons: {
    icon:
      "data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'><text y='14' font-size='14'>🛡️</text></svg>",
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="th">
      <body className="m-0 min-h-dvh">{children}</body>
    </html>
  );
}
