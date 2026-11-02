import './globals.css';
import './answer-markdown.css';

import { TooltipProvider } from '@repo/ui/components/tooltip';
import { cn } from '@repo/ui/lib/utils';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import NextTopLoader from 'nextjs-toploader';

import { ThemeProvider } from '@/components/theme-provider';
import { Toaster } from '@/components/toaster';

/** next/font downloads Inter at build time and serves it from this origin (no Google runtime hop). */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'AskDocs',
    template: '%s | AskDocs',
  },
  description: 'Ask your documents — AI-powered document RAG',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={cn(inter.variable, 'font-sans')}>
      <body className="bg-background font-sans text-foreground antialiased">
        <NextTopLoader color="#0075de" height={2} showSpinner={false} />
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <TooltipProvider>
            {children}
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
