import React from 'react';

interface VeddLogoProps {
  height?: number;
  className?: string;
}

const VeddLogo: React.FC<VeddLogoProps> = ({ height = 40, className = '' }) => {
  const aspectRatio = 3.5; // Approximate width-to-height ratio of the logo
  const width = height * aspectRatio;
  
  return (
    <svg 
      className={className} 
      height={height} 
      width={width}
      viewBox="0 0 500 143" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="xMidYMid meet"
    >
      {/* V */}
      <path d="M40 0L80 140L120 0H40Z" fill="#333333"/>
      
      {/* E */}
      <path d="M140 0H230V30H140V0Z" fill="#333333"/>
      <path d="M140 55H230V85H140V55Z" fill="#333333"/>
      <path d="M140 110H230V140H140V110Z" fill="#333333"/>
      
      {/* First D */}
      <path d="M250 0H320C365 0 390 30 390 70C390 110 365 140 320 140H250V0Z" fill="#333333"/>
      
      {/* Second D */}
      <path d="M410 0H480C525 0 550 30 550 70C550 110 525 140 480 140H410V0Z" fill="#333333"/>
      
      {/* Red cursive text */}
      <path d="M205 143C205 143 270 155 340 143" stroke="#E64A4A" strokeWidth="3" strokeLinecap="round"/>
    </svg>
  );
};

export default VeddLogo;
