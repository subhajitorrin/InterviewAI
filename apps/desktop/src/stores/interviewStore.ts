import { create } from 'zustand';
import { 
  ParsedResumeData, 
  InterviewPlan, 
  generateInterviewPlan, 
  getSampleParsedResume,
  SAMPLE_RESUME_TEXT,
  parseResume
} from '../utils/resumeParser';

export interface MessageItem {
  id: string;
  sender: 'ai' | 'user';
  text: string;
  time: string;
}

export const ROLES_LIST = [
  'Full Stack Developer',
  'Frontend Developer',
  'Backend Engineer',
  'AI / Machine Learning Engineer',
  'DevOps / Cloud Engineer',
  'Mobile Developer (iOS/Android)',
  'System Design Architect'
];

let cachedFemaleVoice: SpeechSynthesisVoice | null = null;

function getGuaranteedFemaleVoice(): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  if (cachedFemaleVoice) return cachedFemaleVoice;

  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  // Known macOS and standard browser female voice names
  const femaleNames = [
    'Samantha', // macOS standard US Female
    'Victoria', // macOS US Female
    'Karen',    // macOS AU Female
    'Tessa',    // macOS ZA Female
    'Moira',    // macOS IE Female
    'Fiona',    // macOS Scottish Female
    'Google US English', // Chrome Female
    'Microsoft Zira',
    'Jenny',
    'Aria'
  ];

  for (const name of femaleNames) {
    const found = voices.find(v => v.name.toLowerCase().includes(name.toLowerCase()));
    if (found) {
      cachedFemaleVoice = found;
      return found;
    }
  }

  // Any English voice with female in name
  const anyFemale = voices.find(v => v.lang.startsWith('en') && /female/i.test(v.name));
  if (anyFemale) {
    cachedFemaleVoice = anyFemale;
    return anyFemale;
  }

  // Filter out any known male names on macOS/Windows/Linux:
  const maleNames = ['alex', 'fred', 'daniel', 'bruce', 'junior', 'ralph', 'albert', 'oliver', 'george', 'tom', 'guy', 'david', 'mark'];
  const nonMale = voices.find(v => v.lang.startsWith('en') && !maleNames.some(m => v.name.toLowerCase().includes(m)));
  if (nonMale) {
    cachedFemaleVoice = nonMale;
    return nonMale;
  }

  return voices[0] || null;
}

if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  window.speechSynthesis.onvoiceschanged = () => {
    cachedFemaleVoice = null;
    getGuaranteedFemaleVoice();
  };
}

export function speakSpeechFallback(text: string, onStart?: () => void, onEnd?: () => void) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
    onEnd?.();
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.05; // slightly higher pitch to guarantee clear female resonance

    const voice = getGuaranteedFemaleVoice();
    if (voice) {
      utterance.voice = voice;
    }

    utterance.onstart = () => {
      onStart?.();
    };
    utterance.onend = () => {
      onEnd?.();
    };
    utterance.onerror = () => {
      onEnd?.();
    };

    window.speechSynthesis.speak(utterance);
  } catch (e) {
    console.warn('Speech synthesis error:', e);
    onEnd?.();
  }
}

interface SimpleInterviewState {
  // Navigation: Only 2 pages
  currentPage: 'setup' | 'call';
  
  // Page 1: Setup State
  selectedRole: string;
  setSelectedRole: (role: string) => void;
  resumeFileName: string | null;
  candidateName: string;
  setCandidateName: (name: string) => void;
  parsedResume: ParsedResumeData | null;
  interviewPlan: InterviewPlan | null;
  setResumeFile: (fileName: string, candidateName?: string) => void;
  setParsedResume: (data: ParsedResumeData, fileName?: string) => void;
  useSampleResume: () => void;
  clearResume: () => void;
  regeneratePlan: () => void;

  // Page 2: Interview Call State
  isMicMuted: boolean;
  isVideoMuted: boolean;
  showCaptions: boolean;
  isAiSpeaking: boolean;
  isUserSpeaking: boolean;
  callSeconds: number;
  questionIndex: number;
  currentPhaseIndex: number;
  isPlanDrawerOpen: boolean;
  currentQuestion: string;
  subtitlesText: string;
  messages: MessageItem[];

  // Actions
  setAiSpeaking: (speaking: boolean) => void;
  setCallSeconds: (seconds: number) => void;
  incrementCallSeconds: () => void;
  togglePlanDrawer: () => void;
  setCurrentPhaseIndex: (index: number) => void;
  startInterview: () => void;
  endInterview: () => void;
  toggleMic: () => void;
  toggleVideo: () => void;
  toggleCaptions: () => void;
  submitUserSpeech: (text: string) => void;
  repeatAiQuestion: () => void;
  nextQuestion: () => void;
}

const initialRole = ROLES_LIST[0];

export const useInterviewStore = create<SimpleInterviewState>((set, get) => ({
  currentPage: 'setup',

  selectedRole: initialRole,
  setSelectedRole: (role) => {
    set({ selectedRole: role });
    const { parsedResume } = get();
    if (parsedResume) {
      const updatedPlan = generateInterviewPlan(parsedResume, role);
      set({ interviewPlan: updatedPlan });
    }
  },

  resumeFileName: null,
  candidateName: 'Candidate',
  parsedResume: null,
  interviewPlan: null,
  currentPhaseIndex: 0,
  isPlanDrawerOpen: false,

  setCandidateName: (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    set((state) => {
      const updatedResume = state.parsedResume 
        ? { ...state.parsedResume, candidateName: trimmed }
        : null;
      const updatedPlan = updatedResume 
        ? generateInterviewPlan(updatedResume, state.selectedRole)
        : null;

      return {
        candidateName: trimmed,
        parsedResume: updatedResume,
        interviewPlan: updatedPlan
      };
    });
  },

  setResumeFile: (fileName, name = 'Subhajit Ghosh') => {
    const parsed = parseResume(SAMPLE_RESUME_TEXT, fileName);
    parsed.candidateName = name;
    const plan = generateInterviewPlan(parsed, get().selectedRole);
    set({
      resumeFileName: fileName,
      candidateName: name,
      parsedResume: parsed,
      interviewPlan: plan
    });
  },

  setParsedResume: (data: ParsedResumeData, fileName?: string) => {
    const plan = generateInterviewPlan(data, get().selectedRole);
    set({
      resumeFileName: fileName || `${data.candidateName.replace(/\s+/g, '_')}_Resume.pdf`,
      candidateName: data.candidateName,
      parsedResume: data,
      interviewPlan: plan
    });
  },

  useSampleResume: () => {
    const sample = getSampleParsedResume();
    const plan = generateInterviewPlan(sample, get().selectedRole);
    set({
      resumeFileName: 'Subhajit_Ghosh_Resume.pdf',
      candidateName: sample.candidateName,
      parsedResume: sample,
      interviewPlan: plan
    });
  },

  clearResume: () => {
    const emptyResume = parseResume('Candidate\nSoftware Engineer', 'Resume.pdf');
    const plan = generateInterviewPlan(emptyResume, get().selectedRole);
    set({ 
      resumeFileName: null, 
      candidateName: 'Candidate',
      parsedResume: emptyResume,
      interviewPlan: plan
    });
  },

  regeneratePlan: () => {
    const { parsedResume, selectedRole } = get();
    if (parsedResume) {
      set({ interviewPlan: generateInterviewPlan(parsedResume, selectedRole) });
    }
  },

  setAiSpeaking: (speaking: boolean) => {
    set({ isAiSpeaking: speaking });
  },

  setCallSeconds: (seconds: number) => {
    set({ callSeconds: seconds });
  },

  incrementCallSeconds: () => {
    set((s) => ({ callSeconds: s.callSeconds + 1 }));
  },

  togglePlanDrawer: () => {
    set((s) => ({ isPlanDrawerOpen: !s.isPlanDrawerOpen }));
  },

  setCurrentPhaseIndex: (index: number) => {
    set({ currentPhaseIndex: index });
  },

  // Call state
  isMicMuted: false,
  isVideoMuted: false,
  showCaptions: true,
  isAiSpeaking: false,
  isUserSpeaking: false,
  callSeconds: 0,
  questionIndex: 0,
  currentQuestion: '',
  subtitlesText: '',
  messages: [],

  startInterview: () => {
    const { candidateName, selectedRole, resumeFileName } = get();
    const hasResume = Boolean(resumeFileName && candidateName && candidateName !== 'Candidate');
    const greeting = hasResume
      ? `Hi ${candidateName}! Welcome to your ${selectedRole} interview. I've reviewed your resume and prepared our plan. How are you doing today?`
      : `Hi there! Welcome to your ${selectedRole} interview. I've prepared our interview plan. How are you doing today?`;

    set({
      currentPage: 'call',
      callSeconds: 0,
      questionIndex: 0,
      currentPhaseIndex: 0,
      currentQuestion: greeting,
      subtitlesText: greeting,
      isAiSpeaking: false,
      messages: [
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: greeting,
          time: '00:00'
        }
      ]
    });
  },

  endInterview: () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    set({
      currentPage: 'setup',
      isAiSpeaking: false,
      isUserSpeaking: false,
      callSeconds: 0,
      currentPhaseIndex: 0,
      isPlanDrawerOpen: false
    });
  },

  toggleMic: () => set((s) => ({ isMicMuted: !s.isMicMuted })),
  toggleVideo: () => set((s) => ({ isVideoMuted: !s.isVideoMuted })),
  toggleCaptions: () => set((s) => ({ showCaptions: !s.showCaptions })),

  submitUserSpeech: (text: string) => {
    const { messages, callSeconds, interviewPlan, questionIndex } = get();

    const formatTime = (s: number) => {
      const mins = Math.floor(s / 60).toString().padStart(2, '0');
      const secs = (s % 60).toString().padStart(2, '0');
      return `${mins}:${secs}`;
    };

    const newMsgs: MessageItem[] = [
      ...messages,
      {
        id: `user-${Date.now()}`,
        sender: 'user',
        text,
        time: formatTime(callSeconds)
      }
    ];

    set({
      messages: newMsgs,
      subtitlesText: text,
      isUserSpeaking: true,
      isAiSpeaking: false
    });

    // Determine next question from tailored interview plan
    setTimeout(() => {
      set({ isUserSpeaking: false });

      const phases = interviewPlan?.phases || [];
      const nextIdx = questionIndex + 1;
      
      // Calculate current phase
      const phaseIdx = Math.min(Math.floor(nextIdx / 2), phases.length - 1);
      const currentPhase = phases[phaseIdx];
      const nextQ = currentPhase?.tailoredQuestions[nextIdx % currentPhase.tailoredQuestions.length] || 
        "Thank you! That concludes our technical evaluation. You've demonstrated great depth across the topics.";

      setTimeout(() => {
        set({
          questionIndex: nextIdx,
          currentPhaseIndex: phaseIdx,
          currentQuestion: nextQ,
          subtitlesText: nextQ,
          isAiSpeaking: true,
          messages: [
            ...newMsgs,
            {
              id: `ai-${Date.now()}`,
              sender: 'ai',
              text: nextQ,
              time: formatTime(callSeconds + 2)
            }
          ]
        });

        speakSpeechFallback(
          nextQ,
          () => set({ isAiSpeaking: true }),
          () => set({ isAiSpeaking: false })
        );
      }, 1000);
    }, 1500);
  },

  repeatAiQuestion: () => {
    const { currentQuestion } = get();
    set({ isAiSpeaking: true, subtitlesText: currentQuestion });
    speakSpeechFallback(
      currentQuestion,
      () => set({ isAiSpeaking: true }),
      () => set({ isAiSpeaking: false })
    );
  },

  nextQuestion: () => {
    const { interviewPlan, questionIndex, messages, callSeconds } = get();
    const phases = interviewPlan?.phases || [];
    const nextIdx = questionIndex + 1;
    const phaseIdx = Math.min(Math.floor(nextIdx / 2), phases.length - 1);
    const currentPhase = phases[phaseIdx];
    const nextQ = currentPhase?.tailoredQuestions[nextIdx % currentPhase.tailoredQuestions.length] || 
      "Thank you! We've covered all core areas. You can conclude the interview whenever you are ready.";

    const formatTime = (s: number) => {
      const mins = Math.floor(s / 60).toString().padStart(2, '0');
      const secs = (s % 60).toString().padStart(2, '0');
      return `${mins}:${secs}`;
    };

    set({
      questionIndex: nextIdx,
      currentPhaseIndex: phaseIdx,
      currentQuestion: nextQ,
      subtitlesText: nextQ,
      isAiSpeaking: true,
      messages: [
        ...messages,
        {
          id: `ai-${Date.now()}`,
          sender: 'ai',
          text: nextQ,
          time: formatTime(callSeconds)
        }
      ]
    });

    speakSpeechFallback(
      nextQ,
      () => set({ isAiSpeaking: true }),
      () => set({ isAiSpeaking: false })
    );
  }
}));
