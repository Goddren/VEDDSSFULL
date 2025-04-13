import React, { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Sparkles, CheckCheck, XCircle } from 'lucide-react';

export function EarlyAccessForm() {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const { toast } = useToast();

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
      setSubmitted(true);
      toast({
        title: "Early Access Reserved!",
        description: "You'll be among the first to get access to our premium features.",
        duration: 5000,
      });

      // Store in localStorage to remember this user already signed up
      localStorage.setItem('earlyAccessSignup', JSON.stringify({
        email,
        phone: phoneDigits,
        date: new Date().toISOString()
      }));
      
      // Close dialog after a short delay
      setTimeout(() => {
        setOpen(false);
        // Reset form after dialog is closed
        setTimeout(() => {
          setSubmitted(false);
          setEmail('');
          setPhone('');
        }, 300);
      }, 2000);
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
          <div className="absolute -bottom-5 left-0 right-0 text-center">
            <span className="text-xs font-medium text-amber-300">Limited Time Offer</span>
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
            Be among the first to experience our premium features at 50% off the regular price.
          </DialogDescription>
        </DialogHeader>
        
        {submitted ? (
          <div className="py-6 flex flex-col items-center text-center">
            <div className="h-14 w-14 rounded-full bg-green-500/20 flex items-center justify-center mb-4">
              <CheckCheck className="h-8 w-8 text-green-500" />
            </div>
            <h3 className="text-xl font-semibold text-white mb-2">You're In!</h3>
            <p className="text-gray-400 mb-6">
              Thank you for your interest! We'll contact you as soon as early access is available.
            </p>
            <div className="bg-green-500/10 border border-green-500/20 rounded-md py-2 px-4">
              <p className="text-green-400 text-sm">Early access discount secured: <span className="font-bold">50% OFF</span></p>
            </div>
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
                  <>Reserve My Spot</>
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