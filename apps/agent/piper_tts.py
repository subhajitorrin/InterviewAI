import asyncio
import io
import wave
import uuid
import subprocess
from pathlib import Path
from typing import Optional

from livekit.agents import tts, APIConnectOptions, DEFAULT_API_CONNECT_OPTIONS
from livekit.agents.tts import AudioEmitter, ChunkedStream

class PiperTTS(tts.TTS):
    """
    Local Piper Neural TTS implementation for LiveKit Agents.
    Runs completely offline using onnxruntime and local Piper voice models.
    """

    def __init__(
        self,
        *,
        model_path: str = "assets/piper-voices/en_US-lessac-medium.onnx",
        config_path: Optional[str] = None,
        piper_bin: str = "apps/agent/.venv/bin/piper",
    ):
        self._model_path = Path(model_path).resolve()
        self._config_path = (
            Path(config_path).resolve()
            if config_path
            else Path(f"{self._model_path}.json")
        )
        self._piper_bin = Path(piper_bin).resolve()

        # Lessac medium is 22050Hz mono 16-bit PCM
        super().__init__(
            capabilities=tts.TTSCapabilities(streaming=False),
            sample_rate=22050,
            num_channels=1,
        )

    @property
    def model(self) -> str:
        return "piper-en_US-lessac-medium"

    @property
    def provider(self) -> str:
        return "local-piper"

    def synthesize(
        self, text: str, *, conn_options: APIConnectOptions = DEFAULT_API_CONNECT_OPTIONS
    ) -> ChunkedStream:
        return _PiperChunkedStream(
            tts=self,
            input_text=text,
            conn_options=conn_options,
            model_path=str(self._model_path),
            piper_bin=str(self._piper_bin),
        )


class _PiperChunkedStream(ChunkedStream):
    def __init__(
        self,
        *,
        tts: tts.TTS,
        input_text: str,
        conn_options: APIConnectOptions,
        model_path: str,
        piper_bin: str,
    ):
        super().__init__(tts=tts, input_text=input_text, conn_options=conn_options)
        self._model_path = model_path
        self._piper_bin = piper_bin

    async def _run(self, output_emitter: AudioEmitter) -> None:
        text = self._input_text.strip()
        if not text:
            return

        cmd = [
            self._piper_bin,
            "-m",
            self._model_path,
            "--length-scale",
            "1.05",
            "--noise-scale",
            "0.667",
            "--noise-w-scale",
            "0.8",
            "--sentence-silence",
            "0.2",
            "--output-raw",  # raw 16-bit 22050Hz mono PCM directly to stdout
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdin=asyncio.subprocess.PIPE,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        stdout_data, stderr_data = await proc.communicate(input=text.encode("utf-8"))

        if proc.returncode != 0:
            err_msg = stderr_data.decode("utf-8", errors="replace")
            raise RuntimeError(f"Piper TTS synthesis failed ({proc.returncode}): {err_msg}")

        output_emitter.initialize(
            request_id=str(uuid.uuid4()),
            sample_rate=self._tts.sample_rate,
            num_channels=self._tts.num_channels,
            mime_type="audio/pcm",
            frame_size_ms=50,
            stream=False,
        )

        if stdout_data:
            output_emitter.push(stdout_data)
        output_emitter.flush()
