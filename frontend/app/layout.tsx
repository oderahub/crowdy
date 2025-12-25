import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AppKitProvider } from '@/components/AppKitProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'STX Escrow - Trustless P2P Trading',
  description: 'Secure escrow service for P2P trading on Stacks',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <AppKitProvider>{children}</AppKitProvider>
      </body>
    </html>
  );
}
