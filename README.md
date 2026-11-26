# InterviewAI — Open Source AI Technical Interviewer

> **An open-source, autonomous, resume-aware mock technical interview platform.** Powered by full-duplex WebRTC audio streaming, dynamic resume indexing, computer vision presence verification, and native desktop environment monitoring.

---

## 📌 Executive Summary (For Recruiters, Hiring Managers & Developers)

**InterviewAI** is an open-source AI-powered technical interviewer application packaged as a native desktop client. Unlike traditional static question-and-answer chatbots, InterviewAI conducts **natural, spoken-dialogue technical interviews in real-time** with sub-second latency.

It dynamically inspects the candidate's uploaded resume (PDF/text), tailors in-depth technical questions to their real-world project experience, guides them through an autonomous **4-step onboarding protocol**, and continuously monitors camera presence and active desktop applications to simulate an authentic, professional technical assessment.

---

## ✨ Key Highlights

- ⚡ **Low-Latency Full-Duplex Voice**: Natural conversational back-and-forth powered by **LiveKit WebRTC**, **Deepgram Nova-3 STT**, **Silero VAD**, and **OpenAI GPT-4o-mini**, with full interruption support.
- 🎯 **Resume-Aware Dynamic Interviewing**: Parses PDF resumes in real-time, extracts candidate skills, career timeline, and project achievements, and injects personalized context into the AI interviewer persona (*Sarah Mitchell, Principal Engineer*).
- 👁️ **Computer Vision Presence Detection**: Integrated **OpenCV** vision pipeline (Haar Cascades + CLAHE adaptive contrast) automatically verifies candidate frame presence and alerts if the webcam is obscured or unattended.
- 🖥️ **Desktop Environment Awareness**: Native macOS application detection (`lsappinfo` / AppleScript) identifies open third-party software (e.g., ChatGPT, browsers, terminals) and issues courteous voice advisories to minimize distractions.
- 🌊 **Physics-Driven Audio Visualizer**: Siri-style, reactive soundwave visualizer rendered at 60 FPS using real-time Web Audio API frequency analysis.
- 🎙️ **Dual-Engine Speech Synthesis**: High-fidelity neural voice powered by **OpenAI TTS (`nova`)** paired with a zero-cloud local fallback engine powered by **Piper TTS**.
- 📜 **Full Conversation Transcript Logging**: Automatically captures and records time-stamped candidate and interviewer turns into `conversation.log` for post-interview review.

---

## 🏛️ System Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          ELECTRON DESKTOP APP                           │
│  ┌─────────────────────────┐           ┌─────────────────────────────┐  │
│  │    React + TypeScript   │           │    Electron Main Process    │  │
│  │  - Physics Audio Wave   │  IPC /    │  - Native macOS App Monitor │  │
│  │  - Resume Parser (PDF)  │  Events   │  - LiveKit Auth Token Gen   │  │
│  │  - MediaStream / Video  │◄─────────►│  - Conversation Logger      │  │
│  └────────────▲────────────┘           └──────────────▲──────────────┘  │
└───────────────┼───────────────────────────────────────┼─────────────────┘
                │ WebRTC Audio & Data Channels          │
                ▼                                       ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                        LIVEKIT REAL-TIME CLUSTER                        │
│                 Low-Latency Media & Data Transport                      │
└───────────────────────────────────▲─────────────────────────────────────┘
                                    │ WebRTC RPC / Events
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       PYTHON AI AGENT WORKER                            │
│  ┌───────────────────────────────────────────────────────────────────┐  │
│  │               Sarah Mitchell (Interviewer Controller)             │  │
│  ├─────────────────┬───────────────────┬─────────────────────────────┤  │
│  │  Deepgram Nova3 │  OpenAI GPT-4o    │  OpenAI TTS / Piper TTS     │  │
│  │  Streaming STT  │  Mini LLM Engine  │  Neural Voice Synthesis     │  │
│  ├─────────────────┴───────────────────┴─────────────────────────────┤  │
│  │                 OpenCV Facial Presence Engine                     │  │
│  │         (Haar Cascades + CLAHE Contrast Normalization)            │  │
│  └───────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 🛠️ Tech Stack & Tools

| Layer | Technologies | Purpose |
| :--- | :--- | :--- |
| **Frontend UI** | **React 18**, **TypeScript**, **Tailwind CSS**, **Lucide Icons** | Ultra-responsive, dark-mode interview chamber UI |
| **Desktop Shell** | **Electron 34**, **Node.js** | Native macOS window management, hardware media access, IPC |
| **Real-Time Audio** | **LiveKit Client SDK**, **WebRTC**, **Web Audio API** | Real-time bidirectional audio transport and audio-level analysis |
| **Voice AI Agent** | **Python 3.13**, **LiveKit Agents Framework** | Autonomous room worker handling turn-taking and conversational logic |
| **Speech-to-Text** | **Deepgram Nova-3** | Real-time, streaming voice transcription with high technical accuracy |
| **Intelligence** | **OpenAI GPT-4o-mini** | Low-latency context-aware conversational reasoning |
| **Voice Synthesis** | **OpenAI TTS (`nova`)** + **Piper TTS (ONNX)** | Natural human-like speech output with local offline fallback |
| **Voice Activity** | **Silero VAD** | Fast, reliable speech boundary and interruption detection |
| **Computer Vision** | **OpenCV (`cv2`)**, **NumPy** | Real-time webcam candidate face detection and coverage validation |
| **System Sensing** | **macOS `lsappinfo`**, **AppleScript** | Non-invasive desktop process identification |

---

## 🔄 User Journey & Onboarding Flow

1. **Role Selection & Resume Ingestion**:
   - Candidate selects their target specialization (e.g., *Full Stack Developer*, *Backend Engineer*, *AI/ML Engineer*).
   - Candidate drops their PDF resume, triggering client-side text extraction and entity recognition for programming languages, frameworks, databases, and work history.

2. **The 4-Step Verification Sequence**:
   - **Step 1 (Personalized Welcome)**: AI addresses the candidate by name and welcomes them to the role-specific session.
   - **Step 2 (Environment Diagnostics)**: Desktop scanner identifies running external programs and provides voice guidance to close distracting apps.
   - **Step 3 (Camera Calibration)**: OpenCV processes candidate camera frames to confirm lighting, clarity, and facial presence.
   - **Step 4 (Technical Kickoff)**: AI initiates the technical interview with an open-ended question targeted specifically at projects highlighted in the uploaded resume.

3. **Active Technical Dialogue**:
   - Candidate responds naturally by voice; the AI acknowledges answers, probes trade-offs, and transitions smoothly across topics without unnatural pauses or scripted responses.

---

## ⚡ Quick Start (Running Locally)

### Prerequisites
- **Node.js** (v18+ or v20+)
- **Python** (v3.10+)
- **LiveKit Server** (`brew install livekit` on macOS or via Docker)

### 1. Clone & Configure Environment
```bash
git clone https://github.com/your-username/interview-ai.git
cd interview-ai

# Create .env file with your API keys
cat <<EOF > .env
OPENAI_API_KEY=your_openai_key_here
DEEPGRAM_API_KEY=your_deepgram_key_here
LIVEKIT_URL=ws://127.0.0.1:7880
LIVEKIT_API_KEY=devkey
LIVEKIT_API_SECRET=secret
USE_OPENAI_TTS=true
EOF
```

### 2. Install Desktop Dependencies
```bash
cd apps/desktop
npm install
```

### 3. Setup Python Agent
```bash
cd ../../apps/agent
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

### 4. Start the Services
Run each service in a separate terminal tab:

```bash
# Terminal 1: LiveKit Local Server
livekit-server --dev
# (or from root: npm run livekit:dev)

# Terminal 2: Python AI Agent Worker
cd apps/agent
source .venv/bin/activate
python agent.py dev
# (or from root: npm run agent:start)

# Terminal 3: Electron Desktop App
cd apps/desktop
npm run electron:dev
# (or from root: npm run electron:dev)
```

---

## 💡 Key Engineering Challenges & Solutions

### 1. Sub-Second Conversational Latency
* **Challenge**: Standard cloud voice bots exhibit multi-second latency (STT -> LLM -> TTS), causing awkward pauses.
* **Solution**: Integrated LiveKit Agents with streaming Deepgram Nova-3 transcription and Silero VAD, enabling instant barge-in/interruption capabilities and sub-second speech turnaround.

### 2. Deterministic Resume Context Without Prompt Bloat
* **Challenge**: Passing an entire unformatted resume directly into every LLM turn increases latency and cost.
* **Solution**: Developed a multi-tier client-side parser that categorizes key skills into domains (Languages, Frontend, Backend, Cloud/DevOps, Architecture) and extracts top projects to inject concise, high-value prompt instructions.

### 3. Zero-Dependency Computer Vision Reliability
* **Challenge**: Heavy neural-network vision models require significant memory and GPU resources on client machines.
* **Solution**: Engineered an OpenCV presence detector using multi-scale Haar Cascades combined with CLAHE (Contrast Limited Adaptive Histogram Equalization) to maintain reliable facial detection under variable lighting conditions with minimal CPU overhead.

### 4. Resilient Speech Synthesis Fallback
* **Challenge**: Cloud TTS rate limits or network drops can freeze the interview dialogue.
* **Solution**: Implemented a fallback adapter pairing cloud neural TTS (OpenAI) with an embedded ONNX-based local Piper TTS engine, ensuring speech generation continues even during transient network degradation.

---

## 📁 Repository Structure

```text
interivew-ai/
├── apps/
│   ├── desktop/                 # Electron + React Desktop Application
│   │   ├── electron/            # Main process, macOS system monitor, IPC
│   │   └── src/
│   │       ├── components/      # AiVisualizer, UI controls
│   │       ├── hooks/           # useLiveKitVoice WebRTC integration
│   │       ├── pages/           # SetupPage, MeetingPage
│   │       ├── stores/          # Zustand global state management
│   │       └── utils/           # Resume parser, system client, logger
│   └── agent/                   # LiveKit Python Agent Worker
│       ├── agent.py             # Voice agent logic, prompts, session handlers
│       ├── presence_detector.py # OpenCV face detection pipeline
│       └── piper_tts.py         # Local neural TTS ONNX adapter
├── assets/                      # Piper ONNX voice models
├── packages/                    # Monorepo shared packages
├── conversation.log             # Live session transcript output
└── README.md
```

---

## 👨‍💻 Author & Contact

Developed as a demonstration of real-time multi-modal AI systems, WebRTC engineering, and desktop-native application architecture.

- **Developer**: Subhajit Ghosh
- **Focus Areas**: Full Stack Engineering, Voice AI, Distributed Systems, Real-Time WebRTC Applications
