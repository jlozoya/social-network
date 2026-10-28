import type { ReactNode } from 'react';
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className="legal-shell">
      <nav className="legal-nav">
        <a className="brand" href="/">
          <span className="brand-icon">
            s<span>.</span>
          </span>
          <span>
            Social Network<span className="brand-note">CONEXIONES QUE IMPORTAN</span>
          </span>
        </a>
        <a className="text-button small" href="/">
          Volver a la comunidad ↗
        </a>
      </nav>
      <main className="legal-content">{children}</main>
      <footer className="legal-footer">
        <a href="/privacy">Privacidad</a>
        <a href="/terms">Términos</a>
        <a href="/community">Comunidad</a>
        <a href="/child-safety">Seguridad infantil</a>
        <a href="/delete-account">Eliminar cuenta</a>
        <a href="/support">Soporte</a>
      </footer>
    </div>
  );
}
