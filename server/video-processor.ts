import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

const uploadsDir = path.join(process.cwd(), 'uploads');
const framesDir = path.join(uploadsDir, 'frames');

if (!fs.existsSync(framesDir)) {
  fs.mkdirSync(framesDir, { recursive: true });
}

export interface ExtractedFrame {
  path: string;
  timestamp: number;
  base64: string;
}

export async function extractFramesFromVideo(
  videoBuffer: Buffer,
  numFrames: number = 4,
  videoMimeType: string = 'video/mp4'
): Promise<ExtractedFrame[]> {
  const videoId = uuidv4();
  const extension = videoMimeType.includes('quicktime') ? 'mov' : 
                    videoMimeType.includes('webm') ? 'webm' : 'mp4';
  const videoPath = path.join(uploadsDir, `${videoId}.${extension}`);
  const framePattern = path.join(framesDir, `${videoId}_frame_%03d.jpg`);
  
  try {
    await fs.promises.writeFile(videoPath, videoBuffer);
    console.log('Video saved to:', videoPath);
    
    const duration = await getVideoDuration(videoPath);
    console.log('Video duration:', duration, 'seconds');
    
    if (duration <= 0) {
      throw new Error('Could not determine video duration');
    }
    
    const interval = duration / (numFrames + 1);
    const frames: ExtractedFrame[] = [];
    
    for (let i = 1; i <= numFrames; i++) {
      const timestamp = interval * i;
      const framePath = path.join(framesDir, `${videoId}_frame_${String(i).padStart(3, '0')}.jpg`);
      
      await extractFrameAtTime(videoPath, framePath, timestamp);
      
      if (fs.existsSync(framePath)) {
        const frameBuffer = await fs.promises.readFile(framePath);
        const base64 = frameBuffer.toString('base64');
        
        frames.push({
          path: framePath,
          timestamp,
          base64
        });
      }
    }
    
    await fs.promises.unlink(videoPath).catch(() => {});
    
    console.log(`Extracted ${frames.length} frames from video`);
    return frames;
    
  } catch (error) {
    await fs.promises.unlink(videoPath).catch(() => {});
    console.error('Error extracting frames:', error);
    throw error;
  }
}

async function getVideoDuration(videoPath: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      videoPath
    ]);
    
    let output = '';
    let errorOutput = '';
    
    ffprobe.stdout.on('data', (data) => {
      output += data.toString();
    });
    
    ffprobe.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffprobe.on('close', (code) => {
      if (code === 0) {
        const duration = parseFloat(output.trim());
        resolve(isNaN(duration) ? 0 : duration);
      } else {
        console.error('ffprobe error:', errorOutput);
        reject(new Error(`ffprobe exited with code ${code}`));
      }
    });
    
    ffprobe.on('error', (err) => {
      reject(err);
    });
  });
}

async function extractFrameAtTime(videoPath: string, outputPath: string, timestamp: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn('ffmpeg', [
      '-ss', timestamp.toString(),
      '-i', videoPath,
      '-vframes', '1',
      '-q:v', '2',
      '-y',
      outputPath
    ]);
    
    let errorOutput = '';
    
    ffmpeg.stderr.on('data', (data) => {
      errorOutput += data.toString();
    });
    
    ffmpeg.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        console.error('ffmpeg error:', errorOutput);
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
    
    ffmpeg.on('error', (err) => {
      reject(err);
    });
  });
}

export async function cleanupFrames(frames: ExtractedFrame[]): Promise<void> {
  for (const frame of frames) {
    try {
      if (fs.existsSync(frame.path)) {
        await fs.promises.unlink(frame.path);
      }
    } catch (error) {
      console.error('Error cleaning up frame:', frame.path, error);
    }
  }
}
