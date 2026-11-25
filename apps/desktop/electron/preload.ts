import { contextBridge, ipcRenderer } from 'electron';

export interface ElectronAPI {
  getRunningApps: () => Promise<Array<{ name: string; bundleId: string; category: string }>>;
  getDeviceInfo: () => Promise<{ platform: string; arch: string; electronVersion: string; nodeVersion: string }>;
  getLiveKitToken: (roomName: string, participantName?: string, metadata?: string) => Promise<string>;
  initConversationLog: (candidateName: string, role: string) => Promise<boolean>;
  logConversationTurn: (speaker: string, text: string) => Promise<boolean>;
}

const api: ElectronAPI = {
  getRunningApps: () => ipcRenderer.invoke('system:getRunningApps'),
  getDeviceInfo: () => ipcRenderer.invoke('system:getDeviceInfo'),
  getLiveKitToken: (roomName: string, participantName?: string, metadata?: string) =>
    ipcRenderer.invoke('livekit:getToken', { roomName, participantName, metadata }),
  initConversationLog: (candidateName: string, role: string) =>
    ipcRenderer.invoke('log:init', { candidateName, role }),
  logConversationTurn: (speaker: string, text: string) =>
    ipcRenderer.invoke('log:append', { speaker, text }),
};

contextBridge.exposeInMainWorld('electronAPI', api);
