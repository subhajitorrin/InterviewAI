import React, { useEffect, useRef, useState } from 'react';

interface AiVisualizerProps {
  isAiSpeaking: boolean;
  audioLevel?: number; // 0 to 1
}

export const AiVisualizer: React.FC<AiVisualizerProps> = ({
  isAiSpeaking,
  audioLevel = 0,
}) => {
  // Use animation frame loop for organic, ultra-smooth physics-based wave motion
  const [phase, setPhase] = useState(0);
  const animRef = useRef<number | null>(null);

  useEffect(() => {
    let currentPhase = 0;
    const animate = () => {
      // Faster, more dynamic wave phase speed when speech audio is detected
      const speed = isAiSpeaking ? 0.12 + audioLevel * 0.18 : 0.025;
      currentPhase += speed;
      setPhase(currentPhase);
      animRef.current = requestAnimationFrame(animate);
    };

    animRef.current = requestAnimationFrame(animate);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [isAiSpeaking, audioLevel]);

  // Array of 5 clean, minimal dots (like modern Siri / Voice AI interfaces)
  // Symmetric distribution centered in the chamber
  const dotWeights = [0.45, 0.8, 1.25, 0.8, 0.45];

  // Base level when AI is speaking vs ambient idle state
  const currentVolume = isAiSpeaking ? Math.max(audioLevel, 0.22) : 0.04;

  return (
    <div className="relative w-full h-full flex flex-col items-center justify-center p-6 select-none overflow-hidden bg-black">
      {/* Subtle, elegant white ambient backlight - responds softly to tone and speech */}
      <div
        className="absolute rounded-full pointer-events-none transition-all duration-300 ease-out"
        style={{
          width: `${140 + currentVolume * 160}px`,
          height: `${140 + currentVolume * 160}px`,
          background: isAiSpeaking
            ? `radial-gradient(circle, rgba(255, 255, 255, ${0.08 + currentVolume * 0.16}) 0%, rgba(255, 255, 255, 0) 70%)`
            : 'radial-gradient(circle, rgba(255, 255, 255, 0.03) 0%, rgba(255, 255, 255, 0) 70%)',
          filter: 'blur(36px)',
        }}
      />

      {/* Main White Dots Soundwave Container */}
      <div className="relative z-10 flex items-center justify-center gap-3 sm:gap-4 h-24">
        {dotWeights.map((weight, i) => {
          // Harmonic wave offset across dots
          const wave = Math.sin(phase + i * 0.85);
          const positiveWave = (wave + 1) / 2; // normalize 0..1

          // Vertical displacement and size scaling directly linked to speech tone
          const maxDisplacement = isAiSpeaking ? 18 * weight * currentVolume : 2;
          const yOffset = isAiSpeaking ? Math.sin(phase * 1.4 + i * 0.9) * maxDisplacement : Math.sin(phase + i * 0.6) * 1.5;

          // Dot size: resting at 9px, scaling up to 18px on vocal peaks
          const baseSize = 9;
          const size = isAiSpeaking
            ? baseSize + (positiveWave * 6 + currentVolume * 10) * weight * 0.6
            : baseSize + Math.sin(phase + i) * 0.8;

          // Opacity: bright crisp white on voice peaks, softly muted when silent
          const opacity = isAiSpeaking
            ? Math.min(1, 0.65 + currentVolume * 0.35 + positiveWave * 0.2)
            : 0.35 + Math.sin(phase + i * 0.5) * 0.08;

          return (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{
                transform: `translateY(${-yOffset}px)`,
                transition: 'transform 80ms cubic-bezier(0.2, 0.8, 0.4, 1)',
              }}
            >
              <div
                className="rounded-full bg-white transition-all duration-75 ease-out"
                style={{
                  width: `${size}px`,
                  height: `${size}px`,
                  opacity,
                  boxShadow: isAiSpeaking && currentVolume > 0.15
                    ? `0 0 ${8 + currentVolume * 12}px rgba(255, 255, 255, ${0.5 + currentVolume * 0.4})`
                    : '0 0 3px rgba(255, 255, 255, 0.25)',
                }}
              />
            </div>
          );
        })}
      </div>

      {/* Clean Status Subtitle */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2">
        <span
          className="text-[11px] font-mono tracking-widest uppercase transition-colors duration-200"
          style={{
            color: isAiSpeaking ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.35)',
          }}
        >
          {isAiSpeaking ? 'Speaking' : 'Listening'}
        </span>
      </div>
    </div>
  );
};
