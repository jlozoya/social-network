import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Social Network · Lo que importa, más cerca',
  description: 'Comparte lo que te importa, encuentra tu comunidad y conversa a tu ritmo.',
  icons: {
    icon: '/favicon.svg',
    shortcut: '/favicon.svg',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
