import React from 'react';

interface VeddLogoProps {
  height?: number;
  className?: string;
}

const VeddLogo: React.FC<VeddLogoProps> = ({ height = 40, className = '' }) => {
  return (
    <svg 
      className={className} 
      height={height} 
      viewBox="0 0 120 40" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M20 10L25 30L30 10H20Z" fill="#333333"/>
      <path d="M35 10H60V15H35V10Z" fill="#333333"/>
      <path d="M35 17.5H60V22.5H35V17.5Z" fill="#333333"/>
      <path d="M35 25H60V30H35V25Z" fill="#333333"/>
      <path d="M65 10C65 10 70 10 75 10C80 10 85 15 85 20C85 25 80 30 75 30H65V10Z" fill="#333333"/>
      <path d="M90 10C90 10 95 10 100 10C105 10 110 15 110 20C110 25 105 30 100 30H90V10Z" fill="#333333"/>
      <path d="M40 35C40 35 60 40 80 35" stroke="#E64A4A" strokeWidth="1"/>
    </svg>
  );
};

export default VeddLogo;
