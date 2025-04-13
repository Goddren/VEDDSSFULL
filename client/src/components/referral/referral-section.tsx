import React from 'react';
import ReferralCard from './referral-card';
import ReferralLeaderboard from './referral-leaderboard';

interface ReferralSectionProps {
  className?: string;
  preview?: boolean;
}

export function ReferralSection({ className = '', preview = false }: ReferralSectionProps) {
  // Referral system is now active
  preview = false;
  return (
    <div className={`${className} space-y-6`}>
      <h2 className="text-2xl font-bold">
        {preview ? 'Coming Soon: Referral Program' : 'Refer & Earn'}
      </h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ReferralCard preview={preview} />
        <ReferralLeaderboard preview={preview} />
      </div>
    </div>
  );
}

export default ReferralSection;