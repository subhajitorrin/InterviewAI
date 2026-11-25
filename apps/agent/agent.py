import os
import json
import asyncio
import logging
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables (.env)
load_dotenv()

# Workspace Root Log File
LOG_FILE_PATH = Path(__file__).resolve().parent.parent.parent / "conversation.log"

def init_conversation_log(candidate_name: str, role: str):
    try:
        with open(LOG_FILE_PATH, "w", encoding="utf-8") as f:
            f.write("=" * 80 + "\n")
            f.write("INTERVIEW CONVERSATION LOG\n")
            f.write(f"Candidate: {candidate_name}\n")
            f.write(f"Target Role: {role}\n")
            f.write(f"Started At: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}\n")
            f.write("=" * 80 + "\n\n")
        logger.info(f"📝 Initialized fresh conversation log at: {LOG_FILE_PATH}")
    except Exception as e:
        logger.warning(f"Failed to initialize conversation log: {e}")

def append_conversation_log(speaker: str, text: str):
    try:
        if not text or not str(text).strip():
            return
        timestamp = datetime.now().strftime("%H:%M:%S")
        with open(LOG_FILE_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] [{speaker}]: {str(text).strip()}\n")
    except Exception as e:
        logger.warning(f"Failed to append to conversation log: {e}")

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

    candidate_info = {"name": "Candidate", "role": "Software Engineer"}

    @session.on("user_input_transcribed")
    def on_transcript(event):
        if event.is_final and event.transcript.strip():
            logger.info(f"🎤 [Candidate Said]: {event.transcript}")
            append_conversation_log(f"Candidate ({candidate_info['name']})", event.transcript.strip())

    @session.on("conversation_item_added")
    def on_conversation_item(event):
        try:
            item = event.item
            if hasattr(item, "role") and hasattr(item, "content"):
                role_str = str(item.role).lower()
                text = ""
                if isinstance(item.content, list):
                    text = " ".join([str(c) for c in item.content if c])
                elif isinstance(item.content, str):
                    text = item.content
                if text.strip() and ("assistant" in role_str or "agent" in role_str):
                    append_conversation_log("AI (Sarah Mitchell)", text.strip())
        except Exception as e:
            logger.warning(f"Error logging conversation item: {e}")

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

    # Listen for application monitoring warning triggers sent from desktop app
    @ctx.room.on("data_received")
    def on_data_received(data_packet):
        try:
            raw_text = data_packet.data.decode("utf-8") if isinstance(data_packet.data, (bytes, bytearray)) else str(data_packet.data)
            payload = json.loads(raw_text)
            if payload.get("type") == "app_warning":
                app_name = payload.get("appName", "an external application")
                warn_text = f"Warning: you have opened {app_name}. Please close external applications and return to the interview."
                logger.warning(f"⚠️ Application warning triggered: {app_name}")
                append_conversation_log("SYSTEM ALERT", f"Candidate opened application: {app_name}")
                append_conversation_log("AI (Sarah Mitchell)", warn_text)
                session.say(warn_text, allow_interruptions=False)
            elif payload.get("type") == "presence_result":
                is_present = payload.get("isPresent", True)
                reason = payload.get("reason", "Face or person not detected on webcam")
                if not is_present:
                    warn_presence = "You aren't visible in front of the camera. Please make sure you are in frame."
                    logger.warning(f"⚠️ OpenCV presence alert: {reason}")
                    append_conversation_log("SYSTEM ALERT", f"OpenCV camera check: {reason}")
                    append_conversation_log("AI (Sarah Mitchell)", warn_presence)
                    session.say(warn_presence, allow_interruptions=False)
        except Exception as e:
            logger.warning(f"Error handling data packet: {e}")

    # Helper to broadcast step changes to the frontend UI
    async def broadcast_step(step_name: str, message: str):
        try:
            payload = json.dumps({"type": "step", "step": step_name, "message": message})
            await ctx.room.local_participant.publish_data(payload, reliable=True)
        except Exception as e:
            logger.debug(f"Broadcast step error: {e}")

    # Helper to speak onboarding steps safely without throwing unhandled exceptions
    async def speak_safe(text: str, allow_interruptions: bool = False):
        try:
            handle = session.say(text, allow_interruptions=allow_interruptions)
            await handle
        except Exception as e:
            logger.warning(f"Speech playback notice: {e}")

    # Reliable 4-step onboarding flow executed directly through the AI voice
    async def initial_greeting():
        try:
            logger.info("⏳ Waiting for candidate participant to join room...")
            candidate = await ctx.wait_for_participant()
            logger.info(f"👤 Candidate participant detected: {candidate.identity}")
            
            # Extract candidate metadata (passed in token)
            candidate_name = candidate.name or "Candidate"
            role = "Software Engineer"
            skills_str = "modern full-stack development and distributed systems"
            top_project = "production systems"
            active_apps: list[str] = []

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
                    if meta.get("activeApps") and isinstance(meta["activeApps"], list):
                        active_apps = [a for a in meta["activeApps"] if a not in ("loginwindow", "WindowManager", "Dock")]
                except Exception as meta_err:
                    logger.warning(f"Error parsing candidate metadata: {meta_err}")

            candidate_info["name"] = candidate_name
            candidate_info["role"] = role
            init_conversation_log(candidate_name, role)

            # Concise instructions to keep OpenAI token and TTS costs low
            new_instructions = (
                f"You are Sarah Mitchell, Principal Software Engineer and technical interviewer for {candidate_name} applying for {role}. "
                f"Resume context: {skills_str}. Key project: {top_project}. "
                f"Rules: Keep every response direct and strictly under 2 sentences. Address {candidate_name} by name, acknowledge answers concisely, and ask one focused technical question at a time."
            )
            try:
                await agent.update_instructions(new_instructions)
            except Exception as inst_err:
                logger.warning(f"Failed to update agent instructions: {inst_err}")

            # Generous pause for candidate's WebRTC audio player to attach and unmute
            await asyncio.sleep(1.2)
            
            logger.info(f"🔊 Starting 4-step verification & greeting sequence for {candidate_name}...")
            has_name = bool(candidate_name and candidate_name.lower() != "candidate")
            display_name = candidate_name if has_name else "there"

            # --- STEP 1: GREETINGS WITH MY NAME ---
            logger.info("🔊 Step 1: Greeting with name")
            step1 = f"Hi {display_name}! Welcome to your {role} interview."
            append_conversation_log("AI (Sarah Mitchell)", step1)
            await broadcast_step("greeting", step1)
            await speak_safe(step1, allow_interruptions=False)
            await asyncio.sleep(0.7)

            # --- STEP 2: DESKTOP ENVIRONMENT CHECK ---
            logger.info("🔊 Step 2: Desktop environment check")
            apps_text = ", ".join(active_apps[:4]) if active_apps else "several applications"
            step2 = f"Let me check your desktop environment. I can see {apps_text} are active. You can close any applications that are not relevant to our interview."
            append_conversation_log("AI (Sarah Mitchell)", step2)
            await broadcast_step("desktop_check", f"Desktop: {apps_text}")
            await speak_safe(step2, allow_interruptions=False)
            await asyncio.sleep(0.7)

            # --- STEP 3: WEBCAM TEST ---
            logger.info("🔊 Step 3: Webcam test")
            step3 = "Now let me test your webcam."
            append_conversation_log("AI (Sarah Mitchell)", step3)
            await broadcast_step("webcam_test", "Testing webcam & candidate presence...")
            await speak_safe(step3, allow_interruptions=False)
            await asyncio.sleep(1.0)

            # --- STEP 4: ALL GOOD, LET'S START ---
            logger.info("🔊 Step 4: All good & kickoff")
            step4 = f"All good! Let's start with the interview. To kick things off, tell me about your background and your experience with {skills_str}."
            append_conversation_log("AI (Sarah Mitchell)", step4)
            await broadcast_step("in_progress", "Interview in progress")
            await speak_safe(step4, allow_interruptions=True)
            logger.info("🔊 4-step onboarding sequence playback completed.")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Greeting error: {e}", exc_info=True)

    asyncio.create_task(initial_greeting())

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(server)
