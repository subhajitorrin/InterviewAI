import React, { useRef, useState } from 'react';
import { useInterviewStore, ROLES_LIST } from '../stores/interviewStore';
import { extractTextFromFile, parseResume } from '../utils/resumeParser';
import { 
  FileText, 
  Upload, 
  Trash2, 
  ArrowRight,
  Loader2,
  ChevronDown
} from 'lucide-react';

export const SetupPage: React.FC = () => {
  const { 
    selectedRole, 
    setSelectedRole, 
    resumeFileName, 
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
    <div className="min-h-screen bg-black text-white flex items-center justify-center p-6 select-none antialiased">
      <div className="w-full max-w-sm space-y-6">
        
        {/* Minimal Title */}
        <div className="text-center space-y-1">
          <h1 className="text-xl font-medium tracking-tight">Interview Setup</h1>
        </div>

        {/* Core Controls */}
        <div className="space-y-4">
          {/* File Upload Area */}
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.doc,.docx,.txt,.md"
            className="hidden"
            onChange={handleFileUpload}
          />

          {isLoading ? (
            <div className="border border-neutral-800 bg-[#0A0A0A] rounded-xl p-8 text-center flex flex-col items-center justify-center gap-2">
              <Loader2 className="w-5 h-5 text-neutral-400 animate-spin" />
              <span className="text-xs text-neutral-400">Reading document...</span>
            </div>
          ) : !resumeFileName ? (
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border border-dashed rounded-xl p-8 text-center cursor-pointer transition-all duration-150 flex flex-col items-center justify-center gap-2.5 ${
                isDragOver 
                  ? 'border-neutral-500 bg-neutral-900/60' 
                  : 'border-neutral-800 hover:border-neutral-600 bg-[#0A0A0A]'
              }`}
            >
              <Upload className="w-5 h-5 text-neutral-400" />
              <span className="text-xs text-neutral-300">
                Upload Resume (PDF)
              </span>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-[#0A0A0A] border border-neutral-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <FileText className="w-4 h-4 text-neutral-400 shrink-0" />
                <span className="text-xs font-medium text-neutral-200 truncate max-w-[200px]">
                  {resumeFileName}
                </span>
              </div>
              <button
                onClick={clearResume}
                className="p-1 rounded text-neutral-500 hover:text-red-400 hover:bg-neutral-900 transition-colors cursor-pointer"
                title="Remove"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* Role Selector */}
          <div className="relative">
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value)}
              className="w-full px-3.5 py-3 bg-[#0A0A0A] border border-neutral-800 hover:border-neutral-700 rounded-xl text-xs text-neutral-200 focus:outline-none focus:border-neutral-500 appearance-none cursor-pointer pr-9 transition-colors"
            >
              {ROLES_LIST.map((role) => (
                <option key={role} value={role} className="bg-neutral-950 text-neutral-200">
                  {role}
                </option>
              ))}
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-neutral-500">
              <ChevronDown className="w-4 h-4" />
            </div>
          </div>

          {/* Start Button */}
          <button
            onClick={startInterview}
            disabled={isLoading}
            className="w-full py-3 px-4 rounded-xl bg-white hover:bg-neutral-200 text-black font-medium text-xs tracking-tight transition-all duration-150 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <span>Start Interview</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

      </div>
    </div>
  );
};
