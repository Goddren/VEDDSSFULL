import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Video, VideoOff, Mic, MicOff, Radio, Square, Users, Settings, Monitor, Camera } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface LiveStreamHostProps {
  roomId: string;
  userId: number;
  streamType: 'event' | 'schedule';
  streamId: number;
  eventTitle: string;
  onStreamEnd?: () => void;
  onRecordingSaved?: (blob: Blob) => void;
}

export function LiveStreamHost({
  roomId,
  userId,
  streamType,
  streamId,
  eventTitle,
  onStreamEnd,
  onRecordingSaved
}: LiveStreamHostProps) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const peerConnectionsRef = useRef<Map<number, RTCPeerConnection>>(new Map());

  const [isStreaming, setIsStreaming] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [isMicOn, setIsMicOn] = useState(true);
  const [viewerCount, setViewerCount] = useState(0);
  const [streamDuration, setStreamDuration] = useState(0);
  const [useScreenShare, setUseScreenShare] = useState(false);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isStreaming) {
      interval = setInterval(() => {
        setStreamDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isStreaming]);

  const formatDuration = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    if (hrs > 0) {
      return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const connectWebSocket = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'stream-start',
        roomId,
        userId,
        data: { streamType, streamId }
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      toast({
        title: 'Connection Error',
        description: 'Failed to connect to streaming server',
        variant: 'destructive'
      });
    };

    ws.onclose = () => {
      console.log('WebSocket closed');
    };

    wsRef.current = ws;
  }, [roomId, userId, streamType, streamId, toast]);

  const handleWebSocketMessage = async (message: any) => {
    switch (message.type) {
      case 'stream-start':
        if (message.data?.success) {
          setIsStreaming(true);
          toast({
            title: 'Live Stream Started',
            description: 'You are now broadcasting live!'
          });
        }
        break;

      case 'viewer-count':
        setViewerCount(message.data?.count || 0);
        break;

      case 'viewer-joined':
        // Host receives notification that a viewer joined - create peer connection and send offer
        if (message.data?.viewerId && mediaStreamRef.current) {
          await createPeerConnection(message.data.viewerId);
        }
        break;

      case 'join':
        // Legacy handler for backward compatibility
        if (message.userId && mediaStreamRef.current) {
          await createPeerConnection(message.userId);
        }
        break;

      case 'answer':
        if (message.userId) {
          const pc = peerConnectionsRef.current.get(message.userId);
          if (pc && message.data?.sdp) {
            await pc.setRemoteDescription(new RTCSessionDescription(message.data.sdp));
          }
        }
        break;

      case 'ice-candidate':
        if (message.userId && message.data?.candidate) {
          const pc = peerConnectionsRef.current.get(message.userId);
          if (pc) {
            await pc.addIceCandidate(new RTCIceCandidate(message.data.candidate));
          }
        }
        break;
    }
  };

  const createPeerConnection = async (viewerId: number) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => {
        pc.addTrack(track, mediaStreamRef.current!);
      });
    }

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          roomId,
          userId,
          data: {
            targetUserId: viewerId,
            candidate: event.candidate
          }
        }));
      }
    };

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'offer',
        roomId,
        userId,
        data: {
          targetUserId: viewerId,
          sdp: offer
        }
      }));
    }

    peerConnectionsRef.current.set(viewerId, pc);
  };

  const startStream = async () => {
    try {
      let stream: MediaStream;

      if (useScreenShare) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        const audioStream = await navigator.mediaDevices.getUserMedia({
          audio: true
        });
        const tracks = [...screenStream.getTracks(), ...audioStream.getAudioTracks()];
        stream = new MediaStream(tracks);
      } else {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 1280, height: 720, facingMode: 'user' },
          audio: { echoCancellation: true, noiseSuppression: true }
        });
      }

      mediaStreamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }

      connectWebSocket();
      setStreamDuration(0);

    } catch (error) {
      console.error('Failed to start stream:', error);
      toast({
        title: 'Camera/Mic Access Failed',
        description: 'Please allow camera and microphone access to stream',
        variant: 'destructive'
      });
    }
  };

  const stopStream = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'stream-end',
        roomId,
        userId
      }));
      wsRef.current.close();
    }

    peerConnectionsRef.current.forEach(pc => pc.close());
    peerConnectionsRef.current.clear();

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    if (isRecording) {
      stopRecording();
    }

    setIsStreaming(false);
    setViewerCount(0);
    onStreamEnd?.();

    toast({
      title: 'Stream Ended',
      description: `You streamed for ${formatDuration(streamDuration)}`
    });
  };

  const startRecording = () => {
    if (!mediaStreamRef.current) return;

    recordedChunksRef.current = [];
    const options = { mimeType: 'video/webm;codecs=vp9,opus' };

    try {
      const mediaRecorder = new MediaRecorder(mediaStreamRef.current, options);

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        onRecordingSaved?.(blob);
        toast({
          title: 'Recording Saved',
          description: 'Your stream recording has been saved'
        });
      };

      mediaRecorder.start(1000);
      mediaRecorderRef.current = mediaRecorder;
      setIsRecording(true);

      toast({
        title: 'Recording Started',
        description: 'Your stream is now being recorded'
      });
    } catch (error) {
      console.error('Recording error:', error);
      toast({
        title: 'Recording Failed',
        description: 'Unable to start recording',
        variant: 'destructive'
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const toggleCamera = () => {
    if (mediaStreamRef.current) {
      const videoTrack = mediaStreamRef.current.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setIsCameraOn(videoTrack.enabled);
      }
    }
  };

  const toggleMic = () => {
    if (mediaStreamRef.current) {
      const audioTrack = mediaStreamRef.current.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  useEffect(() => {
    return () => {
      if (isStreaming) {
        stopStream();
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <Card className="border-red-500/50 bg-gradient-to-br from-gray-900 to-gray-950">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Radio className={`h-5 w-5 ${isStreaming ? 'text-red-500 animate-pulse' : 'text-gray-500'}`} />
              {eventTitle}
            </CardTitle>
            {isStreaming && (
              <div className="flex items-center gap-3">
                <Badge variant="destructive" className="animate-pulse">
                  LIVE
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {viewerCount}
                </Badge>
                <Badge variant="secondary">
                  {formatDuration(streamDuration)}
                </Badge>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              muted
              playsInline
              className="w-full h-full object-cover"
            />
            {!isStreaming && !mediaStreamRef.current && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <Video className="h-16 w-16 mb-4" />
                <p>Click "Go Live" to start streaming</p>
              </div>
            )}
            {isRecording && (
              <div className="absolute top-4 left-4 flex items-center gap-2 bg-red-600 px-3 py-1 rounded-full">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                <span className="text-white text-sm font-medium">REC</span>
              </div>
            )}
          </div>

          {!isStreaming ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Button
                  variant={useScreenShare ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setUseScreenShare(false)}
                >
                  <Camera className="h-4 w-4 mr-1" />
                  Camera
                </Button>
                <Button
                  variant={useScreenShare ? 'outline' : 'default'}
                  size="sm"
                  onClick={() => setUseScreenShare(true)}
                >
                  <Monitor className="h-4 w-4 mr-1" />
                  Screen Share
                </Button>
              </div>
              <Button
                onClick={startStream}
                className="w-full bg-red-600 hover:bg-red-700"
                size="lg"
              >
                <Radio className="h-5 w-5 mr-2" />
                Go Live
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2">
                <Button
                  variant={isCameraOn ? 'secondary' : 'destructive'}
                  size="icon"
                  onClick={toggleCamera}
                >
                  {isCameraOn ? <Video className="h-5 w-5" /> : <VideoOff className="h-5 w-5" />}
                </Button>
                <Button
                  variant={isMicOn ? 'secondary' : 'destructive'}
                  size="icon"
                  onClick={toggleMic}
                >
                  {isMicOn ? <Mic className="h-5 w-5" /> : <MicOff className="h-5 w-5" />}
                </Button>
                <Button
                  variant={isRecording ? 'destructive' : 'outline'}
                  onClick={isRecording ? stopRecording : startRecording}
                >
                  {isRecording ? (
                    <>
                      <Square className="h-4 w-4 mr-2" />
                      Stop Recording
                    </>
                  ) : (
                    <>
                      <div className="w-3 h-3 bg-red-500 rounded-full mr-2" />
                      Record
                    </>
                  )}
                </Button>
              </div>
              <Button
                onClick={stopStream}
                variant="destructive"
                className="w-full"
                size="lg"
              >
                <Square className="h-5 w-5 mr-2" />
                End Stream
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
