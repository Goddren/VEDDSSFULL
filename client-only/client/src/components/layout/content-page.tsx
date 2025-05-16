import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react';
import { useLocation } from 'wouter';

interface ContentPageProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const ContentPage: React.FC<ContentPageProps> = ({ title, subtitle, children }) => {
  const [location, navigate] = useLocation();
  
  // Define our menu items
  const menuItems = [
    { path: '/about', label: 'About' },
    { path: '/contact', label: 'Contact' },
    { path: '/support', label: 'Support' },
    { path: '/privacy', label: 'Privacy' },
    { path: '/terms', label: 'Terms' },
    { path: '/security', label: 'Security' }
  ];

  // Function to handle going back
  const goBack = () => {
    // Check if we can go back in history
    if (window.history.length > 1) {
      window.history.back();
    } else {
      // If not, navigate to home
      navigate('/');
    }
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        {/* Back button */}
        <div className="mb-6">
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={goBack}
            className="flex items-center text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="mr-1 h-4 w-4" />
            Back
          </Button>
        </div>
        
        {/* Navigation tabs */}
        <div className="mb-6 overflow-auto">
          <div className="flex space-x-2 overflow-x-auto pb-2">
            {menuItems.map((item) => (
              <Button
                key={item.path}
                variant={location === item.path ? "default" : "outline"}
                size="sm"
                onClick={() => navigate(item.path)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="mb-10 text-center">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-3">{title}</h1>
          {subtitle && (
            <p className="text-lg text-muted-foreground">{subtitle}</p>
          )}
        </div>
        
        <Card>
          <CardContent className="prose prose-invert max-w-none pt-6">
            {children}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ContentPage;