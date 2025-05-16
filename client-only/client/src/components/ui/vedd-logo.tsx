import React from 'react';
import logoImage from '@assets/IMG_3645.png';

interface VeddLogoProps {
  height?: number;
  className?: string;
}

const VeddLogo: React.FC<VeddLogoProps> = ({ height = 40, className = '' }) => {
  // Using the exact image provided without modifications
  return (
    <img 
      src={logoImage} 
      alt="VEDD Logo" 
      className={className}
      style={{ height: height || 'auto' }}
    />
  );
};

export default VeddLogo;
