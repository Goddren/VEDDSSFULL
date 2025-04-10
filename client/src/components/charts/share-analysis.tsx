import React, { useState } from 'react';
import { Share2, Copy, Check, X, Clipboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { apiRequest } from '@/lib/queryClient';
import { toast } from '@/hooks/use-toast';
import { ChartAnalysis } from '@shared/schema';

interface ShareAnalysisProps {
  analysis: ChartAnalysis;
  onClose: () => void;
}

export const ShareAnalysis: React.FC<ShareAnalysisProps> = ({ analysis, onClose }) => {
  const [notes, setNotes] = useState<string>('');
  const [isSharing, setIsSharing] = useState<boolean>(false);
  const [shareUrl, setShareUrl] = useState<string>('');
  const [copySuccess, setCopySuccess] = useState<boolean>(false);

  const handleShare = async () => {
    try {
      setIsSharing(true);
      
      const response = await apiRequest(
        'POST', 
        `/api/analyses/${analysis.id}/share`, 
        { notes: notes.trim() || null }
      );
      
      if (!response.ok) {
        throw new Error('Failed to share analysis');
      }
      
      const sharedAnalysis = await response.json();
      const generatedUrl = `${window.location.origin}/shared/${sharedAnalysis.shareId}`;
      setShareUrl(generatedUrl);
      
      toast({
        title: "Analysis shared successfully",
        description: "Copy the link to share with others",
      });
    } catch (error) {
      console.error('Error sharing analysis:', error);
      toast({
        title: "Failed to share analysis",
        description: error instanceof Error ? error.message : "An unknown error occurred",
        variant: "destructive",
      });
    } finally {
      setIsSharing(false);
    }
  };

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopySuccess(true);
      
      toast({
        title: "Link copied to clipboard",
        description: "You can now paste and share it",
      });
      
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      toast({
        title: "Failed to copy link",
        description: "Please copy it manually",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="bg-[#0A0A0A] p-4 rounded-lg animate-in slide-in-from-bottom-5 duration-300">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <div className="w-8 h-8 rounded-lg bg-[#333333] flex items-center justify-center mr-3">
            <Share2 className="h-4 w-4 text-[#E64A4A]" />
          </div>
          <h3 className="text-lg font-medium">Share Chart Analysis</h3>
        </div>
        <Button 
          variant="ghost" 
          size="icon"
          onClick={onClose}
          className="h-8 w-8 rounded-full hover:bg-[#333333]"
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      {!shareUrl ? (
        <>
          <div className="mb-4">
            <p className="text-sm text-gray-400 mb-2">
              Add optional trading notes to your analysis before sharing
            </p>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add your trading notes here (optional)..."
              className="bg-[#1A1A1A] border-[#333333] focus:border-[#E64A4A] h-[120px] resize-none"
            />
          </div>
          
          <div className="flex space-x-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1 border-[#333333] hover:bg-[#333333] hover:text-white"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleShare}
              disabled={isSharing}
              className="flex-1 bg-[#E64A4A] hover:bg-[#D63A3A] text-white"
            >
              {isSharing ? (
                <>
                  <div className="animate-spin mr-2 h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                  Sharing...
                </>
              ) : (
                <>
                  <Share2 className="mr-2 h-4 w-4" />
                  Generate Share Link
                </>
              )}
            </Button>
          </div>
        </>
      ) : (
        <>
          <div className="mb-4">
            <p className="text-sm text-gray-300 mb-2">
              Your chart analysis has been shared! Copy this link to share with others:
            </p>
            <div className="flex">
              <div className="flex-1 bg-[#1A1A1A] border border-[#333333] rounded-l-md p-2 text-sm overflow-x-auto whitespace-nowrap text-gray-300">
                {shareUrl}
              </div>
              <Button
                onClick={copyToClipboard}
                className={`rounded-l-none ${copySuccess ? 'bg-green-600' : 'bg-[#333333]'}`}
              >
                {copySuccess ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          
          {notes && (
            <div className="mb-4">
              <p className="text-sm text-gray-400 mb-1">Your Trading Notes:</p>
              <div className="bg-[#1A1A1A] border border-[#333333] rounded-md p-3 text-sm text-gray-300">
                {notes}
              </div>
            </div>
          )}
          
          <div className="flex space-x-3">
            <Button 
              variant="outline" 
              onClick={onClose}
              className="flex-1 border-[#333333] hover:bg-[#333333] hover:text-white"
            >
              Close
            </Button>
            <Button 
              onClick={copyToClipboard}
              className="flex-1 bg-[#E64A4A] hover:bg-[#D63A3A] text-white"
            >
              {copySuccess ? (
                <>
                  <Check className="mr-2 h-4 w-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Clipboard className="mr-2 h-4 w-4" />
                  Copy Link
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
};

export default ShareAnalysis;