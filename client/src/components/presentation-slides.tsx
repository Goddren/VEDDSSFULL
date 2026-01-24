import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { 
  ChevronLeft, 
  ChevronRight, 
  Presentation, 
  Sparkles, 
  Clock, 
  Loader2,
  Eye,
  EyeOff,
  Maximize,
  Minimize,
  Lightbulb,
  AlertTriangle,
  CheckCircle,
  HelpCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import VeddLogo from '@/components/ui/vedd-logo';

interface PresentationSlide {
  slideNumber: number;
  title: string;
  bulletPoints: string[];
  explainerExample?: string;
  realWorldExample?: string;
  notableIncident?: string;
  keyReasons?: string[];
  speakerNotes?: string;
  visualSuggestion?: string;
  duration?: string;
}

interface PresentationOutline {
  eventTitle: string;
  totalSlides: number;
  estimatedDuration: string;
  slides: PresentationSlide[];
}

interface PresentationSlidesProps {
  eventId: number;
  scheduleId?: number;
  eventTitle: string;
  eventDescription?: string;
  talkingPoints?: string[];
  agenda?: { time: string; topic: string; notes?: string }[];
  duration?: number;
  onSlideChange?: (slideNumber: number) => void;
}

export function PresentationSlides({
  eventId,
  scheduleId,
  eventTitle,
  eventDescription = '',
  talkingPoints = [],
  agenda = [],
  duration = 30,
  onSlideChange
}: PresentationSlidesProps) {
  const { toast } = useToast();
  const [isEnabled, setIsEnabled] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [presentation, setPresentation] = useState<PresentationOutline | null>(null);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [showSpeakerNotes, setShowSpeakerNotes] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const generateOutline = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/presentation/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          eventId,
          scheduleId,
          eventTitle,
          eventDescription,
          talkingPoints,
          agenda,
          duration
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate presentation');
      }

      const data = await response.json();
      setPresentation(data);
      setCurrentSlide(0);
      toast({
        title: 'Presentation Generated',
        description: `${data.totalSlides} slides ready for your session`
      });
    } catch (error) {
      console.error('Error generating presentation:', error);
      toast({
        title: 'Generation Failed',
        description: 'Could not generate presentation outline',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggle = (enabled: boolean) => {
    setIsEnabled(enabled);
    if (enabled && !presentation) {
      generateOutline();
    }
  };

  const nextSlide = () => {
    if (presentation && currentSlide < presentation.slides.length - 1) {
      const newSlide = currentSlide + 1;
      setCurrentSlide(newSlide);
      onSlideChange?.(newSlide);
    }
  };

  const prevSlide = () => {
    if (currentSlide > 0) {
      const newSlide = currentSlide - 1;
      setCurrentSlide(newSlide);
      onSlideChange?.(newSlide);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isEnabled || !presentation) return;
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        nextSlide();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        prevSlide();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isEnabled, presentation, currentSlide]);

  const currentSlideData = presentation?.slides[currentSlide];

  return (
    <Card className="bg-gradient-to-br from-gray-900 to-gray-950 border-purple-500/30 p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Presentation className="h-5 w-5 text-purple-400" />
          <Label htmlFor="presentation-toggle" className="font-medium text-white">
            AI Presentation Outline
          </Label>
        </div>
        <div className="flex items-center gap-3">
          {presentation && (
            <Badge variant="outline" className="text-purple-400 border-purple-500/50">
              {presentation.totalSlides} slides
            </Badge>
          )}
          <Switch
            id="presentation-toggle"
            checked={isEnabled}
            onCheckedChange={handleToggle}
            disabled={isLoading}
          />
        </div>
      </div>

      {isLoading && (
        <div className="flex flex-col items-center justify-center py-8 text-purple-400">
          <Loader2 className="h-8 w-8 animate-spin mb-3" />
          <p className="text-sm">Generating AI presentation outline...</p>
        </div>
      )}

      {isEnabled && presentation && !isLoading && (
        <div className={`space-y-4 ${isFullscreen ? 'fixed inset-0 z-50 bg-gray-950 p-6' : ''}`}>
          {isFullscreen && (
            <div className="flex items-center justify-between mb-4">
              <VeddLogo height={32} />
              <Button variant="ghost" size="sm" onClick={() => setIsFullscreen(false)}>
                <Minimize className="h-4 w-4 mr-1" /> Exit Fullscreen
              </Button>
            </div>
          )}

          <div className={`bg-gradient-to-br from-purple-900/40 to-indigo-900/30 rounded-xl p-6 border border-purple-500/30 ${isFullscreen ? 'min-h-[60vh]' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <VeddLogo height={24} className={isFullscreen ? 'hidden' : ''} />
                <Badge className="bg-purple-600 text-white">
                  Slide {currentSlide + 1} of {presentation.totalSlides}
                </Badge>
              </div>
              {currentSlideData?.duration && (
                <Badge variant="outline" className="text-gray-400 border-gray-600">
                  <Clock className="h-3 w-3 mr-1" />
                  {currentSlideData.duration}
                </Badge>
              )}
            </div>

            <h2 className={`font-bold text-white mb-6 ${isFullscreen ? 'text-4xl' : 'text-2xl'}`}>
              {currentSlideData?.title}
            </h2>

            <ul className="space-y-3 mb-6">
              {currentSlideData?.bulletPoints.map((point, i) => (
                <li 
                  key={i} 
                  className={`flex items-start gap-3 text-gray-200 ${isFullscreen ? 'text-xl' : 'text-base'}`}
                >
                  <span className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-500/30 flex items-center justify-center text-purple-300 text-sm font-medium">
                    {i + 1}
                  </span>
                  {point}
                </li>
              ))}
            </ul>

            {currentSlideData?.explainerExample && (
              <div className={`bg-purple-900/30 rounded-lg p-3 border border-purple-500/30 mb-3 ${isFullscreen ? 'p-4' : ''}`}>
                <div className="flex items-start gap-2">
                  <HelpCircle className={`text-purple-400 flex-shrink-0 ${isFullscreen ? 'h-5 w-5' : 'h-4 w-4'}`} />
                  <div>
                    <p className={`text-purple-300 font-medium mb-1 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>Think of it like this...</p>
                    <p className={`text-gray-300 ${isFullscreen ? 'text-base' : 'text-sm'}`}>{currentSlideData.explainerExample}</p>
                  </div>
                </div>
              </div>
            )}

            {currentSlideData?.realWorldExample && (
              <div className={`bg-green-900/30 rounded-lg p-3 border border-green-500/30 mb-3 ${isFullscreen ? 'p-4' : ''}`}>
                <div className="flex items-start gap-2">
                  <Lightbulb className={`text-green-400 flex-shrink-0 ${isFullscreen ? 'h-5 w-5' : 'h-4 w-4'}`} />
                  <div>
                    <p className={`text-green-300 font-medium mb-1 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>Real-World Example</p>
                    <p className={`text-gray-300 ${isFullscreen ? 'text-base' : 'text-sm'}`}>{currentSlideData.realWorldExample}</p>
                  </div>
                </div>
              </div>
            )}

            {currentSlideData?.notableIncident && (
              <div className={`bg-amber-900/30 rounded-lg p-3 border border-amber-500/30 mb-3 ${isFullscreen ? 'p-4' : ''}`}>
                <div className="flex items-start gap-2">
                  <AlertTriangle className={`text-amber-400 flex-shrink-0 ${isFullscreen ? 'h-5 w-5' : 'h-4 w-4'}`} />
                  <div>
                    <p className={`text-amber-300 font-medium mb-1 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>Notable Incident</p>
                    <p className={`text-gray-300 ${isFullscreen ? 'text-base' : 'text-sm'}`}>{currentSlideData.notableIncident}</p>
                  </div>
                </div>
              </div>
            )}

            {currentSlideData?.keyReasons && currentSlideData.keyReasons.length > 0 && (
              <div className={`bg-blue-900/30 rounded-lg p-3 border border-blue-500/30 mb-3 ${isFullscreen ? 'p-4' : ''}`}>
                <div className="flex items-start gap-2">
                  <CheckCircle className={`text-blue-400 flex-shrink-0 ${isFullscreen ? 'h-5 w-5' : 'h-4 w-4'}`} />
                  <div>
                    <p className={`text-blue-300 font-medium mb-1 ${isFullscreen ? 'text-lg' : 'text-sm'}`}>Key Reasons</p>
                    <ul className="space-y-1">
                      {currentSlideData.keyReasons.map((reason, i) => (
                        <li key={i} className={`text-gray-300 ${isFullscreen ? 'text-base' : 'text-sm'}`}>
                          • {reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {currentSlideData?.visualSuggestion && (
              <div className="text-xs text-gray-500 italic flex items-center gap-1">
                <Sparkles className="h-3 w-3" />
                Visual: {currentSlideData.visualSuggestion}
              </div>
            )}
          </div>

          {showSpeakerNotes && currentSlideData?.speakerNotes && (
            <div className="bg-gray-800/50 rounded-lg p-3 border border-gray-700">
              <p className="text-xs text-gray-400 mb-1 font-medium">Speaker Notes:</p>
              <p className="text-sm text-gray-300">{currentSlideData.speakerNotes}</p>
            </div>
          )}

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={prevSlide}
                disabled={currentSlide === 0}
                className="border-gray-700"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={nextSlide}
                disabled={currentSlide === presentation.slides.length - 1}
                className="border-gray-700"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSpeakerNotes(!showSpeakerNotes)}
                className="text-gray-400"
              >
                {showSpeakerNotes ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsFullscreen(!isFullscreen)}
                className="text-gray-400"
              >
                <Maximize className="h-4 w-4" />
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={generateOutline}
                className="border-purple-500/50 text-purple-400"
              >
                <Sparkles className="h-4 w-4 mr-1" />
                Regenerate
              </Button>
            </div>
          </div>

          <div className="flex gap-1">
            {presentation.slides.map((_, i) => (
              <button
                key={i}
                onClick={() => {
                  setCurrentSlide(i);
                  onSlideChange?.(i);
                }}
                className={`flex-1 h-1.5 rounded-full transition-all ${
                  i === currentSlide 
                    ? 'bg-purple-500' 
                    : i < currentSlide 
                      ? 'bg-purple-500/50' 
                      : 'bg-gray-700'
                }`}
              />
            ))}
          </div>
        </div>
      )}

      {!isEnabled && !isLoading && (
        <p className="text-sm text-gray-500 text-center py-4">
          Enable to generate AI-powered presentation slides for your session
        </p>
      )}
    </Card>
  );
}
