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

let sharedCanvas: HTMLCanvasElement | null = null;
let sharedCtx: CanvasRenderingContext2D | null = null;
let isCheckInProgress = false;

/**
 * Checks candidate presence on webcam using OpenCV Face/Upper-Body and biometric verification.
 */
export async function detectCandidatePresence(video: HTMLVideoElement | null): Promise<PresenceCheckResult> {
  if (!video) {
    return {
      cameraActive: false,
      isPresent: false,
      reason: 'No video element'
    };
  }

  const stream = video.srcObject as MediaStream | null;
  if (!stream) {
    return {
      cameraActive: false,
      isPresent: false,
      reason: 'No active video stream'
    };
  }

  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack || !videoTrack.enabled || videoTrack.readyState !== 'live') {
    return {
      cameraActive: false,
      isPresent: false,
      reason: 'Camera is muted or disabled'
    };
  }

  // Ensure video element has loaded and has valid dimensions
  if (video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
    return {
      cameraActive: true,
      isPresent: false,
      reason: 'Camera stream initializing',
      method: 'stream-initializing'
    };
  }

  // Prevent overlapping concurrent checks from lagging the pipeline
  if (isCheckInProgress) {
    return {
      cameraActive: true,
      isPresent: false,
      reason: 'Detection in progress',
      method: 'throttled'
    };
  }

  isCheckInProgress = true;

  try {
    // Reusable canvas (320x240) for fast sub-millisecond snapshotting
    if (!sharedCanvas) {
      sharedCanvas = document.createElement('canvas');
      sharedCanvas.width = 320;
      sharedCanvas.height = 240;
      sharedCtx = sharedCanvas.getContext('2d', { willReadFrequently: true });
    }

    if (!sharedCtx) {
      return {
        cameraActive: true,
        isPresent: false,
        reason: 'Canvas context unavailable',
        method: 'no-canvas'
      };
    }

    sharedCtx.drawImage(video, 0, 0, 320, 240);

    // Fast client-side brightness check
    try {
      const sample = sharedCtx.getImageData(0, 0, 320, 240).data;
      let totalBrightness = 0;
      // Sample every 16th pixel for sub-millisecond brightness check
      const step = 16 * 4;
      let samplesCount = 0;
      for (let i = 0; i < sample.length; i += step) {
        // Rec. 601 luma formula
        totalBrightness += (0.299 * sample[i] + 0.587 * sample[i + 1] + 0.114 * sample[i + 2]);
        samplesCount++;
      }
      const avgBrightness = totalBrightness / (samplesCount || 1);

      if (avgBrightness < 8.0) {
        return {
          cameraActive: false,
          isPresent: false,
          reason: 'Camera is covered or completely dark',
          method: 'client-dark'
        };
      }
    } catch {}

    const base64Image = sharedCanvas.toDataURL('image/jpeg', 0.82);
    if (!base64Image) {
      return {
        cameraActive: true,
        isPresent: false,
        reason: 'Failed to capture frame',
        method: 'no-frame'
      };
    }

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
    console.warn('Face detection error:', cvErr);
  } finally {
    isCheckInProgress = false;
  }

  return {
    cameraActive: true,
    isPresent: false,
    reason: 'Face detection unavailable',
    method: 'no-face-fallback'
  };
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
