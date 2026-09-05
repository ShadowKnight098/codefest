import React from 'react';

interface TerminationPageProps {
  reason?: string;
  onReturnToDashboard: () => void;
}

export const TerminationPage: React.FC<TerminationPageProps> = ({
  reason = 'repeated tab-switch violations during the assessment',
  onReturnToDashboard,
}) => {
  return (
    <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center p-6">
      {/* Centered card with 4px top border in --error */}
      <div className="w-full max-w-[480px] bg-white border border-[#DBD7C9] border-t-4 border-t-[#AE2E22] rounded-[6px] p-10 sm:p-12 text-center shadow-none">
        {/* Status Heading: mono, 14px, --error */}
        <div className="font-mono text-[14px] font-semibold text-[#AE2E22] uppercase tracking-normal mb-4">
          ASSESSMENT TERMINATED
        </div>

        {/* Body copy */}
        <p className="text-[15px] text-[#1B2029] leading-relaxed mb-4">
          Your attempt was terminated due to {reason}.
        </p>

        <p className="text-[13px] text-[#59626F] leading-relaxed mb-8">
          If you believe this is an error, contact your event coordinator.
        </p>

        {/* Action: Return to Dashboard (outline --ink button) */}
        <div>
          <button
            onClick={onReturnToDashboard}
            className="btn-secondary h-[42px] px-6 text-[14px]"
            type="button"
          >
            Return to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
};
