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
  CheckCircle2,
  Sparkles,
  Laptop,
  Camera
} from 'lucide-react';

export const MeetingPage: React.FC = () => {
  const {
    isMicMuted,
    isVideoMuted,
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
  const [stepMessage, setStepMessage] = useState<string>('Initializing interview chamber...');
  const [activeWarningApp, setActiveWarningApp] = useState<string | null>(null);

  const baselineAppsRef = useRef<string[]>([]);
  const warnedAppsRef = useRef<Set<string>>(new Set());
  const hasStartedFlowRef = useRef<boolean>(false);

  const livekitConnectedRef = useRef<boolean>(false);

  // Stable handler for speaking changes
  const handleAiSpeakingChange = useCallback((speaking: boolean) => {
    useInterviewStore.getState().setAiSpeaking(speaking);
  }, []);

  // Stable handler for data messages received from LiveKit agent
  const handleDataReceived = useCallback((data: any) => {
    if (data?.type === 'step') {
      if (data.step) {
        setCurrentStep(data.step);
      }
      if (data.message) {
        setStepMessage(data.message);
      }
    }
  }, []);

  // Connect to LiveKit audio room for real-time AI voice conversation
  const { connect, disconnect, sendData, isConnected, aiAudioLevel } = useLiveKitVoice({
    roomName: 'interview-room-1',
    participantName: candidateName || 'Candidate',
    isMicMuted,
    onAiSpeakingChange: handleAiSpeakingChange,
    onDataReceived: handleDataReceived,
  });

  useEffect(() => {
    livekitConnectedRef.current = isConnected;
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
        setStepMessage(greetingText);
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
        setStepMessage(`Desktop: ${appListText || 'Active applications verified'}`);
        await speakSafe(desktopText);
        await new Promise((r) => setTimeout(r, 500));

        // --- STEP 3: WEBCAM TEST ---
        setCurrentStep('webcam_test');
        setStepMessage('Testing webcam & candidate presence...');
        const webcamSpeech = `Now let me test your webcam.`;

        const presencePromise = detectCandidatePresence(videoRef.current);
        await Promise.all([speakSafe(webcamSpeech), presencePromise]);

        const presence = await presencePromise;
        if (useInterviewStore.getState().isVideoMuted || !presence.cameraActive) {
          setStepMessage('Camera is off. Please enable your webcam.');
          await speakSafe('Please make sure your camera is turned on.');
        } else if (!presence.isPresent) {
          setStepMessage('Candidate not detected. Please center yourself.');
          await speakSafe('Please center yourself in front of the camera.');
        } else {
          setStepMessage('Webcam & presence verified.');
        }

        await new Promise((r) => setTimeout(r, 600));

        // --- STEP 4: ALL GOOD, LET'S START ---
        setCurrentStep('ready');
        const startSpeech = `All good! Let's start with the interview. To kick things off, tell me about your background and a challenging technical project you recently worked on.`;
        setStepMessage("All good! Let's start with the interview.");
        await speakSafe(startSpeech);
        await new Promise((r) => setTimeout(r, 300));

        setCurrentStep('in_progress');
        setStepMessage('Interview in progress');
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

  return (
    <div className="h-screen w-screen bg-[#111317] text-white flex flex-col justify-between p-6 select-none overflow-hidden relative">
      
      {/* Real-Time Floating Warning Banner if an external application is opened */}
      {activeWarningApp && (
        <div className="absolute top-5 left-1/2 -translate-x-1/2 z-50 bg-rose-600/95 text-white px-5 py-2.5 rounded-2xl shadow-2xl border border-rose-400 flex items-center gap-2.5 text-xs font-semibold backdrop-blur-md animate-bounce">
          <AlertTriangle className="w-4 h-4 shrink-0 text-white" />
          <span>Warning: You have opened <strong>{activeWarningApp}</strong>. Please keep external applications closed.</span>
        </div>
      )}

      {/* 2 Horizontal Video Boxes */}
      <div className="flex-1 w-full max-w-7xl mx-auto flex items-center justify-center px-4">
        <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-5 items-center">
          
          {/* LEFT: MY WEBCAM */}
          <div className="relative w-full aspect-video bg-[#1C1F26] rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center border border-slate-800/80">
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
              <div className="flex flex-col items-center justify-center text-slate-500">
                <VideoOff className="w-10 h-10 mb-2 opacity-40" />
              </div>
            )}

            {/* Subtle Step Status Pill */}
            <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-3 py-1.5 rounded-xl border border-white/10 flex items-center gap-2 text-[11px] font-medium z-20">
              {currentStep === 'greeting' && (
                <>
                  <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-slate-300">Welcome & Greeting</span>
                </>
              )}
              {currentStep === 'desktop_check' && (
                <>
                  <Laptop className="w-3.5 h-3.5 text-indigo-400" />
                  <span className="text-indigo-300 truncate max-w-[240px]">{stepMessage}</span>
                </>
              )}
              {currentStep === 'webcam_test' && (
                <>
                  <Camera className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                  <span className="text-amber-300">{stepMessage}</span>
                </>
              )}
              {currentStep === 'ready' && (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-300 font-semibold">{stepMessage}</span>
                </>
              )}
              {currentStep === 'in_progress' && (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-slate-300">Interview In Progress</span>
                </>
              )}
            </div>

            {/* Participant Tag */}
            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-medium text-slate-200 z-20">
              {isMicMuted ? (
                <MicOff className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Mic className="w-3.5 h-3.5 text-slate-300" />
              )}
              <span>{candidateName || 'You'}</span>
            </div>
          </div>

          {/* RIGHT: AI INTERVIEWER */}
          <div className="relative w-full aspect-video bg-[#1C1F26] rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center border border-slate-800/80">
            <AiVisualizer
              isAiSpeaking={isAiSpeaking}
              audioLevel={aiAudioLevel}
            />

            {/* Participant Tag */}
            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-medium text-slate-200 z-20">
              <span className={`w-2 h-2 rounded-full ${isAiSpeaking ? 'bg-cyan-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>AI Interviewer (Sarah)</span>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Control Bar */}
      <div className="h-16 flex items-center justify-center gap-4">
        {/* Mute / Unmute */}
        <button
          onClick={toggleMic}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all cursor-pointer ${
            isMicMuted
              ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-lg shadow-rose-600/30'
              : 'bg-[#2B303C] hover:bg-slate-700 text-white'
          }`}
          title={isMicMuted ? 'Unmute' : 'Mute'}
        >
          {isMicMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
        </button>

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
