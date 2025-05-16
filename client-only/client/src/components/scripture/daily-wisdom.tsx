import React from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { BiBook } from 'react-icons/bi';
import { TooltipProvider, Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getScriptureWisdomForToday } from '@/data/scripture-wisdom';
import { TbShare3 } from 'react-icons/tb';

interface DailyScriptureWisdomProps {
  className?: string;
  forceId?: number; // Optional ID to force a specific scripture
}

export function DailyScriptureWisdom({ className, forceId }: DailyScriptureWisdomProps) {
  // Get today's scripture and wisdom
  const scriptureWisdom = getScriptureWisdomForToday(forceId);

  // Function to share scripture wisdom
  const handleShare = () => {
    const text = `"${scriptureWisdom.verse}" - ${scriptureWisdom.reference}\n\nTrading wisdom: ${scriptureWisdom.tradingWisdom}`;
    
    if (navigator.share) {
      navigator.share({
        title: 'Daily Scripture Trading Wisdom',
        text: text,
      }).catch((error) => console.log('Error sharing:', error));
    } else {
      navigator.clipboard.writeText(text)
        .then(() => {
          alert('Scripture and trading wisdom copied to clipboard!');
        })
        .catch(err => {
          console.error('Failed to copy: ', err);
        });
    }
  };

  return (
    <Card className={`overflow-hidden ${className}`}>
      <CardHeader className="bg-primary/10 pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-lg font-semibold flex items-center">
            <BiBook className="mr-2" /> Daily Scripture Wisdom
          </CardTitle>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" onClick={handleShare}>
                  <TbShare3 className="h-4 w-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Share this wisdom</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
        <CardDescription className="text-primary/70">
          Kingdom principles for your trading journey
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        <blockquote className="border-l-4 border-primary/50 pl-4 italic">
          "{scriptureWisdom.verse}"
        </blockquote>
        <div className="text-sm font-medium text-right mt-1">
          — {scriptureWisdom.reference}
        </div>
      </CardContent>
      <CardFooter className="bg-muted/30 flex flex-col items-start">
        <h4 className="font-medium text-sm mb-1">Trading Application:</h4>
        <p className="text-sm">{scriptureWisdom.tradingWisdom}</p>
        <div className="w-full flex justify-end mt-2">
          <span className="text-xs text-muted-foreground capitalize bg-primary/10 px-2 py-0.5 rounded-full">
            {scriptureWisdom.theme}
          </span>
        </div>
      </CardFooter>
    </Card>
  );
}