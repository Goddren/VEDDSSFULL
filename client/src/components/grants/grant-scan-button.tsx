import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, Search } from "lucide-react";

interface GrantScanButtonProps {
  onScanComplete: () => void;
  isAdmin?: boolean;
  grantTypes?: string[];
}

export function GrantScanButton({ onScanComplete, isAdmin, grantTypes }: GrantScanButtonProps) {
  const [scanning, setScanning] = useState(false);
  const { toast } = useToast();

  const handleScan = async () => {
    setScanning(true);
    toast({
      title: "Scanning for grants...",
      description: "AI is searching for relevant funding opportunities. This takes ~20 seconds.",
    });
    try {
      const res = await apiRequest("POST", "/api/grants/scan", {
        grantTypes: grantTypes || (isAdmin
          ? ['business_fintech','community_dev','ambassador_education','international','ai_focused']
          : ['ambassador_education','community_dev']),
      });
      const data = await res.json();
      onScanComplete();
      toast({
        title: `✅ Scan complete — ${data.grantsFound || 0} grants found`,
        description: `${data.grantsCreated || 0} new grants added to your list.`,
      });
    } catch (err: any) {
      toast({
        title: "Scan failed",
        description: err.message || "Failed to scan for grants. Check your AI API key is set.",
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  };

  return (
    <Button
      onClick={handleScan}
      disabled={scanning}
      className="bg-green-600 hover:bg-green-500 text-white gap-2"
      size="sm"
    >
      {scanning ? (
        <>
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          Scanning...
        </>
      ) : (
        <>
          <Search className="w-3.5 h-3.5" />
          {isAdmin ? "Full Grant Scan" : "Scan for Grants"}
        </>
      )}
    </Button>
  );
}
