import { useCallback, useState, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { ArrowUpFromLine, X, Video, Play, Pause } from 'lucide-react';

interface VideoUploadProps {
  onVideoUpload: (file: File) => void;
  isUploading?: boolean;
}

const VideoUpload: React.FC<VideoUploadProps> = ({ onVideoUpload, isUploading = false }) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [dragHighlight, setDragHighlight] = useState<boolean>(false);
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const dropzoneRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { toast } = useToast();

  const validateFile = (file: File): boolean => {
    const allowedTypes = ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo'];
    if (!allowedTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a video file (MP4, MOV, WebM, AVI)",
        variant: "destructive"
      });
      return false;
    }
    
    if (file.size > 50 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Maximum video size is 50MB",
        variant: "destructive"
      });
      return false;
    }
    
    return true;
  };

  const processFile = useCallback((file: File) => {
    console.log('Processing video file:', file.name, file.type, file.size);
    
    if (!validateFile(file)) {
      console.log('Video validation failed');
      return;
    }
    
    const objectUrl = URL.createObjectURL(file);
    console.log('Created object URL for video preview:', objectUrl);
    setPreviewUrl(objectUrl);
    setVideoFile(file);
    
    return () => URL.revokeObjectURL(objectUrl);
  }, [toast]);

  const handleUpload = useCallback(() => {
    if (videoFile) {
      onVideoUpload(videoFile);
    }
  }, [videoFile, onVideoUpload]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    console.log('onDrop called with video files:', acceptedFiles.length);
    setIsDragging(false);
    setDragHighlight(false);
    
    if (acceptedFiles.length === 0) {
      console.log('No accepted files');
      return;
    }
    
    console.log('Processing video file:', acceptedFiles[0].name);
    processFile(acceptedFiles[0]);
  }, [processFile]);

  const { getRootProps, getInputProps, isDragReject } = useDropzone({
    onDrop,
    accept: {
      'video/mp4': ['.mp4'],
      'video/quicktime': ['.mov'],
      'video/webm': ['.webm'],
      'video/x-msvideo': ['.avi']
    },
    disabled: isUploading,
    maxFiles: 1,
    noClick: !!previewUrl,
    onDragEnter: () => {
      setIsDragging(true);
      setDragHighlight(true);
    },
    onDragLeave: () => {
      setIsDragging(false);
      setDragHighlight(false);
    }
  });

  const clearVideo = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
    }
    setPreviewUrl(null);
    setVideoFile(null);
    setIsPlaying(false);
  }, [previewUrl]);

  const togglePlayPause = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  }, [isPlaying]);

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
        
        {isDragging && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-10 flex items-center justify-center">
            <div className="text-center animate-pulse">
              <ArrowUpFromLine className="h-12 w-12 text-primary mx-auto mb-4" />
              <p className="text-xl font-semibold">Drop to upload video</p>
            </div>
          </div>
        )}
        
        {previewUrl ? (
          <div className="relative p-3">
            <div className="absolute top-2 right-2 z-20 flex gap-2">
              <Button
                variant="secondary"
                size="icon"
                className="h-8 w-8 rounded-full opacity-80 hover:opacity-100"
                onClick={togglePlayPause}
                data-testid="button-toggle-play"
              >
                {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8 rounded-full opacity-80 hover:opacity-100"
                onClick={clearVideo}
                data-testid="button-clear-video"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="rounded-lg overflow-hidden relative">
              <video 
                ref={videoRef}
                src={previewUrl} 
                className="w-full object-contain max-h-[300px]"
                onEnded={() => setIsPlaying(false)}
                data-testid="video-preview"
              />
              
              {isUploading && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
                    <p className="text-lg font-semibold">Processing video...</p>
                    <p className="text-sm text-muted-foreground mt-2">Extracting frames for analysis</p>
                  </div>
                </div>
              )}
            </div>
            
            {!isUploading && (
              <div className="mt-3 flex justify-center">
                <Button 
                  onClick={(e) => { e.stopPropagation(); handleUpload(); }}
                  className="bg-primary hover:bg-primary/80"
                  data-testid="button-analyze-video"
                >
                  <Video className="mr-2 h-4 w-4" />
                  Analyze Video Frames
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="p-6 text-center">
            <div className="flex flex-col items-center justify-center gap-6 py-8">
              <div className="relative">
                <div className="w-24 h-24 rounded-full bg-muted flex items-center justify-center relative z-10 shadow-inner overflow-hidden">
                  <div className="absolute inset-0 bg-primary/5 rounded-full"></div>
                  <div className="absolute inset-0 rounded-full bg-primary/10 animate-pulse-custom"></div>
                  <div className="animate-float">
                    <Video className="h-12 w-12 text-primary drop-shadow-md" />
                  </div>
                </div>
                
                <div
                  className="absolute inset-0 rounded-full border-2 border-primary z-0 animate-pulse-ring"
                  style={{ top: '-12%', left: '-12%', right: '-12%', bottom: '-12%' }}
                ></div>
              </div>
              
              <div className="space-y-2">
                <p className="text-lg font-medium">Upload your chart video</p>
                <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                  Drag & drop or click to browse video files for multi-frame analysis
                </p>
                
                <div className="flex flex-wrap gap-2 justify-center mt-4">
                  <div className="relative">
                    <Button
                      variant="default"
                      className="bg-primary hover:bg-primary/80 relative z-10 active:scale-95 active:shadow-inner transform transition-all duration-150"
                      disabled={isUploading}
                      data-testid="button-browse-video"
                    >
                      <div className="flex items-center">
                        <span className="relative">
                          <span className="absolute inset-0 rounded-full bg-white/20 animate-ping opacity-30 h-full w-full"></span>
                          <ArrowUpFromLine className="mr-2 h-4 w-4" />
                        </span>
                        Browse Videos
                      </div>
                    </Button>
                    <input 
                      type="file" 
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer" 
                      accept="video/mp4,video/quicktime,video/webm,video/x-msvideo"
                      onChange={(e) => {
                        console.log('Video file input change triggered');
                        const file = e.target.files?.[0];
                        if (file) {
                          console.log('Video file selected:', file.name);
                          processFile(file);
                        }
                      }}
                      disabled={isUploading}
                      data-testid="input-video-file"
                    />
                  </div>
                </div>
              </div>
              
              <div className="text-sm text-muted-foreground/70">
                <p>Supports MP4, MOV, WebM, and AVI formats (max 50MB)</p>
                <p className="text-xs mt-1">AI will extract and analyze key frames from your video</p>
              </div>
            </div>
          </div>
        )}
      </div>
      
      {!previewUrl && (
        <div className="mt-3 text-xs text-muted-foreground text-center">
          <p>Video analysis extracts 4 key frames for comprehensive chart analysis</p>
        </div>
      )}
    </div>
  );
};

export default VideoUpload;
