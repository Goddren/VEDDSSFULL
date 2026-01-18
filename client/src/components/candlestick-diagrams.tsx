interface CandleProps {
  x: number;
  open: number;
  close: number;
  high: number;
  low: number;
  width?: number;
  label?: string;
}

const Candle = ({ x, open, close, high, low, width = 30, label }: CandleProps) => {
  const isBullish = close > open;
  const bodyTop = Math.min(open, close);
  const bodyBottom = Math.max(open, close);
  const bodyHeight = Math.max(bodyBottom - bodyTop, 2);
  const color = isBullish ? '#22c55e' : '#ef4444';
  
  return (
    <g>
      <line 
        x1={x + width/2} 
        y1={high} 
        x2={x + width/2} 
        y2={low} 
        stroke={color} 
        strokeWidth="2"
      />
      <rect 
        x={x} 
        y={bodyTop} 
        width={width} 
        height={bodyHeight} 
        fill={color}
        stroke={color}
        strokeWidth="1"
      />
      {label && (
        <text 
          x={x + width/2} 
          y={low + 20} 
          textAnchor="middle" 
          fill="#9ca3af" 
          fontSize="11"
        >
          {label}
        </text>
      )}
    </g>
  );
};

const Arrow = ({ x1, y1, x2, y2, color = '#fbbf24' }: { x1: number; y1: number; x2: number; y2: number; color?: string }) => (
  <g>
    <defs>
      <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
        <polygon points="0 0, 10 3.5, 0 7" fill={color} />
      </marker>
    </defs>
    <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth="2" markerEnd="url(#arrowhead)" />
  </g>
);

const Label = ({ x, y, text, color = '#fbbf24' }: { x: number; y: number; text: string; color?: string }) => (
  <text x={x} y={y} textAnchor="middle" fill={color} fontSize="14" fontWeight="bold">
    {text}
  </text>
);

export const DojiDiagram = () => (
  <svg viewBox="0 0 300 200" className="w-full h-auto">
    <rect width="300" height="200" fill="#1f2937" />
    <Label x={150} y={25} text="DOJI PATTERN" />
    <Candle x={50} open={120} close={80} high={60} low={140} label="Before" />
    <g>
      <line x1={150} y1={50} x2={150} y2={150} stroke="#9ca3af" strokeWidth="2" />
      <rect x={135} y={98} width={30} height={4} fill="#9ca3af" stroke="#9ca3af" />
      <text x={150} y={175} textAnchor="middle" fill="#fbbf24" fontSize="12" fontWeight="bold">DOJI</text>
      <text x={150} y={190} textAnchor="middle" fill="#6b7280" fontSize="10">Open ≈ Close</text>
    </g>
    <Candle x={220} open={80} close={120} high={60} low={140} label="After" />
    <Arrow x1={200} y1={40} x2={165} y2={55} />
  </svg>
);

export const HammerDiagram = () => (
  <svg viewBox="0 0 300 200" className="w-full h-auto">
    <rect width="300" height="200" fill="#1f2937" />
    <Label x={150} y={25} text="HAMMER PATTERN" />
    <Candle x={40} open={70} close={90} high={60} low={100} />
    <Candle x={80} open={85} close={100} high={80} low={110} />
    <Candle x={120} open={95} close={110} high={90} low={120} />
    <g>
      <line x1={175} y1={70} x2={175} y2={160} stroke="#22c55e" strokeWidth="2" />
      <rect x={160} y={70} width={30} height={15} fill="#22c55e" stroke="#22c55e" />
      <text x={175} y={180} textAnchor="middle" fill="#fbbf24" fontSize="12" fontWeight="bold">HAMMER</text>
    </g>
    <Candle x={220} open={90} close={70} high={60} low={80} />
    <Arrow x1={210} y1={50} x2={185} y2={65} />
    <text x={175} y={195} textAnchor="middle" fill="#6b7280" fontSize="9">Long lower wick, small body at top</text>
  </svg>
);

export const EngulfingDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={25} text="BULLISH ENGULFING" />
    <Candle x={40} open={80} close={100} high={70} low={110} />
    <Candle x={80} open={85} close={105} high={75} low={115} />
    <g>
      <rect x={120} y={90} width={20} height={30} fill="#ef4444" stroke="#ef4444" />
      <line x1={130} y1={85} x2={130} y2={125} stroke="#ef4444" strokeWidth="2" />
      <text x={130} y={140} textAnchor="middle" fill="#9ca3af" fontSize="9">Small</text>
    </g>
    <g>
      <rect x={155} y={75} width={35} height={50} fill="#22c55e" stroke="#22c55e" />
      <line x1={172} y1={65} x2={172} y2={135} stroke="#22c55e" strokeWidth="2" />
      <text x={172} y={150} textAnchor="middle" fill="#fbbf24" fontSize="9" fontWeight="bold">ENGULFS</text>
    </g>
    <Candle x={210} open={75} close={60} high={50} low={80} />
    <Candle x={250} open={65} close={50} high={40} low={70} />
    <Arrow x1={172} y1={45} x2={172} y2={60} />
    <text x={175} y={180} textAnchor="middle" fill="#6b7280" fontSize="10">Green candle completely covers red candle body</text>
  </svg>
);

export const MorningStarDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="MORNING STAR (3 Candles)" />
    <Candle x={30} open={60} close={90} high={50} low={100} />
    <g>
      <rect x={80} y={50} width={40} height={60} fill="#ef4444" stroke="#ef4444" />
      <line x1={100} y1={40} x2={100} y2={120} stroke="#ef4444" strokeWidth="2" />
      <text x={100} y={135} textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">1. BEARISH</text>
    </g>
    <g>
      <rect x={145} y={115} width={20} height={8} fill="#9ca3af" stroke="#9ca3af" />
      <line x1={155} y1={105} x2={155} y2={135} stroke="#9ca3af" strokeWidth="2" />
      <text x={155} y={150} textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">2. SMALL</text>
    </g>
    <g>
      <rect x={190} y={60} width={40} height={55} fill="#22c55e" stroke="#22c55e" />
      <line x1={210} y1={50} x2={210} y2={125} stroke="#22c55e" strokeWidth="2" />
      <text x={210} y={140} textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">3. BULLISH</text>
    </g>
    <Candle x={250} open={65} close={50} high={40} low={70} />
    <Candle x={290} open={55} close={40} high={30} low={60} />
    <text x={175} y={175} textAnchor="middle" fill="#22c55e" fontSize="11">↑ Bullish Reversal Signal</text>
  </svg>
);

export const HeadShouldersDiagram = () => (
  <svg viewBox="0 0 400 220" className="w-full h-auto">
    <rect width="400" height="220" fill="#1f2937" />
    <Label x={200} y={20} text="HEAD AND SHOULDERS" />
    <path 
      d="M 30 150 L 80 100 L 110 130 L 160 50 L 210 130 L 240 100 L 290 150 L 350 170" 
      fill="none" 
      stroke="#22c55e" 
      strokeWidth="3"
    />
    <line x1={110} y1={130} x2={210} y2={130} stroke="#ef4444" strokeWidth="2" strokeDasharray="5,5" />
    <text x={80} y={90} textAnchor="middle" fill="#9ca3af" fontSize="11">Left</text>
    <text x={80} y={102} textAnchor="middle" fill="#9ca3af" fontSize="11">Shoulder</text>
    <text x={160} y={40} textAnchor="middle" fill="#fbbf24" fontSize="12" fontWeight="bold">HEAD</text>
    <text x={240} y={90} textAnchor="middle" fill="#9ca3af" fontSize="11">Right</text>
    <text x={240} y={102} textAnchor="middle" fill="#9ca3af" fontSize="11">Shoulder</text>
    <text x={160} y={145} textAnchor="middle" fill="#ef4444" fontSize="10">NECKLINE</text>
    <Arrow x1={300} y1={155} x2={330} y2={175} />
    <text x={350} y={195} textAnchor="middle" fill="#ef4444" fontSize="11">Bearish</text>
    <text x={350} y={208} textAnchor="middle" fill="#ef4444" fontSize="11">Breakout</text>
  </svg>
);

export const DoubleTopDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="DOUBLE TOP (M Pattern)" />
    <path 
      d="M 30 150 L 80 50 L 130 100 L 180 50 L 230 100 L 280 150 L 320 170" 
      fill="none" 
      stroke="#22c55e" 
      strokeWidth="3"
    />
    <line x1={30} y1={50} x2={230} y2={50} stroke="#ef4444" strokeWidth="2" strokeDasharray="5,5" />
    <text x={80} y={40} textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="bold">TOP 1</text>
    <text x={180} y={40} textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="bold">TOP 2</text>
    <text x={130} y={65} textAnchor="middle" fill="#ef4444" fontSize="10">Resistance</text>
    <text x={130} y={115} textAnchor="middle" fill="#9ca3af" fontSize="10">Trough</text>
    <Arrow x1={250} y1={110} x2={280} y2={140} />
    <text x={300} y={180} textAnchor="middle" fill="#ef4444" fontSize="11">↓ Bearish</text>
  </svg>
);

export const TriangleDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="ASCENDING TRIANGLE" />
    <line x1={30} y1={60} x2={280} y2={60} stroke="#ef4444" strokeWidth="2" />
    <text x={295} y={65} fill="#ef4444" fontSize="10">Resistance</text>
    <line x1={30} y1={160} x2={250} y2={70} stroke="#22c55e" strokeWidth="2" />
    <text x={80} y={175} fill="#22c55e" fontSize="10">Rising Support</text>
    <path 
      d="M 40 150 L 70 65 L 100 130 L 140 65 L 170 110 L 210 65 L 240 90" 
      fill="none" 
      stroke="#60a5fa" 
      strokeWidth="2"
    />
    <Arrow x1={260} y1={60} x2={300} y2={40} color="#22c55e" />
    <text x={310} y={35} textAnchor="start" fill="#22c55e" fontSize="11">Breakout ↗</text>
    <text x={175} y={190} textAnchor="middle" fill="#6b7280" fontSize="10">Price makes higher lows, tests same resistance</text>
  </svg>
);

export const FlagPennantDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="BULL FLAG PATTERN" />
    <line x1={50} y1={170} x2={120} y2={50} stroke="#22c55e" strokeWidth="4" />
    <text x={85} y={130} textAnchor="middle" fill="#22c55e" fontSize="10" transform="rotate(-55, 85, 130)">POLE</text>
    <path 
      d="M 120 50 L 140 70 L 160 55 L 180 75 L 200 60 L 220 80" 
      fill="none" 
      stroke="#60a5fa" 
      strokeWidth="2"
    />
    <line x1={115} y1={45} x2={220} y2={75} stroke="#9ca3af" strokeWidth="1" strokeDasharray="3,3" />
    <line x1={120} y1={55} x2={225} y2={85} stroke="#9ca3af" strokeWidth="1" strokeDasharray="3,3" />
    <text x={170} y={100} textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="bold">FLAG</text>
    <Arrow x1={230} y1={70} x2={290} y2={30} color="#22c55e" />
    <text x={300} y={45} textAnchor="start" fill="#22c55e" fontSize="10">Continue ↗</text>
    <text x={175} y={185} textAnchor="middle" fill="#6b7280" fontSize="10">Strong move (pole) + consolidation (flag) = continuation</text>
  </svg>
);

export const CupHandleDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="CUP AND HANDLE" />
    <path 
      d="M 30 60 Q 30 160 150 160 Q 270 160 270 60" 
      fill="none" 
      stroke="#22c55e" 
      strokeWidth="3"
    />
    <text x={150} y={145} textAnchor="middle" fill="#fbbf24" fontSize="12" fontWeight="bold">CUP</text>
    <path 
      d="M 270 60 Q 290 90 280 100 Q 270 110 290 90" 
      fill="none" 
      stroke="#60a5fa" 
      strokeWidth="2"
    />
    <text x={295} y={85} textAnchor="start" fill="#fbbf24" fontSize="10" fontWeight="bold">HANDLE</text>
    <line x1={20} y1={60} x2={320} y2={60} stroke="#9ca3af" strokeWidth="1" strokeDasharray="3,3" />
    <text x={330} y={65} fill="#9ca3af" fontSize="9">Rim</text>
    <Arrow x1={295} y1={55} x2={320} y2={30} color="#22c55e" />
    <text x={175} y={185} textAnchor="middle" fill="#6b7280" fontSize="10">Rounded bottom (U-shape) + small pullback = bullish</text>
  </svg>
);

export const WedgeDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="RISING WEDGE (Bearish)" />
    <line x1={40} y1={160} x2={250} y2={50} stroke="#ef4444" strokeWidth="2" />
    <line x1={40} y1={140} x2={250} y2={60} stroke="#ef4444" strokeWidth="2" />
    <path 
      d="M 50 155 L 80 130 L 110 145 L 140 110 L 170 125 L 200 85 L 230 100 L 240 65" 
      fill="none" 
      stroke="#60a5fa" 
      strokeWidth="2"
    />
    <text x={160} y={90} textAnchor="middle" fill="#fbbf24" fontSize="10">Converging</text>
    <text x={160} y={102} textAnchor="middle" fill="#fbbf24" fontSize="10">Trendlines</text>
    <Arrow x1={255} y1={70} x2={290} y2={120} color="#ef4444" />
    <text x={300} y={140} textAnchor="start" fill="#ef4444" fontSize="10">Bearish</text>
    <text x={300} y={152} textAnchor="start" fill="#ef4444" fontSize="10">Breakout ↓</text>
    <text x={175} y={185} textAnchor="middle" fill="#6b7280" fontSize="10">Both lines slope up but converge = bearish reversal</text>
  </svg>
);

export const SupportResistanceDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="SUPPORT & RESISTANCE" />
    <line x1={30} y1={50} x2={320} y2={50} stroke="#ef4444" strokeWidth="2" />
    <text x={330} y={55} fill="#ef4444" fontSize="10">Resistance</text>
    <line x1={30} y1={150} x2={320} y2={150} stroke="#22c55e" strokeWidth="2" />
    <text x={330} y={155} fill="#22c55e" fontSize="10">Support</text>
    <path 
      d="M 40 100 L 70 55 L 90 80 L 120 55 L 150 100 L 180 145 L 210 120 L 240 145 L 270 100 L 300 55" 
      fill="none" 
      stroke="#60a5fa" 
      strokeWidth="2"
    />
    <circle cx={70} cy={55} r={8} fill="none" stroke="#ef4444" strokeWidth="2" />
    <circle cx={120} cy={55} r={8} fill="none" stroke="#ef4444" strokeWidth="2" />
    <circle cx={180} cy={145} r={8} fill="none" stroke="#22c55e" strokeWidth="2" />
    <circle cx={240} cy={145} r={8} fill="none" stroke="#22c55e" strokeWidth="2" />
    <text x={95} y={75} fill="#ef4444" fontSize="9">Rejection</text>
    <text x={210} y={170} fill="#22c55e" fontSize="9">Bounce</text>
  </svg>
);

export const RSIDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="RSI INDICATOR" />
    <rect x={30} y={35} width={290} height={30} fill="#ef444420" />
    <rect x={30} y={135} width={290} height={30} fill="#22c55e20" />
    <line x1={30} y1={65} x2={320} y2={65} stroke="#ef4444" strokeWidth="1" strokeDasharray="5,5" />
    <line x1={30} y1={135} x2={320} y2={135} stroke="#22c55e" strokeWidth="1" strokeDasharray="5,5" />
    <text x={325} y={50} fill="#ef4444" fontSize="10">70</text>
    <text x={325} y={142} fill="#22c55e" fontSize="10">30</text>
    <text x={25} y={50} textAnchor="end" fill="#ef4444" fontSize="9">Overbought</text>
    <text x={25} y={142} textAnchor="end" fill="#22c55e" fontSize="9">Oversold</text>
    <path 
      d="M 40 100 L 70 80 L 100 50 L 130 60 L 160 100 L 190 140 L 220 150 L 250 130 L 280 100 L 310 80" 
      fill="none" 
      stroke="#a855f7" 
      strokeWidth="2"
    />
    <circle cx={100} cy={50} r={6} fill="#ef4444" />
    <circle cx={220} cy={150} r={6} fill="#22c55e" />
    <text x={100} y={38} textAnchor="middle" fill="#ef4444" fontSize="9">Sell Signal</text>
    <text x={220} y={175} textAnchor="middle" fill="#22c55e" fontSize="9">Buy Signal</text>
  </svg>
);

export const MACDDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="MACD INDICATOR" />
    <line x1={30} y1={100} x2={320} y2={100} stroke="#4b5563" strokeWidth="1" />
    <text x={325} y={105} fill="#6b7280" fontSize="9">0</text>
    {[40, 60, 80, 100, 120, 140, 160].map((x, i) => (
      <rect key={i} x={x} y={100} width={15} height={20 + i * 5} fill="#22c55e" opacity="0.7" />
    ))}
    {[180, 200, 220, 240, 260, 280].map((x, i) => (
      <rect key={i} x={x} y={100 - (25 - i * 5)} width={15} height={25 - i * 5} fill="#ef4444" opacity="0.7" />
    ))}
    <path d="M 45 130 L 85 120 L 125 100 L 165 80 L 205 90 L 245 110 L 285 120" fill="none" stroke="#3b82f6" strokeWidth="2" />
    <path d="M 45 140 L 85 130 L 125 115 L 165 95 L 205 100 L 245 115 L 285 125" fill="none" stroke="#f97316" strokeWidth="2" />
    <circle cx={165} cy={87} r={8} fill="none" stroke="#fbbf24" strokeWidth="2" />
    <text x={165} y={70} textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">Bullish Cross</text>
    <text x={80} y={180} fill="#3b82f6" fontSize="10">— MACD Line</text>
    <text x={180} y={180} fill="#f97316" fontSize="10">— Signal Line</text>
    <text x={280} y={180} fill="#6b7280" fontSize="10">█ Histogram</text>
  </svg>
);

export const MovingAveragesDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="MOVING AVERAGES - GOLDEN CROSS" />
    <path d="M 30 150 L 80 140 L 130 120 L 180 90 L 230 60 L 280 40 L 320 35" fill="none" stroke="#60a5fa" strokeWidth="2" />
    <path d="M 30 120 L 80 125 L 130 110 L 180 95 L 230 75 L 280 55 L 320 50" fill="none" stroke="#f97316" strokeWidth="2" />
    <circle cx={155} cy={105} r={10} fill="none" stroke="#fbbf24" strokeWidth="2" />
    <text x={155} y={130} textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="bold">GOLDEN CROSS</text>
    <Arrow x1={175} y1={90} x2={200} y2={65} color="#22c55e" />
    <text x={215} y={60} fill="#22c55e" fontSize="10">Bullish ↗</text>
    <text x={60} y={180} fill="#60a5fa" fontSize="10">— 50 MA (Fast)</text>
    <text x={180} y={180} fill="#f97316" fontSize="10">— 200 MA (Slow)</text>
  </svg>
);

export const BollingerBandsDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="BOLLINGER BANDS" />
    <path d="M 30 40 L 80 50 L 130 45 L 180 70 L 230 50 L 280 55 L 320 45" fill="none" stroke="#22c55e" strokeWidth="2" />
    <path d="M 30 100 L 80 95 L 130 90 L 180 100 L 230 95 L 280 100 L 320 95" fill="none" stroke="#3b82f6" strokeWidth="2" />
    <path d="M 30 160 L 80 145 L 130 150 L 180 130 L 230 150 L 280 145 L 320 155" fill="none" stroke="#ef4444" strokeWidth="2" />
    <path d="M 40 110 L 70 60 L 100 80 L 130 55 L 160 95 L 190 130 L 220 145 L 250 120 L 280 100 L 310 70" fill="none" stroke="#fbbf24" strokeWidth="2" />
    <circle cx={130} cy={55} r={6} fill="#ef4444" />
    <circle cx={220} cy={145} r={6} fill="#22c55e" />
    <text x={130} y={40} textAnchor="middle" fill="#ef4444" fontSize="9">Overbought</text>
    <text x={220} y={165} textAnchor="middle" fill="#22c55e" fontSize="9">Oversold</text>
    <text x={50} y={185} fill="#22c55e" fontSize="10">— Upper Band</text>
    <text x={150} y={185} fill="#3b82f6" fontSize="10">— Middle (SMA)</text>
    <text x={260} y={185} fill="#ef4444" fontSize="10">— Lower Band</text>
  </svg>
);

export const VolumeDiagram = () => (
  <svg viewBox="0 0 350 200" className="w-full h-auto">
    <rect width="350" height="200" fill="#1f2937" />
    <Label x={175} y={20} text="VOLUME ANALYSIS" />
    <path d="M 30 120 L 60 115 L 90 110 L 120 100 L 150 95 L 180 60 L 210 55 L 240 50 L 270 45 L 300 40" fill="none" stroke="#60a5fa" strokeWidth="2" />
    <rect x={35} y={145} width={20} height={25} fill="#6b7280" opacity="0.5" />
    <rect x={65} y={140} width={20} height={30} fill="#6b7280" opacity="0.5" />
    <rect x={95} y={135} width={20} height={35} fill="#6b7280" opacity="0.5" />
    <rect x={125} y={130} width={20} height={40} fill="#6b7280" opacity="0.5" />
    <rect x={155} y={100} width={20} height={70} fill="#22c55e" />
    <rect x={185} y={95} width={20} height={75} fill="#22c55e" />
    <rect x={215} y={120} width={20} height={50} fill="#6b7280" opacity="0.5" />
    <rect x={245} y={125} width={20} height={45} fill="#6b7280" opacity="0.5" />
    <rect x={275} y={130} width={20} height={40} fill="#6b7280" opacity="0.5" />
    <text x={175} y={95} textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">HIGH VOLUME</text>
    <text x={175} y={107} textAnchor="middle" fill="#fbbf24" fontSize="10" fontWeight="bold">BREAKOUT</text>
    <Arrow x1={175} y1={75} x2={175} y2={60} color="#22c55e" />
    <text x={175} y={190} textAnchor="middle" fill="#6b7280" fontSize="10">High volume confirms price breakouts</text>
  </svg>
);

export const patternDiagrams = {
  doji: DojiDiagram,
  hammer: HammerDiagram,
  engulfing: EngulfingDiagram,
  morningStar: MorningStarDiagram,
  headShoulders: HeadShouldersDiagram,
  doubleTop: DoubleTopDiagram,
  triangle: TriangleDiagram,
  flagPennant: FlagPennantDiagram,
  cupHandle: CupHandleDiagram,
  wedge: WedgeDiagram,
  supportResistance: SupportResistanceDiagram,
  rsi: RSIDiagram,
  macd: MACDDiagram,
  movingAverages: MovingAveragesDiagram,
  bollingerBands: BollingerBandsDiagram,
  volume: VolumeDiagram,
};
