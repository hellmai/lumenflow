import type { ReactNode } from 'react';
import './globals.css';

const APP_METADATA = {
  title: 'LumenFlow Web Surface',
  description: 'Next.js shell for kernel HTTP surface APIs.',
} as const;

interface RootLayoutProps {
  readonly children: ReactNode;
}

export const metadata = APP_METADATA;

export default function RootLayout(props: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{props.children}</body>
    </html>
  );
}
