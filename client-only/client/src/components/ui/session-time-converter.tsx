import React, { useState, useEffect } from 'react';
import { Clock, Globe, ChevronDown, ChevronUp } from 'lucide-react';
import SessionCountdownTimer from './session-countdown-timer';

interface SessionTime {
  name: string;
  hours: string;
  utcStart: number;
  utcEnd: number;
  description: string;
}

interface SessionTimeConverterProps {
  symbol: string;
}

const tradingSessions: SessionTime[] = [
  {
    name: 'Sydney Session',
    hours: '7:00 PM - 4:00 AM UTC',
    utcStart: 19,
    utcEnd: 4,
    description: 'Start of the Asian trading day'
  },
  {
    name: 'Tokyo Session',
    hours: '12:00 AM - 9:00 AM UTC',
    utcStart: 0,
    utcEnd: 9,
    description: 'Main Asian trading session'
  },
  {
    name: 'London Session',
    hours: '8:00 AM - 5:00 PM UTC',
    utcStart: 8,
    utcEnd: 17,
    description: 'Highest European volume'
  },
  {
    name: 'New York Session',
    hours: '1:00 PM - 10:00 PM UTC',
    utcStart: 13,
    utcEnd: 22, 
    description: 'US trading hours'
  }
];

// Function to determine if a session is active now
function isSessionActive(utcStart: number, utcEnd: number): boolean {
  const now = new Date();
  const currentHourUTC = now.getUTCHours();
  
  if (utcStart < utcEnd) {
    // Normal case: e.g., 8 AM to 5 PM
    return currentHourUTC >= utcStart && currentHourUTC < utcEnd;
  } else {
    // Session spans midnight: e.g., 10 PM to 6 AM
    return currentHourUTC >= utcStart || currentHourUTC < utcEnd;
  }
}

// Function to convert UTC time to local time
function convertToLocalTime(utcHour: number): string {
  const now = new Date();
  const localTime = new Date(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    utcHour,
    0,
    0
  );
  
  return localTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Function to get session local time range
function getLocalTimeRange(utcStart: number, utcEnd: number): string {
  const startLocal = convertToLocalTime(utcStart);
  const endLocal = convertToLocalTime(utcEnd);
  return `${startLocal} - ${endLocal}`;
}

export const SessionTimeConverter: React.FC<SessionTimeConverterProps> = ({ symbol }) => {
  const [currentTime, setCurrentTime] = useState<string>('');
  const [timezone, setTimezone] = useState<string>('');
  const [showCountdown, setShowCountdown] = useState<boolean>(false);
  
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(now.toLocaleTimeString());
      setTimezone(
        Intl.DateTimeFormat().resolvedOptions().timeZone || 
        `GMT${now.getTimezoneOffset() < 0 ? '+' : '-'}${Math.abs(now.getTimezoneOffset() / 60)}`
      );
    };
    
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // Determine which currency markets are most relevant for this symbol
  const getPrimaryMarket = (): string => {
    if (symbol.includes('JPY') || symbol.includes('AUD') || symbol.includes('NZD')) {
      return 'Asian';
    } else if (symbol.includes('GBP') || symbol.includes('EUR') || symbol.includes('CHF')) {
      return 'European';
    } else if (symbol.includes('CAD') || symbol.includes('USD')) {
      return 'North American';
    }
    return '';
  };

  const primaryMarket = getPrimaryMarket();

  return (
    <div className="bg-[#0A0A0A] p-4 rounded-lg mt-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center">
          <Clock className="mr-2 h-5 w-5 text-[#E64A4A]" />
          <h4 className="font-medium">Trading Session Times</h4>
        </div>
        <div className="flex items-center text-sm bg-[#1E1E1E] px-3 py-1 rounded-md">
          <Globe className="mr-1 h-4 w-4 text-gray-400" />
          <span className="text-gray-300">{currentTime}</span>
          <span className="ml-1 text-gray-500 text-xs">{timezone}</span>
        </div>
      </div>
      
      <div className="space-y-3 mb-4">
        {tradingSessions.map((session, index) => {
          const isActive = isSessionActive(session.utcStart, session.utcEnd);
          const isPrimary = primaryMarket && session.name.includes(primaryMarket);
          const localTimeRange = getLocalTimeRange(session.utcStart, session.utcEnd);
          
          return (
            <div 
              key={index} 
              className={`p-3 rounded-md border ${isActive 
                ? 'border-[#E64A4A] bg-[#E64A4A]/10' 
                : 'border-[#333333] bg-[#1E1E1E]'
              } ${isPrimary ? 'ring-1 ring-yellow-500' : ''}`}
            >
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center">
                  <div className={`w-2 h-2 rounded-full mr-2 ${isActive ? 'bg-[#E64A4A] animate-pulse' : 'bg-gray-500'}`}></div>
                  <span className="font-medium">{session.name}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded ${isActive ? 'bg-[#E64A4A] text-white' : 'bg-[#333333] text-gray-300'}`}>
                  {isActive ? 'Now' : 'Inactive'}
                </span>
              </div>
              
              <div className="grid grid-cols-2 text-sm mt-2">
                <div>
                  <p className="text-gray-400">UTC Time</p>
                  <p className="text-gray-300">{session.hours}</p>
                </div>
                <div>
                  <p className="text-gray-400">Your Local Time</p>
                  <p className="text-gray-300">{localTimeRange}</p>
                </div>
              </div>
              
              <p className="text-xs text-gray-400 mt-2">{session.description}</p>
              
              {isPrimary && (
                <div className="mt-2 text-xs text-yellow-500">
                  Primary market for {symbol}
                </div>
              )}
            </div>
          );
        })}
      </div>
      
      <div className="text-sm text-gray-300 mt-4">
        <p className="mb-2"><span className="font-semibold">Note:</span> Session overlaps often show the highest volatility and trading opportunities:</p>
        <ul className="list-disc ml-5 space-y-1 text-xs">
          <li>Tokyo/London Overlap (8:00 AM - 9:00 AM UTC)</li>
          <li>London/New York Overlap (1:00 PM - 5:00 PM UTC)</li>
        </ul>
      </div>
      
      <button 
        className="mt-4 w-full flex items-center justify-center text-sm py-2 px-3 rounded-md bg-[#1E1E1E] hover:bg-[#2A2A2A] transition-colors"
        onClick={() => setShowCountdown(!showCountdown)}
      >
        <Clock className="w-4 h-4 mr-2 text-[#E64A4A]" />
        {showCountdown ? "Hide Interactive Countdown" : "Show Interactive Countdown Timer"}
        {showCountdown ? <ChevronUp className="w-4 h-4 ml-2" /> : <ChevronDown className="w-4 h-4 ml-2" />}
      </button>
      
      {showCountdown && <SessionCountdownTimer symbol={symbol} />}
    </div>
  );
};

export default SessionTimeConverter;