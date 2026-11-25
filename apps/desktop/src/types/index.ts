export type InterviewStage = 
  | 'role_selection' 
  | 'resume_upload' 
  | 'pre_flight' 
  | 'live_interview' 
  | 'report';

export type RoleCategory = 'Engineering' | 'AI & Data' | 'Product & Architecture';

export interface JobRole {
  id: string;
  title: string;
  category: RoleCategory;
  level: 'Junior' | 'Mid-Level' | 'Senior' | 'Staff/Lead';
  description: string;
  techStack: string[];
  expectedTopics: string[];
}

export interface ExtractedResume {
  fileName: string;
  fileSize: string;
  candidateName: string;
  headline: string;
  experienceYears: number;
  skills: {
    core: string[];
    frameworks: string[];
    cloudAndDevops: string[];
    tools: string[];
  };
  highlightProjects: {
    title: string;
    description: string;
    technologies: string[];
  }[];
  extractedSummary: string;
}

export interface DetectedApp {
  name: string;
  bundleId: string;
  category: 'Editor' | 'Browser' | 'Communication' | 'Terminal' | 'Other';
  icon: string;
  status: 'safe' | 'warning' | 'flagged';
  isMonitored: boolean;
}

export interface HardwareCheckState {
  webcamGranted: boolean;
  webcamStreamActive: boolean;
  micGranted: boolean;
  micLevel: number;
  faceDetected: boolean;
  faceConfidence: number;
  detectedApps: DetectedApp[];
  isScanningApps: boolean;
}

export interface TranscriptMessage {
  id: string;
  sender: 'ai' | 'candidate';
  text: string;
  timestamp: string;
  isStreaming?: boolean;
}

export interface QuestionItem {
  id: string;
  index: number;
  category: 'Resume Deep-dive' | 'Core Architecture' | 'System Design' | 'Live Problem Solving' | 'Behavioral';
  question: string;
  rationale: string;
  timeLimitSeconds: number;
  status: 'pending' | 'in_progress' | 'completed';
  candidateAnswer?: string;
  score?: number; // 0-100
  feedback?: string;
}

export interface InterviewAnalyticsReport {
  sessionId: string;
  roleTitle: string;
  candidateName: string;
  interviewDate: string;
  durationSeconds: number;
  overallScore: number;
  metrics: {
    technicalAccuracy: number;
    communicationClarity: number;
    problemSolving: number;
    resumeConsistency: number;
    confidenceAndPresence: number;
  };
  radarCategories: {
    label: string;
    score: number;
  }[];
  topStrengths: string[];
  growthAreas: string[];
  keyQuotes: {
    question: string;
    answer: string;
    critique: string;
  }[];
  verdict: 'Strong Hire' | 'Hire' | 'Borderline' | 'Needs More Preparation';
  summaryVerdict: string;
}
