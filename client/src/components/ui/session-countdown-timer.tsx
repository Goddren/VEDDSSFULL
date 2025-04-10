import React, { useState, useEffect } from 'react';
import { Clock, AlertCircle, TrendingUp } from 'lucide-react';

interface SessionCountdownTimerProps {
  symbol: string;
}

interface TradingSession {
  name: string;
  utcStart: number;
  utcEnd: number;
  importance: 'high' | 'medium' | 'low';
  color: string;
}

interface Overlap {
  name: string;
  utcStart: number;
  utcEnd: number;
  description: string;
  importance: 'critical' | 'high' | 'medium';
}

const getTradingSessions = (symbol: string): TradingSession[] => {
  // Basic sessions that apply to all currency pairs
  const sessions: TradingSession[] = [
    {
      name: 'Sydney',
      utcStart: 20, // 8 PM UTC
      utcEnd: 5,    // 5 AM UTC (spans midnight)
      importance: 'low',
      color: 'bg-indigo-500'
    },
    {
      name: 'Tokyo',
      utcStart: 0,  // 12 AM UTC
      utcEnd: 9,    // 9 AM UTC
      importance: 'medium',
      color: 'bg-blue-500'
    },
    {
      name: 'London',
      utcStart: 8,  // 8 AM UTC
      utcEnd: 16,   // 4 PM UTC
      importance: 'high',
      color: 'bg-red-500'
    },
    {
      name: 'New York',
      utcStart: 13, // 1 PM UTC
      utcEnd: 22,   // 10 PM UTC
      importance: 'high',
      color: 'bg-green-500'
    }
  ];

  // Adjust importance based on currency pairs
  if (symbol.includes('JPY') || symbol.includes('AUD') || symbol.includes('NZD')) {
    // Asian currencies - Tokyo session is more important
    sessions.find(s => s.name === 'Tokyo')!.importance = 'high';
    sessions.find(s => s.name === 'Sydney')!.importance = 'medium';
  }
  
  if (symbol.includes('GBP') || symbol.includes('EUR') || symbol.includes('CHF')) {
    // European currencies - London session is most important
    sessions.find(s => s.name === 'London')!.importance = 'high';
  }
  
  if (symbol.includes('CAD') || symbol.includes('USD')) {
    // North American currencies - New York session is most important
    sessions.find(s => s.name === 'New York')!.importance = 'high';
  }
  
  return sessions;
};

const getSessionOverlaps = (): Overlap[] => {
  return [
    {
      name: 'Tokyo-London Overlap',
      utcStart: 8, // 8 AM UTC
      utcEnd: 9,   // 9 AM UTC
      description: 'Increased volatility as European traders enter the market',
      importance: 'medium'
    },
    {
      name: 'London-New York Overlap',
      utcStart: 13, // 1 PM UTC
      utcEnd: 16,   // 4 PM UTC
      description: 'Highest liquidity period; excellent for trading',
      importance: 'critical'
    }
  ];
};

// Function to check if a session is currently active
function isSessionActive(utcStart: number, utcEnd: number): boolean {
  const now = new Date();
  const currentHourUTC = now.getUTCHours();
  
  if (utcStart < utcEnd) {
    // Normal case (e.g., 8 AM to 4 PM)
    return currentHourUTC >= utcStart && currentHourUTC < utcEnd;
  } else {
    // Session spans midnight (e.g., 8 PM to 5 AM)
    return currentHourUTC >= utcStart || currentHourUTC < utcEnd;
  }
}

// Function to get time until next session starts or current session ends
function getNextTransition(sessions: TradingSession[]): {
  type: 'start' | 'end';
  session: TradingSession;
  timeLeft: { hours: number; minutes: number; seconds: number };
} | null {
  const now = new Date();
  const currentHourUTC = now.getUTCHours();
  const currentMinUTC = now.getUTCMinutes();
  const currentSecUTC = now.getUTCSeconds();
  
  let closestTransition = Infinity;
  let closestSession: TradingSession | null = null;
  let transitionType: 'start' | 'end' = 'start';
  
  sessions.forEach(session => {
    const isActive = isSessionActive(session.utcStart, session.utcEnd);
    
    // Calculate time to session start
    if (!isActive) {
      let hoursToStart: number;
      
      if (session.utcStart > currentHourUTC) {
        // Session starts later today
        hoursToStart = session.utcStart - currentHourUTC;
      } else {
        // Session starts tomorrow
        hoursToStart = (24 - currentHourUTC) + session.utcStart;
      }
      
      const minutesToStart = (hoursToStart * 60) - currentMinUTC;
      
      if (minutesToStart < closestTransition) {
        closestTransition = minutesToStart;
        closestSession = session;
        transitionType = 'start';
      }
    }
    // Calculate time to session end
    else {
      let hoursToEnd: number;
      
      if (session.utcEnd > currentHourUTC) {
        // Session ends later today
        hoursToEnd = session.utcEnd - currentHourUTC;
      } else {
        // Session ends tomorrow (spans midnight)
        hoursToEnd = (24 - currentHourUTC) + session.utcEnd;
      }
      
      const minutesToEnd = (hoursToEnd * 60) - currentMinUTC;
      
      if (minutesToEnd < closestTransition) {
        closestTransition = minutesToEnd;
        closestSession = session;
        transitionType = 'end';
      }
    }
  });
  
  if (!closestSession) return null;
  
  // Convert minutes to hours, minutes, seconds
  const hours = Math.floor(closestTransition / 60);
  const minutes = Math.floor(closestTransition % 60);
  const seconds = 60 - currentSecUTC;
  
  return {
    type: transitionType,
    session: closestSession,
    timeLeft: { hours, minutes, seconds }
  };
}

// Get currently active sessions
function getActiveSessions(sessions: TradingSession[]): TradingSession[] {
  return sessions.filter(session => isSessionActive(session.utcStart, session.utcEnd));
}

// Get currently active overlaps
function getActiveOverlaps(overlaps: Overlap[]): Overlap[] {
  return overlaps.filter(overlap => isSessionActive(overlap.utcStart, overlap.utcEnd));
}

// Format time with leading zeros
function formatTimeUnit(unit: number): string {
  return unit < 10 ? `0${unit}` : `${unit}`;
}

const SessionCountdownTimer: React.FC<SessionCountdownTimerProps> = ({ symbol }) => {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [activeStates, setActiveStates] = useState<{
    activeSessions: TradingSession[];
    activeOverlaps: Overlap[];
    nextTransition: ReturnType<typeof getNextTransition>;
  }>({
    activeSessions: [],
    activeOverlaps: [],
    nextTransition: null
  });
  
  // Initialize trading sessions and overlaps
  const tradingSessions = getTradingSessions(symbol);
  const sessionOverlaps = getSessionOverlaps();
  
  useEffect(() => {
    // Update time and session statuses every second
    const interval = setInterval(() => {
      const now = new Date();
      setCurrentTime(now);
      
      setActiveStates({
        activeSessions: getActiveSessions(tradingSessions),
        activeOverlaps: getActiveOverlaps(sessionOverlaps),
        nextTransition: getNextTransition(tradingSessions)
      });
    }, 1000);
    
    // Initial calculation
    setActiveStates({
      activeSessions: getActiveSessions(tradingSessions),
      activeOverlaps: getActiveOverlaps(sessionOverlaps),
      nextTransition: getNextTransition(tradingSessions)
    });
    
    return () => clearInterval(interval);
  }, [symbol]);
  
  const { activeSessions, activeOverlaps, nextTransition } = activeStates;
  
  return (
    <div className="bg-[#0A0A0A] p-4 rounded-lg mt-4">
      <h4 className="font-medium mb-3 flex items-center">
        <Clock className="mr-2 h-5 w-5 text-[#E64A4A]" />
        Trading Session Countdown
      </h4>
      
      {/* Active Trading Sessions */}
      <div className="mb-4">
        <p className="text-sm text-gray-400 mb-2">Currently Active:</p>
        
        {activeSessions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {activeSessions.map((session, index) => (
              <div 
                key={index} 
                className={`px-3 py-1 rounded-full text-xs text-white ${session.color} flex items-center animate-pulse`}
              >
                <span className="w-2 h-2 bg-white rounded-full mr-1"></span>
                {session.name}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-500 italic">No major trading sessions currently active</p>
        )}
        
        {activeOverlaps.length > 0 && (
          <div className="mt-2">
            <p className="text-sm text-gray-400 mb-2">
              <span className="text-yellow-500 font-medium">Session Overlap Active:</span>
            </p>
            {activeOverlaps.map((overlap, index) => (
              <div key={index} className="bg-yellow-500/20 border border-yellow-500 rounded p-2 flex items-start">
                <AlertCircle className="w-4 h-4 text-yellow-500 mr-2 mt-0.5 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-white">{overlap.name}</p>
                  <p className="text-xs text-gray-300">{overlap.description}</p>
                  {overlap.importance === 'critical' && (
                    <p className="text-xs text-yellow-500 font-medium mt-1">Optimal trading conditions</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      
      {/* Countdown Timer */}
      {nextTransition && (
        <div className="bg-[#1E1E1E] rounded-lg p-3 mb-4">
          <div className="flex items-start">
            <div className={`w-10 h-10 rounded-lg ${nextTransition.session.color} flex items-center justify-center mr-3`}>
              <Clock className="text-white" />
            </div>
            <div>
              <p className="text-sm text-gray-300">
                {nextTransition.type === 'start' 
                  ? `${nextTransition.session.name} session starts in:`
                  : `${nextTransition.session.name} session ends in:`}
              </p>
              
              <div className="flex items-center mt-1 space-x-1 text-2xl font-mono font-bold">
                <div className="bg-[#2A2A2A] px-2 py-1 rounded-md">
                  {formatTimeUnit(nextTransition.timeLeft.hours)}
                </div>
                <span>:</span>
                <div className="bg-[#2A2A2A] px-2 py-1 rounded-md">
                  {formatTimeUnit(nextTransition.timeLeft.minutes)}
                </div>
                <span>:</span>
                <div className="bg-[#2A2A2A] px-2 py-1 rounded-md">
                  {formatTimeUnit(nextTransition.timeLeft.seconds)}
                </div>
              </div>
              
              {nextTransition.type === 'start' && nextTransition.session.importance === 'high' && (
                <div className="mt-2 text-xs flex items-center text-[#E64A4A]">
                  <TrendingUp className="w-3 h-3 mr-1" />
                  Major session for {symbol} trading
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Session Timeline */}
      <div className="mt-4">
        <h5 className="text-sm font-medium mb-2">24-Hour Session Timeline (UTC)</h5>
        <div className="relative h-12 bg-[#1E1E1E] rounded-lg overflow-hidden">
          {/* Time indicators */}
          <div className="absolute top-0 left-0 w-full h-full flex">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="flex-1 border-r border-[#333333] h-full relative">
                {i % 3 === 0 && (
                  <span className="absolute bottom-0 left-1 text-xs text-gray-500">{i}</span>
                )}
              </div>
            ))}
          </div>
          
          {/* Current time marker */}
          <div 
            className="absolute top-0 h-full w-0.5 bg-white z-20" 
            style={{ 
              left: `${(currentTime.getUTCHours() * 60 + currentTime.getUTCMinutes()) / (24 * 60) * 100}%` 
            }}
          >
            <div className="w-2 h-2 rounded-full bg-white -ml-[3px] animate-pulse"></div>
          </div>
          
          {/* Sessions */}
          {tradingSessions.map((session, index) => {
            // Calculate position and width
            let leftPosition: string;
            let width: string;
            
            if (session.utcStart < session.utcEnd) {
              // Standard session (e.g., 8-16)
              leftPosition = `${(session.utcStart / 24) * 100}%`;
              width = `${((session.utcEnd - session.utcStart) / 24) * 100}%`;
            } else {
              // Session spans midnight (e.g., 20-5)
              leftPosition = `${(session.utcStart / 24) * 100}%`;
              width = `${((24 - session.utcStart + session.utcEnd) / 24) * 100}%`;
            }
            
            const isActive = isSessionActive(session.utcStart, session.utcEnd);
            
            return (
              <div 
                key={index}
                className={`absolute h-8 top-2 rounded-md ${session.color} ${isActive ? 'opacity-80' : 'opacity-40'}`}
                style={{ 
                  left: leftPosition,
                  width: width,
                  zIndex: session.importance === 'high' ? 15 : (session.importance === 'medium' ? 10 : 5)
                }}
              >
                <div className="h-full flex items-center justify-center text-xs text-white font-medium">
                  {session.name}
                </div>
              </div>
            );
          })}
          
          {/* Overlaps */}
          {sessionOverlaps.map((overlap, index) => {
            const leftPosition = `${(overlap.utcStart / 24) * 100}%`;
            const width = `${((overlap.utcEnd - overlap.utcStart) / 24) * 100}%`;
            const isActive = isSessionActive(overlap.utcStart, overlap.utcEnd);
            
            return (
              <div 
                key={`overlap-${index}`}
                className={`absolute h-2 bottom-0 bg-yellow-500 ${isActive ? 'animate-pulse' : 'opacity-50'}`}
                style={{ 
                  left: leftPosition,
                  width: width,
                  zIndex: 12
                }}
              ></div>
            );
          })}
        </div>
        <div className="mt-1 text-xs text-gray-500">
          <span className="inline-block mr-4">⬜ = Sydney</span>
          <span className="inline-block mr-4">⬜ = Tokyo</span>
          <span className="inline-block mr-4">⬜ = London</span>
          <span className="inline-block">⬜ = New York</span>
        </div>
        <div className="mt-1 text-xs text-gray-500">
          <span className="inline-block">Yellow bars = Session overlaps (high volatility periods)</span>
        </div>
      </div>
      
      <div className="mt-4 text-xs">
        <p className="text-gray-400">
          <span className="font-medium">PRO TIP:</span> {symbol.includes('JPY') 
            ? 'JPY pairs often show increased volatility during Asian sessions.'
            : symbol.includes('GBP')
              ? 'GBP pairs are most active during London trading hours.'
              : 'Major currency pairs typically have tightest spreads during London/NY overlap.'}
        </p>
      </div>
    </div>
  );
};

export default SessionCountdownTimer;