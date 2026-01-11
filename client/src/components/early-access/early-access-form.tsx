import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, CheckCheck, XCircle, Copy, Clock } from 'lucide-react';
import { createEarlyAccessPromo } from '@/lib/promo-codes';

export function EarlyAccessForm() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [promoCode, setPromoCode] = useState('');
  const [timeLeft, setTimeLeft] = useState({
    hours: 23,
    minutes: 59,
    seconds: 59
  });
  const { toast } = useToast();
  
  // Countdown timer effect
  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft(prev => {
        if (prev.seconds > 0) {
          return { ...prev, seconds: prev.seconds - 1 };
        } else if (prev.minutes > 0) {
          return { ...prev, minutes: prev.minutes - 1, seconds: 59 };
        } else if (prev.hours > 0) {
          return { hours: prev.hours - 1, minutes: 59, seconds: 59 };
        }
        return prev; // Time's up
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError('');

    // Validate email
    if (!email.match(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)) {
      setError('Please enter a valid email address');
      setIsSubmitting(false);
      return;
    }

    // Simple phone validation (at least 10 digits)
    const phoneDigits = phone.replace(/\D/g, '');
    if (phoneDigits.length < 10) {
      setError('Please enter a valid phone number');
      setIsSubmitting(false);
      return;
    }

    // In a real application, you would send this data to your server
    // For now, we'll simulate a successful submission
    setTimeout(() => {
      setIsSubmitting(false);
      
      // Generate a 50% off promo code
      const promoCodeObj = createEarlyAccessPromo(email);
      setPromoCode(promoCodeObj.code);
      
      setSubmitted(true);
      toast({
        title: "Early Access Reserved!",
        description: "You've received a special 50% OFF promo code for premium plans.",
        duration: 5000,
      });

      // Store in localStorage to remember this user already signed up
      localStorage.setItem('earlyAccessSignup', JSON.stringify({
        email,
        phone: phoneDigits,
        date: new Date().toISOString(),
        promoCode: promoCodeObj.code
      }));
      
      // Keep dialog open so user can see promo code
      // Don't auto-close to give user time to copy the code
    }, 1500);
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <div className="relative">
          <Button 
            size="lg" 
            className="bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black font-semibold shadow-lg shadow-amber-600/30 transition-all duration-300 transform hover:scale-105"
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Get Early Access
          </Button>
          <div className="absolute top-0 right-0 -mt-3 -mr-2">
            <span className="inline-flex items-center justify-center px-2 py-1 text-xs font-bold leading-none text-red-100 bg-red-600 rounded-full animate-pulse">
              50% OFF
            </span>
          </div>
          <div className="absolute -bottom-6 left-0 right-0 text-center">
            <span className="text-xs font-semibold text-red-600 dark:text-red-400">Only <span className="font-bold">5 spots</span> left!</span>
          </div>
        </div>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md bg-gray-900 border-gray-800 text-white">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center">
            <Sparkles className="mr-2 h-5 w-5 text-amber-500" />
            Get Exclusive Early Access
          </DialogTitle>
          <DialogDescription className="text-gray-400">
            Be among the first to experience our premium features at 50% off the regular price. <span className="text-red-400 font-bold">Only 5 spots remaining!</span>
          </DialogDescription>
          
          {/* Countdown Timer */}
          <div className="mt-4 mx-auto bg-gray-800 rounded-lg p-3 flex items-center justify-center border border-amber-500/30">
            <Clock className="text-amber-500 mr-2 h-5 w-5" />
            <div className="text-center">
              <p className="text-xs text-gray-400 mb-1">This offer expires in:</p>
              <div className="flex items-center justify-center space-x-2 text-white">
                <div className="bg-gray-700 rounded px-2 py-1 min-w-[40px] text-center">
                  <span className="font-mono text-lg font-bold">{timeLeft.hours.toString().padStart(2, '0')}</span>
                  <span className="text-xs block text-gray-400">hours</span>
                </div>
                <span className="text-gray-400">:</span>
                <div className="bg-gray-700 rounded px-2 py-1 min-w-[40px] text-center">
                  <span className="font-mono text-lg font-bold">{timeLeft.minutes.toString().padStart(2, '0')}</span>
                  <span className="text-xs block text-gray-400">mins</span>
                </div>
                <span className="text-gray-400">:</span>
                <div className="bg-gray-700 rounded px-2 py-1 min-w-[40px] text-center">
                  <span className="font-mono text-lg font-bold">{timeLeft.seconds.toString().padStart(2, '0')}</span>
                  <span className="text-xs block text-gray-400">secs</span>
                </div>
              </div>
            </div>
          </div>
        </DialogHeader>
        
        {submitted ? (
          <div className="py-6 flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <CheckCheck className="h-8 w-8 text-green-500" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">You're In!</h3>
            <p className="text-gray-400 mb-4">
              Thank you for your interest! We'll contact you as soon as early access is available.
            </p>
            
            {/* 50% OFF Promo Code Display */}
            <div className="w-full mb-5">
              <Label htmlFor="promo-code" className="text-sm font-medium text-gray-300 mb-1 block text-left">
                Your Exclusive Promo Code:
              </Label>
              <div className="relative">
                <Input 
                  id="promo-code"
                  value={promoCode}
                  readOnly
                  className="bg-gray-800 border border-amber-500/50 focus:border-amber-500 text-amber-400 font-medium text-center pr-10"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 rounded-md text-amber-400 hover:text-amber-300 hover:bg-amber-900/30"
                  onClick={() => {
                    navigator.clipboard.writeText(promoCode);
                    toast({
                      title: "Copied!",
                      description: "Promo code copied to clipboard",
                      duration: 2000,
                    });
                  }}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-500 mt-1 text-left">
                Use this code at checkout to get 50% OFF any premium plan. Valid for 7 days.
              </p>
            </div>
            
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-md py-3 px-4 w-full">
              <h4 className="font-medium text-amber-400 mb-1">How to use your code:</h4>
              <ol className="text-sm text-gray-300 text-left list-decimal pl-5 space-y-1">
                <li>Go to our subscription page</li>
                <li>Select any premium plan</li>
                <li>Enter this code at checkout</li>
                <li>Enjoy 50% off your subscription</li>
              </ol>
            </div>
            
            <Button 
              className="mt-6 bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black font-semibold"
              onClick={() => setOpen(false)}
            >
              Done
            </Button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input 
                id="email" 
                type="email" 
                placeholder="your@email.com" 
                className="bg-gray-800 border-gray-700 text-white"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="phone">Phone Number</Label>
              <Input 
                id="phone" 
                type="tel" 
                placeholder="(123) 456-7890" 
                className="bg-gray-800 border-gray-700 text-white"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                required
              />
            </div>
            
            {error && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-md py-2 px-3 flex items-center">
                <XCircle className="h-4 w-4 text-red-500 mr-2 flex-shrink-0" />
                <p className="text-red-400 text-sm">{error}</p>
              </div>
            )}
            
            <div className="pt-3">
              <Button 
                type="submit" 
                className="w-full bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-600 hover:to-yellow-600 text-black font-semibold"
                disabled={isSubmitting}
              >
                {isSubmitting ? 
                  <div className="flex items-center">
                    <div className="w-5 h-5 border-t-2 border-b-2 border-black rounded-full animate-spin mr-2"></div>
                    Processing...
                  </div>
                : 
                  <>Claim My Spot <span className="text-red-900 font-bold">(5 left!)</span></>
                }
              </Button>
            </div>
            
            <p className="text-xs text-gray-500 text-center pt-2">
              By submitting, you agree to receive updates about our product. We respect your privacy and will never share your information.
            </p>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}