import React, { useCallback, useState, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowUpFromLine, X, ImageIcon, Clipboard } from 'lucide-react';
import { getBase64 } from '@/lib/utils';

interface ImageUploadProps {
  onImageUpload: (file: File) => void;
  isUploading?: boolean;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ onImageUpload, isUploading = false }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragHighlight, setDragHighlight] = useState<boolean>(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Function to handle file validation
  const validateFile = (file: File): boolean => {
    // Check file type
    if (!file.type.includes('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPEG, PNG)",
        variant: "destructive"
      });
      return false;
    }
    
    // Check file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB",
        variant: "destructive"
      });
      return false;
    }
    
    return true;
  };

  // Process the file and prepare for upload
  const processFile = useCallback((file: File) => {
    if (!validateFile(file)) return;
    
    // Create a preview
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);
    setImageFile(file);
    
    // Auto-upload if one-click is enabled
    onImageUpload(file);
    
    // Cleanup function
    return () => URL.revokeObjectURL(objectUrl);
  }, [onImageUpload, toast]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setIsDragging(false);
    setDragHighlight(false);
    
    if (acceptedFiles.length === 0) return;
    processFile(acceptedFiles[0]);
  }, [processFile]);

  const { getRootProps, getInputProps, isDragReject, open } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    },
    disabled: isUploading,
    maxFiles: 1,
    noClick: !!previewUrl, // Disable click when we have a preview
    onDragEnter: () => {
      setIsDragging(true);
      setDragHighlight(true);
    },
    onDragLeave: () => {
      setIsDragging(false);
      setDragHighlight(false);
    }
  });

  // Handle clipboard paste
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      if (isUploading) return;
      
      const items = e.clipboardData?.items;
      if (!items) return;
      
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const file = items[i].getAsFile();
          if (file) {
            toast({
              title: "Image pasted",
              description: "Processing pasted image...",
            });
            processFile(file);
            break;
          }
        }
      }
    };
    
    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [isUploading, processFile, toast]);

  // Clear the preview and reset
  const clearImage = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setPreviewUrl(null);
    setImageFile(null);
  }, []);

  // Animation classes based on state
  const getBorderClasses = () => {
    if (dragHighlight) {
      return 'border-primary border-2 bg-primary/10 scale-102';
    }
    if (previewUrl) {
      return 'border-primary/50 border';
    }
    return 'border-dashed border-2 border-muted-foreground/50 hover:border-primary/50';
  };

  return (
    <div 
      className={`relative rounded-xl transition-all duration-300 ${isUploading ? 'opacity-70 pointer-events-none' : ''}`}
    >
      <div 
        {...getRootProps()} 
        className={`relative overflow-hidden rounded-xl transition-all duration-300 ${getBorderClasses()}`}
        ref={dropzoneRef}
      >
        <input {...getInputProps()} disabled={isUploading} />
        
        {/* Drop overlay that appears when dragging */}
        {isDragging && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="text-center animate-pulse">
              <ArrowUpFromLine className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className="text-xl font-semibold">Drop to analyze</p>
            </div>
          </div>
        )}
        
        {/* Preview area when an image is selected */}
        {previewUrl ? (
          <div className="relative p-3">
            <div className="absolute top-2 right-2 z-20">
              <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8 rounded-full opacity-80 hover:opacity-100"
                onClick={clearImage}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="rounded-lg overflow-hidden relative">
              <img 
                src={previewUrl} 
                alt="Chart preview" 
                className="w-full object-contain max-h-[300px]"
              />
              
              {isUploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-lg font-semibold">Uploading...</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <div className="flex flex-col items-center justify-center gap-6 py-8">
              <div className="w-20 h-20 rounded-full bg-muted flex items-center justify-center">
                <ImageIcon className="h-10 w-10 text-primary" />
              </div>
              
              <div className="space-y-2">
                <p className="text-lg font-medium">Upload your chart screenshot</p>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Drag & drop or click to browse files for analysis
                </p>
                
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  <Button
                    variant="default"
                    className="bg-primary hover:bg-primary/80"
                    onClick={open}
                    disabled={isUploading}
                  >
                    <ArrowUpFromLine className="mr-2 h-4 w-4" />
                    Browse Files
                  </Button>
                  
                  <Button
                    variant="outline"
                    onClick={() => {
                      toast({
                        title: "Clipboard access",
                        description: "Press Ctrl+V to paste an image from clipboard",
                      });
                    }}
                  >
                    <Clipboard className="mr-2 h-4 w-4" />
                    Paste Image
                  </Button>
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground/70">
                <p>Supports MT4, MT5, and TradingView screenshots</p>
                <p className="text-xs mt-1">Press Ctrl+V to paste from clipboard</p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Additional instructions below the upload area */}
      {!previewUrl && (
        <div className="mt-3 text-xs text-muted-foreground text-center">
          <p>For best results, ensure price action and indicators are clearly visible</p>
        </div>
      )}
    </div>
  );
};

export default ImageUpload;
