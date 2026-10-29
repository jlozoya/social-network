'use client';
import { useCallback, useEffect, useState } from 'react';
export type View = 'feed' | 'discover' | 'messages' | 'profile' | 'settings' | 'moderation';
export const names: Record<View, string> = {
  feed: 'Publicaciones',
  discover: 'Descubrir',
  messages: 'Mensajes',
  profile: 'Perfil',
  settings: 'Ajustes',
  moderation: 'Moderación',
};

export function useNavigation() {
  const [view, setView] = useState<View>('feed');
  const [profileId, setProfileId] = useState('');
  const [conversation, setConversation] = useState<string | null>(null);
  const [sharedPost, setSharedPost] = useState<string | null>(null);
  const go = useCallback((page: View, person = '', chat: string | null = null) => {
    setView(page);
    setProfileId(person);
    setConversation(chat);
    const url = new URL(location.href);
    url.search = '';
    if (page !== 'feed') url.searchParams.set('view', page);
    if (person) url.searchParams.set('user', person);
    if (chat) url.searchParams.set('chat', chat);
    history.pushState({}, '', url);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(location.search);
      const requested = params.get('view') as View;
      if (requested && names[requested]) setView(requested);
      else setView('feed');
      setProfileId(params.get('user') ?? '');
      setConversation(params.get('chat'));
      setSharedPost(params.get('post'));
    };
    read();
    window.addEventListener('popstate', read);

    return () => window.removeEventListener('popstate', read);
  }, []);
  return { view, profileId, conversation, setConversation, sharedPost, setSharedPost, go };
}
