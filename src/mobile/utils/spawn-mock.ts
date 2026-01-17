export const spawn = (): never => {
  throw new Error('spawn is not available in browser environment');
};

export type ChildProcess = never;
