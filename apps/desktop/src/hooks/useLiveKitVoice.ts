import { useEffect, useRef, useState, useCallback } from 'react';
import { Room, RoomEvent, Track, RemoteTrack, RemoteParticipant } from 'livekit-client';

export interface UseLiveKitVoiceOptions {
  roomName?: string;
  participantName?: string;
  metadata?: string;
  isMicMuted?: boolean;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onAiSpeakingChange?: (isSpeaking: boolean) => void;
  onDataReceived?: (data: any) => void;
}

export function useLiveKitVoice({
  roomName = 'interview-room-1',
  participantName = 'Candidate',
  metadata,
  isMicMuted = false,
  onConnected,
  onDisconnected,
  onAiSpeakingChange,
  onDataReceived,
}: UseLiveKitVoiceOptions) {
  const roomRef = useRef<Room | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aiAudioLevel, setAiAudioLevel] = useState(0);

  // Keep latest callbacks in refs so changes don't invalidate connect() callback
  const callbacksRef = useRef({ onConnected, onDisconnected, onAiSpeakingChange, onDataReceived });
  callbacksRef.current = { onConnected, onDisconnected, onAiSpeakingChange, onDataReceived };

  const isMicMutedRef = useRef(isMicMuted);
  isMicMutedRef.current = isMicMuted;

  // Prevent overlapping concurrent connection attempts
  const isConnectingRef = useRef(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Web Audio Analyser references
  const audioContextRef = useRef<AudioContext | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // Clean up all attached audio elements to prevent audio leaks/repeating echoes
  const cleanupAudioElements = useCallback(() => {
    const existingAudio = document.querySelectorAll('.livekit-remote-audio-track');
    existingAudio.forEach((el) => {
      try {
        (el as HTMLAudioElement).pause();
        el.remove();
      } catch {}
    });

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      try {
        audioContextRef.current.close();
      } catch {}
      audioContextRef.current = null;
    }
    setAiAudioLevel(0);
  }, []);

  const disconnect = useCallback(async () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    isConnectingRef.current = false;

    if (roomRef.current) {
      const room = roomRef.current;
      roomRef.current = null;
      try {
        await room.disconnect();
      } catch (e) {
        console.warn('[LiveKit] Disconnect error:', e);
      }
    }

    cleanupAudioElements();
    setIsConnected(false);
    callbacksRef.current.onDisconnected?.();
  }, [cleanupAudioElements]);

  const connect = useCallback(async (customMetadata?: string) => {
    // Prevent overlapping connection attempts
    if (isConnectingRef.current) {
      console.log('[LiveKit] Connection already in progress, ignoring duplicate call');
      return;
    }

    // Already connected to the same room
    if (roomRef.current && roomRef.current.state === 'connected' && roomRef.current.name === roomName) {
      console.log('[LiveKit] Already connected to room:', roomName);
      return;
    }

    try {
      isConnectingRef.current = true;
      setError(null);

      // Cancel any ongoing attempt and cleanly disconnect existing room
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      if (roomRef.current) {
        await roomRef.current.disconnect();
        roomRef.current = null;
      }
      cleanupAudioElements();

      if (abortController.signal.aborted) return;

      const effectiveMetadata = customMetadata !== undefined ? customMetadata : metadata;

      // Fetch JWT token
      let token = '';
      if ((window as any).electronAPI?.getLiveKitToken) {
        token = await (window as any).electronAPI.getLiveKitToken(roomName, participantName, effectiveMetadata);
      } else {
        const res = await fetch('/api/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            room: roomName,
            name: participantName,
            metadata: effectiveMetadata,
          }),
        });
        const data = await res.json();
        token = data.token;
      }

      if (abortController.signal.aborted) return;
      if (!token) throw new Error('No valid token received');

      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      // Handle remote audio tracks: ONLY play tracks from the AI Agent, NEVER from candidate
      const handleTrackSubscribed = (track: RemoteTrack, _publication: any, participant: RemoteParticipant) => {
        // Never play local tracks
        if (participant.isLocal) return;

        // Never play tracks from candidate participants (prevents feedback/self-echo loop)
        const isCandidate = participant.identity.toLowerCase().startsWith('candidate') ||
                            participant.name?.toLowerCase() === 'candidate';
        if (isCandidate) {
          console.warn(`[LiveKit] Ignored audio track from non-agent participant: ${participant.identity}`);
          return;
        }

        if (track.kind === Track.Kind.Audio) {
          const el = track.attach();
          el.className = 'livekit-remote-audio-track';
          el.volume = 1.0;
          el.muted = false;
          document.body.appendChild(el);

          // Play audio and handle browser autoplay policy
          el.play().catch((e) => {
            console.warn('[LiveKit] Remote audio play error:', e);
            const resumeAudio = () => {
              el.play().catch(() => {});
              room.startAudio().catch(() => {});
              window.removeEventListener('click', resumeAudio);
            };
            window.addEventListener('click', resumeAudio, { once: true });
          });

          console.log(`[LiveKit] Attached and playing AI voice track from: ${participant.identity}`);

          // Set up Web Audio Analyser for live frequency visualization
          try {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            if (AudioCtx && track.mediaStreamTrack) {
              if (audioContextRef.current) {
                audioContextRef.current.close().catch(() => {});
              }

              const audioCtx = new AudioCtx();
              audioContextRef.current = audioCtx;

              const source = audioCtx.createMediaStreamSource(new MediaStream([track.mediaStreamTrack]));
              const analyser = audioCtx.createAnalyser();
              analyser.fftSize = 128;
              analyser.smoothingTimeConstant = 0.4;
              source.connect(analyser);

              const bufferLength = analyser.frequencyBinCount;
              const dataArray = new Uint8Array(bufferLength);

              const checkAudioLevel = () => {
                if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
                  return;
                }

                analyser.getByteFrequencyData(dataArray);
                // Calculate RMS energy across human vocal frequencies (approx 85Hz - 3400Hz)
                let energy = 0;
                const vocalBins = Math.min(bufferLength, 32);
                for (let i = 1; i < vocalBins; i++) {
                  energy += (dataArray[i] / 255) ** 2;
                }
                const rms = Math.sqrt(energy / (vocalBins - 1));
                // Responsive dynamic scaling for subtle vocal inflections and tone dynamics
                const scaled = Math.min(1, Math.max(0, rms * 1.85));
                setAiAudioLevel(scaled);

                animationFrameRef.current = requestAnimationFrame(checkAudioLevel);
              };

              checkAudioLevel();
            }
          } catch (analyserErr) {
            console.warn('[LiveKit] Web Audio Analyser setup error:', analyserErr);
          }
        }
      };

      room.on(RoomEvent.TrackSubscribed, handleTrackSubscribed);

      room.on(RoomEvent.TrackUnsubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => {
            try {
              (el as HTMLAudioElement).pause();
              el.remove();
            } catch {}
          });
        }
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        // AI is speaking if there is an active speaker that is remote and not a candidate
        const isAiSpeaking = speakers.some(
          (s) => !s.isLocal && !s.identity.toLowerCase().startsWith('candidate')
        );
        callbacksRef.current.onAiSpeakingChange?.(isAiSpeaking);
        if (!isAiSpeaking) {
          setAiAudioLevel(0);
        }
      });

      room.on(RoomEvent.DataReceived, (payload: Uint8Array) => {
        try {
          const str = new TextDecoder().decode(payload);
          const data = JSON.parse(str);
          callbacksRef.current.onDataReceived?.(data);
        } catch (e) {
          console.warn('[LiveKit] Data decode error:', e);
        }
      });

      room.on(RoomEvent.Disconnected, () => {
        cleanupAudioElements();
        setIsConnected(false);
        callbacksRef.current.onDisconnected?.();
      });

      const livekitUrl = (import.meta as any).env?.VITE_LIVEKIT_URL || 'ws://127.0.0.1:7880';
      await room.connect(livekitUrl, token);

      if (abortController.signal.aborted) {
        await room.disconnect();
        return;
      }

      // Unlock browser audio context automatically
      try {
        await room.startAudio();
      } catch (startAudioErr) {
        console.warn('[LiveKit] startAudio error:', startAudioErr);
      }

      roomRef.current = room;
      setIsConnected(true);
      callbacksRef.current.onConnected?.();

      // Enable microphone according to current mute state
      try {
        await room.localParticipant.setMicrophoneEnabled(!isMicMutedRef.current);
      } catch (micErr: any) {
        console.error('[LiveKit] Microphone enable error:', micErr);
      }
    } catch (err: any) {
      console.warn('[LiveKit] Connection error:', err.message);
      setError(err.message);
    } finally {
      isConnectingRef.current = false;
    }
  }, [roomName, participantName, cleanupAudioElements]);

  const sendData = useCallback(async (data: any) => {
    if (roomRef.current?.localParticipant) {
      try {
        const str = JSON.stringify(data);
        const encoded = new TextEncoder().encode(str);
        await roomRef.current.localParticipant.publishData(encoded, { reliable: true });
      } catch (err) {
        console.warn('[LiveKit] sendData error:', err);
      }
    }
  }, []);

  // Handle microphone mute toggle without triggering reconnect
  useEffect(() => {
    if (roomRef.current?.localParticipant) {
      roomRef.current.localParticipant.setMicrophoneEnabled(!isMicMuted).catch((err) => {
        console.warn('[LiveKit] Failed to toggle mic state:', err);
      });
    }
  }, [isMicMuted]);

  // Clean up completely on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    connect,
    disconnect,
    sendData,
    isConnected,
    aiAudioLevel,
    error,
  };
}
