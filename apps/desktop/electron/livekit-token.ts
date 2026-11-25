import { AccessToken } from 'livekit-server-sdk';

const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY || 'devkey';
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET || 'secret';

export async function createParticipantToken(
  roomName: string,
  participantName: string = 'Candidate'
): Promise<string> {
  // Use deterministic identity so LiveKit enforces single session per candidate,
  // preventing duplicate ghost participants from causing audio echo loops.
  const normalizedIdentity = `candidate_${participantName.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: normalizedIdentity,
    name: participantName,
    ttl: '2h',
  });

  at.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true,
  });

  return await at.toJwt();
}
