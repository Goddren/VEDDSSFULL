import React from 'react';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useQuery } from '@tanstack/react-query';

const Dashboard: React.FC = () => {
  const { data: analyses, isLoading, isError } = useQuery({
    queryKey: ['/api/analyses'],
  });

  return (
    <div className="container mx-auto px-4 md:px-8 py-8">
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">Dashboard</h1>
          <p className="text-gray-400 mt-2">View your analysis history and statistics</p>
        </div>
        <Link href="/analysis">
          <Button className="bg-[#E64A4A] hover:bg-opacity-80 text-white">
            <i className="fas fa-plus mr-2"></i> New Analysis
          </Button>
        </Link>
      </div>

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="bg-[#1E1E1E] border-[#333333]">
          <CardHeader className="pb-2">
            <CardDescription>Total Analyses</CardDescription>
            <CardTitle className="text-2xl">{isLoading ? '...' : analyses?.length || 0}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-400">
              <span className="text-[#4CAF50]">+3</span> from last week
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-[#1E1E1E] border-[#333333]">
          <CardHeader className="pb-2">
            <CardDescription>Buy Signals</CardDescription>
            <CardTitle className="text-2xl">
              {isLoading ? '...' : 
                analyses?.filter(a => a.direction.toLowerCase() === 'buy').length || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-400">
              <span className="text-[#E64A4A]">-2</span> from last week
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-[#1E1E1E] border-[#333333]">
          <CardHeader className="pb-2">
            <CardDescription>Sell Signals</CardDescription>
            <CardTitle className="text-2xl">
              {isLoading ? '...' : 
                analyses?.filter(a => a.direction.toLowerCase() === 'sell').length || 0}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-sm text-gray-400">
              <span className="text-[#4CAF50]">+5</span> from last week
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Analyses */}
      <Card className="bg-[#1E1E1E] border-[#333333] mb-8">
        <CardHeader>
          <CardTitle>Recent Analyses</CardTitle>
          <CardDescription>Your most recent chart analyses</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-4 border-[#333333] border-t-[#E64A4A] rounded-full animate-spin"></div>
            </div>
          ) : isError ? (
            <div className="text-center py-8 text-gray-400">Error loading analyses</div>
          ) : analyses?.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <p>No analyses yet. Upload your first chart to get started.</p>
              <Link href="/analysis">
                <Button className="mt-4 bg-[#E64A4A] hover:bg-opacity-80 text-white">
                  Analyze Chart
                </Button>
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {analyses?.slice(0, 5).map((analysis) => (
                <Link key={analysis.id} href={`/analysis/${analysis.id}`}>
                  <div className="bg-[#0A0A0A] p-4 rounded-lg flex items-center justify-between hover:bg-[#222222] transition cursor-pointer">
                    <div className="flex items-center">
                      <div className="h-16 w-16 rounded bg-[#1E1E1E] mr-4 overflow-hidden">
                        <img 
                          src={analysis.imageUrl} 
                          alt="Chart thumbnail" 
                          className="h-full w-full object-cover"
                        />
                      </div>
                      <div>
                        <h4 className="font-medium">{analysis.symbol || 'Unknown Symbol'}</h4>
                        <p className="text-sm text-gray-400">{analysis.timeframe || 'Unknown Timeframe'}</p>
                        <div className="mt-1 flex items-center">
                          <span className={`text-xs px-2 py-0.5 rounded ${
                            analysis.direction.toLowerCase() === 'buy' 
                              ? 'bg-green-500/20 text-green-500' 
                              : 'bg-red-500/20 text-red-500'
                          }`}>
                            {analysis.direction}
                          </span>
                          <span className="text-xs text-gray-400 ml-2">
                            {new Date(analysis.createdAt).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <i className="fas fa-chevron-right text-gray-400"></i>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Popular Patterns */}
      <Card className="bg-[#1E1E1E] border-[#333333]">
        <CardHeader>
          <CardTitle>Pattern Distribution</CardTitle>
          <CardDescription>Most common patterns in your analyses</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center">
            <div className="text-center text-gray-400">
              <i className="fas fa-chart-pie text-4xl mb-4 text-[#E64A4A]/50"></i>
              <p>Analyze more charts to see pattern distribution</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Dashboard;
