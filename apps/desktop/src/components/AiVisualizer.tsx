import React from 'react';
import { Bot, Sparkles } from 'lucide-react';

interface AiVisualizerProps {
  isAiSpeaking: boolean;
  audioLevel?: number; // 0 to 1
}

export const AiVisualizer: React.FC<AiVisualizerProps> = ({
  isAiSpeaking,
  audioLevel = 0,
}) => {
  // Dot heights scaled by audio level (with fallbacks if level is 0)
  const effectiveLevel = isAiSpeaking ? Math.max(audioLevel, 0.4) : 0;

  // 7 visualizer dots with symmetric harmonic multipliers
  const dotMultipliers = [0.45, 0.7, 1.0, 1.35, 1.0, 0.7, 0.45];

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6 select-none overflow-hidden">
      
      {/* Background ambient spotlight glow - only active when speaking */}
      <div 
        className={`absolute w-72 h-72 rounded-full blur-3xl pointer-events-none transition-all duration-500 ease-out ${
          isAiSpeaking 
            ? 'bg-blue-600/30 scale-125 opacity-100' 
            : 'scale-75 opacity-0'
        }`}
      />

      {/* Main Avatar & Pulse Rings Container */}
      <div className="relative flex items-center justify-center">
        
        {/* Outermost Expanding Pulse Ring - only when speaking */}
        {isAiSpeaking && (
          <div 
            className="absolute rounded-full border border-blue-400/25 bg-blue-500/5 transition-transform duration-300 pointer-events-none animate-ping"
            style={{
              width: `${140 + effectiveLevel * 45}px`,
              height: `${140 + effectiveLevel * 45}px`,
              animationDuration: '2.2s',
            }}
          />
        )}

        {/* Middle Pulse Ring - only when speaking */}
        {isAiSpeaking && (
          <div 
            className="absolute rounded-full border-2 border-cyan-400/35 bg-cyan-500/10 shadow-[0_0_35px_rgba(34,211,238,0.25)] transition-all duration-300 pointer-events-none"
            style={{
              width: `${120 + effectiveLevel * 30}px`,
              height: `${120 + effectiveLevel * 30}px`,
              transform: `scale(${1 + effectiveLevel * 0.12})`,
            }}
          />
        )}

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

        {/* Central Orb / Avatar */}
        <div 
          className={`relative w-24 h-24 rounded-full flex items-center justify-center shadow-2xl transition-all duration-300 z-10 ${
            isAiSpeaking 
              ? 'bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 shadow-blue-500/40 scale-105' 
              : 'bg-gradient-to-tr from-[#1E2330] to-[#2B3245] shadow-black/60 scale-100'
          }`}
        >
          {isAiSpeaking ? (
            <Sparkles className="w-10 h-10 text-white animate-pulse" />
          ) : (
            <Bot className="w-10 h-10 text-slate-400" />
          )}
        </div>

      </div>

      {/* Floating Animated Audio Dots Visualizer - ONLY visible when speaking */}
      <div 
        className={`flex items-center justify-center gap-1.5 h-12 mt-6 z-10 transition-all duration-300 ${
          isAiSpeaking ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-2 pointer-events-none'
        }`}
      >
        {dotMultipliers.map((multiplier, idx) => {
          const dynamicHeight = isAiSpeaking 
            ? Math.min(48, Math.max(12, 12 + effectiveLevel * 28 * multiplier)) 
            : 0;

          return (
            <div
              key={idx}
              className="w-1.5 rounded-full transition-all duration-150 ease-out bg-gradient-to-t from-blue-500 via-cyan-400 to-indigo-300 shadow-[0_0_8px_rgba(34,211,238,0.6)]"
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

    </div>
  );
};
