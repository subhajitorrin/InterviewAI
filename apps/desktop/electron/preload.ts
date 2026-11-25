import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  getRunningApps: () => Promise<Array<{ name: string; bundleId: string; category: string }>>;
  getDeviceInfo: () => Promise<{ platform: string; arch: string; electronVersion: string; nodeVersion: string }>;
}

const api: ElectronAPI = {
  getRunningApps: () => ipcRenderer.invoke('system:getRunningApps'),
  getDeviceInfo: () => ipcRenderer.invoke('system:getDeviceInfo'),
};

contextBridge.exposeInMainWorld('electronAPI', api);
