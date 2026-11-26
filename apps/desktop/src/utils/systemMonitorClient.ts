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

/**
 * Checks candidate presence on webcam using OpenCV Face/Upper-Body and central occupancy detection.
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

  // Ensure video element has loaded and has valid frames
  if (video.videoWidth === 0 || video.videoHeight === 0 || video.readyState < 2) {
    return {
      cameraActive: true,
      isPresent: true,
      reason: 'Camera stream initializing',
      method: 'stream-ready-pass'
    };
  }

  // Capture current webcam snapshot from video element
  // 480x360 provides optimal clarity for face & eye feature recognition
  let base64Image = '';
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 480;
    canvas.height = 360;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (ctx) {
      ctx.drawImage(video, 0, 0, 480, 360);
      base64Image = canvas.toDataURL('image/jpeg', 0.88);
    }
  } catch (canvasErr) {
    console.warn('Failed to capture video snapshot for OpenCV:', canvasErr);
  }

  // Primary: OpenCV Face Detection (via Electron IPC or Vite middleware)
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
      console.warn('OpenCV face detection call failed:', cvErr);
    }
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
