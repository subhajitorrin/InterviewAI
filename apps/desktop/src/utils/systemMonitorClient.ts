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

export interface PresenceCheckResult {
  cameraActive: boolean;
  isPresent: boolean;
  reason?: string;
  method?: string;
  faceDetected?: boolean;
  facesCount?: number;
}

/**
 * Checks candidate presence on webcam using OpenCV Haar Cascades.
 * Falls back to HTML5 Canvas analysis if OpenCV service is unreachable.
 */
export async function detectCandidatePresence(video: HTMLVideoElement | null): Promise<PresenceCheckResult> {
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

  // Capture current webcam snapshot from video element
  let base64Image = '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 240;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0, 320, 240);
      base64Image = canvas.toDataURL('image/jpeg', 0.85);
    }
  } catch (canvasErr) {
    console.warn('Failed to capture video snapshot for OpenCV:', canvasErr);
  }

  // 1. Primary: OpenCV Face & Upper Body Detection (via Electron IPC or Vite middleware)
  if (base64Image) {
    try {
      let opencvResult: any = null;

      if ((window as any).electronAPI?.detectPresenceWithOpenCV) {
        opencvResult = await (window as any).electronAPI.detectPresenceWithOpenCV(base64Image);
      } else {
        const res = await fetch('/api/opencv/detect-presence', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ image: base64Image }),
        });
        if (res.ok) {
          opencvResult = await res.json();
        }
      }

      if (opencvResult && typeof opencvResult.isPresent === 'boolean') {
        return {
          cameraActive: opencvResult.cameraActive ?? true,
          isPresent: opencvResult.isPresent,
          reason: opencvResult.reason,
          method: opencvResult.method || 'opencv',
          faceDetected: opencvResult.faceDetected,
          facesCount: opencvResult.facesCount,
        };
      }
    } catch (cvErr) {
      console.warn('OpenCV detection call failed, using canvas fallback:', cvErr);
    }
  }

  // 2. Fallback: Native FaceDetector or HTML5 Canvas sampling
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    
    if (!ctx) {
      return { cameraActive: true, isPresent: true, method: 'canvas-simple' };
    }

    ctx.drawImage(video, 0, 0, 160, 120);
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

      if (lum > 22) litPixels++;
      if (Math.abs(r - g) > 7 || Math.abs(r - b) > 7) contrastPixels++;
    }

    const isLit = (litPixels / totalPixels) > 0.3;
    const hasContrast = (contrastPixels / totalPixels) > 0.12;
    const isPresent = isLit && hasContrast;

    return {
      cameraActive: true,
      isPresent,
      reason: isPresent ? undefined : 'No person detected in camera view',
      method: 'canvas-fallback'
    };
  } catch (err) {
    console.warn('Canvas presence fallback error:', err);
    return { cameraActive: true, isPresent: true, method: 'fallback-pass' };
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
