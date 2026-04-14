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
    try {
      await apiRequest("POST", "/api/grants/scan", {
        grantTypes: grantTypes || (isAdmin
          ? ['business_fintech','community_dev','ambassador_education','international','ai_focused']
          : ['ambassador_education','community_dev']),
      });
      toast({
        title: "Grant scan started",
        description: "AI is scanning for relevant grants. Results will appear in ~30 seconds.",
      });
      // Poll for completion
      setTimeout(() => {
        setScanning(false);
        onScanComplete();
        toast({
          title: "Grants updated",
          description: "New grant opportunities have been loaded.",
        });
      }, 30000);
    } catch (err: any) {
      setScanning(false);
      toast({
        title: "Scan failed",
        description: err.message || "Failed to start grant scan",
        variant: "destructive",
      });
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
