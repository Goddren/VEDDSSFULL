import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'wouter';
import { ChartAnalysis } from '@shared/schema';
import { SwipeDeck } from '@/components/trading/swipe-deck';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Filter, List, Shuffle } from 'lucide-react';
import { ChartImage } from '@/components/ui/chart-image';

const Historical: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'swipe' | 'list'>('swipe');
  
  const { data: analyses = [], isLoading, isError } = useQuery<ChartAnalysis[]>({
    queryKey: ['/api/analyses'],
    queryFn: async () => {
      const res = await fetch('/api/analyses');
      if (!res.ok) throw new Error('Failed to fetch analyses');
      return res.json();
    }
  });

  const filteredAnalyses = React.useMemo(() => {
    if (!analyses) return [];
    
    return analyses.filter((analysis: ChartAnalysis) => {
      const query = searchQuery.toLowerCase();
      return (
        analysis.symbol?.toLowerCase().includes(query) ||
        analysis.direction?.toLowerCase().includes(query) ||
        analysis.trend?.toLowerCase().includes(query) ||
        analysis.timeframe?.toLowerCase().includes(query)
      );
    });
  }, [analyses, searchQuery]);
  
  const handleFilterClick = () => {
    // Implement filter dialog later
    console.log('Filter clicked');
  };

  return (
    <div className="container mx-auto px-4 md:px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl md:text-3xl font-bold">Historical Analyses</h1>
        <p className="text-gray-400 mt-2">View and search your past chart analyses</p>
      </div>
      
      <Card className="bg-[#1E1E1E] border-[#2D2D2D] mb-8">
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle>Search & Filter</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-grow">
              <Input
                placeholder="Search by symbol, timeframe, direction..."
                className="bg-[#0A0A0A] border-[#333333] placeholder:text-gray-500"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
            <Button 
              variant="outline" 
              className="border-[#333333] hover:bg-[#333333]"
              onClick={handleFilterClick}
            >
              <Filter className="h-4 w-4 mr-2" /> Filter
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="mb-6">
        <Tabs 
          defaultValue="swipe" 
          value={viewMode}
          onValueChange={(value) => setViewMode(value as 'swipe' | 'list')} 
          className="w-full"
        >
          <div className="flex justify-center mb-4">
            <TabsList className="bg-[#1E1E1E] border border-[#333333]">
              <TabsTrigger 
                value="swipe" 
                className="data-[state=active]:bg-[#E64A4A] data-[state=active]:text-white"
              >
                <Shuffle className="h-4 w-4 mr-2" /> Swipe Mode
              </TabsTrigger>
              <TabsTrigger 
                value="list" 
                className="data-[state=active]:bg-[#E64A4A] data-[state=active]:text-white"
              >
                <List className="h-4 w-4 mr-2" /> List Mode
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="swipe" className="w-full">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-8 h-8 border-4 border-[#333333] border-t-[#E64A4A] rounded-full animate-spin"></div>
              </div>
            ) : isError ? (
              <div className="text-center py-12 text-red-500">
                <p className="mb-2">Failed to load analyses. Please try again later.</p>
              </div>
            ) : filteredAnalyses.length === 0 ? (
              <div className="text-center py-12 text-gray-400">
                {searchQuery 
                  ? <p>No analyses match your search criteria</p>
                  : <p>No analyses found. Upload your first chart to get started.</p>
                }
                
                <Link href="/analysis">
                  <Button className="mt-4 bg-[#E64A4A] hover:bg-opacity-80">
                    New Analysis
                  </Button>
                </Link>
              </div>
            ) : (
              <SwipeDeck
                analyses={filteredAnalyses}
                onFilterClick={handleFilterClick}
              />
            )}
          </TabsContent>

          <TabsContent value="list">
            <Card className="bg-[#1E1E1E] border-[#2D2D2D]">
              <CardHeader>
                <CardTitle>Analysis History</CardTitle>
                <CardDescription>
                  {isLoading ? 'Loading...' : `${filteredAnalyses.length} analyses found`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <div className="flex justify-center py-8">
                    <div className="w-8 h-8 border-4 border-[#333333] border-t-[#E64A4A] rounded-full animate-spin"></div>
                  </div>
                ) : isError ? (
                  <div className="text-center py-8 text-red-500">
                    <p>Failed to load analyses. Please try again later.</p>
                  </div>
                ) : filteredAnalyses.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    {searchQuery 
                      ? <p>No analyses match your search criteria</p>
                      : <p>No analyses found. Upload your first chart to get started.</p>
                    }
                    
                    <Link href="/analysis">
                      <Button className="mt-4 bg-[#E64A4A] hover:bg-opacity-80">
                        New Analysis
                      </Button>
                    </Link>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filteredAnalyses.map((analysis: ChartAnalysis) => (
                      <Link key={analysis.id} href={`/analysis/${analysis.id}`}>
                        <div className="bg-[#0A0A0A] hover:bg-[#1A1A1A] p-4 rounded-lg flex flex-col md:flex-row md:items-center gap-4 cursor-pointer transition-colors">
                          <div className="md:w-1/4 lg:w-1/6">
                            <div className="h-32 md:h-20 rounded bg-[#1E1E1E] overflow-hidden">
                              <ChartImage 
                                imageUrl={analysis.imageUrl}
                                altText={`${analysis.symbol || 'Chart'} analysis`}
                                className="h-full w-full"
                              />
                            </div>
                          </div>
                          
                          <div className="md:w-3/4 lg:w-5/6 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                            <div>
                              <div className="flex items-center gap-2 mb-1">
                                <h3 className="font-medium">{analysis.symbol || 'Unknown Symbol'}</h3>
                                <span className={`text-xs px-2 py-0.5 rounded-full ${
                                  analysis.direction.toLowerCase() === 'buy' 
                                    ? 'bg-green-500/20 text-green-500' 
                                    : 'bg-red-500/20 text-red-500'
                                }`}>
                                  {analysis.direction}
                                </span>
                              </div>
                              <p className="text-sm text-gray-400">{analysis.timeframe || 'Unknown Timeframe'}</p>
                              <p className="text-sm">
                                <span className="text-gray-400">Trend:</span> {analysis.trend}
                              </p>
                            </div>
                            
                            <div className="text-sm space-y-1">
                              <div className="flex justify-between md:justify-start md:gap-4">
                                <span className="text-gray-400">Entry:</span> 
                                <span>{analysis.entryPoint}</span>
                              </div>
                              <div className="flex justify-between md:justify-start md:gap-4">
                                <span className="text-gray-400">TP:</span> 
                                <span>{analysis.takeProfit}</span>
                              </div>
                              <div className="flex justify-between md:justify-start md:gap-4">
                                <span className="text-gray-400">SL:</span> 
                                <span>{analysis.stopLoss}</span>
                              </div>
                            </div>
                            
                            <div className="text-right">
                              <p className="text-sm text-gray-400">
                                {new Date(analysis.createdAt).toLocaleDateString()}
                              </p>
                              <p className="text-xs text-gray-500">
                                {new Date(analysis.createdAt).toLocaleTimeString()}
                              </p>
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Historical;
