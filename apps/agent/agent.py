import os
import asyncio
import logging
from pathlib import Path
from dotenv import load_dotenv

# Load environment variables (.env)
load_dotenv()

from livekit.agents import (
    Agent,
    AgentSession,
    AgentServer,
    JobContext,
    AutoSubscribe,
    TurnHandlingOptions,
    EndpointingOptions,
    InterruptionOptions,
    room_io,
    tts,
)
from livekit.plugins import deepgram, silero, openai
from piper_tts import PiperTTS

logger = logging.getLogger("interview-agent")
logging.basicConfig(level=logging.INFO)

# Check TTS engine
use_openai_tts = os.environ.get("USE_OPENAI_TTS", "true").lower() == "true" and bool(os.environ.get("OPENAI_API_KEY"))

voice_path = Path(__file__).parent.parent.parent / "assets" / "piper-voices" / "en_US-lessac-medium.onnx"
local_piper_tts = PiperTTS(
    model_path=str(voice_path),
    piper_bin=str(Path(__file__).parent / ".venv" / "bin" / "piper"),
)

if use_openai_tts:
    logger.info("Using OpenAI Neural TTS ('alloy') with local Piper fallback")
    openai_tts = openai.TTS(model="tts-1", voice="alloy")
    tts_engine = tts.FallbackAdapter([openai_tts, local_piper_tts])
else:
    logger.info("Using Local Piper Neural TTS ('en_US-lessac')")
    tts_engine = local_piper_tts

server = AgentServer()

# Register as default room agent (agent_name="") so LiveKit server auto-dispatches all rooms to this worker
@server.rtc_session()
async def entrypoint(ctx: JobContext):
    logger.info(f"Connecting to LiveKit room: {ctx.room.name}")
    
    # Connect to room (AgentSession handles audio publication & subscription)
    await ctx.connect(auto_subscribe=AutoSubscribe.SUBSCRIBE_ALL)

    stt_plugin = deepgram.STT(model="nova-3", language="en-US")
    llm_plugin = openai.LLM(model="gpt-4o-mini")
    vad_plugin = silero.VAD.load()

    instructions = (
        "You are an encouraging, professional AI Technical Interviewer named Dr. Sarah Vance. "
        "Keep your conversational responses direct, warm, concise, and natural (1-2 sentences). "
        "Never repeat yourself. Converse smoothly with the candidate. "
        "When the candidate answers, acknowledge their response concisely and ask the next technical question."
    )

    agent = Agent(
        instructions=instructions,
        stt=stt_plugin,
        vad=vad_plugin,
        llm=llm_plugin,
        tts=tts_engine,
    )

    session = AgentSession(
        turn_handling=TurnHandlingOptions(
            endpointing=EndpointingOptions(min_delay=0.5, max_delay=2.5),
            interruption=InterruptionOptions(enabled=True),
        )
    )

    @session.on("user_input_transcribed")
    def on_transcript(event):
        if event.is_final:
            logger.info(f"🎤 [Candidate Said]: {event.transcript}")

    @session.on("agent_state_changed")
    def on_agent_state(state):
        logger.info(f"🤖 [Agent State]: {state}")

    @session.on("user_state_changed")
    def on_user_state(state):
        logger.info(f"👤 [User State]: {state}")

    @session.on("error")
    def on_error(err):
        logger.error(f"⚠️ [Session Error]: {err}")

    # Set close_on_disconnect=False so the agent doesn't prematurely die if candidate reconnects
    room_options = room_io.RoomOptions(close_on_disconnect=False)
    await session.start(agent, room=ctx.room, room_options=room_options)
    logger.info("Voice session started.")

    # Re-link audio stream if participant connects or reconnects
    @ctx.room.on("participant_connected")
    def on_participant_connected(participant):
        logger.info(f"👤 Candidate connected: {participant.identity}")
        if hasattr(session, "_room_io") and session._room_io:
            session._room_io.set_participant(participant.identity)

    # Wait for the candidate participant to join the room before speaking greeting
    async def initial_greeting():
        try:
            logger.info("⏳ Waiting for candidate participant to join room...")
            participant = await ctx.wait_for_participant()
            logger.info(f"👤 Candidate joined: {participant.identity}. Preparing initial greeting...")
            
            # Allow audio track publication and WebRTC connection to stabilize
            await asyncio.sleep(1.0)
            
            logger.info("🔊 Generating initial greeting speech...")
            handle = session.say("Hi there! I'm Dr. Sarah Vance, your AI interviewer. How are you doing today?")
            await handle
            logger.info("🔊 Greeting speech playback completed.")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Greeting error: {e}", exc_info=True)

    asyncio.create_task(initial_greeting())

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(server)
