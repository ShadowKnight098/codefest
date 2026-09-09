import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { ApiError } from '../api/client';

export const LoginPage: React.FC<{ onOpenAdmin?: () => void }> = ({ onOpenAdmin }) => {
  const { login } = useAuth();

  const [rollNumber, setRollNumber] = useState('');
  const [email, setEmail] = useState('');
  const [pin, setPin] = useState('');
  const [clickCount, setClickCount] = useState(0);

  const [fieldErrors, setFieldErrors] = useState<{ [key: string]: string }>({});
  const [banner, setBanner] = useState<{ type: 'error' | 'warn' | 'success'; message: string } | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isLocked, setIsLocked] = useState(false);

  const handleSecretClick = () => {
    const next = clickCount + 1;
    if (next >= 3) {
      setClickCount(0);
      if (onOpenAdmin) onOpenAdmin();
      else window.location.hash = 'admin';
    } else {
      setClickCount(next);
      setTimeout(() => setClickCount(0), 1200);
    }
  };

  const validate = (): boolean => {
    const errors: { [key: string]: string } = {};

    if (!rollNumber.trim()) {
      errors.rollNumber = 'Roll number is required.';
    }

    if (!email.trim()) {
      errors.email = 'Registered institutional email is required.';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = 'Please enter a valid email address.';
    }

    if (!pin.trim()) {
      errors.pin = 'Password is required (Use your Roll Number).';
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || isSubmitting) return;

    setBanner(null);

    if (!validate()) {
      return;
    }

    setIsSubmitting(true);
    try {
      await login(rollNumber.trim(), email.trim(), pin.trim());
      setBanner({
        type: 'success',
        message: 'Signed in — redirecting to your dashboard…'
      });
    } catch (err: unknown) {
      if (err instanceof ApiError) {
        if (err.status === 429 || err.message.toLowerCase().includes('locked')) {
          setIsLocked(true);
          setBanner({
            type: 'warn',
            message: 'Too many failed attempts. Access is temporarily locked — try again shortly or contact your event coordinator.'
          });
        } else {
          setBanner({
            type: 'error',
            message: 'The roll number, email, or PIN you entered is incorrect.'
          });
        }
      } else {
        setBanner({
          type: 'error',
          message: 'The roll number, email, or PIN you entered is incorrect.'
        });
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F6F2] flex items-center justify-center p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-[920px] bg-white border border-[#DBD7C9] rounded-[6px] overflow-hidden shadow-none flex flex-col md:flex-row">
        
        {/* IDENTITY PANEL (44%) */}
        <div className="w-full md:w-[44%] bg-[#16233F] text-white p-8 sm:p-10 lg:p-12 flex flex-col justify-between select-none">
          <div>
            {/* Header / Department info (Triple click to open Organizer Login) */}
            <div
              onClick={handleSecretClick}
              className="cursor-default"
              title="Official Evaluation Environment"
            >
              <div className="text-[11px] font-mono uppercase tracking-wider text-white/60 mb-0.5">
                Conducted by
              </div>
              <div className="text-[13.5px] font-semibold text-white tracking-normal">
                Department of CSE (AI &amp; ML)
              </div>
              <div className="text-[12px] text-white/70 mt-0.5">
                RGM College of Engineering &amp; Technology
              </div>
            </div>

            {/* Fest Name (large serif) */}
            <div onClick={handleSecretClick} className="mt-8 cursor-default">
              <div className="font-serif text-[38px] leading-[1.08] font-semibold text-white">
                CodeFest
              </div>
              <div className="font-serif text-[38px] leading-[1.08] font-normal text-white/70">
                2026
              </div>
            </div>

            {/* Thin horizontal rule (44px wide, 1px) */}
            <div className="w-[44px] h-[1px] bg-white/30 my-6" />

            {/* Round List */}
            <div className="space-y-3.5">
              <div className="flex items-center space-x-3 text-[14px]">
                <span className="font-mono text-[12px] font-medium text-white/45 w-5">01</span>
                <span className="font-medium text-white/90">MCQ Assessment</span>
              </div>
              <div className="flex items-center space-x-3 text-[14px]">
                <span className="font-mono text-[12px] font-medium text-white/45 w-5">02</span>
                <span className="font-medium text-white/90">Debugging Assessment</span>
              </div>
              <div className="flex items-center space-x-3 text-[14px]">
                <span className="font-mono text-[12px] font-medium text-white/45 w-5">03</span>
                <span className="font-medium text-white/90">Presentation</span>
              </div>
            </div>
          </div>

          {/* HOD & Faculty Details Block */}
          <div className="border-t border-white/15 pt-4 mt-6">
            <div className="text-[10.5px] font-mono tracking-wider uppercase text-white/45 mb-0.5">
              Head of the Department
            </div>
            <div className="text-[13.5px] font-semibold text-white">
              Dr. Kishore Kumar <span className="text-[11.5px] font-normal text-white/70">(M.Tech, Ph.D)</span>
            </div>
            <div className="text-[11.5px] text-white/70">
              HOD, Department of CSE (AI &amp; ML)
            </div>
            <div className="text-[11px] text-white/45 mt-0.5">
              RGMCET, Nandyal
            </div>
          </div>
        </div>

        {/* FORM PANEL (56%) */}
        <div className="w-full md:w-[56%] bg-white p-8 sm:p-10 lg:p-12 flex flex-col justify-between">
          <div>
            <h1 className="font-serif text-[27px] font-semibold text-[#1B2029] leading-tight">
              Participant sign in
            </h1>
            <p className="text-[13.5px] text-[#59626F] mt-1.5 mb-7">
              Enter your credentials to access the assessment environment.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              {/* Roll number */}
              <div>
                <label className="block text-[13px] font-semibold text-[#59626F] mb-1.5">
                  Roll number
                </label>
                <input
                  type="text"
                  value={rollNumber}
                  onChange={(e) => {
                    setRollNumber(e.target.value.toUpperCase());
                    if (fieldErrors.rollNumber) setFieldErrors({ ...fieldErrors, rollNumber: '' });
                  }}
                  disabled={isSubmitting || isLocked}
                  placeholder="e.g. 21A91A6127"
                  className={`spec-input font-mono uppercase ${fieldErrors.rollNumber ? 'invalid' : ''}`}
                  autoComplete="username"
                />
                {fieldErrors.rollNumber && (
                  <p className="text-[12.5px] text-[#AE2E22] mt-1">{fieldErrors.rollNumber}</p>
                )}
              </div>

              {/* Registered email */}
              <div>
                <label className="block text-[13px] font-semibold text-[#59626F] mb-1.5">
                  Registered email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (fieldErrors.email) setFieldErrors({ ...fieldErrors, email: '' });
                  }}
                  disabled={isSubmitting || isLocked}
                  placeholder="student@rgmcet.edu.in"
                  className={`spec-input font-sans ${fieldErrors.email ? 'invalid' : ''}`}
                  autoComplete="email"
                />
                {fieldErrors.email && (
                  <p className="text-[12.5px] text-[#AE2E22] mt-1">{fieldErrors.email}</p>
                )}
              </div>

              {/* Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[13px] font-semibold text-[#59626F]">
                    Password
                  </label>
                  <span className="text-[12px] text-[#8B93A0]">Use your Roll Number</span>
                </div>
                <input
                  type="password"
                  value={pin}
                  onChange={(e) => {
                    setPin(e.target.value);
                    if (fieldErrors.pin) setFieldErrors({ ...fieldErrors, pin: '' });
                  }}
                  disabled={isSubmitting || isLocked}
                  placeholder="Enter your Roll Number"
                  className={`spec-input font-mono tracking-wider ${fieldErrors.pin ? 'invalid' : ''}`}
                  autoComplete="current-password"
                />
                {fieldErrors.pin && (
                  <p className="text-[12.5px] text-[#AE2E22] mt-1">{fieldErrors.pin}</p>
                )}
              </div>

              {/* Sign in Button */}
              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting || isLocked}
                  className="btn-primary w-full h-[46px] text-[14px]"
                >
                  {isSubmitting ? (
                    <span className="flex items-center justify-center space-x-2">
                      <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      <span>Signing in…</span>
                    </span>
                  ) : (
                    <span>Sign in</span>
                  )}
                </button>
              </div>
            </form>

            {/* Banners */}
            {banner && (
              <div
                className={`mt-4 p-3.5 rounded-[3px] text-[12.5px] leading-relaxed border ${
                  banner.type === 'error'
                    ? 'bg-[#FBEAE8] border-[#EFC5BF] text-[#AE2E22]'
                    : banner.type === 'warn'
                    ? 'bg-[#FBF1DD] border-[#E9D6A3] text-[#8A5A00]'
                    : 'bg-[#E8F3EC] border-[#BEDFCB] text-[#1E7A46]'
                }`}
              >
                {banner.message}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-[#DBD7C9]/60 text-center space-y-1.5">
            <p className="text-[12.5px] text-[#59626F]">
              Trouble signing in?{' '}
              <a href="#contact" className="underline hover:text-[#16233F]">
                Contact your event coordinator.
              </a>
            </p>
            <p className="text-[11.5px] text-[#8B93A0] font-medium font-sans">
                Developed by 3rd year students
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
