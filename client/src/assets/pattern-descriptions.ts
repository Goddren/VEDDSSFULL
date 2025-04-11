import {
  PieChart,
  ChartLine,
  BarChart2,
  Share2,
  TrendingUp,
  TrendingDown,
  Candlestick,
  ArrowUpDown
} from "lucide-react";
import { PatternSlideItem } from "@/components/ui/pattern-slider";

export const patternDescriptions: PatternSlideItem[] = [
  {
    name: "Double Top/Bottom",
    type: "Reversal",
    percentage: 22,
    icon: PieChart, 
    bgClass: "bg-rose-600/20", 
    barClass: "bg-rose-500",
    description: "A double top forms after an uptrend when a price reaches a high, retraces, then returns to the same level before declining. Double bottoms are the inverse, forming after a downtrend. Both indicate trend reversals with strong accuracy in mature trends.",
    imageUrl: "/patterns/double-top.svg"
  },
  {
    name: "Head & Shoulders",
    type: "Reversal",
    percentage: 18,
    icon: ChartLine,
    bgClass: "bg-red-600/20",
    barClass: "bg-red-500",
    description: "A head and shoulders pattern consists of three peaks, with the middle peak (head) higher than the two surrounding peaks (shoulders). This pattern signals the likely reversal of a trend from bullish to bearish when the neckline is broken.",
    imageUrl: "/patterns/head-shoulders.svg"
  },
  {
    name: "Triangle Patterns",
    type: "Continuation",
    percentage: 25,
    icon: BarChart2,
    bgClass: "bg-blue-600/20",
    barClass: "bg-blue-500",
    description: "Triangles form when prices converge with lower highs and higher lows (symmetrical), lower highs and flat lows (descending), or flat highs and higher lows (ascending). They typically indicate continuation of the broader trend after a period of consolidation.",
    imageUrl: "/patterns/triangle.svg"
  },
  {
    name: "Flags & Pennants",
    type: "Continuation",
    percentage: 15,
    icon: Share2,
    bgClass: "bg-green-600/20",
    barClass: "bg-green-500",
    description: "Flags and pennants are short-term continuation patterns that form after a sharp movement followed by a consolidation period. Flags show parallel trendlines while pennants display converging trendlines, both typically followed by continuation in the original direction.",
    imageUrl: "/patterns/flag-pennant.svg"
  },
  {
    name: "Channel Patterns",
    type: "Trend",
    percentage: 12,
    icon: TrendingUp,
    bgClass: "bg-violet-600/20",
    barClass: "bg-violet-500",
    description: "Channel patterns form when prices move between two parallel trendlines. Ascending channels show higher highs and higher lows, while descending channels display lower highs and lower lows. They provide clear support and resistance levels for trading within the trend.",
    imageUrl: "/patterns/channel.svg"
  },
  {
    name: "Wedge Patterns",
    type: "Mixed",
    percentage: 8,
    icon: TrendingDown,
    bgClass: "bg-cyan-600/20",
    barClass: "bg-cyan-500",
    description: "Wedges form when trendlines converge, with rising wedges showing higher highs and higher lows in a contracting range, and falling wedges displaying lower highs and lower lows. Rising wedges typically predict bearish reversals, while falling wedges often indicate bullish reversals.",
    imageUrl: "/patterns/wedge.svg"
  }
];