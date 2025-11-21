import { useState, useEffect } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { getNetworkStatus, watchNetworkStatus } from "@/lib/pwa";

export function NetworkStatus() {
  const [isOnline, setIsOnline] = useState(getNetworkStatus());
  const [showOffline, setShowOffline] = useState(false);

  useEffect(() => {
    const cleanup = watchNetworkStatus(
      () => {
        setIsOnline(true);
        setShowOffline(false);
      },
      () => {
        setIsOnline(false);
        setShowOffline(true);
      }
    );

    return cleanup;
  }, []);

  useEffect(() => {
    if (!isOnline && showOffline) {
      const timer = setTimeout(() => {
        setShowOffline(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [isOnline, showOffline]);

  if (!showOffline) {
    return null;
  }

  return (
    <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 w-full max-w-md px-4">
      <Alert
        className="border-yellow-500/50 bg-yellow-500/10 animate-in slide-in-from-top"
        data-testid="network-status-alert"
      >
        <WifiOff className="w-4 h-4 text-yellow-500" />
        <AlertDescription className="text-sm">
          You're offline. Some features may be limited. Changes will sync when you're back online.
        </AlertDescription>
      </Alert>
    </div>
  );
}
