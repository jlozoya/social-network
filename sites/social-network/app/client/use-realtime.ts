'use client';
import { useEffect, useState } from 'react';
import { api } from './api-client';
import type { Profile } from './types';
export function useRealtime(
  user: Profile | null,
  refresh: () => void,
  refreshUser: () => Promise<void>,
) {
  const userId = user?.id;
  const [connection, setConnection] = useState({ userId, status: 'connecting' });
  useEffect(() => {
    if (!userId) return;
    const setLive = (status: string) => setConnection({ userId, status });
    let disposed = false,
      client: { close: () => void } | undefined,
      timer: ReturnType<typeof setTimeout> | undefined;
    const changed = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        refresh();
        void refreshUser().catch(() => {});
      }, 250);
    };
    void api<{ configured: boolean }>('/api/realtime/status')
      .then(async (status) => {
        if (disposed) return;
        if (!status.configured) {
          setLive('manual');
          return;
        }
        const Ably = await import('ably');
        if (disposed) return;
        const realtime = new Ably.Realtime({
          authCallback: (_params, callback) => {
            void api<import('ably').TokenRequest>('/api/realtime/token', 'POST')
              .then((token) => callback(null, token))
              .catch((error) => callback(error.message, null));
          },
          clientId: userId,
        });
        client = realtime;
        realtime.connection.on('connected', () => {
          if (!disposed) {
            setLive('connected');
            changed();
          }
        });
        realtime.connection.on('disconnected', () => !disposed && setLive('reconnecting'));
        realtime.connection.on('suspended', () => !disposed && setLive('manual'));
        realtime.connection.on('failed', () => {
          if (!disposed) {
            setLive('manual');
            void refreshUser().catch(() => {});
          }
        });
        for (const channelName of ['sn:feed', `sn:user:${userId}`]) {
          const channel = realtime.channels.get(channelName);
          void channel.subscribe('changed', changed).catch(() => !disposed && setLive('manual'));
          channel.on('attached', changed);
        }
      })
      .catch(() => !disposed && setLive('manual'));
    const visible = () => {
      if (document.visibilityState === 'visible') changed();
    };
    document.addEventListener('visibilitychange', visible);
    return () => {
      disposed = true;
      clearTimeout(timer);
      client?.close();
      document.removeEventListener('visibilitychange', visible);
    };
  }, [userId, refresh, refreshUser]);

  return !userId ? 'signed-out' : connection.userId === userId ? connection.status : 'connecting';
}
