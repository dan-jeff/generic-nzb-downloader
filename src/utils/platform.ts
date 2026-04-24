import type { ElectronBridge } from '../electron';

export const getElectronBridge = (): ElectronBridge | null => {
  if (typeof window === 'undefined') return null;
  return window.electron ?? null;
};

export const isElectron = (): boolean => getElectronBridge() !== null;
