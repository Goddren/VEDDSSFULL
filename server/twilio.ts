import twilio from 'twilio';
import { Request, Response } from 'express';

// Initialize Twilio client
let twilioClient: twilio.Twilio | null = null;

// Check if Twilio credentials are present
export function setupTwilio() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioPhoneNumber = process.env.TWILIO_PHONE_NUMBER;
  
  if (accountSid && authToken && twilioPhoneNumber) {
    try {
      twilioClient = twilio(accountSid, authToken);
      console.log("Twilio client initialized successfully");
      return true;
    } catch (error) {
      console.error("Failed to initialize Twilio client:", error);
      return false;
    }
  } else {
    console.log("Twilio credentials not found in environment variables");
    return false;
  }
}

// Send SMS programmatically (no req/res — for ABBA outreach)
export async function sendSmsRaw(to: string, body: string): Promise<{ success: boolean; sid?: string; error?: string }> {
  if (!twilioClient) return { success: false, error: 'SMS not configured — add TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER to environment.' };
  try {
    const formatted = to.startsWith('+') ? to : `+${to}`;
    const msg = await twilioClient.messages.create({ body, from: process.env.TWILIO_PHONE_NUMBER, to: formatted });
    return { success: true, sid: msg.sid };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

// Send a text message with trading signal
export async function sendTradingSignal(req: Request, res: Response) {
  if (!twilioClient) {
    return res.status(503).json({ 
      success: false,
      message: "SMS service is not configured. Please contact admin to set up Twilio." 
    });
  }

  try {
    const { phoneNumber, message } = req.body;
    
    if (!phoneNumber || !message) {
      return res.status(400).json({ 
        success: false,
        message: "Phone number and message are required" 
      });
    }

    // Format phone number (ensure it starts with +)
    const formattedPhoneNumber = phoneNumber.startsWith('+') 
      ? phoneNumber 
      : `+${phoneNumber}`;

    // Send the SMS
    const twilioResponse = await twilioClient.messages.create({
      body: message,
      from: process.env.TWILIO_PHONE_NUMBER,
      to: formattedPhoneNumber
    });

    return res.status(200).json({
      success: true,
      messageId: twilioResponse.sid,
      message: "Trading signal sent successfully"
    });
    
  } catch (err: unknown) {
    const error = err as Error;
    console.error("Error sending SMS:", error);
    return res.status(500).json({
      success: false,
      message: `Failed to send message: ${error.message || "Unknown error"}`
    });
  }
}