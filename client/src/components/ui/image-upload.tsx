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
    console.log('Processing file in ImageUpload:', file.name, file.type, file.size);
    
    if (!validateFile(file)) {
      console.log('File validation failed in ImageUpload');
      return;
    }
    
    // Create a preview
    const objectUrl = URL.createObjectURL(file);
    console.log('Created object URL for preview:', objectUrl);
    setPreviewUrl(objectUrl);
    setImageFile(file);
    
    // Auto-upload if one-click is enabled
    console.log('Calling onImageUpload with file');
    onImageUpload(file);
    
    // Cleanup function
    return () => URL.revokeObjectURL(objectUrl);
  }, [onImageUpload, validateFile, toast]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    console.log('onDrop called with files:', acceptedFiles.length);
    setIsDragging(false);
    setDragHighlight(false);
    
    if (acceptedFiles.length === 0) {
      console.log('No accepted files');
      return;
    }
    
    console.log('Processing first accepted file:', acceptedFiles[0].name);
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
      return 'border-primary border-3 bg-primary/10 scale-[1.02] shadow-lg shadow-primary/20';
    }
    if (previewUrl) {
      return 'border-primary/60 border-2 shadow-md';
    }
    return 'border-dashed border-2 border-muted-foreground/50 hover:border-primary/50 hover:shadow-md transition-all duration-300 hover:scale-[1.01]';
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
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center relative z-10 shadow-inner overflow-hidden">
                  <div className="absolute inset-0 bg-primary/5 rounded-full"></div>
                  <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-custom"></div>
                  <div className="animate-float">
                    <ImageIcon className="h-12 w-12 text-primary drop-shadow-md" />
                  </div>
                </div>
                
                {/* Pulsing rings */}
                <div
                  className="absolute inset-0 rounded-full border-2 border-primary z-0 animate-pulse-ring"
                  style={{ top: '-12%', left: '-12%', right: '-12%', bottom: '-12%' }}
                ></div>
              </div>
              
              <div className="space-y-2">
                <p className="text-lg font-medium">Upload your chart screenshot</p>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Drag & drop or click to browse files for analysis
                </p>
                
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  {/* Direct file input for more reliable uploads */}
                  <div className="relative">
                    <Button
                      variant="default"
                      className="bg-primary hover:bg-primary/80 relative z-10 active:scale-95 active:shadow-inner transform transition-all duration-150"
                      disabled={isUploading}
                    >
                      <div className="flex items-center">
                        <span className="relative">
                          <span className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-30 h-full w-full"></span>
                          <ArrowUpFromLine className="mr-2 h-4 w-4" />
                        </span>
                        Browse Files
                      </div>
                    </Button>
                    <input 
                      type="file" 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                      accept="image/jpeg,image/png,image/jpg"
                      onChange={(e) => {
                        console.log('File input change triggered');
                        const file = e.target.files?.[0];
                        if (file) {
                          console.log('Direct file input selected file:', file.name);
                          processFile(file);
                        }
                      }}
                      disabled={isUploading}
                    />
                  </div>
                  
                  <Button
                    variant="outline"
                    className="hover:bg-muted/50 hover:border-primary/50 active:scale-95 transform transition-all duration-150"
                    onClick={() => {
                      toast({
                        title: "Clipboard access",
                        description: "Press Ctrl+V to paste an image from clipboard",
                      });
                    }}
                  >
                    <div className="flex items-center">
                      <span className="relative mr-2">
                        <span className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-custom h-full w-full"></span>
                        <Clipboard className="h-4 w-4" />
                      </span>
                      Paste Image
                    </div>
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
