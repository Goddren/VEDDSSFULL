import crypto from 'crypto';
import { createCanvas, loadImage, registerFont } from 'canvas';
import path from 'path';
import fs from 'fs';

interface CertificateData {
  holderName: string;
  certificateNumber: string;
  issueDate: Date;
  finalScore: number;
  modulesCompleted: number;
}

interface NFTMetadata {
  name: string;
  symbol: string;
  description: string;
  image: string;
  external_url: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
  }>;
  properties: {
    files: Array<{
      uri: string;
      type: string;
    }>;
    category: string;
    creators: Array<{
      address: string;
      share: number;
    }>;
  };
}

export function generateCertificateNumber(): string {
  const year = new Date().getFullYear();
  const randomPart = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
  return `VEDD-AMB-${year}-${randomPart}`;
}

export function generateVerificationHash(data: CertificateData): string {
  const payload = JSON.stringify({
    certificateNumber: data.certificateNumber,
    holderName: data.holderName,
    issueDate: data.issueDate.toISOString(),
    finalScore: data.finalScore,
    modulesCompleted: data.modulesCompleted,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
}

export async function generateCertificateImage(data: CertificateData): Promise<Buffer> {
  const width = 1200;
  const height = 850;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#0a0a1a');
  gradient.addColorStop(0.5, '#1a1a3a');
  gradient.addColorStop(1, '#0a0a2a');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#ffd700';
  ctx.lineWidth = 8;
  ctx.strokeRect(30, 30, width - 60, height - 60);

  ctx.strokeStyle = '#ffd70050';
  ctx.lineWidth = 2;
  ctx.strokeRect(50, 50, width - 100, height - 100);

  for (let i = 0; i < 50; i++) {
    ctx.beginPath();
    ctx.arc(
      Math.random() * width,
      Math.random() * height,
      Math.random() * 2,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = `rgba(255, 215, 0, ${Math.random() * 0.3})`;
    ctx.fill();
  }

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('VEDD AI', width / 2, 120);

  ctx.fillStyle = '#ffffff80';
  ctx.font = 'italic 18px Arial';
  ctx.fillText('Vous Etes Des Dieux', width / 2, 155);

  ctx.fillStyle = '#ffffff';
  ctx.font = 'bold 32px Arial';
  ctx.fillText('AMBASSADOR CERTIFICATION', width / 2, 210);

  ctx.fillStyle = '#ffffff80';
  ctx.font = '16px Arial';
  ctx.fillText('This certificate is awarded to', width / 2, 280);

  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 42px Arial';
  ctx.fillText(data.holderName, width / 2, 340);

  ctx.fillStyle = '#ffffff';
  ctx.font = '18px Arial';
  ctx.fillText('for successfully completing the VEDD AI Ambassador Training Program', width / 2, 400);

  const statsY = 480;
  ctx.fillStyle = '#ffffff80';
  ctx.font = '14px Arial';
  
  ctx.fillText('Modules Completed', width / 2 - 200, statsY);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(data.modulesCompleted.toString(), width / 2 - 200, statsY + 35);

  ctx.fillStyle = '#ffffff80';
  ctx.font = '14px Arial';
  ctx.fillText('Final Score', width / 2, statsY);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 28px Arial';
  ctx.fillText(`${data.finalScore}%`, width / 2, statsY + 35);

  ctx.fillStyle = '#ffffff80';
  ctx.font = '14px Arial';
  ctx.fillText('Issue Date', width / 2 + 200, statsY);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 20px Arial';
  ctx.fillText(data.issueDate.toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }), width / 2 + 200, statsY + 35);

  ctx.fillStyle = '#ffffff50';
  ctx.font = '12px Arial';
  ctx.fillText('Certificate Number', width / 2, 600);
  ctx.fillStyle = '#ffd700';
  ctx.font = 'bold 16px Arial';
  ctx.fillText(data.certificateNumber, width / 2, 625);

  ctx.fillStyle = '#ffffff30';
  ctx.font = '11px Arial';
  ctx.fillText('This certificate is blockchain-verified and tied to a VEDD TOKEN NFT', width / 2, 720);
  ctx.fillText('Verify at: veddbuild.com/verify/' + data.certificateNumber, width / 2, 745);

  ctx.fillStyle = '#ffd70030';
  ctx.font = 'bold 120px Arial';
  ctx.save();
  ctx.translate(width / 2, height / 2);
  ctx.rotate(-Math.PI / 6);
  ctx.fillText('CERTIFIED', 0, 0);
  ctx.restore();

  return canvas.toBuffer('image/png');
}

export function generateNFTMetadata(data: CertificateData, imageUrl: string): NFTMetadata {
  return {
    name: `VEDD Ambassador Certificate #${data.certificateNumber.split('-').pop()}`,
    symbol: 'VEDD-AMB',
    description: `Official VEDD AI Ambassador Certification awarded to ${data.holderName} for completing the Ambassador Training Program. This NFT certifies the holder as a verified VEDD AI Ambassador with full platform knowledge and content creation capabilities. "Vous Etes Des Dieux" - You Are Gods.`,
    image: imageUrl,
    external_url: `https://veddbuild.com/verify/${data.certificateNumber}`,
    attributes: [
      { trait_type: 'Certificate Type', value: 'Ambassador' },
      { trait_type: 'Holder Name', value: data.holderName },
      { trait_type: 'Certificate Number', value: data.certificateNumber },
      { trait_type: 'Issue Date', value: data.issueDate.toISOString().split('T')[0] },
      { trait_type: 'Final Score', value: data.finalScore },
      { trait_type: 'Modules Completed', value: data.modulesCompleted },
      { trait_type: 'Status', value: 'Active' },
      { trait_type: 'VEDD Token Reward', value: 100 },
      { trait_type: 'Brand', value: 'Vous Etes Des Dieux' },
    ],
    properties: {
      files: [
        {
          uri: imageUrl,
          type: 'image/png',
        },
      ],
      category: 'image',
      creators: [
        {
          address: 'VEDDAIxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', // Placeholder for VEDD AI's Solana wallet
          share: 100,
        },
      ],
    },
  };
}

export function verifyCertificate(
  certificateNumber: string,
  verificationHash: string,
  data: CertificateData
): boolean {
  const expectedHash = generateVerificationHash(data);
  return verificationHash === expectedHash;
}

export function getTierFromScore(score: number): 'Bronze' | 'Silver' | 'Gold' | 'Platinum' {
  if (score >= 95) return 'Platinum';
  if (score >= 85) return 'Gold';
  if (score >= 75) return 'Silver';
  return 'Bronze';
}
