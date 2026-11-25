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
)
from livekit.plugins import deepgram, silero, openai
from piper_tts import PiperTTS

logger = logging.getLogger("interview-agent")
logging.basicConfig(level=logging.INFO)

# Initialize Piper TTS (local ONNX neural voice)
voice_path = Path(__file__).parent.parent.parent / "assets" / "piper-voices" / "en_US-lessac-medium.onnx"
piper = PiperTTS(
    model_path=str(voice_path),
    piper_bin=str(Path(__file__).parent / ".venv" / "bin" / "piper"),
)

# STT: Deepgram Nova-2 (real-time streaming speech-to-text)
# Falls back gracefully or prompts for DEEPGRAM_API_KEY
deepgram_api_key = os.environ.get("DEEPGRAM_API_KEY", "")
openai_api_key = os.environ.get("OPENAI_API_KEY", "")

server = AgentServer()

@server.rtc_session(agent_name="interview_agent")
async def entrypoint(ctx: JobContext):
    logger.info(f"Connecting to LiveKit room: {ctx.room.name}")
    
    # Automatically subscribe to user audio & video tracks
    await ctx.connect(auto_subscribe=AutoSubscribe.AUDIO_ONLY)

    stt_plugin = deepgram.STT(model="nova-2-general") if deepgram_api_key else deepgram.STT()
    llm_plugin = openai.LLM(model="gpt-4o-mini") if openai_api_key else openai.LLM()
    vad_plugin = silero.VAD.load()

    # Define conversational interviewer instructions
    instructions = (
        "You are an encouraging, professional AI Technical Interviewer named Dr. Sarah Vance. "
        "Keep your conversational responses direct, warm, concise, and natural (1-3 sentences). "
        "Your goal is to converse smoothly over voice with the candidate in a real-time Zoom-style call. "
        "Acknowledge the candidate's remarks concisely and ask natural follow-up questions."
    )

    agent = Agent(
        instructions=instructions,
        stt=stt_plugin,
        vad=vad_plugin,
        llm=llm_plugin,
        tts=piper,
    )

    session = AgentSession()
    await session.start(agent, room=ctx.room)
    logger.info("Voice session started successfully. Waiting for candidate to speak...")

if __name__ == "__main__":
    from livekit.agents.worker import AgentServer
    asyncio.run(server.run())
