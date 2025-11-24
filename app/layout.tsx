import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], variable: '--font-display' });

export const metadata: Metadata = {
  title: 'SuperKagi',
  description: 'Grok-inspired web chat for local LLMs and OpenRouter with Kagi search tools.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
