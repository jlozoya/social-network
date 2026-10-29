'use client';
import { createContext, useContext } from 'react';
import type { Profile, ReportTarget } from './types';
type Context = {
  user: Profile | null;
  sync: number;
  notify: (message: string) => void;
  refreshUser: () => Promise<void>;
  refresh: () => void;
  openAuth: () => void;
  openProfile: (id: string) => void;
  openChat: (id: string) => void;
  openReport: (target: ReportTarget) => void;
};
export const AppContext = createContext<Context>(null!);
export const useApp = () => useContext(AppContext);
