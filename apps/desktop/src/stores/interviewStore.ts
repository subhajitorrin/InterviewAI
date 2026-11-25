import { create } from 'zustand';

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

export const MOCK_QUESTIONS: Record<string, string[]> = {
  'Full Stack Developer': [
    "Welcome! Let's start with your background. Walk me through a challenging full stack project you recently led, and how you architected the communication between your frontend and backend.",
    "When building real-time applications with WebSockets or SSE, how do you handle connection drops, message ordering, and scaling across multiple server instances?",
    "Suppose your database queries are slowing down response times during peak hours. How would you diagnose whether it's an indexing issue, connection pool starvation, or inefficient joins?",
    "Do you have any questions for me regarding our engineering stack or architecture?"
  ],
  default: [
    "Welcome! Tell me about yourself, your recent technical projects, and what interests you about this role.",
    "Can you describe an architectural challenge you faced in production and how you resolved it?",
    "How do you approach automated testing, performance profiling, and code maintainability in your daily workflow?",
    "Great discussion today! Do you have any questions for me?"
  ]
};

interface SimpleInterviewState {
  // Navigation: Only 2 pages
  currentPage: 'setup' | 'call';
  
  // Page 1: Setup State
  selectedRole: string;
  setSelectedRole: (role: string) => void;
  resumeFileName: string | null;
  candidateName: string;
  setResumeFile: (fileName: string, candidateName?: string) => void;
  useSampleResume: () => void;
  clearResume: () => void;

  // Page 2: Zoom Call State
  isMicMuted: boolean;
  isVideoMuted: boolean;
  showCaptions: boolean;
  isAiSpeaking: boolean;
  isUserSpeaking: boolean;
  callSeconds: number;
  questionIndex: number;
  currentQuestion: string;
  subtitlesText: string;
  messages: MessageItem[];

  // Actions
  setAiSpeaking: (speaking: boolean) => void;
  startInterview: () => void;
  endInterview: () => void;
  toggleMic: () => void;
  toggleVideo: () => void;
  toggleCaptions: () => void;
  submitUserSpeech: (text: string) => void;
  repeatAiQuestion: () => void;
  nextQuestion: () => void;
}

export const useInterviewStore = create<SimpleInterviewState>((set, get) => ({
  currentPage: 'setup',

  selectedRole: ROLES_LIST[0],
  setSelectedRole: (role) => set({ selectedRole: role }),

  resumeFileName: null,
  candidateName: 'Candidate',
  
  setResumeFile: (fileName, name = 'Alex Chen') => {
    set({ resumeFileName: fileName, candidateName: name });
  },

  useSampleResume: () => {
    set({
      resumeFileName: 'Alex_Chen_Resume.pdf',
      candidateName: 'Alex Chen'
    });
  },

  clearResume: () => {
    set({ resumeFileName: null, candidateName: 'Candidate' });
  },

  setAiSpeaking: (speaking: boolean) => {
    set({ isAiSpeaking: speaking });
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
    const greeting = "Hi there! I'm Dr. Sarah Vance, your AI interviewer. How are you doing today?";

    set({
      currentPage: 'call',
      callSeconds: 0,
      questionIndex: 0,
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
    set({
      currentPage: 'setup',
      isAiSpeaking: false,
      isUserSpeaking: false,
      callSeconds: 0
    });
  },

  toggleMic: () => set((s) => ({ isMicMuted: !s.isMicMuted })),
  toggleVideo: () => set((s) => ({ isVideoMuted: !s.isVideoMuted })),
  toggleCaptions: () => set((s) => ({ showCaptions: !s.showCaptions })),

  submitUserSpeech: (text: string) => {
    const { messages, callSeconds, selectedRole, questionIndex } = get();
    const questions = MOCK_QUESTIONS[selectedRole] || MOCK_QUESTIONS.default;

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

    // Simulate transition: user finished speaking -> AI responds with next question or follow-up
    setTimeout(() => {
      set({ isUserSpeaking: false });

      const nextIdx = questionIndex + 1;
      const nextQ = questions[nextIdx] || "Thank you! That concludes our technical interview. You can now end the call.";

      setTimeout(() => {
        set({
          questionIndex: nextIdx,
          currentQuestion: nextQ,
          subtitlesText: nextQ,
          isAiSpeaking: true,
          messages: [
            ...newMsgs,
            {
              id: `ai-${Date.now()}`,
              sender: 'ai',
              text: nextQ,
              time: formatTime(callSeconds + 3)
            }
          ]
        });

        setTimeout(() => {
          set({ isAiSpeaking: false });
        }, 4000);
      }, 1000);
    }, 2000);
  },

  repeatAiQuestion: () => {
    const { currentQuestion } = get();
    set({ isAiSpeaking: true, subtitlesText: currentQuestion });
    setTimeout(() => {
      set({ isAiSpeaking: false });
    }, 3500);
  },

  nextQuestion: () => {
    const { selectedRole, questionIndex, messages, callSeconds } = get();
    const questions = MOCK_QUESTIONS[selectedRole] || MOCK_QUESTIONS.default;
    const nextIdx = questionIndex + 1;
    const nextQ = questions[nextIdx] || "Thank you! We've covered all core areas. You can end the call whenever you're ready.";

    const formatTime = (s: number) => {
      const mins = Math.floor(s / 60).toString().padStart(2, '0');
      const secs = (s % 60).toString().padStart(2, '0');
      return `${mins}:${secs}`;
    };

    set({
      questionIndex: nextIdx,
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

    setTimeout(() => {
      set({ isAiSpeaking: false });
    }, 3500);
  }
}));
