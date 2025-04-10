import React, { useState, forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

interface AnimatedInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  helperText?: string;
  animation?: 'glow' | 'float' | 'expand' | 'border' | 'shake' | 'none';
  glowColor?: string;
  labelAnimation?: boolean;
  error?: string;
}

export const AnimatedInput = forwardRef<HTMLInputElement, AnimatedInputProps>(
  ({ 
    className, 
    label, 
    helperText, 
    animation = 'border', 
    glowColor = 'rgba(239, 68, 68, 0.3)', 
    labelAnimation = true,
    error,
    id,
    ...props 
  }, ref) => {
    const [isFocused, setIsFocused] = useState(false);
    const [hasValue, setHasValue] = useState(!!props.defaultValue || !!props.value);
    
    const inputId = id || `animated-input-${Math.random().toString(36).substr(2, 9)}`;

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(true);
      if (props.onFocus) props.onFocus(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setIsFocused(false);
      if (props.onBlur) props.onBlur(e);
    };

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setHasValue(!!e.target.value);
      if (props.onChange) props.onChange(e);
    };

    // Animation variants
    const getInputAnimation = () => {
      switch (animation) {
        case 'glow':
          return cn(
            "transition-all duration-300",
            isFocused && `shadow-[0_0_10px_${glowColor}]`
          );
        case 'float':
          return cn(
            "transition-all duration-300",
            isFocused && "transform translate-y-[-4px]"
          );
        case 'expand':
          return cn(
            "transition-all duration-300",
            isFocused && "transform scale-[1.02]"
          );
        case 'border':
          return cn(
            "transition-all duration-300",
            isFocused && "border-b-2 border-primary"
          );
        case 'shake':
          return isFocused ? "animate-shake" : "";
        default:
          return "";
      }
    };

    return (
      <div className={cn("space-y-2", className)}>
        {label && (
          <Label 
            htmlFor={inputId}
            className={cn(
              "transition-all duration-300",
              labelAnimation && isFocused && "text-primary transform translate-x-1"
            )}
          >
            {label}
          </Label>
        )}
        
        <div className="relative">
          <Input
            id={inputId}
            ref={ref}
            className={cn(
              "transition-all duration-300",
              getInputAnimation(),
              error && "border-red-500 focus-visible:ring-red-500",
              props.disabled && "opacity-70 cursor-not-allowed"
            )}
            style={{
              boxShadow: animation === 'glow' && isFocused ? `0 0 10px ${glowColor}` : undefined
            }}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onChange={handleChange}
            {...props}
          />
          
          {isFocused && animation === 'border' && (
            <motion.div
              className="absolute bottom-0 left-0 h-0.5 bg-primary"
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: 0.3 }}
            />
          )}
        </div>
        
        {(error || helperText) && (
          <p className={cn(
            "text-xs", 
            error ? "text-red-500" : "text-gray-400"
          )}>
            {error || helperText}
          </p>
        )}
      </div>
    );
  }
);

AnimatedInput.displayName = 'AnimatedInput';

export default AnimatedInput;