import React, { useEffect } from 'react';
import { apiFetch } from '../api/client';
import type { DashboardState } from '../types/auth';

interface WaitingPageProps {
  onLevel2Opened: () => void;
  onReturnToDashboard: () => void;
}

export const WaitingPage: React.FC<WaitingPageProps> = ({
  onLevel2Opened,
  onReturnToDashboard,
}) => {
  // Poll server state every 6 seconds per spec
  useEffect(() => {
    const checkState = async () => {
      try {
        const data = await apiFetch<DashboardState>('/api/dashboard/state');
        if (data.state === 'NOT_QUALIFIED' || (data.level1_result && !data.level1_result.is_qualified)) {
          onReturnToDashboard();
        } else if (data.can_start_level2 || data.state === 'LEVEL2_AVAILABLE') {
          onLevel2Opened();
        }
      } catch (err) {
        console.error('Failed to poll status:', err);
      }
    };

    checkState();
    const interval = setInterval(checkState, 10000);
    return () => clearInterval(interval);
  }, [onLevel2Opened, onReturnToDashboard]);

  return (
    <div className="min-h-screen bg-[#F6F6F2] flex flex-col items-center justify-center p-6 text-center">
      {/* Centered Card (max-width 440px) */}
      <div className="w-full max-w-[440px] bg-white border border-[#DBD7C9] rounded-[6px] p-12 sm:p-14">
        {/* Top Tag */}
        <div className="font-mono text-[13px] text-[#8B93A0]">
          LEVEL 01 COMPLETE
        </div>

        {/* Headline */}
        <h2 className="font-serif text-[20px] font-semibold text-[#1B2029] mt-2 mb-6">
          Assessment Submitted Successfully
        </h2>

        {/* 44px Divider Rule */}
        <div className="w-[44px] h-[1px] bg-[#C6C1B0] mx-auto my-6" />

        {/* Level 02 block */}
        <div className="font-mono text-[12px] text-[#8B93A0]">
          LEVEL 02
        </div>
        <h1 className="font-serif text-[22px] font-semibold text-[#1B2029] mt-1 mb-5">
          CODING ASSESSMENT
        </h1>

        {/* Status line: Waiting for organizer (warn badge) */}
        <div className="inline-flex">
          <span className="badge-status badge-in-progress">
            Waiting for organizer
          </span>
        </div>
      </div>

      {/* Under-card text */}
      <p className="text-[12.5px] text-[#59626F] mt-5 max-w-sm">
        Shortlisted candidates who qualify for the next round will receive official notifications on their registered email address. This page updates automatically once Level 2 begins.
      </p>

      {/* Return to Dashboard */}
      <div className="mt-4">
        <button
          onClick={onReturnToDashboard}
          className="btn-ghost text-xs"
          type="button"
        >
          Return to Dashboard
        </button>
      </div>
    </div>
  );
};
