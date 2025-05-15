import React, { useState, useEffect } from 'react';
import { SwipeCard } from './swipe-card';
import { ChartAnalysis } from '@shared/schema';
import { Button } from '@/components/ui/button';
import { RefreshCw, Filter } from 'lucide-react';

interface SwipeDeckProps {
  analyses: ChartAnalysis[];
  onFilterClick?: () => void;
}

export const SwipeDeck: React.FC<SwipeDeckProps> = ({ analyses, onFilterClick }) => {
  const [cards, setCards] = useState<ChartAnalysis[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [emptyMessage, setEmptyMessage] = useState<string>('');
  const [noMoreCards, setNoMoreCards] = useState(false);
  
  // Initialize with analyses when they load
  useEffect(() => {
    if (analyses.length > 0) {
      setCards(analyses);
      setCurrentIndex(0);
      setNoMoreCards(false);
    } else {
      setEmptyMessage('No analyses found');
    }
  }, [analyses]);
  
  // Handle swipe action (either left or right)
  const handleSwipe = (direction: 'left' | 'right') => {
    // Move to next card
    setTimeout(() => {
      if (currentIndex < cards.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        setNoMoreCards(true);
      }
    }, 300);
  };
  
  // Reset the deck back to the beginning
  const resetDeck = () => {
    setCurrentIndex(0);
    setNoMoreCards(false);
  };

  if (analyses.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-96 p-8 text-center">
        <div className="text-gray-400 mb-6">
          <p className="text-xl mb-2">No analyses found</p>
          <p className="text-sm">Create a new analysis to start building your trading history</p>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Card Deck */}
      <div className="relative h-[600px] md:h-[700px] mb-8 mx-auto max-w-md">
        {/* Display cards in reverse order so the first card is on top */}
        {!noMoreCards ? (
          cards
            .slice(currentIndex, currentIndex + 3) // Only render 3 cards at a time for performance
            .map((analysis, i) => (
              <SwipeCard
                key={analysis.id}
                analysis={analysis}
                onSwipe={handleSwipe}
                isTop={i === 0}
              />
            ))
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#1A1A1A] rounded-xl border border-[#333333] p-8 text-center">
            <p className="text-xl mb-4 text-gray-300">You've seen all analyses</p>
            <p className="text-sm text-gray-400 mb-6">Want to browse them again?</p>
            <Button onClick={resetDeck} className="bg-[#E64A4A] hover:bg-opacity-80">
              <RefreshCw className="mr-2 h-4 w-4" /> Reset Deck
            </Button>
          </div>
        )}
      </div>
      
      {/* Card count indicator */}
      <div className="text-center mb-4">
        <p className="text-sm text-gray-400">
          {noMoreCards 
            ? `You've seen all ${cards.length} analyses` 
            : `Analysis ${currentIndex + 1} of ${cards.length}`}
        </p>
      </div>
      
      {/* Filter button */}
      {onFilterClick && (
        <div className="flex justify-center">
          <Button
            variant="outline"
            className="border-[#333333] hover:bg-[#333333]"
            onClick={onFilterClick}
          >
            <Filter className="mr-2 h-4 w-4" /> Filter Analyses
          </Button>
        </div>
      )}
    </div>
  );
};