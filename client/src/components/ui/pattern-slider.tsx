import { useState, useEffect, useCallback, type ReactNode } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";
import useEmblaCarousel from "embla-carousel-react";

export interface PatternSlideItem {
  name: string;
  type: string;
  percentage: number;
  description: string;
  bgClass: string;
  barClass: string;
  icon: React.ComponentType<{ className?: string }>;
  imageUrl: string;
}

interface PatternSliderProps {
  className?: string;
}

export function PatternSlider({ className = "" }: PatternSliderProps) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ 
    loop: true,
    align: "start",
    skipSnaps: false
  });
  
  const [slides, setSlides] = useState<PatternSlideItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [scrollSnaps, setScrollSnaps] = useState<number[]>([]);
  
  // Load pattern slides from the pattern-descriptions module
  useEffect(() => {
    const loadPatterns = async () => {
      try {
        const { patternDescriptions } = await import('@/assets/pattern-descriptions');
        setSlides(patternDescriptions);
      } catch (error) {
        console.error("Failed to load pattern descriptions:", error);
      }
    };
    
    loadPatterns();
  }, []);
  
  // Set up embla carousel hooks
  const scrollPrev = useCallback(() => {
    if (emblaApi) emblaApi.scrollPrev();
  }, [emblaApi]);
  
  const scrollNext = useCallback(() => {
    if (emblaApi) emblaApi.scrollNext();
  }, [emblaApi]);
  
  const onSelect = useCallback(() => {
    if (!emblaApi) return;
    setSelectedIndex(emblaApi.selectedScrollSnap());
  }, [emblaApi]);
  
  useEffect(() => {
    if (!emblaApi) return;
    
    setScrollSnaps(emblaApi.scrollSnapList());
    emblaApi.on("select", onSelect);
    onSelect();
    
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);
  
  return (
    <div className={`${className} relative overflow-hidden`}>
      <div className="overflow-hidden" ref={emblaRef}>
        <div className="flex">
          {slides.map((pattern, index) => (
            <div 
              key={index}
              className="flex-[0_0_100%] min-w-0 sm:flex-[0_0_calc(50%-1rem)] lg:flex-[0_0_calc(33.333%-1rem)] pl-4 first:pl-0"
            >
              <div className={`flex flex-col h-full p-6 rounded-lg ${pattern.bgClass} border border-white/10 shadow-lg transition-all duration-300 hover:border-white/20 hover:shadow-xl`}>
                <div className="flex flex-col items-center mb-6 sm:mb-4 sm:items-start sm:flex-row">
                  <div className="flex-shrink-0 mb-3 sm:mb-0 sm:mr-3">
                    <div className="relative">
                      <img 
                        src={pattern.imageUrl} 
                        alt={pattern.name}
                        className="w-20 h-20 object-contain bg-gray-900 rounded-md"
                        onError={(e) => {
                          console.error(`Failed to load image: ${pattern.imageUrl}`);
                          e.currentTarget.onerror = null;
                          e.currentTarget.src = "data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgdmlld0JveD0iMCAwIDIwMCAyMDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PHJlY3Qgd2lkdGg9IjIwMCIgaGVpZ2h0PSIyMDAiIGZpbGw9IiMzMzMiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZm9udC1mYW1pbHk9Im1vbm9zcGFjZSIgZm9udC1zaXplPSIyMCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZmlsbD0iI2ZmZiIgZHk9Ii4zZW0iPkltYWdlIE5vdCBGb3VuZDwvdGV4dD48L3N2Zz4=";
                        }}
                      />
                    </div>
                  </div>
                  
                  <div className="flex flex-col text-center sm:text-left">
                    <h3 className="text-lg font-bold text-white mb-1">{pattern.name}</h3>
                    <span className="text-sm font-medium text-white/70 mb-2">{pattern.type} Pattern</span>
                    
                    <div className="flex flex-col">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-white/60">Frequency</span>
                        <span className="text-xs font-semibold text-white">{pattern.percentage}%</span>
                      </div>
                      
                      <div className="w-full h-2 bg-white/10 rounded-full mt-1 overflow-hidden">
                        <div 
                          className={`h-full ${pattern.barClass} rounded-full`}
                          style={{ width: `${pattern.percentage}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                </div>
                
                <p className="text-sm text-white/80 flex-grow">{pattern.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Navigation buttons */}
      <button 
        className="absolute top-1/2 left-1 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 transition-all p-2 rounded-full backdrop-blur-sm"
        onClick={scrollPrev}
      >
        <ChevronLeft className="h-5 w-5 text-white" />
      </button>
      
      <button 
        className="absolute top-1/2 right-1 transform -translate-y-1/2 bg-black/50 hover:bg-black/70 transition-all p-2 rounded-full backdrop-blur-sm"
        onClick={scrollNext}
      >
        <ChevronRight className="h-5 w-5 text-white" />
      </button>
      
      {/* Pagination dots */}
      <div className="flex justify-center mt-4">
        {scrollSnaps.map((_, index) => (
          <button
            key={index}
            className={`mx-1 w-2 h-2 rounded-full transition-all ${
              index === selectedIndex 
                ? "bg-white w-4" 
                : "bg-white/30 hover:bg-white/50"
            }`}
            onClick={() => emblaApi?.scrollTo(index)}
            aria-label={`Go to slide ${index + 1}`}
          />
        ))}
      </div>
    </div>
  );
}