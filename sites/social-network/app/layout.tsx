import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Social Network',
  description: 'Publicaciones, fotos, perfiles y mensajes directos.',
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
