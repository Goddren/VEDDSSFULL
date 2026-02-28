import { useState, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { Link } from 'wouter';
import {
  Shirt,
  QrCode,
  ShoppingBag,
  Coins,
  CheckCircle,
  Clock,
  XCircle,
  ExternalLink,
  Camera,
  ChevronRight,
  Star,
  Zap,
  Trophy,
  ArrowRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface ClaimItem {
  id: number;
  productName: string;
  claimCode: string;
  status: string;
  rewardAmount: number;
  submittedAt: string;
  imageUrl?: string;
}

interface WearToEarnStats {
  totalClaims: number;
  totalVeddEarned: number;
  pendingClaims: number;
}

const VEDD_PRODUCTS = [
  'VEDD Classic Tee',
  'VEDD Oversized Hoodie',
  'VEDD Snapback Cap',
  'VEDD Track Pants',
  'VEDD Bomber Jacket',
  'VEDD Long Sleeve',
  'VEDD Cargo Shorts',
  'VEDD Crewneck Sweatshirt',
  'VEDD Zip-Up Hoodie',
  'VEDD Beanie',
  'Other VEDD Item',
];

const getStatusColor = (status: string) => {
  switch (status) {
    case 'approved': return 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30';
    case 'pending': return 'bg-amber-500/20 text-amber-400 border-amber-500/30';
    case 'rejected': return 'bg-red-500/20 text-red-400 border-red-500/30';
    default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30';
  }
};

const getStatusIcon = (status: string) => {
  switch (status) {
    case 'approved': return <CheckCircle className="w-3 h-3" />;
    case 'pending': return <Clock className="w-3 h-3" />;
    case 'rejected': return <XCircle className="w-3 h-3" />;
    default: return <Clock className="w-3 h-3" />;
  }
};

export default function VeddClothingPage() {
  const { toast } = useToast();
  const [claimCode, setClaimCode] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [showImageField, setShowImageField] = useState(false);

  const { data: stats, isLoading: statsLoading } = useQuery<WearToEarnStats>({
    queryKey: ['/api/wear-to-earn/stats'],
    refetchInterval: 30000,
  });

  const { data: claims, isLoading: claimsLoading } = useQuery<ClaimItem[]>({
    queryKey: ['/api/wear-to-earn/claims'],
    refetchInterval: 30000,
  });

  const claimMutation = useMutation({
    mutationFn: (body: { claimCode: string; productName: string; imageUrl?: string }) =>
      apiRequest('POST', '/api/wear-to-earn/claim', body),
    onSuccess: async (res) => {
      const data = await res.json();
      toast({
        title: '🎉 Claim Submitted!',
        description: `+${data.rewardAmount} VEDD tokens added to your wallet (pending approval)`,
      });
      setClaimCode('');
      setSelectedProduct('');
      setImageUrl('');
      setShowImageField(false);
      queryClient.invalidateQueries({ queryKey: ['/api/wear-to-earn/claims'] });
      queryClient.invalidateQueries({ queryKey: ['/api/wear-to-earn/stats'] });
    },
    onError: async (err: any) => {
      let msg = 'Failed to submit claim';
      try { const d = await err.response?.json(); msg = d?.error || msg; } catch {}
      toast({ title: 'Claim Failed', description: msg, variant: 'destructive' });
    },
  });

  const handleSubmit = () => {
    if (!claimCode.trim()) return toast({ title: 'Enter your claim code', variant: 'destructive' });
    if (!selectedProduct) return toast({ title: 'Select a product', variant: 'destructive' });
    claimMutation.mutate({ claimCode: claimCode.trim(), productName: selectedProduct, imageUrl: imageUrl || undefined });
  };

  const totalVedd = stats?.totalVeddEarned || 0;
  const totalClaims = stats?.totalClaims || 0;
  const pendingClaims = stats?.pendingClaims || 0;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Hero */}
      <div className="relative overflow-hidden bg-gradient-to-br from-gray-900 via-amber-950/30 to-gray-900 border-b border-amber-500/20">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent" />
        <div className="relative max-w-4xl mx-auto px-4 py-16 text-center">
          <div className="flex justify-center mb-6">
            <div className="w-20 h-20 rounded-2xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center">
              <Shirt className="w-10 h-10 text-amber-400" />
            </div>
          </div>
          <h1 className="text-4xl md:text-5xl font-black mb-4 bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-300 bg-clip-text text-transparent">
            Wear VEDD. Earn VEDD.
          </h1>
          <p className="text-lg text-gray-300 max-w-2xl mx-auto mb-8">
            Every piece of VEDD Clothing comes with a unique QR code tag. Scan it to instantly earn <span className="text-amber-400 font-bold">50 VEDD tokens</span> — wearable proof that you're part of the movement.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="https://replit.com/@goddren/VeddVerse?s=app"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold transition-colors"
            >
              <ShoppingBag className="w-4 h-4" />
              Shop VEDD Clothing
              <ExternalLink className="w-3 h-3" />
            </a>
            <a
              href="#claim"
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl border border-amber-500/40 hover:border-amber-500/70 text-amber-400 font-semibold transition-colors"
            >
              <QrCode className="w-4 h-4" />
              Claim My Reward
            </a>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-10 space-y-10">

        {/* Stats strip */}
        {totalClaims > 0 && (
          <div className="grid grid-cols-3 gap-4">
            {[
              { label: 'Items Claimed', value: totalClaims, icon: Shirt, color: 'text-amber-400' },
              { label: 'VEDD Earned', value: `${totalVedd}`, icon: Coins, color: 'text-yellow-400' },
              { label: 'Pending', value: pendingClaims, icon: Clock, color: 'text-blue-400' },
            ].map(s => (
              <Card key={s.label} className="bg-gray-900 border-gray-800 text-center">
                <CardContent className="py-4">
                  <s.icon className={`w-5 h-5 mx-auto mb-2 ${s.color}`} />
                  <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                  <p className="text-xs text-gray-500 mt-1">{s.label}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* How It Works */}
        <div>
          <h2 className="text-xl font-bold text-white mb-6">How It Works</h2>
          <div className="grid md:grid-cols-3 gap-4">
            {[
              { step: '1', icon: ShoppingBag, title: 'Buy VEDD Clothing', desc: 'Purchase any item from the official VEDD Clothing store. Every item comes with a unique QR code tag.', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
              { step: '2', icon: QrCode, title: 'Scan the QR Tag', desc: 'Scan the QR code on your clothing tag using your phone camera. Copy the code shown on screen.', color: 'text-blue-400', bg: 'bg-blue-500/10 border-blue-500/20' },
              { step: '3', icon: Coins, title: 'Earn 50 VEDD', desc: 'Paste the code below and submit your claim. 50 VEDD tokens are added to your Trading Vault wallet instantly.', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
            ].map(item => (
              <Card key={item.step} className={`border ${item.bg} bg-gray-900`}>
                <CardContent className="pt-6 pb-5">
                  <div className={`w-10 h-10 rounded-xl ${item.bg} border flex items-center justify-center mb-4`}>
                    <item.icon className={`w-5 h-5 ${item.color}`} />
                  </div>
                  <div className={`text-xs font-bold ${item.color} mb-1`}>STEP {item.step}</div>
                  <h3 className="font-bold text-white mb-2">{item.title}</h3>
                  <p className="text-sm text-gray-400">{item.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Claim Form */}
        <div id="claim">
          <Card className="bg-gray-900 border-amber-500/20">
            <CardHeader className="border-b border-gray-800 pb-4">
              <CardTitle className="flex items-center gap-2 text-amber-400">
                <QrCode className="w-5 h-5" />
                Claim Your Reward
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-5">
              {/* Claim Code */}
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  QR Code / Claim Code <span className="text-amber-400">*</span>
                </label>
                <input
                  type="text"
                  value={claimCode}
                  onChange={e => setClaimCode(e.target.value.toUpperCase())}
                  placeholder="e.g. VEDD-ABC123"
                  maxLength={64}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500/50 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none text-sm font-mono tracking-wider"
                />
                <p className="text-xs text-gray-500 mt-1">Scan the QR code on your clothing tag or enter it manually</p>
              </div>

              {/* Product */}
              <div>
                <label className="block text-sm font-semibold text-gray-300 mb-2">
                  Product <span className="text-amber-400">*</span>
                </label>
                <select
                  value={selectedProduct}
                  onChange={e => setSelectedProduct(e.target.value)}
                  className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500/50 rounded-xl px-4 py-3 text-white focus:outline-none text-sm"
                >
                  <option value="">Select your VEDD item...</option>
                  {VEDD_PRODUCTS.map(p => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              </div>

              {/* Optional photo proof */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowImageField(v => !v)}
                  className="flex items-center gap-2 text-sm text-gray-400 hover:text-amber-400 transition-colors"
                >
                  <Camera className="w-4 h-4" />
                  {showImageField ? 'Hide' : 'Add'} photo proof (optional — boosts approval speed)
                </button>
                {showImageField && (
                  <div className="mt-3">
                    <input
                      type="url"
                      value={imageUrl}
                      onChange={e => setImageUrl(e.target.value)}
                      placeholder="Paste image URL (e.g. from Twitter, Instagram)"
                      className="w-full bg-gray-800 border border-gray-700 focus:border-amber-500/50 rounded-xl px-4 py-3 text-white placeholder-gray-600 focus:outline-none text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">Share a photo of you wearing the item for faster approval</p>
                  </div>
                )}
              </div>

              {/* Reward info */}
              <div className="flex items-center gap-3 p-4 rounded-xl bg-amber-500/10 border border-amber-500/20">
                <Coins className="w-8 h-8 text-amber-400 shrink-0" />
                <div>
                  <p className="font-bold text-amber-400 text-lg">+50 VEDD</p>
                  <p className="text-xs text-gray-400">Tokens added to your Trading Vault wallet upon claim (pending admin review)</p>
                </div>
              </div>

              <Button
                onClick={handleSubmit}
                disabled={claimMutation.isPending || !claimCode.trim() || !selectedProduct}
                className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold py-3 rounded-xl disabled:opacity-50"
              >
                {claimMutation.isPending ? (
                  <span className="flex items-center gap-2"><Clock className="w-4 h-4 animate-spin" /> Submitting...</span>
                ) : (
                  <span className="flex items-center gap-2"><Zap className="w-4 h-4" /> Submit Claim — Earn 50 VEDD</span>
                )}
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Bonus rewards info */}
        <div className="grid md:grid-cols-3 gap-4">
          {[
            { icon: Star, title: 'First Claim Bonus', value: '+25 VEDD', desc: 'Bonus on your very first VEDD clothing item', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
            { icon: Shirt, title: 'Per Item', value: '+50 VEDD', desc: 'Every unique VEDD clothing item you scan', color: 'text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
            { icon: Trophy, title: 'Refer a Purchase', value: '+10 VEDD', desc: 'When a referral buys and scans VEDD clothing', color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
          ].map(item => (
            <Card key={item.title} className={`border ${item.bg} bg-gray-900`}>
              <CardContent className="py-4 flex items-center gap-3">
                <div className={`w-10 h-10 rounded-xl ${item.bg} border flex items-center justify-center shrink-0`}>
                  <item.icon className={`w-5 h-5 ${item.color}`} />
                </div>
                <div>
                  <p className={`font-bold text-lg ${item.color}`}>{item.value}</p>
                  <p className="text-xs font-semibold text-white">{item.title}</p>
                  <p className="text-xs text-gray-500">{item.desc}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Claims History */}
        <div>
          <h2 className="text-xl font-bold text-white mb-4">My Claims</h2>
          <Card className="bg-gray-900 border-gray-800">
            <CardContent className="py-4">
              {claimsLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="animate-pulse flex justify-between items-center py-2">
                      <div className="h-4 bg-gray-800 rounded w-40" />
                      <div className="h-4 bg-gray-800 rounded w-20" />
                    </div>
                  ))}
                </div>
              ) : claims && claims.length > 0 ? (
                <div className="space-y-3">
                  {claims.map(claim => (
                    <div key={claim.id} className="flex items-center justify-between py-3 border-b border-gray-800/60 last:border-0">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center shrink-0">
                          <Shirt className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-white">{claim.productName}</p>
                          <p className="text-xs text-gray-500 font-mono">{claim.claimCode}</p>
                          <p className="text-xs text-gray-600">{formatDistanceToNow(new Date(claim.submittedAt), { addSuffix: true })}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-amber-400 font-bold text-sm">+{claim.rewardAmount} VEDD</span>
                        <Badge className={`flex items-center gap-1 text-xs border ${getStatusColor(claim.status)}`}>
                          {getStatusIcon(claim.status)}
                          {claim.status}
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center mx-auto mb-4">
                    <Shirt className="w-8 h-8 text-amber-400/50" />
                  </div>
                  <p className="text-gray-400 font-medium">No claims yet</p>
                  <p className="text-sm text-gray-600 mt-1">Buy VEDD clothing and scan your tag to get started</p>
                  <a
                    href="https://replit.com/@goddren/VeddVerse?s=app"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 mt-4 px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-sm font-bold transition-colors"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Shop VEDD Clothing
                    <ArrowRight className="w-3 h-3" />
                  </a>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Link to tokenomics */}
        <div className="flex items-center justify-between p-4 rounded-xl border border-gray-800 bg-gray-900/50">
          <div className="flex items-center gap-3">
            <Coins className="w-5 h-5 text-amber-400" />
            <div>
              <p className="text-sm font-semibold text-white">More ways to earn VEDD</p>
              <p className="text-xs text-gray-500">Trade, create EAs, refer friends, and more</p>
            </div>
          </div>
          <Link href="/vedd-tokenomics">
            <Button variant="outline" size="sm" className="border-gray-700 text-gray-300 hover:text-white">
              View All <ChevronRight className="w-3 h-3 ml-1" />
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
