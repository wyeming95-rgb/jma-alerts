import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import 'leaflet/dist/leaflet.css';
import './globals.css';

const plex = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600'], variable: '--font-plex' });

export const metadata: Metadata = {
  title: '気象警報・地震 | JMA alerts & earthquakes',
  description: 'Japan Meteorological Agency weather warnings, advisories, forecasts and recent earthquakes on one map.',
};
export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7f9' },
    { media: '(prefers-color-scheme: dark)', color: '#14171d' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja" className={plex.variable}>
      <body>{children}</body>
    </html>
  );
}
