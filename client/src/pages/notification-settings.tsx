import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import { 
  Bell, 
  BellOff, 
  BellRing, 
  Smartphone, 
  TrendingUp, 
  Newspaper, 
  AlertTriangle,
  CheckCircle2,
  Settings,
  Volume2,
  VolumeX,
  Clock,
  Shield,
  Zap,
  Download
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { 
  requestNotificationPermission, 
  registerServiceWorker, 
  isPWAInstalled,
  showPWAInstallPrompt,
  canInstallPWA
} from '@/lib/pwa';
import { triggerHaptic } from '@/hooks/use-gestures';

interface NotificationPreferences {
  enabled: boolean;
  priceAlerts: boolean;
  analysisComplete: boolean;
  tradeSignals: boolean;
  newsAlerts: boolean;
  dailyDigest: boolean;
  weeklyReport: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  quietHoursEnabled: boolean;
  quietHoursStart: number;
  quietHoursEnd: number;
}

const defaultPreferences: NotificationPreferences = {
  enabled: false,
  priceAlerts: true,
  analysisComplete: true,
  tradeSignals: true,
  newsAlerts: false,
  dailyDigest: false,
  weeklyReport: true,
  soundEnabled: true,
  vibrationEnabled: true,
  quietHoursEnabled: false,
  quietHoursStart: 22,
  quietHoursEnd: 7
};

export default function NotificationSettings() {
  const { toast } = useToast();
  const [preferences, setPreferences] = useState<NotificationPreferences>(defaultPreferences);
  const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>('default');
  const [isInstalled, setIsInstalled] = useState(false);
  const [canInstall, setCanInstall] = useState(false);

  useEffect(() => {
    if ('Notification' in window) {
      setPermissionStatus(Notification.permission);
    }
    setIsInstalled(isPWAInstalled());
    setCanInstall(canInstallPWA());
    
    const savedPrefs = localStorage.getItem('notification_preferences');
    if (savedPrefs) {
      try {
        setPreferences(JSON.parse(savedPrefs));
      } catch (e) {
        console.error('Failed to parse saved preferences');
      }
    }
  }, []);

  const savePreferences = (newPrefs: NotificationPreferences) => {
    setPreferences(newPrefs);
    localStorage.setItem('notification_preferences', JSON.stringify(newPrefs));
    triggerHaptic('light');
  };

  const handleEnableNotifications = async () => {
    try {
      const registration = await registerServiceWorker();
      if (!registration) {
        toast({
          title: 'Service Worker Error',
          description: 'Could not register service worker. Please try again.',
          variant: 'destructive'
        });
        return;
      }

      const permission = await requestNotificationPermission();
      setPermissionStatus(permission);

      if (permission === 'granted') {
        triggerHaptic('medium');
        savePreferences({ ...preferences, enabled: true });
        toast({
          title: 'Notifications Enabled',
          description: 'You will now receive trading alerts on this device.'
        });
      } else if (permission === 'denied') {
        toast({
          title: 'Notifications Blocked',
          description: 'Please enable notifications in your browser settings.',
          variant: 'destructive'
        });
      }
    } catch (error) {
      console.error('Failed to enable notifications:', error);
      toast({
        title: 'Error',
        description: 'Failed to enable notifications. Please try again.',
        variant: 'destructive'
      });
    }
  };

  const handleInstallPWA = async () => {
    const installed = await showPWAInstallPrompt();
    if (installed) {
      setIsInstalled(true);
      triggerHaptic('heavy');
      toast({
        title: 'App Installed!',
        description: 'VEDD AI has been added to your home screen.'
      });
    }
  };

  const handleTestNotification = async () => {
    if (permissionStatus !== 'granted') {
      toast({
        title: 'Enable Notifications First',
        description: 'You need to enable notifications before testing.',
        variant: 'destructive'
      });
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification('Test Notification', {
        body: 'This is a test notification from VEDD AI Trading Vault',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/icon-96x96.png',
        vibrate: preferences.vibrationEnabled ? [200, 100, 200] : undefined,
        tag: 'test-notification',
        data: { url: '/notification-settings' }
      });
      
      triggerHaptic('medium');
      toast({
        title: 'Test Sent',
        description: 'Check your notification panel!'
      });
    } catch (error) {
      console.error('Failed to send test notification:', error);
      toast({
        title: 'Error',
        description: 'Failed to send test notification.',
        variant: 'destructive'
      });
    }
  };

  const updatePreference = <K extends keyof NotificationPreferences>(
    key: K,
    value: NotificationPreferences[K]
  ) => {
    savePreferences({ ...preferences, [key]: value });
  };

  const formatHour = (hour: number) => {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 || 12;
    return `${displayHour}:00 ${period}`;
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-gray-950 py-8 px-4">
      <div className="container mx-auto max-w-2xl space-y-6">
        <div className="text-center mb-8">
          <Badge className="mb-4 bg-primary/20 text-primary border-primary/30">
            <Smartphone className="w-3 h-3 mr-1" />
            Mobile Settings
          </Badge>
          <h1 className="text-3xl font-bold mb-2" data-testid="text-page-title">
            Notification Settings
          </h1>
          <p className="text-muted-foreground">
            Customize how you receive trading alerts
          </p>
        </div>

        <Card className="bg-gray-900/50 border-gray-800" data-testid="card-notification-status">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {permissionStatus === 'granted' ? (
                <Bell className="w-5 h-5 text-green-500" />
              ) : (
                <BellOff className="w-5 h-5 text-yellow-500" />
              )}
              Notification Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium">Push Notifications</p>
                <p className="text-sm text-muted-foreground">
                  {permissionStatus === 'granted' 
                    ? 'Notifications are enabled'
                    : permissionStatus === 'denied'
                    ? 'Notifications are blocked - enable in browser settings'
                    : 'Enable to receive trading alerts'}
                </p>
              </div>
              <Badge 
                variant={permissionStatus === 'granted' ? 'default' : 'secondary'}
                data-testid="badge-permission-status"
              >
                {permissionStatus === 'granted' ? (
                  <><CheckCircle2 className="w-3 h-3 mr-1" /> Enabled</>
                ) : permissionStatus === 'denied' ? (
                  <><AlertTriangle className="w-3 h-3 mr-1" /> Blocked</>
                ) : (
                  'Not Set'
                )}
              </Badge>
            </div>

            {permissionStatus !== 'granted' && (
              <Button 
                onClick={handleEnableNotifications}
                className="w-full"
                data-testid="button-enable-notifications"
              >
                <BellRing className="w-4 h-4 mr-2" />
                Enable Push Notifications
              </Button>
            )}

            {permissionStatus === 'granted' && (
              <Button 
                onClick={handleTestNotification}
                variant="outline"
                className="w-full"
                data-testid="button-test-notification"
              >
                <Zap className="w-4 h-4 mr-2" />
                Send Test Notification
              </Button>
            )}
          </CardContent>
        </Card>

        {!isInstalled && canInstall && (
          <Card className="bg-gradient-to-r from-primary/20 to-purple-500/20 border-primary/30" data-testid="card-install-pwa">
            <CardContent className="pt-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-primary/30 flex items-center justify-center">
                  <Download className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold mb-1">Install VEDD AI App</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    Add to your home screen for the best experience with offline support and instant access.
                  </p>
                  <Button onClick={handleInstallPWA} size="sm" data-testid="button-install-pwa">
                    Install Now
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {isInstalled && (
          <Card className="border-green-500/30 bg-green-500/10" data-testid="card-pwa-installed">
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="w-5 h-5 text-green-500" />
                <div>
                  <p className="font-medium text-green-400">App Installed</p>
                  <p className="text-sm text-muted-foreground">You're using the VEDD AI mobile app</p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="bg-gray-900/50 border-gray-800" data-testid="card-notification-types">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              Notification Types
            </CardTitle>
            <CardDescription>
              Choose which alerts you want to receive
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between" data-testid="setting-price-alerts">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center">
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <div>
                  <Label className="font-medium">Price Alerts</Label>
                  <p className="text-sm text-muted-foreground">When your price targets are hit</p>
                </div>
              </div>
              <Switch
                checked={preferences.priceAlerts}
                onCheckedChange={(checked) => updatePreference('priceAlerts', checked)}
                disabled={permissionStatus !== 'granted'}
              />
            </div>

            <Separator className="bg-gray-800" />

            <div className="flex items-center justify-between" data-testid="setting-analysis-complete">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <Label className="font-medium">Analysis Complete</Label>
                  <p className="text-sm text-muted-foreground">When AI finishes analyzing your charts</p>
                </div>
              </div>
              <Switch
                checked={preferences.analysisComplete}
                onCheckedChange={(checked) => updatePreference('analysisComplete', checked)}
                disabled={permissionStatus !== 'granted'}
              />
            </div>

            <Separator className="bg-gray-800" />

            <div className="flex items-center justify-between" data-testid="setting-trade-signals">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-purple-500" />
                </div>
                <div>
                  <Label className="font-medium">Trade Signals</Label>
                  <p className="text-sm text-muted-foreground">Real-time trading opportunities</p>
                </div>
              </div>
              <Switch
                checked={preferences.tradeSignals}
                onCheckedChange={(checked) => updatePreference('tradeSignals', checked)}
                disabled={permissionStatus !== 'granted'}
              />
            </div>

            <Separator className="bg-gray-800" />

            <div className="flex items-center justify-between" data-testid="setting-news-alerts">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-yellow-500/20 flex items-center justify-center">
                  <Newspaper className="w-5 h-5 text-yellow-500" />
                </div>
                <div>
                  <Label className="font-medium">News Alerts</Label>
                  <p className="text-sm text-muted-foreground">High-impact market news</p>
                </div>
              </div>
              <Switch
                checked={preferences.newsAlerts}
                onCheckedChange={(checked) => updatePreference('newsAlerts', checked)}
                disabled={permissionStatus !== 'granted'}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800" data-testid="card-sound-vibration">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Volume2 className="w-5 h-5" />
              Sound & Vibration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between" data-testid="setting-sound">
              <div className="flex items-center gap-3">
                {preferences.soundEnabled ? (
                  <Volume2 className="w-5 h-5 text-primary" />
                ) : (
                  <VolumeX className="w-5 h-5 text-muted-foreground" />
                )}
                <div>
                  <Label className="font-medium">Sound</Label>
                  <p className="text-sm text-muted-foreground">Play sound for notifications</p>
                </div>
              </div>
              <Switch
                checked={preferences.soundEnabled}
                onCheckedChange={(checked) => updatePreference('soundEnabled', checked)}
              />
            </div>

            <Separator className="bg-gray-800" />

            <div className="flex items-center justify-between" data-testid="setting-vibration">
              <div className="flex items-center gap-3">
                <Smartphone className="w-5 h-5 text-primary" />
                <div>
                  <Label className="font-medium">Vibration</Label>
                  <p className="text-sm text-muted-foreground">Vibrate for notifications</p>
                </div>
              </div>
              <Switch
                checked={preferences.vibrationEnabled}
                onCheckedChange={(checked) => updatePreference('vibrationEnabled', checked)}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800" data-testid="card-quiet-hours">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Quiet Hours
            </CardTitle>
            <CardDescription>
              Mute notifications during specific hours
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <Label className="font-medium">Enable Quiet Hours</Label>
                <p className="text-sm text-muted-foreground">
                  {preferences.quietHoursEnabled 
                    ? `${formatHour(preferences.quietHoursStart)} - ${formatHour(preferences.quietHoursEnd)}`
                    : 'Notifications will always come through'}
                </p>
              </div>
              <Switch
                checked={preferences.quietHoursEnabled}
                onCheckedChange={(checked) => updatePreference('quietHoursEnabled', checked)}
              />
            </div>

            {preferences.quietHoursEnabled && (
              <>
                <Separator className="bg-gray-800" />
                
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm text-muted-foreground">Start Time: {formatHour(preferences.quietHoursStart)}</Label>
                    <Slider
                      value={[preferences.quietHoursStart]}
                      onValueChange={([value]) => updatePreference('quietHoursStart', value)}
                      min={0}
                      max={23}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                  <div>
                    <Label className="text-sm text-muted-foreground">End Time: {formatHour(preferences.quietHoursEnd)}</Label>
                    <Slider
                      value={[preferences.quietHoursEnd]}
                      onValueChange={([value]) => updatePreference('quietHoursEnd', value)}
                      min={0}
                      max={23}
                      step={1}
                      className="mt-2"
                    />
                  </div>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        <Card className="bg-gray-900/50 border-gray-800" data-testid="card-digests">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" />
              Digest & Reports
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between" data-testid="setting-daily-digest">
              <div>
                <Label className="font-medium">Daily Digest</Label>
                <p className="text-sm text-muted-foreground">Summary of your trading activity</p>
              </div>
              <Switch
                checked={preferences.dailyDigest}
                onCheckedChange={(checked) => updatePreference('dailyDigest', checked)}
              />
            </div>

            <Separator className="bg-gray-800" />

            <div className="flex items-center justify-between" data-testid="setting-weekly-report">
              <div>
                <Label className="font-medium">Weekly Report</Label>
                <p className="text-sm text-muted-foreground">Performance summary every Sunday</p>
              </div>
              <Switch
                checked={preferences.weeklyReport}
                onCheckedChange={(checked) => updatePreference('weeklyReport', checked)}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
