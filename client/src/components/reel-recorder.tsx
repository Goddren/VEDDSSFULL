import { useRef, useState } from 'react';
import { Video, Square, Download } from 'lucide-react';

// Records the reel preview to a real downloadable video file using the
// browser's screen-capture + MediaRecorder APIs. This replaces the old
// "screen-record this yourself" instruction — there was never a server-side
// renderer, so the export happens entirely in the browser.
//
// Desktop Chrome/Edge/Firefox: user picks "This tab" in the share dialog and
// gets a .webm download when recording stops. iOS/Android browsers don't
// support getDisplayMedia — we show the built-in screen-recorder tip instead.

export function ReelRecorder({ suggestedName = 'vedd-reel' }: { suggestedName?: string }) {
  const [recording, setRecording] = useState(false);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const supported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;

  const start = async () => {
    setError(null);
    setDownloadUrl(null);
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { frameRate: 30 },
        audio: false,
        // Chrome hint: preselect the current tab in the picker
        preferCurrentTab: true,
      } as any);

      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
        ? 'video/webm;codecs=vp9'
        : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 5_000_000 });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        stream.getTracks().forEach(t => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'video/webm' });
        setDownloadUrl(URL.createObjectURL(blob));
        setRecording(false);
      };
      // If the user ends the share from the browser UI, finalize too
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        if (recorder.state !== 'inactive') recorder.stop();
      });

      recorderRef.current = recorder;
      recorder.start(250);
      setRecording(true);
    } catch (err: any) {
      if (err?.name !== 'NotAllowedError') {
        setError(err?.message || 'Screen capture failed');
      }
      setRecording(false);
    }
  };

  const stop = () => {
    const r = recorderRef.current;
    if (r && r.state !== 'inactive') r.stop();
  };

  if (!supported) {
    return (
      <p style={{ fontSize: 11, color: '#64748B', textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
        📱 On mobile: use your phone's built-in screen recorder (Control Center on iPhone,
        Quick Settings on Android) while the reel plays, then trim and post.
      </p>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
        {!recording ? (
          <button
            onClick={start}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#7C3AED', color: '#fff', border: 'none', borderRadius: 4, padding: '9px 18px', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            <Video size={13} /> Record & Export Video
          </button>
        ) : (
          <button
            onClick={stop}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#DC2626', color: '#fff', border: 'none', borderRadius: 4, padding: '9px 18px', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            <Square size={12} /> Stop & Save
          </button>
        )}
        {downloadUrl && (
          <a
            href={downloadUrl}
            download={`${suggestedName}.webm`}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: '#059669', color: '#fff', borderRadius: 4, padding: '9px 18px', fontSize: 11, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', textDecoration: 'none' }}
          >
            <Download size={13} /> Download Video
          </a>
        )}
      </div>
      {recording && (
        <p style={{ fontSize: 10, color: '#F59E0B', textAlign: 'center' }}>
          ● Recording — press Play on the reel, then Stop & Save when it finishes.
        </p>
      )}
      {error && <p style={{ fontSize: 10, color: '#F87171', textAlign: 'center' }}>{error}</p>}
      {!recording && !downloadUrl && (
        <p style={{ fontSize: 10, color: '#4B5A72', textAlign: 'center', maxWidth: 300, lineHeight: 1.5 }}>
          Choose "This tab" in the picker, press Play on the reel, then Stop & Save to download a video file.
        </p>
      )}
    </div>
  );
}
