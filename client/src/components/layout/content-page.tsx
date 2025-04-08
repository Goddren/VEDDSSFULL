import React from 'react';
import { Card, CardContent } from '@/components/ui/card';

interface ContentPageProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

const ContentPage: React.FC<ContentPageProps> = ({ title, subtitle, children }) => {
  return (
    <div className="container mx-auto px-4 py-12">
      <div className="max-w-4xl mx-auto">
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