'use client';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { api, useApp, useTask, Spinner } from './shared';
import { siteUrl } from './origin';
const support = 'jlozoya1995+socialnetwork@gmail.com';
export default function AuthPanel({
  done,
  chatgpt,
}: {
  done: () => void;
  chatgpt: (link: boolean, accepted: boolean) => Promise<void>;
}) {
  const { refreshUser } = useApp(),
    { busy, task } = useTask();
  const [signup, setSignup] = useState(false),
    [accepted, setAccepted] = useState(false);
  return (
    <>
      <p className="muted">Tu comunidad empieza con una conversación.</p>
      <div className="tabs auth-tabs">
        <button className={!signup ? 'active' : ''} onClick={() => setSignup(false)}>
          Entrar
        </button>
        <button className={signup ? 'active' : ''} onClick={() => setSignup(true)}>
          Crear cuenta
        </button>
      </div>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          const values = Object.fromEntries(new FormData(e.currentTarget));
          void task(async () => {
            await api(signup ? '/api/auth/signup' : '/api/auth/login', 'POST', {
              ...values,
              termsAccepted: accepted,
              ageConfirmed: accepted,
            });
            await refreshUser();
            done();
          });
        }}
      >
        {signup && (
          <>
            <label>
              Tu nombre
              <input
                name="displayName"
                required
                maxLength={80}
                autoComplete="name"
                placeholder="¿Cómo te llamas?"
              />
            </label>
            <label>
              Nombre de usuario
              <input
                name="username"
                required
                minLength={3}
                maxLength={30}
                pattern="[a-zA-Z0-9_]+"
                autoComplete="username"
                placeholder="tu_usuario"
              />
            </label>
          </>
        )}
        <label>
          Correo electrónico
          <input
            name="email"
            type="email"
            required
            autoComplete="email"
            placeholder="tu@correo.com"
          />
        </label>
        <label>
          Contraseña
          <input
            name="password"
            type="password"
            required
            minLength={signup ? 12 : 1}
            maxLength={128}
            autoComplete={signup ? 'new-password' : 'current-password'}
            placeholder={signup ? '12 caracteres o más' : 'Tu contraseña'}
          />
        </label>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span>
            Tengo 18 años o más y acepto los{' '}
            <a href={siteUrl('/terms')} target="_blank" rel="noreferrer">
              términos
            </a>
            , la{' '}
            <a href={siteUrl('/privacy')} target="_blank" rel="noreferrer">
              privacidad
            </a>{' '}
            y las{' '}
            <a href={siteUrl('/community')} target="_blank" rel="noreferrer">
              normas de comunidad
            </a>
            .
          </span>
        </label>
        <button className="button primary full" disabled={busy || (signup && !accepted)}>
          {busy ? <Spinner /> : signup ? 'Crear mi cuenta' : 'Entrar a mi comunidad'}
          <ArrowUpRight size={18} />
        </button>
      </form>
      <div className="or">
        <span>o continúa con</span>
      </div>
      <button
        className="button outline full"
        disabled={busy || !accepted}
        onClick={() => void task(() => chatgpt(false, accepted))}
      >
        <span className="chatgpt-mark">✳</span> ChatGPT
      </button>
      <p className="small muted">
        Para continuar con ChatGPT, acepta primero los términos. Si ya tienes cuenta con este
        correo, puedes vincularla desde Ajustes.
      </p>
      <a
        className="text-button small"
        href={`mailto:${support}?subject=Recuperar%20acceso%20a%20Social%20Network`}
      >
        Necesito ayuda para recuperar el acceso
      </a>
    </>
  );
}
