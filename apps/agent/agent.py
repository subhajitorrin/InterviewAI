import os
import json
import time
import asyncio
import logging
from pathlib import Path
from datetime import datetime
from dotenv import load_dotenv

# Load environment variables (.env)
load_dotenv()

# Workspace Root Log File
LOG_FILE_PATH = Path(__file__).resolve().parent.parent.parent / "conversation.log"
_last_logged_entry = None

def init_conversation_log(candidate_name: str, role: str):
    global _last_logged_entry
    _last_logged_entry = None
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
    global _last_logged_entry
    try:
        clean_text = str(text).strip()
        if not clean_text:
            return
        entry = (speaker, clean_text)
        if _last_logged_entry == entry:
            return
        _last_logged_entry = entry
        timestamp = datetime.now().strftime("%H:%M:%S")
        with open(LOG_FILE_PATH, "a", encoding="utf-8") as f:
            f.write(f"[{timestamp}] [{speaker}]: {clean_text}\n")
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

    # Ultra-low latency pipeline configuration:
    # 1. Deepgram Nova-3 with no_delay, interim_results, and aggressive endpointing
    stt_plugin = deepgram.STT(
        model="nova-3",
        language="en-US",
        no_delay=True,
        interim_results=True,
        filler_words=False,
        endpointing_ms=15,
    )
    # 2. Fast token streaming with gpt-4o-mini capped at 120 completion tokens
    llm_plugin = openai.LLM(
        model="gpt-4o-mini",
        max_completion_tokens=120,
        temperature=0.6,
    )
    # 3. Fast Silero VAD end-of-speech detection (reduced from 550ms default to 250ms)
    vad_plugin = silero.VAD.load(
        min_silence_duration=0.25,
        prefix_padding_duration=0.2,
        activation_threshold=0.45,
    )

    instructions = (
        "You are Sarah Mitchell, a Principal Software Engineer and executive AI technical interviewer at a top technology company. "
        "Keep your conversational responses direct, warm, concise, and natural (1-2 sentences). "
        "Never repeat yourself. Converse smoothly with the candidate. "
        "Progress methodically through each interview phase without getting stuck on any single detail."
    )

    agent = Agent(
        instructions=instructions,
        stt=stt_plugin,
        vad=vad_plugin,
        llm=llm_plugin,
        tts=tts_engine,
    )

    # 4. Turn handling: reduced endpointing delay from 500ms down to 150ms for instant response
    session = AgentSession(
        turn_handling=TurnHandlingOptions(
            endpointing=EndpointingOptions(min_delay=0.15, max_delay=1.2),
            interruption=InterruptionOptions(enabled=True),
        )
    )

    candidate_info = {"name": "Candidate", "role": "Software Engineer"}
    user_speech_stopped_time = 0.0

    @session.on("user_input_transcribed")
    def on_transcript(event):
        nonlocal user_speech_stopped_time
        if event.is_final and event.transcript.strip():
            logger.info(f"🎤 [Candidate Said]: {event.transcript}")
            append_conversation_log(f"Candidate ({candidate_info['name']})", event.transcript.strip())
            # Backup speech stop timestamp when final transcript is emitted
            if user_speech_stopped_time == 0.0:
                user_speech_stopped_time = time.perf_counter()

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

    @session.on("user_state_changed")
    def on_user_state(event):
        nonlocal user_speech_stopped_time
        try:
            new_st = getattr(event, "new_state", str(event))
            old_st = getattr(event, "old_state", "")
            logger.info(f"👤 [User State]: {old_st} -> {new_st}")
            # When candidate stops talking (transitions from speaking to listening)
            if new_st == "listening" and old_st == "speaking":
                user_speech_stopped_time = time.perf_counter()
        except Exception as e:
            logger.debug(f"User state tracking notice: {e}")

    @session.on("agent_state_changed")
    def on_agent_state(event):
        nonlocal user_speech_stopped_time
        try:
            new_st = getattr(event, "new_state", str(event))
            old_st = getattr(event, "old_state", "")
            logger.info(f"🤖 [Agent State]: {old_st} -> {new_st}")
            # When AI starts speaking in response to candidate
            if new_st == "speaking" and user_speech_stopped_time > 0.0:
                turnaround_ms = round((time.perf_counter() - user_speech_stopped_time) * 1000)
                user_speech_stopped_time = 0.0
                if 50 < turnaround_ms < 15000:
                    metrics_state["last_latency_ms"] = turnaround_ms
                    logger.info(f"⚡ [User-to-AI Voice Turnaround Latency]: {turnaround_ms} ms")
                    asyncio.create_task(broadcast_metrics())
        except Exception as e:
            logger.debug(f"Agent state tracking notice: {e}")

    @session.on("error")
    def on_error(err):
        logger.error(f"⚠️ [Session Error]: {err}")

    # Track live OpenAI usage and latency metrics
    metrics_state = {
        "prompt_tokens": 0,
        "completion_tokens": 0,
        "total_tokens": 0,
        "tts_chars": 0,
        "total_cost": 0.0,
        "last_latency_ms": 0,
    }

    async def broadcast_metrics():
        try:
            payload = json.dumps({
                "type": "openai_metrics",
                "cost": round(metrics_state["total_cost"], 5),
                "costFormatted": f"${metrics_state['total_cost']:.4f}",
                "latencyMs": metrics_state["last_latency_ms"],
                "totalTokens": metrics_state["total_tokens"],
                "promptTokens": metrics_state["prompt_tokens"],
                "completionTokens": metrics_state["completion_tokens"],
                "model": "gpt-4o-mini",
            })
            await ctx.room.local_participant.publish_data(payload, reliable=True)
        except Exception as e:
            logger.debug(f"Broadcast metrics error: {e}")

    @session.on("metrics_collected")
    def on_metrics_collected(event):
        try:
            m = getattr(event, "metrics", None)
            if not m:
                return

            m_type = getattr(m, "type", "")
            updated = False

            if m_type == "llm_metrics":
                p_tokens = getattr(m, "prompt_tokens", 0) or 0
                c_tokens = getattr(m, "completion_tokens", 0) or 0
                ttft = getattr(m, "ttft", 0.0) or 0.0
                duration = getattr(m, "duration", 0.0) or 0.0

                metrics_state["prompt_tokens"] += p_tokens
                metrics_state["completion_tokens"] += c_tokens
                metrics_state["total_tokens"] = metrics_state["prompt_tokens"] + metrics_state["completion_tokens"]

                # gpt-4o-mini pricing: $0.15 / 1M prompt, $0.60 / 1M completion
                llm_cost = (p_tokens * (0.15 / 1_000_000)) + (c_tokens * (0.60 / 1_000_000))
                metrics_state["total_cost"] += llm_cost

                # Only use TTFT as initial fallback if voice turnaround latency has not been measured yet
                if metrics_state["last_latency_ms"] == 0:
                    latency = ttft if ttft > 0 else duration
                    if latency > 0:
                        metrics_state["last_latency_ms"] = round(latency * 1000)

                updated = True

            elif m_type == "tts_metrics":
                chars = getattr(m, "characters_count", 0) or 0
                if chars > 0:
                    metrics_state["tts_chars"] += chars
                    # If using OpenAI TTS (tts-1): $15.00 / 1M characters
                    if use_openai_tts:
                        tts_cost = chars * (15.0 / 1_000_000)
                        metrics_state["total_cost"] += tts_cost
                    updated = True

            if updated:
                asyncio.create_task(broadcast_metrics())
        except Exception as e:
            logger.warning(f"Error processing metrics: {e}")

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
                now = asyncio.get_event_loop().time()
                # Cooldown of 12 seconds between warnings so it reliably triggers when away for >5s without continuous rapid spam
                last_warn = getattr(on_data_received, "_last_presence_warn", 0)
                if not getattr(session, "_closing", False) and not is_present and (now - last_warn > 12):
                    on_data_received._last_presence_warn = now
                    warn_presence = "You aren't visible in front of the camera. Please make sure you are in frame."
                    logger.warning(f"⚠️ OpenCV presence alert: {reason}")
                    append_conversation_log("SYSTEM ALERT", f"OpenCV camera check: {reason}")
                    append_conversation_log("AI (Sarah Mitchell)", warn_presence)
                    session.say(warn_presence, allow_interruptions=False)
        except Exception as e:
            logger.warning(f"Error handling data packet: {e}")

    # Helper to broadcast step changes to the frontend UI
    async def broadcast_step(step_name: str, message: str, phase_index: int = None):
        try:
            payload_dict = {"type": "step", "step": step_name, "message": message}
            if phase_index is not None:
                payload_dict["phaseIndex"] = phase_index
            payload = json.dumps(payload_dict)
            await ctx.room.local_participant.publish_data(payload, reliable=True)
        except Exception as e:
            logger.debug(f"Broadcast step error: {e}")

    # Helper to speak onboarding steps safely without throwing unhandled exceptions
    async def speak_safe(text: str, allow_interruptions: bool = False, add_to_chat_ctx: bool = True):
        try:
            handle = session.say(text, allow_interruptions=allow_interruptions, add_to_chat_ctx=add_to_chat_ctx)
            await handle
        except Exception as e:
            logger.warning(f"Speech playback notice: {e}")

    # Reliable 4-step onboarding flow executed directly through the AI voice
    async def initial_greeting():
        try:
            logger.info("⏳ Waiting for candidate participant to join room...")
            candidate = await ctx.wait_for_participant()
            logger.info(f"👤 Candidate participant detected: {candidate.identity}")
            await broadcast_metrics()
            
            # Extract candidate metadata (passed in token)
            candidate_name = candidate.name or "Candidate"
            role = "Software Engineer"
            skills_str = "modern full-stack development and distributed systems"
            top_project = "production systems"
            experience_str = ""
            active_apps: list[str] = []
            plan_obj = None

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
                            skills_str = ", ".join(skills_list[:8])
                    if meta.get("projects"):
                        proj_list = meta["projects"]
                        if isinstance(proj_list, list) and proj_list:
                            proj_titles = [p.get("title", "") for p in proj_list if isinstance(p, dict) and p.get("title")][:3]
                            if proj_titles:
                                top_project = " and ".join(proj_titles)
                    if meta.get("experience"):
                        exp_list = meta["experience"]
                        if isinstance(exp_list, list) and exp_list:
                            exp_items = [f"{e.get('role')} at {e.get('company')}" for e in exp_list if isinstance(e, dict) and e.get('role') and e.get('company')][:2]
                            if exp_items:
                                experience_str = "; ".join(exp_items)
                    if meta.get("activeApps") and isinstance(meta["activeApps"], list):
                        active_apps = [a for a in meta["activeApps"] if a not in ("loginwindow", "WindowManager", "Dock")]
                    if meta.get("plan"):
                        plan_obj = meta["plan"]
                except Exception as meta_err:
                    logger.warning(f"Error parsing candidate metadata: {meta_err}")

            candidate_info["name"] = candidate_name
            candidate_info["role"] = role
            init_conversation_log(candidate_name, role)

            # Extract or build tailored questions from plan phases
            q_intro = "To kick things off, could you give me a short introduction about yourself, your background, and what you've been working on recently?"
            q_project = f"On your resume, you highlighted {top_project}. Walk me through its architecture and how you handled concurrency, state, and scaling."
            q_tech = f"In your work with {skills_str}, how do you structure your code to ensure strict type boundaries, reliability, and error handling?"
            q_system = "Let's work through a practical scenario: How would you architect a high-throughput, fault-tolerant event processing pipeline designed for sub-100 millisecond latency under sudden traffic spikes?"
            q_incident = "Walk me through a high-severity production outage or complex technical bug you personally diagnosed and fixed. What was the root cause and what safeguards did you put in place?"
            q_closing = f"Thank you for sharing your experience today, {candidate_name}! What questions do you have for me regarding our architecture, team, or engineering culture?"

            if plan_obj and isinstance(plan_obj, dict):
                try:
                    plan_phases = plan_obj.get("phases", [])
                    if isinstance(plan_phases, list):
                        for p in plan_phases:
                            p_num = p.get("phaseNumber")
                            t_qs = p.get("tailoredQuestions", [])
                            if not t_qs:
                                continue
                            if p_num == 1 and len(t_qs) > 1:
                                q_project = t_qs[1]
                            elif p_num == 2 and len(t_qs) > 0:
                                q_tech = t_qs[0]
                            elif p_num == 3 and len(t_qs) > 0:
                                q_system = t_qs[0]
                            elif p_num == 4 and len(t_qs) > 0:
                                q_incident = t_qs[0]
                            elif p_num == 5 and len(t_qs) > 0:
                                q_closing = t_qs[0]
                except Exception as plan_err:
                    logger.warning(f"Error extracting tailored plan questions: {plan_err}")

            exp_clause = f"Work experience: {experience_str}. " if experience_str else ""

            # Senior interviewer prompt with strict progression rules (no lingering, rapid progression, 1-sentence segues)
            new_instructions = (
                f"You are Sarah Mitchell, a Principal Software Engineer and hiring manager at a top-tier tech company, conducting a real technical interview with {candidate_name} for the {role} position.\n\n"
                f"CANDIDATE CONTEXT:\n"
                f"- Name: {candidate_name}\n"
                f"- Target Role: {role}\n"
                f"- Skills: {skills_str}\n"
                f"- Highlighted Project: {top_project}\n"
                f"{exp_clause}\n\n"
                "AUDIO CHECKS, MIC TESTS & CLARIFICATIONS (CRITICAL - HIGHEST PRIORITY):\n"
                "- If the candidate asks if you can hear them (e.g., 'Can you hear me?', 'Do you hear me?', 'Am I audible?', 'Hello?', 'Testing mic', 'Are you there?'):\n"
                "  Reply clearly: 'Yes, I can hear you loud and clear! Whenever you are ready, please go ahead with your introduction.' (or prompt them for whichever question is currently active).\n"
                "  DO NOT advance to the next question! DO NOT assume their introduction or background is done! You MUST wait for their actual introduction or answer before proceeding.\n"
                "- If the candidate asks you to repeat or clarify ('Can you repeat that?', 'What did you ask?', 'What do you mean by...?'):\n"
                "  Politely repeat or clarify the current question in 1 sentence. Never jump ahead to the next stage.\n"
                "- If the candidate says 'One second', 'Hold on', or needs a moment:\n"
                "  Reply: 'Take your time, whenever you are ready!' and stay on the current question.\n"
                "- NEVER say 'Thanks for sharing that background' or acknowledge an answer unless the candidate ACTUALLY introduced themselves or answered the question!\n\n"
                "PROGRESSION RULES (WHEN CANDIDATE ANSWERS A QUESTION):\n"
                "1. NO LINGERING ON TOPICS:\n"
                "   - Once the candidate ACTUALLY answers a question or introduces themselves, give exactly ONE brief acknowledgment sentence (e.g., 'Got it, that makes sense.', 'Understood, solid architectural choice.', 'Thanks for that clear explanation.').\n"
                "   - Immediately follow with a natural transition segue into the NEXT scheduled question in the agenda.\n"
                "   - Do NOT ask repetitive or drill-down follow-up questions on the same tool or topic.\n"
                "2. RESPONSE FORMAT & LENGTH:\n"
                "   - Keep your entire response strictly under 2 sentences (at most 35 words). Never monologue.\n"
                "   - Ask ONE clear question at a time.\n"
                "3. TONE & INTERVIEWER PERSONA:\n"
                "   - Speak warmly, crisply, and professionally like an authentic senior tech lead.\n"
                "   - Use realistic transitions: 'Thanks for sharing that!', 'Shifting gears to core engineering...', 'Now let's tackle a practical system design scenario...', 'To wrap up today...'\n\n"
                "INTERVIEW AGENDA & STAGES:\n"
                "The interview starts with your kickoff asking for a short introduction.\n"
                f"- Stage 1 (Candidate Introduction):\n"
                f"  Wait for the candidate to actually introduce themselves. (If they only ask 'Do you hear me?' or check mic, confirm audio and prompt them for their introduction. Do NOT advance yet!).\n"
                f"  ONCE they introduce their background: Acknowledge warmly in 1 sentence ('Thanks for that overview, {candidate_name}!') and ask Question 1: '{q_project}'\n"
                f"- Stage 2 (Project Architecture Deep Dive):\n"
                f"  Wait for their project architecture response. ONCE they answer: Acknowledge in 1 sentence, segue, and ask Question 2: '{q_tech}'\n"
                f"- Stage 3 (Core Engineering & Tech Stack):\n"
                f"  Wait for their technical response. ONCE they answer: Acknowledge in 1 sentence, segue, and ask Question 3: '{q_system}'\n"
                f"- Stage 4 (System Design Scenario):\n"
                f"  Wait for their system design response. ONCE they answer: Acknowledge in 1 sentence, segue, and ask Question 4: '{q_incident}'\n"
                f"- Stage 5 (Production Incident & Reliability):\n"
                f"  Wait for their incident response. ONCE they answer: Acknowledge in 1 sentence, segue, and open the floor: '{q_closing}'\n"
                f"- Stage 6 (Candidate Q&A & Wrap-Up):\n"
                f"  When the candidate asks a question about the team, answer concisely in 1-2 sentences, then close warmly: 'Thank you so much for your time today, {candidate_name}! It was a pleasure speaking with you, and our recruiting team will follow up soon with next steps. Have a great day!'"
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
            await broadcast_step("greeting", step1, phase_index=0)
            await speak_safe(step1, allow_interruptions=False, add_to_chat_ctx=False)
            await asyncio.sleep(0.7)

            # --- STEP 2: DESKTOP ENVIRONMENT CHECK ---
            logger.info("🔊 Step 2: Desktop environment check")
            apps_text = ", ".join(active_apps[:4]) if active_apps else "several applications"
            step2 = f"Let me check your desktop environment. I can see {apps_text} are active. You can close any applications that are not relevant to our interview."
            append_conversation_log("AI (Sarah Mitchell)", step2)
            await broadcast_step("desktop_check", f"Desktop: {apps_text}", phase_index=0)
            await speak_safe(step2, allow_interruptions=False, add_to_chat_ctx=False)
            await asyncio.sleep(0.7)

            # --- STEP 3: WEBCAM TEST ---
            logger.info("🔊 Step 3: Webcam test")
            step3 = "Now let me test your webcam."
            append_conversation_log("AI (Sarah Mitchell)", step3)
            await broadcast_step("webcam_test", "Testing webcam & candidate presence...", phase_index=0)
            await speak_safe(step3, allow_interruptions=False, add_to_chat_ctx=False)
            await asyncio.sleep(1.0)

            # --- STEP 4: ALL GOOD, LET'S START ---
            logger.info("🔊 Step 4: All good & kickoff with introduction")
            step4 = f"All good, everything is set up. Let's get started with the interview! To kick things off, could you give me a short introduction about yourself, your background, and what you've been working on recently?"
            append_conversation_log("AI (Sarah Mitchell)", step4)
            await broadcast_step("in_progress", "Interview in progress", phase_index=0)
            await speak_safe(step4, allow_interruptions=True, add_to_chat_ctx=True)
            logger.info("🔊 4-step onboarding sequence playback completed.")
        except asyncio.CancelledError:
            pass
        except Exception as e:
            logger.error(f"Greeting error: {e}", exc_info=True)

    asyncio.create_task(initial_greeting())

if __name__ == "__main__":
    from livekit.agents import cli
    cli.run_app(server)
