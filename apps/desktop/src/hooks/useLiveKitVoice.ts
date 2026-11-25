import { useEffect, useRef, useState, useCallback } from 'react';
import { Room, RoomEvent, Track, RemoteTrack } from 'livekit-client';

export interface UseLiveKitVoiceOptions {
  roomName?: string;
  participantName?: string;
  isMicMuted?: boolean;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onAiSpeakingChange?: (isSpeaking: boolean) => void;
}

export function useLiveKitVoice({
  roomName = 'interview-room-1',
  participantName = 'Candidate',
  isMicMuted = false,
  onConnected,
  onDisconnected,
  onAiSpeakingChange,
}: UseLiveKitVoiceOptions) {
  const roomRef = useRef<Room | null>(null);
  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize hidden audio element for remote AI voice playback
  useEffect(() => {
    const audio = document.createElement('audio');
    audio.autoplay = true;
    audioElRef.current = audio;
    document.body.appendChild(audio);

    return () => {
      audio.remove();
      audioElRef.current = null;
    };
  }, []);

  const connect = useCallback(async () => {
    try {
      setError(null);
      const room = new Room({
        adaptiveStream: true,
        dynacast: true,
      });
      roomRef.current = room;

      // Listen for remote audio track from AI agent
      room.on(RoomEvent.TrackSubscribed, (track: RemoteTrack) => {
        if (track.kind === Track.Kind.Audio && audioElRef.current) {
          track.attach(audioElRef.current);
        }
      });

      room.on(RoomEvent.ActiveSpeakersChanged, (speakers) => {
        const isAiSpeaking = speakers.some((s) => s.identity.includes('agent') || s.name?.includes('Dr. Sarah') || !s.isLocal);
        onAiSpeakingChange?.(isAiSpeaking);
      });

      room.on(RoomEvent.Disconnected, () => {
        setIsConnected(false);
        onDisconnected?.();
      });

      // Fetch JWT token
      let token = '';
      if ((window as any).electronAPI?.getLiveKitToken) {
        token = await (window as any).electronAPI.getLiveKitToken(roomName, participantName);
      } else {
        // Fallback for standalone web dev mode: use local dev token endpoint or basic token
        token = 'dev-token';
      }

      const livekitUrl = (import.meta as any).env?.VITE_LIVEKIT_URL || 'ws://127.0.0.1:7880';
      await room.connect(livekitUrl, token);
      setIsConnected(true);
      onConnected?.();

      // Enable microphone input to send to Deepgram STT
      await room.localParticipant.setMicrophoneEnabled(!isMicMuted);
    } catch (err: any) {
      console.warn('LiveKit local connection:', err.message);
      setError(err.message);
    }
  }, [roomName, participantName, isMicMuted, onConnected, onDisconnected, onAiSpeakingChange]);

  const disconnect = useCallback(async () => {
    if (roomRef.current) {
      await roomRef.current.disconnect();
      roomRef.current = null;
      setIsConnected(false);
    }
  }, []);

  // Update microphone mute state
  useEffect(() => {
    if (roomRef.current?.localParticipant) {
      roomRef.current.localParticipant.setMicrophoneEnabled(!isMicMuted).catch(() => {});
    }
  }, [isMicMuted]);

  return {
    connect,
    disconnect,
    isConnected,
    error,
  };
}
