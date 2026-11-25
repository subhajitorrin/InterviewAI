import React, { useEffect, useRef } from 'react';
import { useInterviewStore } from '../stores/interviewStore';
import { 
  Mic, 
  MicOff, 
  Video, 
  VideoOff, 
  PhoneOff, 
  Bot 
} from 'lucide-react';

export const MeetingPage: React.FC = () => {
  const {
    isMicMuted,
    isVideoMuted,
    isAiSpeaking,
    toggleMic,
    toggleVideo,
    endInterview
  } = useInterviewStore();

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

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

  return (
    <div className="h-screen w-screen bg-[#111317] text-white flex flex-col justify-between p-6 select-none overflow-hidden">
      
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

            {/* Participant Tag */}
            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-medium text-slate-200">
              {isMicMuted ? (
                <MicOff className="w-3.5 h-3.5 text-rose-400" />
              ) : (
                <Mic className="w-3.5 h-3.5 text-slate-300" />
              )}
              <span>You</span>
            </div>
          </div>

          {/* RIGHT: AI AGENT */}
          <div className="relative w-full aspect-video bg-[#1C1F26] rounded-2xl overflow-hidden shadow-2xl flex items-center justify-center border border-slate-800/80">
            <div className="flex flex-col items-center justify-center">
              {/* AI Avatar with subtle speech ring */}
              <div className={`relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 ${
                isAiSpeaking ? 'ring-4 ring-blue-500/60 scale-105' : 'ring-1 ring-white/10'
              }`}>
                <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-blue-700 to-indigo-600 flex items-center justify-center shadow-lg">
                  <Bot className="w-10 h-10 text-white" />
                </div>
              </div>
            </div>

            {/* Participant Tag */}
            <div className="absolute bottom-3 left-3 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded-lg flex items-center gap-1.5 text-xs font-medium text-slate-200">
              <span className={`w-2 h-2 rounded-full ${isAiSpeaking ? 'bg-blue-400 animate-pulse' : 'bg-slate-500'}`} />
              <span>AI Interviewer</span>
            </div>
          </div>

        </div>
      </div>

      {/* Bottom Zoom Control Bar */}
      <div className="h-16 flex items-center justify-center gap-4">
        {/* Mute / Unmute */}
        <button
          onClick={toggleMic}
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
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
          className={`w-12 h-12 rounded-full flex items-center justify-center transition-all ${
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
          className="h-12 px-6 rounded-full bg-rose-600 hover:bg-rose-500 text-white font-semibold text-xs transition-all flex items-center gap-2 shadow-lg shadow-rose-600/30"
          title="End Session"
        >
          <PhoneOff className="w-4 h-4" />
          <span>End Session</span>
        </button>
      </div>

    </div>
  );
};
