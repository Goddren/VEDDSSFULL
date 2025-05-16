import { ArrowRight } from "lucide-react";
import { Link } from "wouter";
import { ReactNode } from "react";

interface SlidingButtonProps {
  children: ReactNode;
  href: string;
  width?: string;
  gradient?: string;
  className?: string;
}

export function SlidingButton({
  children,
  href,
  width = "w-full max-w-[280px]",
  gradient = "from-red-600 via-red-500 to-red-600",
  className = "",
}: SlidingButtonProps) {
  return (
    <Link href={href} className={`${width} ${className}`}>
      <div className="relative w-full h-16 rounded-full bg-gray-800 p-1 overflow-hidden cursor-pointer shadow-lg shadow-gray-900/20 group">
        {/* Track */}
        <div className={`absolute inset-0 bg-gradient-to-r ${gradient} opacity-90 bg-size-200 animate-gradient-x`}></div>
        
        {/* Animated background effects */}
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -bottom-10 -left-10 h-20 w-20 bg-white/20 rounded-full transition-all duration-500 group-hover:scale-150"></div>
          <div className="absolute -top-10 -right-10 h-20 w-20 bg-white/20 rounded-full transition-all duration-500 group-hover:scale-150"></div>
        </div>
        
        {/* Text label */}
        <div className="absolute inset-0 flex items-center justify-center text-white font-semibold text-lg">
          <span className="mr-2">{children}</span>
          <span className="transform transition-transform duration-500 group-hover:translate-x-3">→</span>
        </div>
        
        {/* Left sliding indicator */}
        <div className="absolute left-1 top-1 bottom-1 flex items-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform -translate-x-full group-hover:translate-x-0">
          <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center">
            <ArrowRight className="h-5 w-5 text-white" />
          </div>
        </div>
        
        {/* Right sliding indicator */}
        <div className="absolute right-1 top-1 bottom-1 flex items-center opacity-0 group-hover:opacity-100 transition-all duration-500 transform translate-x-full group-hover:translate-x-0">
          <div className="h-14 w-14 rounded-full bg-white/10 flex items-center justify-center">
            <ArrowRight className="h-5 w-5 text-white" />
          </div>
        </div>
      </div>
    </Link>
  );
}