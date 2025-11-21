import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Bell, BellOff, Plus, TrendingUp, TrendingDown, AlertCircle, Trash2, CheckCircle, Clock } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { isPWAInstalled, requestNotificationPermission, isMobileDevice } from "@/lib/pwa";
import type { PriceAlert } from "@shared/schema";

export default function MobileAlerts() {
  const { toast } = useToast();
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [formData, setFormData] = useState({
    symbol: "",
    alertType: "price_above",
    targetPrice: "",
    message: ""
  });

  const { data: alerts = [], isLoading } = useQuery<PriceAlert[]>({
    queryKey: ['/api/alerts']
  });

  const { data: recentAnalyses = [] } = useQuery({
    queryKey: ['/api/analyses/recent'],
    refetchInterval: 30000
  });

  useEffect(() => {
    if ('Notification' in window) {
      setNotificationsEnabled(Notification.permission === 'granted');
    }
  }, []);

  const createAlertMutation = useMutation({
    mutationFn: async (data: any) => {
      return apiRequest('/api/alerts', {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      setIsCreateDialogOpen(false);
      setFormData({ symbol: "", alertType: "price_above", targetPrice: "", message: "" });
      toast({
        title: "Alert Created",
        description: "Your price alert has been set successfully."
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to create alert. Please try again.",
        variant: "destructive"
      });
    }
  });

  const toggleAlertMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      return apiRequest(`/api/alerts/${id}/toggle`, {
        method: 'PATCH',
        body: JSON.stringify({ isActive })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
    }
  });

  const deleteAlertMutation = useMutation({
    mutationFn: async (id: number) => {
      return apiRequest(`/api/alerts/${id}`, {
        method: 'DELETE'
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/alerts'] });
      toast({
        title: "Alert Deleted",
        description: "The alert has been removed."
      });
    }
  });

  const handleEnableNotifications = async () => {
    const permission = await requestNotificationPermission();
    setNotificationsEnabled(permission === 'granted');
    
    if (permission === 'granted') {
      toast({
        title: "Notifications Enabled",
        description: "You'll receive real-time trading alerts."
      });
    } else {
      toast({
        title: "Notifications Blocked",
        description: "Please enable notifications in your browser settings.",
        variant: "destructive"
      });
    }
  };

  const handleCreateAlert = () => {
    if (!formData.symbol || !formData.targetPrice || !formData.message) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive"
      });
      return;
    }

    createAlertMutation.mutate(formData);
  };

  const activeAlerts = alerts.filter(a => a.isActive && !a.isTriggered);
  const triggeredAlerts = alerts.filter(a => a.isTriggered);
  const inactiveAlerts = alerts.filter(a => !a.isActive);

  const getAlertIcon = (type: string) => {
    switch (type) {
      case 'price_above': return <TrendingUp className="w-4 h-4" />;
      case 'price_below': return <TrendingDown className="w-4 h-4" />;
      case 'pattern_detected': return <AlertCircle className="w-4 h-4" />;
      default: return <Bell className="w-4 h-4" />;
    }
  };

  const getAlertTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      'price_above': 'Price Above',
      'price_below': 'Price Below',
      'pattern_detected': 'Pattern Alert',
      'trend_change': 'Trend Change'
    };
    return labels[type] || type;
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="container max-w-2xl mx-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold" data-testid="text-page-title">Trading Alerts</h1>
            <p className="text-muted-foreground" data-testid="text-page-subtitle">
              {isPWAInstalled() ? "📱 Mobile App Mode" : "Monitor your trades on the go"}
            </p>
          </div>
          <Button
            variant={notificationsEnabled ? "default" : "outline"}
            size="icon"
            onClick={handleEnableNotifications}
            data-testid="button-toggle-notifications"
          >
            {notificationsEnabled ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
          </Button>
        </div>

        {!notificationsEnabled && (
          <Card className="border-yellow-500/50 bg-yellow-500/10" data-testid="card-notification-prompt">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-yellow-500 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-sm">Enable Notifications</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Turn on notifications to receive real-time trading alerts and never miss an opportunity.
                  </p>
                  <Button
                    onClick={handleEnableNotifications}
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    data-testid="button-enable-notifications"
                  >
                    Enable Now
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card data-testid="card-quick-stats">
          <CardHeader>
            <CardTitle className="text-lg">Quick Stats</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary" data-testid="text-active-alerts-count">
                  {activeAlerts.length}
                </div>
                <div className="text-xs text-muted-foreground">Active</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500" data-testid="text-triggered-alerts-count">
                  {triggeredAlerts.length}
                </div>
                <div className="text-xs text-muted-foreground">Triggered</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-muted-foreground" data-testid="text-recent-analyses-count">
                  {recentAnalyses.length}
                </div>
                <div className="text-xs text-muted-foreground">Analyses</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button className="w-full" size="lg" data-testid="button-create-alert">
              <Plus className="w-5 h-5 mr-2" />
              Create New Alert
            </Button>
          </DialogTrigger>
          <DialogContent data-testid="dialog-create-alert">
            <DialogHeader>
              <DialogTitle>Create Price Alert</DialogTitle>
              <DialogDescription>
                Set up a custom alert for price movements or pattern detection.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="space-y-2">
                <Label htmlFor="symbol">Symbol</Label>
                <Input
                  id="symbol"
                  placeholder="e.g., EURUSD, BTCUSD"
                  value={formData.symbol}
                  onChange={(e) => setFormData({ ...formData, symbol: e.target.value.toUpperCase() })}
                  data-testid="input-alert-symbol"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="alertType">Alert Type</Label>
                <Select
                  value={formData.alertType}
                  onValueChange={(value) => setFormData({ ...formData, alertType: value })}
                >
                  <SelectTrigger id="alertType" data-testid="select-alert-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="price_above">Price Above</SelectItem>
                    <SelectItem value="price_below">Price Below</SelectItem>
                    <SelectItem value="pattern_detected">Pattern Detected</SelectItem>
                    <SelectItem value="trend_change">Trend Change</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {(formData.alertType === 'price_above' || formData.alertType === 'price_below') && (
                <div className="space-y-2">
                  <Label htmlFor="targetPrice">Target Price</Label>
                  <Input
                    id="targetPrice"
                    type="text"
                    placeholder="e.g., 1.0850"
                    value={formData.targetPrice}
                    onChange={(e) => setFormData({ ...formData, targetPrice: e.target.value })}
                    data-testid="input-target-price"
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="message">Alert Message</Label>
                <Input
                  id="message"
                  placeholder="e.g., EURUSD reached target price"
                  value={formData.message}
                  onChange={(e) => setFormData({ ...formData, message: e.target.value })}
                  data-testid="input-alert-message"
                />
              </div>
              <Button
                onClick={handleCreateAlert}
                className="w-full"
                disabled={createAlertMutation.isPending}
                data-testid="button-submit-alert"
              >
                {createAlertMutation.isPending ? "Creating..." : "Create Alert"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Tabs defaultValue="active" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="active" data-testid="tab-active-alerts">
              Active ({activeAlerts.length})
            </TabsTrigger>
            <TabsTrigger value="triggered" data-testid="tab-triggered-alerts">
              Triggered ({triggeredAlerts.length})
            </TabsTrigger>
            <TabsTrigger value="all" data-testid="tab-all-alerts">
              All ({alerts.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active" className="space-y-3 mt-4">
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading alerts...</div>
            ) : activeAlerts.length === 0 ? (
              <Card data-testid="card-no-active-alerts">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No active alerts</p>
                  <p className="text-sm mt-1">Create your first alert to get started</p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[500px]">
                {activeAlerts.map((alert) => (
                  <Card key={alert.id} className="mb-3" data-testid={`card-alert-${alert.id}`}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {getAlertIcon(alert.alertType)}
                            <span className="font-semibold" data-testid={`text-alert-symbol-${alert.id}`}>
                              {alert.symbol}
                            </span>
                            <Badge variant="outline" data-testid={`badge-alert-type-${alert.id}`}>
                              {getAlertTypeLabel(alert.alertType)}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2" data-testid={`text-alert-message-${alert.id}`}>
                            {alert.message}
                          </p>
                          {alert.targetPrice && (
                            <p className="text-sm font-mono" data-testid={`text-alert-price-${alert.id}`}>
                              Target: {alert.targetPrice}
                            </p>
                          )}
                          <p className="text-xs text-muted-foreground mt-2">
                            <Clock className="w-3 h-3 inline mr-1" />
                            Created {new Date(alert.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="flex flex-col gap-2">
                          <Switch
                            checked={alert.isActive}
                            onCheckedChange={(checked) => toggleAlertMutation.mutate({ id: alert.id, isActive: checked })}
                            data-testid={`switch-alert-active-${alert.id}`}
                          />
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteAlertMutation.mutate(alert.id)}
                            data-testid={`button-delete-alert-${alert.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="triggered" className="space-y-3 mt-4">
            {triggeredAlerts.length === 0 ? (
              <Card data-testid="card-no-triggered-alerts">
                <CardContent className="py-8 text-center text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No triggered alerts</p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[500px]">
                {triggeredAlerts.map((alert) => (
                  <Card key={alert.id} className="mb-3 border-green-500/50" data-testid={`card-triggered-alert-${alert.id}`}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <CheckCircle className="w-4 h-4 text-green-500" />
                            <span className="font-semibold">{alert.symbol}</span>
                            <Badge variant="outline" className="border-green-500 text-green-500">
                              Triggered
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground mb-2">{alert.message}</p>
                          {alert.triggeredAt && (
                            <p className="text-xs text-green-500">
                              Triggered {new Date(alert.triggeredAt).toLocaleString()}
                            </p>
                          )}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => deleteAlertMutation.mutate(alert.id)}
                          data-testid={`button-delete-triggered-${alert.id}`}
                        >
                          <Trash2 className="w-4 h-4 text-destructive" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </ScrollArea>
            )}
          </TabsContent>

          <TabsContent value="all" className="space-y-3 mt-4">
            {alerts.length === 0 ? (
              <Card>
                <CardContent className="py-8 text-center text-muted-foreground">
                  <Bell className="w-12 h-12 mx-auto mb-3 opacity-50" />
                  <p>No alerts created yet</p>
                </CardContent>
              </Card>
            ) : (
              <ScrollArea className="h-[500px]">
                {alerts.map((alert) => (
                  <Card key={alert.id} className="mb-3" data-testid={`card-all-alert-${alert.id}`}>
                    <CardContent className="pt-6">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {alert.isTriggered ? (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            ) : (
                              getAlertIcon(alert.alertType)
                            )}
                            <span className="font-semibold">{alert.symbol}</span>
                            <Badge variant={alert.isTriggered ? "default" : "outline"}>
                              {alert.isTriggered ? "Triggered" : alert.isActive ? "Active" : "Inactive"}
                            </Badge>
                          </div>
                          <p className="text-sm text-muted-foreground">{alert.message}</p>
                        </div>
                        <div className="flex flex-col gap-2">
                          {!alert.isTriggered && (
                            <Switch
                              checked={alert.isActive}
                              onCheckedChange={(checked) => toggleAlertMutation.mutate({ id: alert.id, isActive: checked })}
                              data-testid={`switch-all-alert-${alert.id}`}
                            />
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => deleteAlertMutation.mutate(alert.id)}
                            data-testid={`button-delete-all-${alert.id}`}
                          >
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </ScrollArea>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {isMobileDevice() && (
        <div className="fixed bottom-0 left-0 right-0 bg-background border-t">
          <div className="container max-w-2xl mx-auto p-3">
            <div className="flex justify-around">
              <Button variant="ghost" size="sm" data-testid="button-nav-alerts">
                <Bell className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" data-testid="button-nav-analysis">
                <TrendingUp className="w-5 h-5" />
              </Button>
              <Button variant="ghost" size="sm" data-testid="button-nav-settings">
                <AlertCircle className="w-5 h-5" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
