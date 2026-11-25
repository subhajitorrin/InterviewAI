# InterviewAI — Real-Time Autonomous AI Interviewer & Copilot

An autonomous, resume-aware, real-time AI mock interview platform with desktop context awareness, local speech generation (Piper TTS), low-latency streaming STT (Deepgram), computer vision presence detection (MediaPipe), and structured evaluation analytics (GPT-4o-mini + SQLite).

---

## 🌟 Architecture Overview

```
             ELECTRON DESKTOP APP
                      │
          React + TypeScript UI
                      │
             Electron Main Process
                      │
          ─────────────────────────
          │           │           │
       Camera     Application   Resume
       Monitor     Detection    Parser
          │           │           │
          ─────────────────────────
                      │
                LIVEKIT AGENT
                      │
             Interview Controller
                      │
          ─────────────────────────
          │           │           │
       Deepgram   GPT-4o-mini    Piper
         STT          LLM         TTS
          │           │           │
          ─────────────────────────
                      │
               Interview Report
                      │
                   SQLite
```

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
cd apps/desktop
npm install
```

### 2. Start the Interactive UI
```bash
npm run dev
```
Open [http://localhost:5173](http://localhost:5173) in your browser or launch inside the Electron desktop shell.

### 3. Launch inside Electron Desktop Window
```bash
npm run electron:compile
npm run electron:start
```

---

## 🖥️ UI Workflow Screens

1. **Role Selection (`/role_selection`):** Choose target engineering roles (Full Stack, AI/LLM Systems, Distributed Systems, Frontend Architect) with dynamic skill tagging.
2. **Resume Parser (`/resume_upload`):** Upload candidate PDF resumes with instantaneous skill entity extraction, project categorization, and profiling. Includes a 1-click sample resume.
3. **Pre-Flight Hardware & Vision (`/pre_flight`):** Interactive webcam diagnostic with MediaPipe face tracking reticle, real-time microphone VU level meter, and background macOS application scanner.
4. **Live Interview Chamber (`/live_interview`):**
   - **Left:** AI interviewer avatar with reactive audio waveforms, Piper TTS synthesis indicators, and current question rationale.
   - **Right:** Candidate chamber with face-tracking bounding box, streaming transcription feed (Deepgram Nova-2 style), push-to-talk voice emulation chips, and control buttons.
5. **Scorecard & Analytics (`/report`):** Comprehensive candidate scorecard with composite rating (e.g. 89/100 Strong Hire), competency progress breakdown, top strengths, actionable growth areas, and question-by-question critique.
