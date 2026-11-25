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

const APP_CATEGORIES: Record<string, { category: DetectedAppInfo['category']; status: DetectedAppInfo['status'] }> = {
  'Visual Studio Code': { category: 'Editor', status: 'safe' },
  'Code': { category: 'Editor', status: 'safe' },
  'Cursor': { category: 'Editor', status: 'safe' },
  'Antigravity IDE': { category: 'Editor', status: 'safe' },
  'Google Chrome': { category: 'Browser', status: 'safe' },
  'Safari': { category: 'Browser', status: 'safe' },
  'Arc': { category: 'Browser', status: 'safe' },
  'Brave Browser': { category: 'Browser', status: 'safe' },
  'Firefox': { category: 'Browser', status: 'safe' },
  'Slack': { category: 'Communication', status: 'safe' },
  'Discord': { category: 'Communication', status: 'safe' },
  'WhatsApp': { category: 'Communication', status: 'safe' },
  'Telegram': { category: 'Communication', status: 'safe' },
  'Terminal': { category: 'Terminal', status: 'safe' },
  'iTerm2': { category: 'Terminal', status: 'safe' },
  'ChatGPT': { category: 'Other', status: 'warning' },
  'ChatGPT Classic': { category: 'Other', status: 'warning' },
};

/**
 * Reads running macOS desktop applications via lsappinfo with AppleScript fallback
 */
export async function getRunningMacApps(): Promise<DetectedAppInfo[]> {
  if (process.platform !== 'darwin') {
    return [];
  }

  try {
    // 1. Primary: Use lsappinfo visibleProcessList (fast, zero permissions required)
    const { stdout } = await execAsync('lsappinfo visibleProcessList');
    const regex = /"([^"]+)"/g;
    const names: string[] = [];
    let match: RegExpExecArray | null;

    while ((match = regex.exec(stdout)) !== null) {
      const cleanName = match[1]
        .replace(/_/g, ' ')
        .replace(/^\u200e/, '')
        .trim();

      if (
        cleanName &&
        cleanName !== 'loginwindow' &&
        cleanName !== 'WindowManager' &&
        cleanName !== 'Dock'
      ) {
        names.push(cleanName);
      }
    }

    if (names.length > 0) {
      return names.map((name) => {
        const config = APP_CATEGORIES[name] || { category: 'Other', status: 'safe' };
        return {
          name,
          bundleId: `com.apple.${name.toLowerCase().replace(/\s+/g, '')}`,
          category: config.category,
          status: config.status,
          isMonitored: true,
        };
      });
    }
  } catch (lsErr) {
    console.warn('lsappinfo query failed, attempting AppleScript fallback:', lsErr);
  }

  // 2. Fallback: AppleScript
  try {
    const appleScript = `osascript -e 'tell application "System Events" to get name of (every process whose background only is false)'`;
    const { stdout } = await execAsync(appleScript);
    const names = stdout
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    return names.map((name) => {
      const config = APP_CATEGORIES[name] || { category: 'Other', status: 'safe' };
      return {
        name,
        bundleId: `com.apple.${name.toLowerCase().replace(/\s+/g, '')}`,
        category: config.category,
        status: config.status,
        isMonitored: true,
      };
    });
  } catch (asErr) {
    console.error('All macOS app queries failed:', asErr);
    return [];
  }
}
