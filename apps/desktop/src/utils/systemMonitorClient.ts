/**
 * System and presence monitoring utilities for the real-time interview chamber.
 */

export interface SystemCheckResult {
  cameraOn: boolean;
  presenceDetected: boolean;
  runningApps: string[];
  summary: string;
}

/**
 * Queries running applications from Electron IPC or Vite server fallback.
 */
export async function fetchRunningMacApps(): Promise<string[]> {
  try {
    if ((window as any).electronAPI?.getRunningApps) {
      const detected = await (window as any).electronAPI.getRunningApps();
      return detected.map((app: any) => typeof app === 'string' ? app : app.name).filter(Boolean);
    }

    const res = await fetch('/api/system/apps');
    if (res.ok) {
      const data = await res.json();
      return (data.apps || []).filter(Boolean);
    }
  } catch (err) {
    console.warn('Failed to fetch running apps:', err);
  }

  // Safe fallback if neither is available
  return ['Terminal', 'Finder'];
}

/**
 * Checks candidate presence on camera using Native FaceDetector API or Canvas sampling.
 */
export async function detectCandidatePresence(video: HTMLVideoElement | null): Promise<{
  cameraActive: boolean;
  isPresent: boolean;
  reason?: string;
}> {
  if (!video || !video.srcObject) {
    return {
      cameraActive: false,
      isPresent: false,
      reason: 'No active video stream'
    };
  }

  const stream = video.srcObject as MediaStream;
  const videoTrack = stream.getVideoTracks()[0];

  if (!videoTrack || !videoTrack.enabled || videoTrack.readyState !== 'live') {
    return {
      cameraActive: false,
      isPresent: false,
      reason: 'Camera is muted or disabled'
    };
  }

  if (video.videoWidth === 0 || video.videoHeight === 0) {
    return {
      cameraActive: true,
      isPresent: false,
      reason: 'Camera stream loading'
    };
  }

  // 1. Try native Chromium / Electron FaceDetector API
  if (typeof (window as any).FaceDetector !== 'undefined') {
    try {
      const detector = new (window as any).FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
      const faces = await detector.detect(video);
      if (faces && faces.length > 0) {
        return {
          cameraActive: true,
          isPresent: true
        };
      }
    } catch (e) {
      console.warn('Native FaceDetector error, falling back to canvas analysis:', e);
    }
  }

  // 2. Fallback: HTML5 Canvas center-region luminance and contrast sampling
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!ctx) {
      return { cameraActive: true, isPresent: true };
    }

    ctx.drawImage(video, 0, 0, 160, 120);

    // Sample center 80x80 box where candidate head/torso sits
    const frame = ctx.getImageData(40, 20, 80, 80);
    const data = frame.data;
    const totalPixels = data.length / 4;
    let litPixels = 0;
    let contrastPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const lum = 0.299 * r + 0.587 * g + 0.114 * b;

      // Ensure camera is not covered / completely black
      if (lum > 22) {
        litPixels++;
      }

      // Check realistic variance / contrast (person vs plain static surface)
      if (Math.abs(r - g) > 7 || Math.abs(r - b) > 7) {
        contrastPixels++;
      }
    }

    const isLit = (litPixels / totalPixels) > 0.3;
    const hasContrast = (contrastPixels / totalPixels) > 0.12;
    const isPresent = isLit && hasContrast;

    return {
      cameraActive: true,
      isPresent,
      reason: isPresent ? undefined : 'Candidate not visible in camera center'
    };
  } catch (err) {
    console.warn('Canvas presence detection error:', err);
    return { cameraActive: true, isPresent: true };
  }
}

/**
 * Filter newly opened applications comparing current running apps against initial baseline.
 */
export function findNewlyOpenedApps(
  currentApps: string[],
  baselineApps: string[],
  ignoredApps: string[] = ['InterviewAI', 'loginwindow', 'WindowManager', 'Dock']
): string[] {
  const baselineSet = new Set(baselineApps.map(a => a.toLowerCase().trim()));
  const ignoreSet = new Set(ignoredApps.map(a => a.toLowerCase().trim()));

  return currentApps.filter(app => {
    const norm = app.toLowerCase().trim();
    return !baselineSet.has(norm) && !ignoreSet.has(norm);
  });
}
