import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Video, Radio, Users, Send, Maximize, Minimize, Volume2, VolumeX } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface ChatMessage {
  userId: number;
  username: string;
  message: string;
  timestamp: Date;
}

interface LiveStreamViewerProps {
  roomId: string;
  userId: number;
  username: string;
  eventTitle: string;
  hostName?: string;
  onLeave?: () => void;
}

export function LiveStreamViewer({
  roomId,
  userId,
  username,
  eventTitle,
  hostName,
  onLeave
}: LiveStreamViewerProps) {
  const { toast } = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [streamEnded, setStreamEnded] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');

  const connectToStream = useCallback(async () => {
    setIsConnecting(true);

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/stream`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({
        type: 'join',
        roomId,
        userId
      }));
    };

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      handleWebSocketMessage(message);
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
      setIsConnecting(false);
      toast({
        title: 'Connection Error',
        description: 'Failed to connect to stream',
        variant: 'destructive'
      });
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsConnecting(false);
    };

    wsRef.current = ws;
  }, [roomId, userId, toast]);

  const handleWebSocketMessage = async (message: any) => {
    switch (message.type) {
      case 'join':
        if (message.data?.success) {
          setIsConnected(true);
          setIsConnecting(false);
          await setupPeerConnection(message.data.hostId);
          toast({
            title: 'Connected',
            description: 'You are now watching the live stream'
          });
        } else if (message.data?.error) {
          setIsConnecting(false);
          setStreamEnded(true);
          toast({
            title: 'Stream Not Available',
            description: message.data.error,
            variant: 'destructive'
          });
        }
        break;

      case 'viewer-count':
        setViewerCount(message.data?.count || 0);
        break;

      case 'offer':
        if (message.data?.sdp) {
          await handleOffer(message.userId, message.data.sdp);
        }
        break;

      case 'ice-candidate':
        if (message.data?.candidate && peerConnectionRef.current) {
          await peerConnectionRef.current.addIceCandidate(
            new RTCIceCandidate(message.data.candidate)
          );
        }
        break;

      case 'stream-end':
        setStreamEnded(true);
        setIsConnected(false);
        toast({
          title: 'Stream Ended',
          description: 'The host has ended the stream'
        });
        break;

      case 'chat':
        setChatMessages(prev => [...prev, {
          userId: message.userId,
          username: message.data.username,
          message: message.data.message,
          timestamp: new Date()
        }]);
        break;
    }
  };

  const setupPeerConnection = async (hostId: number) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
      ]
    });

    pc.ontrack = (event) => {
      if (videoRef.current && event.streams[0]) {
        videoRef.current.srcObject = event.streams[0];
      }
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'ice-candidate',
          roomId,
          userId,
          data: {
            targetUserId: hostId,
            candidate: event.candidate
          }
        }));
      }
    };

    peerConnectionRef.current = pc;
  };

  const handleOffer = async (hostId: number, sdp: RTCSessionDescriptionInit) => {
    if (!peerConnectionRef.current) {
      await setupPeerConnection(hostId);
    }

    const pc = peerConnectionRef.current!;
    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'answer',
        roomId,
        userId,
        data: {
          targetUserId: hostId,
          sdp: answer
        }
      }));
    }
  };

  const leaveStream = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'leave',
        roomId,
        userId
      }));
      wsRef.current.close();
    }

    if (peerConnectionRef.current) {
      peerConnectionRef.current.close();
      peerConnectionRef.current = null;
    }

    setIsConnected(false);
    onLeave?.();
  };

  const sendChatMessage = () => {
    if (!newMessage.trim() || !wsRef.current) return;

    wsRef.current.send(JSON.stringify({
      type: 'chat',
      roomId,
      userId,
      data: {
        username,
        message: newMessage.trim()
      }
    }));

    setChatMessages(prev => [...prev, {
      userId,
      username,
      message: newMessage.trim(),
      timestamp: new Date()
    }]);

    setNewMessage('');
  };

  const toggleMute = () => {
    if (videoRef.current) {
      videoRef.current.muted = !videoRef.current.muted;
      setIsMuted(!isMuted);
    }
  };

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      videoRef.current?.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  useEffect(() => {
    return () => {
      if (isConnected) {
        leaveStream();
      }
    };
  }, []);

  return (
    <div className="space-y-4">
      <Card className="border-blue-500/50 bg-gradient-to-br from-gray-900 to-gray-950">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Radio className={`h-5 w-5 ${isConnected ? 'text-red-500 animate-pulse' : 'text-gray-500'}`} />
              {eventTitle}
            </CardTitle>
            {isConnected && (
              <div className="flex items-center gap-3">
                <Badge variant="destructive" className="animate-pulse">
                  LIVE
                </Badge>
                <Badge variant="outline" className="flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {viewerCount}
                </Badge>
              </div>
            )}
          </div>
          {hostName && (
            <p className="text-sm text-muted-foreground">Hosted by {hostName}</p>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              className="w-full h-full object-contain"
            />
            {!isConnected && !streamEnded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                <Video className="h-16 w-16 mb-4" />
                <p>Click "Join Stream" to watch</p>
              </div>
            )}
            {streamEnded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400 bg-black/80">
                <Video className="h-16 w-16 mb-4" />
                <p className="text-xl font-semibold">Stream Ended</p>
                <p className="text-sm">Thank you for watching!</p>
              </div>
            )}
            {isConnected && (
              <div className="absolute bottom-4 right-4 flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="icon"
                  className="bg-black/50 hover:bg-black/70"
                  onClick={toggleMute}
                >
                  {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                </Button>
                <Button
                  variant="secondary"
                  size="icon"
                  className="bg-black/50 hover:bg-black/70"
                  onClick={toggleFullscreen}
                >
                  {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                </Button>
              </div>
            )}
          </div>

          {isConnected && (
            <div className="border rounded-lg">
              <div className="h-32 overflow-y-auto p-2 space-y-1">
                {chatMessages.map((msg, i) => (
                  <div key={i} className="text-sm">
                    <span className="font-medium text-primary">{msg.username}: </span>
                    <span className="text-gray-300">{msg.message}</span>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 p-2 border-t">
                <Input
                  placeholder="Send a message..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && sendChatMessage()}
                  className="flex-1"
                />
                <Button size="icon" onClick={sendChatMessage}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          )}

          {!isConnected && !streamEnded && (
            <Button
              onClick={connectToStream}
              disabled={isConnecting}
              className="w-full bg-blue-600 hover:bg-blue-700"
              size="lg"
            >
              {isConnecting ? (
                <>Connecting...</>
              ) : (
                <>
                  <Video className="h-5 w-5 mr-2" />
                  Join Stream
                </>
              )}
            </Button>
          )}

          {isConnected && (
            <Button
              onClick={leaveStream}
              variant="outline"
              className="w-full"
            >
              Leave Stream
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
