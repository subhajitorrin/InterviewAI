import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface DetectedAppInfo {
  name: string;
  bundleId: string;
  category: 'Editor' | 'Browser' | 'Communication' | 'Terminal' | 'Other';
  status: 'safe' | 'warning' | 'flagged';
  isMonitored: boolean;
}

const MONITORED_APPS: Record<string, { category: DetectedAppInfo['category']; status: DetectedAppInfo['status'] }> = {
  'Visual Studio Code': { category: 'Editor', status: 'safe' },
  'Code': { category: 'Editor', status: 'safe' },
  'Google Chrome': { category: 'Browser', status: 'safe' },
  'Arc': { category: 'Browser', status: 'safe' },
  'Brave Browser': { category: 'Browser', status: 'safe' },
  'Safari': { category: 'Browser', status: 'safe' },
  'Slack': { category: 'Communication', status: 'safe' },
  'Discord': { category: 'Communication', status: 'safe' },
  'Terminal': { category: 'Terminal', status: 'safe' },
  'iTerm2': { category: 'Terminal', status: 'safe' },
  'Spotify': { category: 'Other', status: 'safe' },
  'ChatGPT': { category: 'Other', status: 'warning' },
};

/**
 * Reads running macOS desktop applications via AppleScript
 */
export async function getRunningMacApps(): Promise<DetectedAppInfo[]> {
  if (process.platform !== 'darwin') {
    return [];
  }

  try {
    const appleScript = `osascript -e 'tell application "System Events" to get name of (every process whose background only is false)'`;
    const { stdout } = await execAsync(appleScript);
    const names = stdout
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const detected: DetectedAppInfo[] = names.map((name) => {
      const config = MONITORED_APPS[name] || { category: 'Other', status: 'safe' };
      return {
        name,
        bundleId: `com.apple.${name.toLowerCase().replace(/\s+/g, '')}`,
        category: config.category,
        status: config.status,
        isMonitored: true,
      };
    });

    return detected;
  } catch (err) {
    console.error('Failed to query macOS running apps:', err);
    return [];
  }
}
