export const app = {
  getPath: () => '/data',
  getName: () => 'GenericDownloader',
  getVersion: () => '1.0.0',
};

export const ipcRenderer = {
  on: () => {},
  send: () => {},
  invoke: () => Promise.resolve(),
  removeListener: () => {},
};

export const shell = {
  openExternal: () => Promise.resolve(),
};

export const dialog = {
  showOpenDialog: () => Promise.resolve({ canceled: true, filePaths: [] }),
};

export const remote = {
  app,
  dialog,
  shell
};

export default { app, ipcRenderer, shell, dialog, remote };
