import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  getRunningApps: () => Promise<Array<{ name: string; bundleId: string; category: string }>>;
  getDeviceInfo: () => Promise<{ platform: string; arch: string; electronVersion: string; nodeVersion: string }>;
  getLiveKitToken: (roomName: string, participantName?: string) => Promise<string>;
}

const api: ElectronAPI = {
  getRunningApps: () => ipcRenderer.invoke('system:getRunningApps'),
  getDeviceInfo: () => ipcRenderer.invoke('system:getDeviceInfo'),
  getLiveKitToken: (roomName: string, participantName?: string) =>
    ipcRenderer.invoke('livekit:getToken', { roomName, participantName }),
};

contextBridge.exposeInMainWorld('electronAPI', api);
