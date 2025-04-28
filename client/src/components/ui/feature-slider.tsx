import React, { useState, useEffect, useCallback } from 'react';
import useEmblaCarousel from 'embla-carousel-react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

type FeatureSlideItem = {
  icon: React.ReactNode;
  title: string;
  description: string;
  color: string;
  bgGradient: string;
};

interface FeatureSliderProps {
  items: FeatureSlideItem[];
  className?: string;
  autoplay?: boolean;
  autoplayInterval?: number;
}

export function FeatureSlider({ 
  items, 
  className,
  autoplay = true,
  autoplayInterval = 4000
}: FeatureSliderProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, align: 'start' });
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
          {items.map((item, index) => (
            <div
              key={index}
              className="flex-[0_0_100%] min-w-0 relative px-4 md:px-10 transition-opacity duration-500"
              style={{ opacity: selectedIndex === index ? 1 : 0.7 }}
            >
              <div className={`bg-theme-light border border-theme-light p-6 md:p-8 rounded-2xl shadow-theme h-full flex flex-col`}>
                <div className="flex items-center mb-4">
                  <div className={`p-3 rounded-full ${item.color} dark:bg-opacity-20 mr-4 shadow-lg`}>
                    {item.icon}
                  </div>
                  <h3 className="text-xl md:text-2xl font-bold text-theme-main">{item.title}</h3>
                </div>
                <p className="text-theme-muted text-base md:text-lg">{item.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Navigation arrows */}
      <button
        className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 dark:bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 dark:hover:bg-white/30 transition-colors z-10"
        onClick={scrollPrev}
        aria-label="Previous feature"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <button
        className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-black/40 dark:bg-white/20 backdrop-blur-sm flex items-center justify-center text-white hover:bg-black/60 dark:hover:bg-white/30 transition-colors z-10"
        onClick={scrollNext}
        aria-label="Next feature"
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
                : 'bg-gray-400 dark:bg-gray-600 opacity-50 hover:opacity-75'
            }`}
            onClick={() => scrollTo(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}