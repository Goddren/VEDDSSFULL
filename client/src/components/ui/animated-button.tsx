import React, { useState } from 'react';
import { Button, ButtonProps } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface AnimatedButtonProps extends ButtonProps {
  glowColor?: string;
  pulseOnHover?: boolean;
  rippleEffect?: boolean;
  scaleOnHover?: boolean;
  rotateIcon?: boolean;
  slideText?: boolean;
  children: React.ReactNode;
}

export const AnimatedButton: React.FC<AnimatedButtonProps> = ({
  className,
  variant = 'default',
  glowColor,
  pulseOnHover = false,
  rippleEffect = false,
  scaleOnHover = true,
  rotateIcon = false,
  slideText = false,
  onClick,
  children,
  ...props
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const [ripples, setRipples] = useState<{ x: number; y: number; id: number }[]>([]);

  const defaultGlowMap = {
    default: 'rgba(100, 100, 255, 0.5)',
    destructive: 'rgba(255, 100, 100, 0.5)',
    outline: 'rgba(255, 255, 255, 0.2)',
    secondary: 'rgba(160, 160, 160, 0.5)',
    ghost: 'rgba(255, 255, 255, 0.1)',
    link: 'transparent',
  };

  const glow = glowColor || defaultGlowMap[variant as keyof typeof defaultGlowMap];

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLButtonElement>) => {
    setIsPressed(true);

    if (rippleEffect) {
      const button = e.currentTarget;
      const rect = button.getBoundingClientRect();
      
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const rippleId = Date.now();
      setRipples([...ripples, { x, y, id: rippleId }]);
      
      setTimeout(() => {
        setRipples(ripples => ripples.filter(ripple => ripple.id !== rippleId));
      }, 800);
    }
  };

  const handleMouseUp = () => {
    setIsPressed(false);
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (onClick) {
      onClick(e);
    }
  };

  const renderChildren = () => {
    if (!rotateIcon && !slideText) return children;

    // If it's a simple text node
    if (typeof children === 'string') {
      return (
        <span
          className={cn(
            slideText && "transition-transform duration-300",
            slideText && isHovered && "transform translate-x-1"
          )}
        >
          {children}
        </span>
      );
    }

    // For more complex children (with icons)
    return React.Children.map(children, child => {
      if (React.isValidElement(child) && (
        child.type === 'svg' || 
        // Check if it's likely an icon (Lucide icon or similar)
        (typeof child.type === 'function' && 
         child.props && 
         (child.props.width || child.props.size || 
          (child.props.className && child.props.className.includes('w-'))))
      )) {
        // It's an icon, apply rotation if needed
        return React.cloneElement(child as React.ReactElement, {
          className: cn(
            (child as React.ReactElement).props.className,
            rotateIcon && "transition-transform duration-300",
            rotateIcon && isHovered && "transform rotate-12"
          )
        });
      } else if (typeof child === 'string' || (React.isValidElement(child) && child.type === 'span')) {
        // It's text or a span, apply slide if needed
        if (typeof child === 'string') {
          return (
            <span
              className={cn(
                slideText && "transition-transform duration-300",
                slideText && isHovered && "transform translate-x-1"
              )}
            >
              {child}
            </span>
          );
        }
        return React.cloneElement(child as React.ReactElement, {
          className: cn(
            (child as React.ReactElement).props.className,
            slideText && "transition-transform duration-300",
            slideText && isHovered && "transform translate-x-1"
          )
        });
      }
      return child;
    });
  };

  return (
    <Button
      className={cn(
        "relative overflow-hidden transition-all duration-300",
        scaleOnHover && isHovered && "transform scale-105",
        isPressed && "transform scale-95",
        pulseOnHover && isHovered && "animate-pulse",
        glow && isHovered && `shadow-lg`,
        className
      )}
      variant={variant}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onClick={handleClick}
      style={{
        boxShadow: isHovered && glow ? `0 0 15px ${glow}` : undefined,
      }}
      {...props}
    >
      {renderChildren()}
      
      {/* Ripple effect */}
      <AnimatePresence>
        {rippleEffect && ripples.map(ripple => (
          <motion.span
            key={ripple.id}
            initial={{ 
              opacity: 0.5,
              scale: 0.1,
              x: ripple.x, 
              y: ripple.y 
            }}
            animate={{ 
              opacity: 0,
              scale: 4,
            }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute rounded-full bg-white/30 pointer-events-none"
            style={{ 
              width: '10px', 
              height: '10px',
              marginLeft: '-5px',
              marginTop: '-5px',
              zIndex: 10
            }}
          />
        ))}
      </AnimatePresence>
    </Button>
  );
};

export default AnimatedButton;