import React, { useState, useEffect, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PatternSlideItem = {
  name: string;
  type: string;
  description: string;
  percentage: number;
  icon: React.ReactNode;
  bgClass: string;
  barClass: string;
  imageUrl?: string; // Optional chart pattern image
};

interface PatternSliderProps {
  items: PatternSlideItem[];
  className?: string;
  autoplay?: boolean;
  autoplayInterval?: number;
}

export function PatternSlider({ 
  items, 
  className,
  autoplay = true,
  autoplayInterval = 5000
}: PatternSliderProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'center' });
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);

  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);

  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);

  const scrollTo = useCallback(
    (index: number) => {
      if (emblaApi) emblaApi.scrollTo(index);
    },
    [emblaApi]
  );

  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    
    onSelect();
    setScrollSnaps(emblaApi.scrollSnapList());
    emblaApi.on('select', onSelect);
    
    return () => {
      emblaApi.off('select', onSelect);
    };
  }, [emblaApi, onSelect]);

  // Autoplay effect
  useEffect(() => {
    if (!autoplay || !emblaApi) return;
    
    const intervalId = setInterval(() => {
      emblaApi.scrollNext();
    }, autoplayInterval);
    
    return () => clearInterval(intervalId);
  }, [emblaApi, autoplay, autoplayInterval]);

  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {items.map((pattern, index) => (
            <div
              key={index}
              className="flex-[0_0_100%] min-w-0 relative px-4 md:px-8 transition-opacity duration-500"
              style={{ opacity: selectedIndex === index ? 1 : 0.6 }}
            >
              <div className="bg-gray-900/80 backdrop-blur-md p-6 rounded-xl border border-gray-800 shadow-xl h-full transform transition-all duration-300 hover:border-gray-700">
                <div className="flex flex-col md:flex-row gap-6 items-center md:items-start">
                  {/* Pattern image (if available) */}
                  {pattern.imageUrl && (
                    <div className="w-full md:w-1/2 flex-shrink-0 rounded-lg overflow-hidden border border-gray-800 shadow-inner">
                      <img 
                        src={pattern.imageUrl} 
                        alt={`${pattern.name} pattern example`} 
                        className="w-full h-auto object-cover"
                      />
                    </div>
                  )}
                  
                  {/* Pattern details */}
                  <div className={!pattern.imageUrl ? "w-full" : "w-full md:w-1/2"}>
                    <div className="flex items-center gap-3 mb-4">
                      <div className={`p-3 rounded-full ${pattern.bgClass} transition-colors duration-300`}>
                        <div className="animate-pulse">
                          {pattern.icon}
                        </div>
                      </div>
                      <div>
                        <h3 className="text-xl font-semibold text-white">{pattern.name}</h3>
                        <span className="text-sm text-gray-400">{pattern.type} Pattern</span>
                      </div>
                    </div>
                    
                    <p className="text-gray-300 mb-4 leading-relaxed">{pattern.description}</p>
                    
                    <div className="mt-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400">Distribution</span>
                        <span className="text-white font-medium">{pattern.percentage}%</span>
                      </div>
                      <div className="w-full bg-gray-800 rounded-full h-2 overflow-hidden">
                        <div 
                          className={`${pattern.barClass} h-2 rounded-full transform-gpu transition-all duration-1000 ease-out`}
                          style={{ 
                            width: `${pattern.percentage}%`,
                            animation: 'width 1.5s ease-out',
                          }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation arrows */}
      <button
        className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors z-10"
        onClick={scrollPrev}
        aria-label="Previous pattern"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/50 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/80 transition-colors z-10"
        onClick={scrollNext}
        aria-label="Next pattern"
      >
        <ChevronRight className="h-6 w-6" />
      </button>

      {/* Dots indicator */}
      <div className="flex justify-center mt-4">
        {scrollSnaps.map((_, index) => (
          <button
            key={index}
            className={`w-3 h-3 mx-1 rounded-full transition-all ${
              index === selectedIndex 
                ? 'bg-red-500 scale-125' 
                : 'bg-gray-500 opacity-50 hover:opacity-75'
            }`}
            onClick={() => scrollTo(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}