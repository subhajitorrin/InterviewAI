import React, { useRef, useState } from 'react';
import { useInterviewStore, ROLES_LIST } from '../stores/interviewStore';
import { extractTextFromFile, parseResume } from '../utils/resumeParser';
import { 
  FileText, 
  Upload, 
  Check, 
  Trash2, 
  ArrowRight,
  Loader2,
  Briefcase,
  User,
  Code2
} from 'lucide-react';

export const SetupPage: React.FC = () => {
  const { 
    selectedRole, 
    setSelectedRole, 
    resumeFileName, 
    candidateName,
    parsedResume,
    setParsedResume,
    clearResume, 
    startInterview 
  } = useInterviewStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleFileProcess = async (file: File) => {
    try {
      setIsLoading(true);
      const text = await extractTextFromFile(file);
      const parsed = parseResume(text, file.name);
      setParsedResume(parsed, file.name);
    } catch (err) {
      console.error('Failed to parse resume:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  return (
    <div className="min-h-screen bg-black text-neutral-100 flex flex-col justify-between p-6 sm:p-10 select-none antialiased">
      {/* Top Header */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between py-2 border-b border-neutral-900">
        <div className="flex items-center gap-2.5">
          <div className="w-2 h-2 rounded-full bg-emerald-500" />
          <span className="text-xs font-mono uppercase tracking-wider text-neutral-400">
            Interview Environment
          </span>
        </div>
        <span className="text-xs text-neutral-500 font-mono">v0.1.0</span>
      </header>

      {/* Main Content Area */}
      <main className="w-full max-w-lg mx-auto my-auto py-8 space-y-8">
        {/* Title & Description */}
        <div className="space-y-1.5 text-left">
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white">
            Technical Interview Setup
          </h1>
          <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
            Attach your candidate profile or resume to calibrate interview evaluation metrics.
          </p>
        </div>

        {/* Card Form */}
        <div className="bg-[#0A0A0A] border border-neutral-800 rounded-xl p-6 sm:p-7 shadow-2xl space-y-6">
          {/* 1. Resume Upload */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-300">
                Resume / CV
              </label>
              <span className="text-[11px] text-neutral-500 font-mono">PDF, TXT, MD</span>
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.doc,.docx,.txt,.md"
              className="hidden"
              onChange={handleFileUpload}
            />

            {isLoading ? (
              <div className="border border-neutral-800 bg-neutral-950 rounded-lg p-7 text-center flex flex-col items-center justify-center gap-2.5">
                <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />
                <span className="text-xs text-neutral-400">Parsing document structure...</span>
              </div>
            ) : !resumeFileName ? (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
                onDragLeave={() => setIsDragOver(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border border-dashed rounded-lg p-7 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-2.5 ${
                  isDragOver 
                    ? 'border-neutral-400 bg-neutral-900/60' 
                    : 'border-neutral-800 hover:border-neutral-600 bg-neutral-950/60 hover:bg-neutral-950'
                }`}
              >
                <div className="w-9 h-9 rounded-md bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-400">
                  <Upload className="w-4 h-4" />
                </div>
                <div className="space-y-0.5">
                  <p className="text-xs font-medium text-neutral-200">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-[11px] text-neutral-500">
                    PDF format recommended
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-lg bg-neutral-950 border border-neutral-800 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded bg-neutral-900 border border-neutral-800 flex items-center justify-center text-neutral-300 shrink-0">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-white truncate max-w-[220px]">
                          {resumeFileName}
                        </span>
                        <span className="inline-flex items-center gap-1 text-[10px] text-emerald-400 bg-emerald-950/50 border border-emerald-800/60 px-1.5 py-0.5 rounded font-mono">
                          <Check className="w-3 h-3" /> Ready
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={clearResume}
                    className="p-1.5 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-900 transition-colors cursor-pointer"
                    title="Remove file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>

                {/* Extracted Details Overview */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-neutral-900 text-xs">
                  <div className="flex items-center gap-1.5 text-neutral-400 truncate">
                    <User className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                    <span className="text-neutral-200 truncate">
                      {candidateName && candidateName !== 'Candidate' ? candidateName : 'Candidate'}
                    </span>
                  </div>
                  {parsedResume && (
                    <div className="flex items-center gap-1.5 text-neutral-400 justify-end">
                      <Code2 className="w-3.5 h-3.5 text-neutral-500 shrink-0" />
                      <span className="text-neutral-200">
                        {parsedResume.skills.all.length} skills identified
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* 2. Target Job Role */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-neutral-300">
                Target Role
              </label>
              <span className="text-[11px] text-neutral-500 font-mono">Track</span>
            </div>

            <div className="relative">
              <select
                value={selectedRole}
                onChange={(e) => setSelectedRole(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-neutral-950 border border-neutral-800 rounded-lg text-xs text-neutral-200 focus:outline-none focus:border-neutral-600 appearance-none cursor-pointer pr-10"
              >
                {ROLES_LIST.map((role) => (
                  <option key={role} value={role} className="bg-neutral-950 text-neutral-200">
                    {role}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-neutral-500">
                <Briefcase className="w-3.5 h-3.5" />
              </div>
            </div>
          </div>

          {/* 3. Action Button */}
          <button
            onClick={startInterview}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-lg bg-white hover:bg-neutral-200 text-black font-semibold text-xs tracking-tight transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-black" />
                <span>Processing...</span>
              </>
            ) : (
              <>
                <span>Enter Interview Session</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {/* Minimal Environment Notice */}
        <div className="flex items-center justify-between text-[11px] text-neutral-600 font-mono px-1">
          <span>Camera & microphone active during session</span>
          <span>Proctored session</span>
        </div>
      </main>

      {/* Footer */}
      <footer className="w-full max-w-5xl mx-auto py-3 border-t border-neutral-900 flex items-center justify-between text-xs text-neutral-600">
        <span>Engineering Candidate Assessment</span>
        <span>Confidential</span>
      </footer>
    </div>
  );
};
