import React, { useEffect, useRef, useCallback, useState } from 'react';
import { useInterviewStore, speakSpeechFallback } from '../stores/interviewStore';
import { useLiveKitVoice } from '../hooks/useLiveKitVoice';
import { AiVisualizer } from '../components/AiVisualizer';
import { 
  fetchRunningMacApps, 
  detectCandidatePresence, 
  findNewlyOpenedApps 
} from '../utils/systemMonitorClient';
import { 
  initConversationLog, 
  appendConversationLog 
} from '../utils/conversationLogger';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff,
  AlertTriangle,
  ChevronUp,
  Check
} from 'lucide-react';

export const MeetingPage: React.FC = () => {
  const {
    isMicMuted,
    isVideoMuted,
    selectedMicId,
    setSelectedMicId,
    isAiSpeaking,
    candidateName,
    selectedRole,
    parsedResume,
    interviewPlan,
    toggleMic,
    toggleVideo,
    endInterview
  } = useInterviewStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Exact 4-step flow state: greeting -> desktop_check -> webcam_test -> ready -> in_progress
  const [currentStep, setCurrentStep] = useState<
    'greeting' | 'desktop_check' | 'webcam_test' | 'ready' | 'in_progress'
  >('greeting');
  const [activeWarningApp, setActiveWarningApp] = useState<string | null>(null);
  const [isFaceDetected, setIsFaceDetected] = useState<boolean | null>(null);
  const [isAbsenceWarningActive, setIsAbsenceWarningActive] = useState<boolean>(false);
  const [isMicMenuOpen, setIsMicMenuOpen] = useState<boolean>(false);
  const micMenuRef = useRef<HTMLDivElement>(null);

  // Live OpenAI cost & latency metrics
  const [openAiMetrics, setOpenAiMetrics] = useState<{
    cost: number;
    costFormatted: string;
    latencyMs: number;
    totalTokens: number;
    model: string;
  }>({
    cost: 0.0,
    costFormatted: '$0.0000',
    latencyMs: 0,
    totalTokens: 0,
    model: 'gpt-4o-mini',
  });

  const baselineAppsRef = useRef<string[]>([]);
  const warnedAppsRef = useRef<Set<string>>(new Set());
  const hasStartedFlowRef = useRef<boolean>(false);
  const livekitConnectedRef = useRef<boolean>(false);
  const sendDataRef = useRef<(data: any) => Promise<void>>(() => Promise.resolve());
  const isFaceDetectedRef = useRef<boolean>(false);
  const absentStartTimeRef = useRef<number | null>(null);
  const lastAbsenceWarningTimeRef = useRef<number>(0);
  const userSpeechEndTimeRef = useRef<number>(0);
  const wasUserSpeakingRef = useRef<boolean>(false);

  // Stable handler for speaking changes and live voice turnaround latency
  const handleAiSpeakingChange = useCallback((speaking: boolean) => {
    useInterviewStore.getState().setAiSpeaking(speaking);

    // When AI starts speaking in response to candidate, compute voice turnaround time
    if (speaking && userSpeechEndTimeRef.current > 0) {
      const turnaroundMs = Math.round(performance.now() - userSpeechEndTimeRef.current);
      userSpeechEndTimeRef.current = 0;
      if (turnaroundMs > 80 && turnaroundMs < 12000) {
        setOpenAiMetrics((prev) => ({
          ...prev,
          latencyMs: turnaroundMs,
        }));
      }
    }
  }, []);

  const handleUserSpeakingChange = useCallback((speaking: boolean) => {
    if (wasUserSpeakingRef.current && !speaking) {
      // User just finished speaking!
      userSpeechEndTimeRef.current = performance.now();
    }
    wasUserSpeakingRef.current = speaking;
  }, []);

  // Stable handler for data messages received from LiveKit agent
  const handleDataReceived = useCallback((data: any) => {
    if (data?.type === 'openai_metrics') {
      setOpenAiMetrics({
        cost: data.cost ?? 0,
        costFormatted: data.costFormatted || `$${(data.cost || 0).toFixed(4)}`,
        latencyMs: data.latencyMs ?? 0,
        totalTokens: data.totalTokens ?? 0,
        model: data.model || 'gpt-4o-mini',
      });
      return;
    }

    if (data?.type === 'step') {
      // Mark flow as started so client-side fallback does not also speak
      hasStartedFlowRef.current = true;
      if (data.step) {
        setCurrentStep(data.step);
      }
      if (typeof data.phaseIndex === 'number') {
        useInterviewStore.getState().setCurrentPhaseIndex(data.phaseIndex);
      }

      // When AI initiates webcam test step, run OpenCV face presence detection
      if (data.step === 'webcam_test') {
        setTimeout(async () => {
          try {
            const presence = await detectCandidatePresence(videoRef.current);
            const present = Boolean(presence.isPresent && presence.cameraActive);
            setIsFaceDetected(present);
            isFaceDetectedRef.current = present;
            if (!present) {
              sendDataRef.current({ type: 'presence_result', isPresent: false, reason: presence.reason });
            } else {
              sendDataRef.current({ type: 'presence_result', isPresent: true });
            }
          } catch (e) {
            console.warn('Webcam test verification error:', e);
          }
        }, 1200);
      }
    }
  }, []);

  // Connect to LiveKit audio room for real-time AI voice conversation
  const { 
    connect, 
    disconnect, 
    sendData, 
    isConnected, 
    aiAudioLevel,
    availableMics,
    currentAudioDeviceId,
    switchMicrophone,
    refreshAudioDevices
  } = useLiveKitVoice({
    roomName: 'interview-room-1',
    participantName: candidateName || 'Candidate',
    isMicMuted,
    selectedMicId,
    onAiSpeakingChange: handleAiSpeakingChange,
    onUserSpeakingChange: handleUserSpeakingChange,
    onDataReceived: handleDataReceived,
  });

  const handleSelectMicrophone = async (deviceId: string) => {
    setSelectedMicId(deviceId);
    await switchMicrophone(deviceId);
    setIsMicMenuOpen(false);
  };

  // Close microphone picker popup on click outside
  useEffect(() => {
    if (!isMicMenuOpen) return;
    refreshAudioDevices();
    const handleClickOutside = (event: MouseEvent) => {
      if (micMenuRef.current && !micMenuRef.current.contains(event.target as Node)) {
        setIsMicMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMicMenuOpen, refreshAudioDevices]);

  useEffect(() => {
    sendDataRef.current = sendData;
  }, [sendData]);

  useEffect(() => {
    livekitConnectedRef.current = isConnected;
    if (isConnected) {
      hasStartedFlowRef.current = true;
    }
  }, [isConnected]);

  // Connect once on mount after fetching active apps, disconnect on unmount
  useEffect(() => {
    let cancelled = false;

    async function initializeAndConnect() {
      const latestApps = await fetchRunningMacApps();
      if (cancelled) return;

      baselineAppsRef.current = latestApps;
      const filteredApps = latestApps.filter(
        (a) => !['loginwindow', 'WindowManager', 'Dock'].includes(a)
      );

      const meta = JSON.stringify({
        candidateName: candidateName || 'Candidate',
        role: selectedRole,
        skills: parsedResume?.skills.all || [],
        experience: parsedResume?.experience || [],
        projects: parsedResume?.projects || [],
        plan: interviewPlan,
        activeApps: filteredApps,
      });

      await connect(meta);
    }

    initializeAndConnect();

    return () => {
      cancelled = true;
      disconnect();
    };
  }, [candidateName, selectedRole, parsedResume, interviewPlan, connect, disconnect]);

  // Webcam stream management
  useEffect(() => {
    let isCancelled = false;

    const startCamera = async () => {
      if (isVideoMuted) {
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((track) => track.stop());
          streamRef.current = null;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = null;
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
            facingMode: 'user'
          },
          audio: false
        });

        if (isCancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (e) {
            console.warn('Autoplay error:', e);
          }
        }
      } catch (err) {
        console.error('Failed to get camera stream:', err);
      }
    };

    startCamera();

    return () => {
      isCancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
        streamRef.current = null;
      }
    };
  }, [isVideoMuted]);

  // Client fallback speech dispatcher (only used if LiveKit is offline/disconnected)
  const speakSafe = useCallback((text: string): Promise<void> => {
    if (livekitConnectedRef.current) return Promise.resolve();

    appendConversationLog('AI (Sarah Mitchell)', text);

    return new Promise((resolve) => {
      useInterviewStore.getState().setAiSpeaking(true);
      speakSpeechFallback(
        text,
        () => useInterviewStore.getState().setAiSpeaking(true),
        () => {
          useInterviewStore.getState().setAiSpeaking(false);
          resolve();
        }
      );
    });
  }, []);

  // Onboarding Flow:
  // When connected, agent.py drives the 4 steps with OpenAI Nova female voice.
  // If LiveKit doesn't connect within 4.5s, client-side fallback activates so the user is never stuck.
  useEffect(() => {
    if (hasStartedFlowRef.current) return;

    const timer = setTimeout(() => {
      if (hasStartedFlowRef.current || livekitConnectedRef.current) return;
      hasStartedFlowRef.current = true;

      const runFallbackFlow = async () => {
        const state = useInterviewStore.getState();
        const name = state.candidateName && state.candidateName.toLowerCase() !== 'candidate' 
          ? state.candidateName 
          : 'there';
        const role = state.selectedRole;

        await initConversationLog(name, role);
        await new Promise((r) => setTimeout(r, 400));

        // --- STEP 1: GREETINGS WITH MY NAME ---
        setCurrentStep('greeting');
        const greetingText = `Hi ${name}! Welcome to your ${role} interview.`;
        await speakSafe(greetingText);
        await new Promise((r) => setTimeout(r, 500));

        // --- STEP 2: DESKTOP ENVIRONMENT CHECK ---
        setCurrentStep('desktop_check');
        const latestApps = await fetchRunningMacApps();
        baselineAppsRef.current = latestApps;

        const activeApps = latestApps.filter(
          (a) => !['loginwindow', 'WindowManager', 'Dock'].includes(a)
        );
        const appListText = activeApps.slice(0, 4).join(', ');

        const desktopText = `Let me check your desktop environment. I can see ${appListText || 'several applications'} are active. You can close any applications that are not relevant to our interview.`;
        await speakSafe(desktopText);
        await new Promise((r) => setTimeout(r, 500));

        // --- STEP 3: WEBCAM TEST ---
        setCurrentStep('webcam_test');
        const webcamSpeech = `Now let me test your webcam.`;

        const presencePromise = detectCandidatePresence(videoRef.current);
        await Promise.all([speakSafe(webcamSpeech), presencePromise]);

        const presence = await presencePromise;
        if (useInterviewStore.getState().isVideoMuted || !presence.cameraActive) {
          await speakSafe('Please make sure your camera is turned on.');
        } else if (!presence.isPresent) {
          await speakSafe("You aren't visible in front of the camera. Please make sure you are in frame.");
        }

        await new Promise((r) => setTimeout(r, 600));

        // --- STEP 4: ALL GOOD, LET'S START ---
        setCurrentStep('ready');
        const startSpeech = `All good, everything is set up. Let's get started with the interview! To kick things off, could you give me a short introduction about yourself, your background, and what you've been working on recently?`;
        await speakSafe(startSpeech);
        await new Promise((r) => setTimeout(r, 300));

        setCurrentStep('in_progress');
      };

      runFallbackFlow();
    }, 4500);

    return () => clearTimeout(timer);
  }, [speakSafe]);

  // 2. Real-Time Application Monitor during the Interview
  useEffect(() => {
    // Only monitor after baseline applications are established
    if (currentStep !== 'in_progress' && currentStep !== 'ready') return;

    const interval = setInterval(async () => {
      try {
        const latestApps = await fetchRunningMacApps();
        const newlyOpened = findNewlyOpenedApps(latestApps, baselineAppsRef.current);

        const unannounced = newlyOpened.filter((app) => !warnedAppsRef.current.has(app.toLowerCase()));

        if (unannounced.length > 0) {
          const appName = unannounced[0];
          warnedAppsRef.current.add(appName.toLowerCase());
          setActiveWarningApp(appName);

          // If LiveKit is connected, notify Python agent to speak warning with Sarah Mitchell's voice
          if (livekitConnectedRef.current) {
            sendData({ type: 'app_warning', appName });
          } else {
            const warnMsg = `Warning: you have opened ${appName}. Please close external applications and return to the interview.`;
            appendConversationLog('SYSTEM ALERT', `Candidate opened application: ${appName}`);
            appendConversationLog('AI (Sarah Mitchell)', warnMsg);
            speakSpeechFallback(warnMsg);
          }
        } else if (activeWarningApp) {
          // Check if warned app was closed
          const stillOpen = latestApps.some((a) => a.toLowerCase().trim() === activeWarningApp.toLowerCase().trim());
          if (!stillOpen) {
            appendConversationLog('SYSTEM INFO', `Application closed: ${activeWarningApp}`);
            setActiveWarningApp(null);
          }
        }
      } catch (err) {
        console.warn('Background app monitor error:', err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [currentStep, activeWarningApp, sendData]);

  // Real-Time Camera Presence Monitor
  // Runs continuously every 300ms as long as the chamber is open and camera is active.
  // Instantly updates "In Frame" vs "Out of Frame" in real-time.
  // If candidate is absent from frame for >= 5 seconds (5000ms), triggers verbal AI warning.
  useEffect(() => {
    let isCancelled = false;

    const interval = setInterval(async () => {
      if (isCancelled) return;

      if (useInterviewStore.getState().isVideoMuted) {
        setIsFaceDetected(false);
        isFaceDetectedRef.current = false;
        setIsAbsenceWarningActive(false);
        absentStartTimeRef.current = null;
        return;
      }

      try {
        const presence = await detectCandidatePresence(videoRef.current);
        if (isCancelled) return;

        const present = Boolean(presence.isPresent && presence.cameraActive);
        setIsFaceDetected(present);
        isFaceDetectedRef.current = present;

        const now = Date.now();

        if (present) {
          // Candidate is in front of the camera
          absentStartTimeRef.current = null;
          setIsAbsenceWarningActive(false);
        } else {
          // Candidate is absent / out of frame
          if (absentStartTimeRef.current === null) {
            absentStartTimeRef.current = now;
          }

          const absentElapsed = now - absentStartTimeRef.current;

          // If absent for >= 5 seconds, trigger AI warning
          if (absentElapsed >= 5000) {
            setIsAbsenceWarningActive(true);

            // Cooldown of 12 seconds between verbal warnings so it doesn't spam
            if (now - lastAbsenceWarningTimeRef.current > 12000) {
              lastAbsenceWarningTimeRef.current = now;
              const warnPresence = "You aren't visible in front of the camera. Please make sure you are in frame.";

              if (livekitConnectedRef.current) {
                sendDataRef.current({
                  type: 'presence_result',
                  isPresent: false,
                  reason: 'Candidate out of frame for >5 seconds',
                });
              } else {
                appendConversationLog('SYSTEM ALERT', 'Candidate out of frame for >5 seconds');
                appendConversationLog('AI (Sarah Mitchell)', warnPresence);
                speakSpeechFallback(warnPresence);
              }
            }
          }
        }
      } catch (err) {
        console.warn('Real-time presence detection error:', err);
      }
    }, 300);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="h-screen w-screen bg-[#111317] text-white flex flex-col justify-between p-6 select-none overflow-hidden relative">
      
      {/* Simple Live Cost Badge (Top-Left Corner) */}
      <div className="absolute top-5 left-6 z-40 bg-black/70 backdrop-blur-md border border-neutral-800 px-3.5 py-1.5 rounded-xl flex items-center gap-2 shadow-lg">
        <span className="text-xs text-neutral-400 font-medium">Cost:</span>
        <span className="text-sm font-mono font-bold text-white">
          {openAiMetrics.costFormatted || `$${openAiMetrics.cost.toFixed(4)}`}
        </span>
      </div>

      {/* Real-Time Floating Warning Banner if an external application is opened */}
      {activeWarningApp && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 bg-rose-600/95 text-white px-5 py-2.5 rounded-2xl shadow-2xl border border-rose-400 flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md animate-bounce">
          <AlertTriangle className="w-4 h-4 shrink-0 text-white" />
          <span>Warning: You have opened <strong>{activeWarningApp}</strong>. Please keep external applications closed.</span>
        </div>
      )}

      {/* Real-Time Floating Warning Banner if candidate is out of camera frame for >5 seconds */}
      {!activeWarningApp && isAbsenceWarningActive && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 bg-rose-600/95 text-white px-5 py-2.5 rounded-2xl shadow-2xl border border-rose-400 flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md animate-pulse">
          <AlertTriangle className="w-4 h-4 shrink-0 text-white" />
          <span>Warning: You aren't visible in front of the camera. Please return to frame.</span>
        </div>
      )}

      {/* 2 Horizontal Video Boxes */}
      <div className="flex-1 w-full max-w-7xl mx-auto flex items-center justify-center px-4">
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
          
          {/* LEFT: MY WEBCAM */}
          <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center border border-neutral-800">
            {/* Always keep video element in DOM so ref and srcObject attach immediately */}
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`w-full h-full object-cover transform -scale-x-100 ${
                isVideoMuted ? 'hidden' : 'block'
              }`}
            />

            {/* Video Muted or Fallback Placeholder */}
            {isVideoMuted && (
              <div className="flex flex-col items-center justify-center text-neutral-500">
                <VideoOff className="w-10 h-10 mb-2 opacity-40" />
              </div>
            )}

            {/* Live Camera Presence Status Sign (Green = Face Detected, Red = Not Detected) */}
            <div className="absolute top-3 right-3 z-20">
              {isVideoMuted ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-black/70 backdrop-blur-md text-neutral-400 border border-neutral-700">
                  <span className="w-2 h-2 rounded-full bg-neutral-500" />
                  <span>Camera Off</span>
                </div>
              ) : isFaceDetected === null ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-black/70 backdrop-blur-md text-neutral-300 border border-neutral-700">
                  <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                  <span>Calibrating...</span>
                </div>
              ) : isFaceDetected ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-emerald-950/80 backdrop-blur-md text-emerald-300 border border-emerald-500/40 shadow-sm shadow-emerald-500/20">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span>In Frame</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-rose-950/80 backdrop-blur-md text-rose-300 border border-rose-500/40 shadow-sm shadow-rose-500/20 animate-pulse">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  <span>Out of Frame</span>
                </div>
              )}
            </div>

            {/* Participant Tag */}
            <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md border border-neutral-800 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-medium text-neutral-300 z-20">
              {isMicMuted ? (
                <MicOff className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Mic className="w-3.5 h-3.5 text-neutral-400" />
              )}
              <span>{candidateName || 'You'}</span>
            </div>
          </div>

          {/* RIGHT: AI INTERVIEWER */}
          <div className="relative w-full aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center border border-neutral-800">
            <AiVisualizer
              isAiSpeaking={isAiSpeaking}
              audioLevel={aiAudioLevel}
            />

            {/* Participant Tag */}
            <div className="absolute bottom-3 left-3 bg-black/70 backdrop-blur-md border border-neutral-800 px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-medium text-neutral-300 z-20">
              <span className={`w-2 h-2 rounded-full ${isAiSpeaking ? 'bg-white animate-pulse' : 'bg-neutral-600'}`} />
              <span>Interviewer (Sarah)</span>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="h-16 flex items-center justify-center gap-4">
        {/* Google Meet-Style Split Microphone Pill Control */}
        <div className="relative inline-flex items-center" ref={micMenuRef}>
          {/* Mute / Unmute Button (Left Side) */}
          <button
            onClick={toggleMic}
            className={`h-12 pl-4 pr-2.5 rounded-l-full flex items-center justify-center transition-all cursor-pointer ${
              isMicMuted
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                : 'bg-[#2B303C] hover:bg-slate-700 text-white'
            }`}
            title={isMicMuted ? 'Turn on microphone' : 'Turn off microphone'}
          >
            {isMicMuted ? <MicOff className="w-5 h-5 text-white" /> : <Mic className="w-5 h-5 text-white" />}
          </button>

          {/* Vertical Divider Line */}
          <div className={`w-[1px] h-6 ${isMicMuted ? 'bg-rose-400/40' : 'bg-neutral-600/80'}`} />

          {/* Microphone Selector Chevron (Right Side) */}
          <button
            onClick={() => setIsMicMenuOpen((prev) => !prev)}
            className={`h-12 pr-3 pl-2 rounded-r-full flex items-center justify-center transition-all cursor-pointer ${
              isMicMuted
                ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
                : isMicMenuOpen
                ? 'bg-slate-700 text-sky-400'
                : 'bg-[#2B303C] hover:bg-slate-700 text-neutral-300 hover:text-white'
            }`}
            title="Select microphone"
          >
            <ChevronUp className={`w-4 h-4 transition-transform duration-200 ${isMicMenuOpen ? 'rotate-180' : ''}`} />
          </button>

          {/* Google Meet Audio Settings Popover Menu */}
          {isMicMenuOpen && (
            <div className="absolute bottom-16 left-0 mb-2 w-72 sm:w-80 bg-[#1A1D24]/95 backdrop-blur-xl border border-neutral-700/80 rounded-2xl shadow-2xl p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-neutral-800 mb-1.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-neutral-300">
                  <Mic className="w-3.5 h-3.5 text-neutral-400" />
                  <span>MICROPHONE</span>
                </div>
                <span className="text-[10px] text-neutral-500 font-mono">
                  {availableMics.length} {availableMics.length === 1 ? 'device' : 'devices'}
                </span>
              </div>

              <div className="max-h-56 overflow-y-auto space-y-1 py-0.5 custom-scrollbar">
                {availableMics.length === 0 ? (
                  <div className="px-3 py-2 text-xs text-neutral-400">
                    Default System Microphone
                  </div>
                ) : (
                  availableMics.map((device, idx) => {
                    const isSelected =
                      (selectedMicId && selectedMicId === device.deviceId) ||
                      (currentAudioDeviceId && currentAudioDeviceId === device.deviceId) ||
                      (!selectedMicId && idx === 0);

                    const label = device.label || `Microphone ${idx + 1}`;

                    return (
                      <button
                        key={device.deviceId || idx}
                        onClick={() => handleSelectMicrophone(device.deviceId)}
                        className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-left transition-colors cursor-pointer ${
                          isSelected
                            ? 'bg-white/10 text-white font-medium'
                            : 'text-neutral-300 hover:bg-white/5 hover:text-white'
                        }`}
                      >
                        <span className="truncate pr-2">{label}</span>
                        {isSelected && <Check className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>

        {/* Video On / Off */}
        <button
          onClick={toggleVideo}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            isVideoMuted
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
              : 'bg-[#2B303C] hover:bg-slate-700 text-white'
          }`}
          title={isVideoMuted ? 'Start Video' : 'Stop Video'}
        >
          {isVideoMuted ? <VideoOff className="w-5 h-5" /> : <Video className="w-5 h-5" />}
        </button>

        {/* End Call Button */}
        <button
          onClick={endInterview}
          className="h-12 px-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all flex items-center gap-2 shadow-lg shadow-rose-600/30 cursor-pointer"
          title="End Session"
        >
          <PhoneOff className="w-4 h-4" />
          <span>End Session</span>
        </button>
      </div>

    </div>
  );
};
