import React, { useRef, useState } from 'react';
import { useInterviewStore, ROLES_LIST } from '../stores/interviewStore';
import { extractTextFromFile, parseResume } from '../utils/resumeParser';
import { 
  FileText, 
  UploadCloud, 
  CheckCircle2, 
  Trash2, 
  ArrowRight,
  Loader2,
  Sparkles
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
  const [indexingStage, setIndexingStage] = useState<string>('');
  const [indexingProgress, setIndexingProgress] = useState<number>(0);

  const handleFileProcess = async (file: File) => {
    try {
      setIsLoading(true);
      setIndexingProgress(20);
      setIndexingStage('Reading resume document...');

      const text = await extractTextFromFile(file);
      await new Promise((r) => setTimeout(r, 280));

      setIndexingProgress(50);
      setIndexingStage('Indexing technical skills & domain expertise...');
      const parsed = parseResume(text, file.name);
      await new Promise((r) => setTimeout(r, 350));

      setIndexingProgress(80);
      setIndexingStage('Calibrating AI interview context & projects...');
      setParsedResume(parsed, file.name);
      await new Promise((r) => setTimeout(r, 300));

      setIndexingProgress(100);
      setIndexingStage('AI context successfully indexed!');
      await new Promise((r) => setTimeout(r, 180));
    } catch (err) {
      console.error('Failed to parse resume:', err);
    } finally {
      setIsLoading(false);
      setIndexingStage('');
      setIndexingProgress(0);
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
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileProcess(file);
    }
  };

  return (
    <div className="min-h-screen bg-[#0E1117] text-white flex flex-col items-center justify-center p-6 select-none">
      <div className="w-full max-w-md bg-[#161B26] border border-slate-800 rounded-3xl p-7 shadow-2xl space-y-6">
        
        {/* Title */}
        <div className="text-center">
          <h1 className="text-2xl font-bold tracking-tight">InterviewAI</h1>
        </div>

        {/* 1. Resume Upload */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300">
            Resume
          </label>

          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt"
            className="hidden"
            onChange={handleFileUpload}
          />

          {isLoading ? (
            <div className="border border-blue-500/40 bg-[#0E1117] rounded-2xl p-6 text-center flex flex-col items-center justify-center gap-3">
              <div className="relative flex items-center justify-center">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <Sparkles className="w-4 h-4 text-cyan-400 absolute animate-pulse" />
              </div>
              <div className="space-y-2 w-full max-w-[280px]">
                <p className="text-xs font-semibold text-white tracking-wide">
                  {indexingStage || 'Indexing resume context...'}
                </p>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div
                    className="bg-gradient-to-r from-blue-500 to-cyan-400 h-full rounded-full transition-all duration-300 ease-out"
                    style={{ width: `${indexingProgress}%` }}
                  />
                </div>
                <p className="text-[10px] text-slate-400">
                  Ingesting skills, projects & context for the AI interviewer
                </p>
              </div>
            </div>
          ) : !resumeFileName ? (
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className="border border-dashed border-slate-700 hover:border-blue-500 bg-[#0E1117] rounded-2xl p-6 text-center cursor-pointer transition-all"
            >
              <UploadCloud className="w-8 h-8 text-slate-400 mx-auto mb-2" />
              <p className="text-xs text-slate-300">
                Upload your resume (PDF)
              </p>
            </div>
          ) : (
            <div className="p-4 rounded-2xl bg-[#0E1117] border border-slate-700/80 space-y-2.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5 truncate">
                  <FileText className="w-4 h-4 text-blue-400 shrink-0" />
                  <span className="text-xs font-semibold text-white truncate max-w-[190px]">
                    {resumeFileName}
                  </span>
                  <span className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20 shrink-0">
                    <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                    Indexed
                  </span>
                </div>

                <button
                  onClick={clearResume}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors cursor-pointer"
                  title="Remove Resume"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              {/* Extracted context pills */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                {candidateName && candidateName !== 'Candidate' && (
                  <span className="text-[10px] text-blue-300 bg-blue-500/15 px-2 py-0.5 rounded-md border border-blue-500/30 font-medium">
                    👤 {candidateName}
                  </span>
                )}
                {parsedResume && parsedResume.skills.all.length > 0 && (
                  <span className="text-[10px] text-slate-300 bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700 font-medium">
                    ⚡ {parsedResume.skills.all.length} Skills
                  </span>
                )}
                {parsedResume && parsedResume.projects.length > 0 && (
                  <span className="text-[10px] text-indigo-300 bg-indigo-500/15 px-2 py-0.5 rounded-md border border-indigo-500/30 font-medium">
                    🚀 {parsedResume.projects.length} Projects
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        {/* 2. Job Role Selection */}
        <div className="space-y-2">
          <label className="text-xs font-medium text-slate-300">
            Job Role
          </label>

          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="w-full px-3.5 py-2.5 bg-[#0E1117] border border-slate-700 rounded-xl text-xs text-white focus:outline-none focus:border-blue-500 cursor-pointer"
          >
            {ROLES_LIST.map((role) => (
              <option key={role} value={role} className="bg-[#0E1117] text-white">
                {role}
              </option>
            ))}
          </select>
        </div>

        {/* 3. Start Interview Button */}
        <button
          onClick={startInterview}
          disabled={isLoading}
          className="w-full py-3.5 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold text-xs shadow-lg shadow-blue-600/25 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
        >
          {isLoading ? (
            <>
              <Loader2 className="w-4 h-4 text-white animate-spin" />
              <span>Indexing Resume Context...</span>
            </>
          ) : (
            <>
              <span>Start Technical Interview</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </>
          )}
        </button>

      </div>
    </div>
  );
};
