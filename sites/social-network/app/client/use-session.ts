'use client';
import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api-client';
import { siteUrl } from './origin';
import type { Profile } from './types';
import type { View } from './use-navigation';
function b64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}

export function useSession({
  go,
  refresh,
  notify,
}: {
  go: (view: View) => void;
  refresh: () => void;
  notify: (message: string) => void;
}) {
  const [user, setUser] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [auth, setAuth] = useState(false);
  const lastCode = useRef('');
  const refreshUser = useCallback(async () => {
    const result = await api<{ user: Profile | null }>('/api/session');
    setUser(result.user);
  }, []);

  const finishAuth = useCallback(
    async (code: string, state: string) => {
      if (lastCode.current === code) return;
      lastCode.current = code;
      try {
        const raw = sessionStorage.getItem('sn_auth');
        if (!raw) throw new Error('Vuelve a iniciar el acceso desde esta app.');
        const pending = JSON.parse(raw);
        if (pending.state !== state) throw new Error('El acceso no corresponde a esta sesión.');
        await api('/api/auth/exchange', 'POST', { code, state, verifier: pending.verifier });
        sessionStorage.removeItem('sn_auth');
        if (Capacitor.isNativePlatform()) await Browser.close().catch(() => {});
        await refreshUser();
        setAuth(false);
        go('feed');
        refresh();
        notify('Sesión iniciada.');
      } catch (error) {
        notify(error instanceof Error ? error.message : 'No se pudo completar el acceso.');
        history.replaceState({}, '', '/');
        await refreshUser();
      }
    },
    [go, notify, refresh, refreshUser],
  );

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const code = params.get('auth_code'),
      state = params.get('state');
    void Promise.resolve()
      .then(() => (code && state ? finishAuth(code, state) : refreshUser()))
      .catch((error) => notify(error.message))
      .finally(() => setLoading(false));
    let disposed = false,
      remove: (() => void) | undefined;
    if (Capacitor.isNativePlatform()) {
      const receive = (value: string) => {
        const url = new URL(value);
        if (url.protocol === 'socialnetwork:' && url.host === 'auth') {
          const code = url.searchParams.get('code'),
            state = url.searchParams.get('state');
          if (code && state) void finishAuth(code, state);
        }
      };
      void App.addListener('appUrlOpen', (event) => receive(event.url)).then((listener) => {
        if (disposed) void listener.remove();
        else remove = () => void listener.remove();
      });
      void App.getLaunchUrl().then((value) => {
        if (value) receive(value.url);
      });
    }
    return () => {
      disposed = true;
      remove?.();
    };
  }, [finishAuth, notify, refreshUser]);

  const chatgpt = useCallback(async (link: boolean, accepted: boolean) => {
    const verifier = b64(crypto.getRandomValues(new Uint8Array(32))),
      state = b64(crypto.getRandomValues(new Uint8Array(32))),
      challenge = b64(
        new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))),
      );
    const native = Capacitor.isNativePlatform();
    const payload = {
      challenge,
      state,
      native,
      link,
      termsAccepted: accepted,
      ageConfirmed: accepted,
    };
    sessionStorage.setItem('sn_auth', JSON.stringify({ verifier, state }));
    if (native) {
      const result = await api<{ url: string }>('/api/auth/start', 'POST', payload);
      await Browser.open({ url: result.url });
    } else {
      // El acceso de Sites requiere navegar en la página superior. Un formulario
      // nativo evita esperar un fetch antes de salir del modal y también funciona
      // cuando la aplicación está dentro de un iframe.
      const form = document.createElement('form');
      form.method = 'POST';
      form.action = siteUrl('/api/auth/start');
      form.target = '_top';
      form.hidden = true;
      for (const [name, value] of Object.entries(payload)) {
        const input = document.createElement('input');
        input.type = 'hidden';
        input.name = name;
        input.value = String(value);
        form.appendChild(input);
      }
      document.body.appendChild(form);
      try {
        form.submit();
      } finally {
        form.remove();
      }
    }
  }, []);

  const logout = async () => {
    try {
      await api('/api/auth/logout', 'POST', {});
      setUser(null);
      go('feed');
      refresh();
    } catch (error) {
      notify((error as Error).message);
    }
  };

  return { user, setUser, loading, auth, setAuth, refreshUser, chatgpt, logout };
}
