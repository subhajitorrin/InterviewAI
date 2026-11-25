import React from 'react';
import { Bot, Sparkles, Volume2 } from 'lucide-react';

interface AiVisualizerProps {
  isAiSpeaking: boolean;
  audioLevel?: number; // 0 to 1
  subtitles?: string;
  interviewerName?: string;
}

export const AiVisualizer: React.FC<AiVisualizerProps> = ({
  isAiSpeaking,
  audioLevel = 0,
  subtitles,
  interviewerName = 'Dr. Sarah Vance',
}) => {
  // Dot heights scaled by audio level (with fallbacks if level is 0)
  const effectiveLevel = isAiSpeaking ? Math.max(audioLevel, 0.35) : 0;

  // 7 visualizer dots with symmetric harmonic multipliers
  const dotMultipliers = [0.45, 0.7, 0.95, 1.3, 0.95, 0.7, 0.45];

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6 select-none overflow-hidden">
      
      {/* Background ambient spotlight glow */}
      <div 
        className={`absolute w-72 h-72 rounded-full blur-3xl pointer-events-none transition-all duration-700 ease-out ${
          isAiSpeaking 
            ? 'bg-blue-600/25 scale-125 opacity-100' 
            : 'bg-indigo-900/15 scale-90 opacity-40'
        }`}
      />

      {/* Main Avatar & Pulse Rings Container */}
      <div className="relative flex items-center justify-center my-auto">
        
        {/* Outermost Expanding Pulse Ring */}
        {isAiSpeaking && (
          <div 
            className="absolute rounded-full border border-blue-400/20 bg-blue-500/5 transition-transform duration-300 pointer-events-none animate-ping"
            style={{
              width: `${140 + effectiveLevel * 50}px`,
              height: `${140 + effectiveLevel * 50}px`,
              animationDuration: '2.4s',
            }}
          />
        )}

        {/* Middle Breathing Pulse Ring */}
        <div 
          className={`absolute rounded-full transition-all duration-500 pointer-events-none ${
            isAiSpeaking 
              ? 'border-2 border-cyan-400/30 bg-cyan-500/10 shadow-[0_0_35px_rgba(34,211,238,0.25)]' 
              : 'border border-slate-700/40 bg-slate-800/10'
          }`}
          style={{
            width: `${120 + effectiveLevel * 35}px`,
            height: `${120 + effectiveLevel * 35}px`,
            transform: `scale(${1 + effectiveLevel * 0.15})`,
          }}
        />

        {/* Inner Glowing Aura Ring */}
        <div 
          className={`absolute rounded-full transition-all duration-300 pointer-events-none ${
            isAiSpeaking
              ? 'border-2 border-blue-400/60 shadow-[0_0_25px_rgba(59,130,246,0.5)]'
              : 'border border-white/10 shadow-none'
          }`}
          style={{
            width: '108px',
            height: '108px',
            transform: `scale(${isAiSpeaking ? 1 + effectiveLevel * 0.08 : 1})`,
          }}
        />

        {/* Central Orb / Avatar Portrait */}
        <div 
          className={`relative w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 z-10 ${
            isAiSpeaking 
              ? 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 shadow-blue-500/40' 
              : 'bg-gradient-to-tr from-[#1E2330] to-[#2B3245] shadow-black/60'
          }`}
          style={{
            transform: `scale(${isAiSpeaking ? 1 + effectiveLevel * 0.06 : 1})`,
          }}
        >
          {isAiSpeaking ? (
            <Sparkles className="w-10 h-10 text-white animate-pulse" />
          ) : (
            <Bot className="w-10 h-10 text-slate-300" />
          )}
        </div>

      </div>

      {/* Floating Animated Audio Dots Visualizer (Waveform Equalizer) */}
      <div className="flex items-center justify-center gap-1.5 h-12 mb-3 z-10">
        {dotMultipliers.map((multiplier, idx) => {
          // Dynamic height: scaled by voice level + harmonic multiplier
          const baseHeight = isAiSpeaking ? 12 : 6;
          const dynamicHeight = isAiSpeaking 
            ? Math.min(48, Math.max(12, 12 + effectiveLevel * 30 * multiplier)) 
            : baseHeight;

          return (
            <div
              key={idx}
              className={`w-1.5 rounded-full transition-all duration-150 ease-out ${
                isAiSpeaking
                  ? 'bg-gradient-to-t from-blue-500 via-cyan-400 to-indigo-300 shadow-[0_0_8px_rgba(34,211,238,0.6)]'
                  : 'bg-slate-600/50'
              }`}
              style={{
                height: `${dynamicHeight}px`,
                animation: isAiSpeaking
                  ? `soundwave 1.1s ease-in-out infinite alternate ${idx * 0.12}s`
                  : undefined,
              }}
            />
          );
        })}
      </div>

      {/* Live State Badge */}
      <div className="z-10 mb-2">
        {isAiSpeaking ? (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/15 border border-blue-400/30 text-blue-300 text-xs font-medium shadow-lg shadow-blue-500/10">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
            </span>
            <span>{interviewerName} • Speaking</span>
          </div>
        ) : (
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-medium">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Listening to you...</span>
          </div>
        )}
      </div>

      {/* Live Subtitles / Caption Overlay */}
      {subtitles && (
        <div className="w-full max-w-lg mt-1 z-10">
          <div className="bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-4 py-2.5 shadow-2xl flex items-start gap-2.5">
            <Volume2 className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="text-xs text-slate-200 leading-relaxed font-normal">
              {subtitles}
            </p>
          </div>
        </div>
      )}

    </div>
  );
};
