import React, { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';

interface ImageUploadProps {
  onImageUpload: (file: File) => void;
  isUploading?: boolean;
}

const ImageUpload: React.FC<ImageUploadProps> = ({ onImageUpload, isUploading = false }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const { toast } = useToast();

  const onDrop = useCallback((acceptedFiles: File[]) => {
    if (acceptedFiles.length === 0) return;
    
    const file = acceptedFiles[0];
    
    // Check file type
    if (!file.type.includes('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPEG, PNG)",
        variant: "destructive"
      });
      return;
    }
    
    // Check file size (10MB max)
    if (file.size > 10 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum file size is 10MB",
        variant: "destructive"
      });
      return;
    }
    
    onImageUpload(file);
  }, [onImageUpload, toast]);

  const { getRootProps, getInputProps, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png']
    },
    disabled: isUploading,
    maxFiles: 1
  });

  return (
    <div 
      {...getRootProps()} 
      className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-all duration-300 relative
        ${isDragActive || isDragReject ? 'border-[#E64A4A]' : 'border-[#2D2D2D] hover:border-[#E64A4A]'}
        ${isUploading ? 'opacity-50 cursor-not-allowed' : 'opacity-100'}
        bg-[#0A0A0A]
      `}
    >
      <input {...getInputProps()} disabled={isUploading} />
      <div className="flex flex-col items-center justify-center gap-4">
        <div className="w-16 h-16 rounded-full bg-[#333333] flex items-center justify-center">
          <i className="fas fa-chart-line text-[#E64A4A] text-2xl"></i>
        </div>
        <div>
          <p className="font-medium">Drag & drop chart image or</p>
          <Button
            variant="default"
            className="mt-2 bg-[#E64A4A] hover:bg-opacity-80 text-white"
            disabled={isUploading}
          >
            Browse Files
          </Button>
        </div>
        <p className="text-sm text-gray-400">Supports MT4, MT5, and TradingView screenshots</p>
      </div>
    </div>
  );
};

export default ImageUpload;
