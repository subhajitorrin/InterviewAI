import os
import json
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
    logger.info("Using OpenAI Neural TTS ('nova' - female) with local Piper fallback")
    openai_tts = openai.TTS(model="tts-1", voice="nova")
    tts_engine = tts.FallbackAdapter([openai_tts, local_piper_tts])
else:
    logger.info("Using Local Piper Neural TTS ('en_US-lessac' - female)")
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
        "You are Sarah Mitchell, a Principal Software Engineer and executive AI technical interviewer at a top technology company. "
        "Keep your conversational responses direct, warm, concise, and natural (1-2 sentences). "
        "Never repeat yourself. Converse smoothly with the candidate. "
        "Acknowledge their responses thoughtfully and progress through the technical interview plan."
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
        logger.info(f"👤 Candidate connected: {participant.identity}, metadata: {participant.metadata}")
        if hasattr(session, "_room_io") and session._room_io:
            session._room_io.set_participant(participant.identity)

    # Wait for candidate and media pipeline to be completely ready before speaking greeting
    async def initial_greeting():
        try:
            logger.info("⏳ Waiting for candidate participant to join room...")
            candidate = await ctx.wait_for_participant()
            logger.info(f"👤 Candidate participant detected: {candidate.identity}")
            
            # Extract candidate metadata (passed in token)
            candidate_name = candidate.name or "Candidate"
            role = "Software Engineer"
            skills_str = "distributed systems, cloud architecture, and modern full-stack development"
            top_project = "key production systems"
            plan_summary = "5-stage technical interview"

            if candidate.metadata:
                try:
                    meta = json.loads(candidate.metadata)
                    if meta.get("candidateName"):
                        candidate_name = meta["candidateName"]
                    if meta.get("role"):
                        role = meta["role"]
                    if meta.get("skills"):
                        skills_list = meta["skills"]
                        if isinstance(skills_list, list) and skills_list:
                            skills_str = ", ".join(skills_list[:4])
                    if meta.get("projects"):
                        proj_list = meta["projects"]
                        if isinstance(proj_list, list) and proj_list and isinstance(proj_list[0], dict):
                            top_project = proj_list[0].get("title", top_project)
                    if meta.get("plan") and isinstance(meta["plan"], dict):
                        plan_phases = meta["plan"].get("phases", [])
                        if plan_phases:
                            plan_summary = "; ".join([f"Phase {p.get('phaseNumber')}: {p.get('title')}" for p in plan_phases])
                except Exception as meta_err:
                    logger.warning(f"Error parsing candidate metadata: {meta_err}")

            # Concise instructions to keep token usage low
            agent.instructions = (
                f"You are Sarah Mitchell, technical interviewer for {candidate_name} ({role}). "
                f"Resume context: {skills_str}. "
                f"Rules: Keep every response direct and under 2 sentences. Address {candidate_name} by name, acknowledge answers concisely, and ask one focused technical question at a time."
            )

            # Wait for RoomIO to complete audio setup and publish the audio track
            if hasattr(session, "_room_io") and session._room_io:
                logger.info("⏳ Waiting for RoomIO audio output to be ready...")
                await session._room_io.wait_for_ready()
                
                # Wait for remote candidate to subscribe to the agent's audio track
                sub_fut = session._room_io.subscribed_fut
                if sub_fut:
                    try:
                        logger.info("⏳ Waiting for candidate to subscribe to AI voice track...")
                        await asyncio.wait_for(asyncio.shield(sub_fut), timeout=6.0)
                        logger.info("✅ Candidate subscribed to AI voice track!")
                    except asyncio.TimeoutError:
                        logger.warning("Subscription wait timed out; continuing to speech")

            # Small 0.5s pause to ensure browser audio element is unmuted and attached
            await asyncio.sleep(0.5)
            
            logger.info(f"🔊 Starting 4-step verification & greeting sequence for {candidate_name}...")
            has_name = bool(candidate_name and candidate_name.lower() != "candidate")
            display_name = candidate_name if has_name else "there"

            # Step 1: Greetings with name
            logger.info("🔊 Step 1: Greeting with name")
            step1 = f"Hi {display_name}! Welcome to your {role} interview."
            handle1 = session.say(step1, allow_interruptions=False)
            await handle1
            await asyncio.sleep(0.8)

            # Step 2: Desktop environment check
            logger.info("🔊 Step 2: Desktop environment check")
            step2 = "Let me check your desktop environment. I can see several applications are active; you can close any applications that are not relevant to our interview."
            handle2 = session.say(step2, allow_interruptions=False)
            await handle2
            await asyncio.sleep(0.8)

            # Step 3: Webcam test
            logger.info("🔊 Step 3: Webcam test")
            step3 = "Now let me test your webcam."
            handle3 = session.say(step3, allow_interruptions=False)
            await handle3
            await asyncio.sleep(1.2)

            # Step 4: All good confirmation & technical kick-off question
            logger.info("🔊 Step 4: All good & kickoff")
            step4 = f"All good! Let's start with the interview. To kick things off, tell me about your experience with {skills_str} and walk me through your key project, {top_project}."
            handle4 = session.say(step4, allow_interruptions=False)
            await handle4
            logger.info("🔊 4-step onboarding sequence playback completed.")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Greeting error: {e}", exc_info=True)

    asyncio.create_task(initial_greeting())

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(server)
