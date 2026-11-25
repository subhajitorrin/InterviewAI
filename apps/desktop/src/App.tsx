import React from 'react';
import { useInterviewStore } from './stores/interviewStore';
import { SetupPage } from './pages/SetupPage';
import { MeetingPage } from './pages/MeetingPage';

export const App: React.FC = () => {
  const { currentPage } = useInterviewStore();

  return (
    <div className="h-screen w-screen bg-[#0E1117] overflow-hidden">
      {currentPage === 'setup' ? <SetupPage /> : <MeetingPage />}
    </div>
  );
};

export default App;
