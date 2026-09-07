import React, { useState, useEffect } from 'react';

interface AssessmentHeaderProps {
  roundCode: string; // e.g. "LEVEL 01"
  roundName: string; // e.g. "MCQ ASSESSMENT"
  remainingSeconds: number;
  onToggleDrawer?: () => void;
  showDrawerButton?: boolean;
  rightAction?: React.ReactNode;
}

export const AssessmentHeader: React.FC<AssessmentHeaderProps> = ({
  roundCode,
  roundName,
  remainingSeconds,
  onToggleDrawer,
  showDrawerButton = false,
  rightAction,
}) => {
  const [isFullscreen, setIsFullscreen] = useState<boolean>(!!document.fullscreenElement);

  useEffect(() => {
    const handleFsChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
    } else {
      document.exitFullscreen().catch(() => {});
    }
  };

  // Format MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(Math.max(0, secs) / 60);
    const s = Math.max(0, secs) % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const isCritical = remainingSeconds <= 120; // Under 2 minutes

  return (
    <header className="h-[64px] bg-white border-b border-[#DBD7C9] px-6 flex items-center justify-between sticky top-0 z-40">
      {/* Left: Department & Fest Identity (inline) */}
      <div className="flex items-center space-x-2.5">
        <span className="text-[12px] font-bold tracking-[0.08em] text-[#59626F] uppercase">
          CSE (AI &amp; ML)
        </span>
        <span className="text-[#DBD7C9]">·</span>
        <span className="font-serif text-[16px] font-bold text-[#1B2029]">
          CodeFest 2026
        </span>
      </div>

      {/* Right: Round Info, Timer & Optional Final Actions */}
      <div className="flex items-center space-x-4">
        {/* Fullscreen Button */}
        <button
          onClick={toggleFullscreen}
          className={`px-2.5 py-1 text-xs font-mono rounded-[3px] border transition-colors flex items-center space-x-1.5 ${
            isFullscreen
              ? 'bg-[#E8F3EC] text-[#1E7A46] border-[#BEDFCB]'
              : 'bg-[#FFF3CD] text-[#856404] border-[#FFEEBA] hover:bg-[#FFEBAA]'
          }`}
          title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen Mode'}
          type="button"
        >
          <span>{isFullscreen ? '⛶ Fullscreen Active' : '⛶ Go Fullscreen'}</span>
        </button>

        <div className="text-right">
          <div className="font-mono text-[12px] text-[#8B93A0] leading-none mb-1">
            {roundCode}
          </div>
          <div className="text-[13px] font-semibold text-[#1B2029] leading-none">
            {roundName}
          </div>
        </div>

        {/* Timer: IBM Plex Mono, 22px, weight 600 */}
        <div
          className={`font-mono text-[22px] font-semibold tracking-tight transition-colors duration-200 ${
            isCritical ? 'text-[#AE2E22]' : 'text-[#1B2029]'
          }`}
          title={isCritical ? 'Less than 2 minutes remaining' : 'Remaining time'}
        >
          {formatTime(remainingSeconds)}
        </div>

        {/* Right Action (e.g. Final Submit button) */}
        {rightAction}

        {/* Drawer button for screens below 1100px */}
        {showDrawerButton && onToggleDrawer && (
          <button
            onClick={onToggleDrawer}
            className="xl:hidden btn-ghost text-xs px-2.5 py-1"
            type="button"
          >
            Navigator
          </button>
        )}
      </div>
    </header>
  );
};
