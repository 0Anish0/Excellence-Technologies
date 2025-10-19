import './globals.css';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { Toaster } from '@/components/ui/toaster';
import dynamic from 'next/dynamic';

const inter = Inter({ subsets: ['latin'] });
const Chatbot = dynamic(() => import('../components/chatbot.tsx').then(mod => mod.default), { ssr: false });

export const metadata: Metadata = {
  title: 'Poll App',
  description: 'Excellence Technologies',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
        <Chatbot />
        <Toaster />
      </body>
    </html>
  );
}