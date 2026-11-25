import React, { useRef } from 'react';
import { useInterviewStore, ROLES_LIST } from '../stores/interviewStore';
import { 
  FileText, 
  UploadCloud, 
  CheckCircle2, 
  Trash2, 
  ArrowRight
} from 'lucide-react';

export const SetupPage: React.FC = () => {
  const { 
    selectedRole, 
    setSelectedRole, 
    resumeFileName, 
    setResumeFile, 
    clearResume, 
    startInterview 
  } = useInterviewStore();

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setResumeFile(file.name);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) {
      setResumeFile(file.name);
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
            accept=".pdf,.doc,.docx"
            className="hidden"
            onChange={handleFileUpload}
          />

          {!resumeFileName ? (
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
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-[#0E1117] border border-slate-700">
              <div className="flex items-center gap-2.5">
                <FileText className="w-4 h-4 text-blue-400" />
                <span className="text-xs font-medium text-white truncate max-w-[220px]">
                  {resumeFileName}
                </span>
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              </div>

              <button
                onClick={clearResume}
                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
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
          className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs shadow-lg shadow-blue-600/20 transition-all flex items-center justify-center gap-1.5"
        >
          <span>Start Interview</span>
          <ArrowRight className="w-3.5 h-3.5" />
        </button>

      </div>
    </div>
  );
};
