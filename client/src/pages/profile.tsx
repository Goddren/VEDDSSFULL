import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useAuth } from "@/hooks/use-auth";
import { ApiKeySettings } from "@/components/ui/api-key-settings";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { 
  Loader2, 
  User, 
  Key, 
  Shield, 
  ChevronLeft, 
  CreditCard, 
  Plus, 
  Trash2,
  AlertCircle,
  Camera,
  ImagePlus
} from "lucide-react";
import { updateUserProfileSchema } from "@shared/schema";
import { useLocation, useParams } from "wouter";
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { 
  Dialog, 
  DialogContent, 
  DialogDescription, 
  DialogFooter, 
  DialogHeader, 
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

// Form for profile information
const profileFormSchema = updateUserProfileSchema;
type ProfileFormValues = z.infer<typeof profileFormSchema>;

// Form for password change
const passwordFormSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  newPassword: z.string().min(6, "Password must be at least 6 characters"),
  confirmPassword: z.string().min(1, "Please confirm your password"),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: "Passwords do not match",
  path: ["confirmPassword"],
});
type PasswordFormValues = z.infer<typeof passwordFormSchema>;

// Payment method type
type PaymentMethod = {
  id: string;
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
};

export default function ProfilePage() {
  const { user, updateProfileMutation, changePasswordMutation } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const [location, setLocation] = useLocation();
  const { toast } = useToast();
  const [showAddCardDialog, setShowAddCardDialog] = useState(false);
  const [isAddingCard, setIsAddingCard] = useState(false);
  const [isRemovingCard, setIsRemovingCard] = useState(false);
  const [cardToRemove, setCardToRemove] = useState<string | null>(null);
  const params = useParams();
  const viewingUserId = params.userId ? parseInt(params.userId, 10) : undefined;
  const isViewingOwnProfile = !viewingUserId || (user && viewingUserId === user.id);
  
  // If viewing another user's profile, fetch their data
  const { data: profileUser, isLoading: isLoadingProfileUser } = useQuery({
    queryKey: viewingUserId ? [`/api/profile/${viewingUserId}`] : ['no-query'],
    enabled: !!viewingUserId && viewingUserId !== user?.id,
  });
  
  // Fetch payment methods
  const { 
    data: paymentMethods, 
    isLoading: isLoadingPaymentMethods,
    refetch: refetchPaymentMethods
  } = useQuery<PaymentMethod[]>({
    queryKey: ['/api/payment-methods'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/payment-methods');
      return res.json();
    },
    enabled: isViewingOwnProfile ? !!user : false,
  });

  // Subscription info
  const { 
    data: subscription,
    isLoading: isLoadingSubscription
  } = useQuery({
    queryKey: ['/api/subscription'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/subscription');
      return res.json();
    },
    enabled: isViewingOwnProfile ? !!user : false,
  });
  
  // Add payment method mutation
  const addPaymentMethodMutation = useMutation({
    mutationFn: async (formData: { cardNumber: string; expMonth: string; expYear: string; cvc: string }) => {
      const res = await apiRequest('POST', '/api/payment-methods', formData);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Payment Method Added",
        description: "Your payment method has been added successfully.",
        variant: "default",
      });
      setShowAddCardDialog(false);
      refetchPaymentMethods();
    },
    onError: (error) => {
      toast({
        title: "Error Adding Payment Method",
        description: error instanceof Error ? error.message : "Failed to add payment method. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Remove payment method mutation
  const removePaymentMethodMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const res = await apiRequest('DELETE', `/api/payment-methods/${paymentMethodId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Payment Method Removed",
        description: "Your payment method has been removed successfully.",
        variant: "default",
      });
      setCardToRemove(null);
      refetchPaymentMethods();
    },
    onError: (error) => {
      toast({
        title: "Error Removing Payment Method",
        description: error instanceof Error ? error.message : "Failed to remove payment method. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Set default payment method mutation
  const setDefaultPaymentMethodMutation = useMutation({
    mutationFn: async (paymentMethodId: string) => {
      const res = await apiRequest('PUT', `/api/payment-methods/${paymentMethodId}/default`);
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Default Payment Method Updated",
        description: "Your default payment method has been updated successfully.",
        variant: "default",
      });
      refetchPaymentMethods();
    },
    onError: (error) => {
      toast({
        title: "Error Updating Default Payment Method",
        description: error instanceof Error ? error.message : "Failed to update default payment method. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Add card form handlers
  const handleAddCard = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    setIsAddingCard(true);
    
    try {
      addPaymentMethodMutation.mutate({
        cardNumber: formData.get('cardNumber') as string,
        expMonth: formData.get('expMonth') as string,
        expYear: formData.get('expYear') as string,
        cvc: formData.get('cvc') as string,
      });
    } catch (error) {
      console.error('Error adding card:', error);
    } finally {
      setIsAddingCard(false);
    }
  };
  
  // Remove card handler
  const handleRemoveCard = (id: string) => {
    setCardToRemove(id);
  };
  
  const confirmRemoveCard = async () => {
    if (!cardToRemove) return;
    
    setIsRemovingCard(true);
    try {
      await removePaymentMethodMutation.mutateAsync(cardToRemove);
    } catch (error) {
      console.error('Error removing card:', error);
    } finally {
      setIsRemovingCard(false);
    }
  };
  
  // Set default payment method handler
  const handleSetDefaultPaymentMethod = async (id: string) => {
    try {
      await setDefaultPaymentMethodMutation.mutateAsync(id);
    } catch (error) {
      console.error('Error setting default payment method:', error);
    }
  };
  
  // Determine which user data to display
  const displayUser = viewingUserId && profileUser ? profileUser : user;
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  
  // Profile form setup
  const profileForm = useForm<ProfileFormValues>({
    resolver: zodResolver(profileFormSchema),
    defaultValues: {
      email: user?.email || "",
      fullName: user?.fullName || "",
      bio: (user as any)?.bio || "",
    },
  });

  // Password form setup
  const passwordForm = useForm<PasswordFormValues>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  // Avatar upload handler
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast({
        title: "Invalid file type",
        description: "Please upload an image file (JPG, PNG, GIF)",
        variant: "destructive",
      });
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB",
        variant: "destructive",
      });
      return;
    }

    setIsUploadingAvatar(true);
    
    try {
      const formData = new FormData();
      formData.append('avatar', file);

      const response = await fetch('/api/upload-avatar', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to upload avatar');
      }

      const result = await response.json();
      setAvatarPreview(result.avatarUrl);
      
      updateProfileMutation.mutate({ avatarUrl: result.avatarUrl });
      
      toast({
        title: "Avatar updated",
        description: "Your profile picture has been updated successfully.",
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: "Failed to upload avatar. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  // Form submission handlers
  const onProfileSubmit = (data: ProfileFormValues) => {
    updateProfileMutation.mutate(data);
  };

  const onPasswordSubmit = (data: PasswordFormValues) => {
    changePasswordMutation.mutate({
      currentPassword: data.currentPassword,
      newPassword: data.newPassword,
    });
    passwordForm.reset();
  };

  // Get user initials for avatar fallback
  const getUserInitials = () => {
    if (!user) return "U";
    if (user.fullName) {
      return user.fullName
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .substring(0, 2);
    }
    return user.username.substring(0, 2).toUpperCase();
  };

  return (
    <div className="container py-10 max-w-5xl">
      <div className="flex flex-col md:flex-row gap-8">
        {/* Profile Header */}
        <div className="md:w-1/3">
          <div className="flex flex-col items-center text-center mb-6">
            <div className="relative group">
              <Avatar className="h-28 w-28 mb-4 ring-4 ring-primary/20">
                <AvatarImage 
                  src={avatarPreview || (user as any)?.avatarUrl || user?.profileImage || ""} 
                  alt={user?.username} 
                />
                <AvatarFallback className="text-2xl bg-primary/10">{getUserInitials()}</AvatarFallback>
              </Avatar>
              {isViewingOwnProfile && (
                <>
                  <input 
                    type="file" 
                    ref={fileInputRef}
                    onChange={handleAvatarUpload}
                    accept="image/*"
                    className="hidden"
                    data-testid="input-avatar-upload"
                  />
                  <Button
                    size="icon"
                    variant="secondary"
                    className="absolute bottom-3 right-0 h-8 w-8 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingAvatar}
                    data-testid="button-change-avatar"
                  >
                    {isUploadingAvatar ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Camera className="h-4 w-4" />
                    )}
                  </Button>
                </>
              )}
            </div>
            <h1 className="text-2xl font-bold">{user?.fullName || user?.username}</h1>
            <p className="text-muted-foreground">{user?.email}</p>
            {(user as any)?.bio && (
              <p className="text-sm text-muted-foreground mt-2 max-w-xs" data-testid="text-user-bio">
                {(user as any).bio}
              </p>
            )}
          </div>
        </div>

        {/* Profile Content */}
        <div className="md:w-2/3">
          <Tabs defaultValue="profile" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid grid-cols-4 mb-8">
              <TabsTrigger value="profile" className="flex items-center justify-center gap-2">
                <User className="h-4 w-4" />
                <span>Profile</span>
              </TabsTrigger>
              <TabsTrigger value="payment" className="flex items-center justify-center gap-2">
                <CreditCard className="h-4 w-4" />
                <span>Payment</span>
              </TabsTrigger>
              <TabsTrigger value="security" className="flex items-center justify-center gap-2">
                <Shield className="h-4 w-4" />
                <span>Security</span>
              </TabsTrigger>
              <TabsTrigger value="api" className="flex items-center justify-center gap-2">
                <Key className="h-4 w-4" />
                <span>API Settings</span>
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="profile" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Personal Information</CardTitle>
                  <CardDescription>
                    Update your personal information and contact details
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...profileForm}>
                    <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-6">
                      <FormField
                        control={profileForm.control}
                        name="fullName"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Full Name</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter your full name" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={profileForm.control}
                        name="email"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Email</FormLabel>
                            <FormControl>
                              <Input placeholder="Enter your email" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={profileForm.control}
                        name="bio"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Biography</FormLabel>
                            <FormControl>
                              <Textarea 
                                placeholder="Tell us about yourself and your trading experience..."
                                className="resize-none min-h-[120px]"
                                {...field}
                                data-testid="input-bio"
                              />
                            </FormControl>
                            <FormDescription>
                              Share your trading background, strategies, or interests. Max 500 characters.
                            </FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" disabled={updateProfileMutation.isPending}>
                        {updateProfileMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save Changes
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Account Information</CardTitle>
                  <CardDescription>
                    Your account details and membership information
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <dl className="space-y-4">
                    <div className="flex flex-col sm:flex-row sm:gap-1">
                      <dt className="font-medium text-muted-foreground min-w-40">Username:</dt>
                      <dd>{user?.username}</dd>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:gap-1">
                      <dt className="font-medium text-muted-foreground min-w-40">Member Since:</dt>
                      <dd>{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "N/A"}</dd>
                    </div>
                  </dl>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="security" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Change Password</CardTitle>
                  <CardDescription>
                    Update your password to keep your account secure
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Form {...passwordForm}>
                    <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-6">
                      <FormField
                        control={passwordForm.control}
                        name="currentPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Current Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Enter your current password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={passwordForm.control}
                        name="newPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>New Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Enter your new password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <FormField
                        control={passwordForm.control}
                        name="confirmPassword"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Confirm New Password</FormLabel>
                            <FormControl>
                              <Input type="password" placeholder="Confirm your new password" {...field} />
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                      <Button type="submit" disabled={changePasswordMutation.isPending}>
                        {changePasswordMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Update Password
                      </Button>
                    </form>
                  </Form>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Account Security</CardTitle>
                  <CardDescription>
                    Additional security settings for your account
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Two-Factor Authentication</p>
                        <p className="text-muted-foreground text-sm">
                          Add an extra layer of security to your account
                        </p>
                      </div>
                      <Button variant="outline" disabled>Coming Soon</Button>
                    </div>
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Session Management</p>
                        <p className="text-muted-foreground text-sm">
                          Manage your active sessions and devices
                        </p>
                      </div>
                      <Button variant="outline" disabled>Coming Soon</Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="payment" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>Subscription</CardTitle>
                  <CardDescription>
                    Your current subscription plan and payment options
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {isLoadingSubscription ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : subscription ? (
                    <div className="space-y-6">
                      <div className="flex items-center justify-between">
                        <div>
                          <h3 className="text-lg font-medium">Current Plan</h3>
                          <p className="text-muted-foreground">
                            {subscription.planName} - {subscription.status === 'active' ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                        <Badge variant={subscription.planName === 'Expert' ? 'default' : 'outline'}>
                          {subscription.planName}
                        </Badge>
                      </div>
                      
                      {subscription.planName !== 'Expert' && (
                        <div className="flex justify-end">
                          <Button
                            variant="default"
                            onClick={() => setLocation('/subscription')}
                          >
                            Upgrade Plan
                          </Button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>
                        Unable to load subscription information. Please try again.
                      </AlertDescription>
                    </Alert>
                  )}
                </CardContent>
              </Card>
              
              <Card>
                <CardHeader>
                  <div className="flex justify-between items-center">
                    <div>
                      <CardTitle>Payment Methods</CardTitle>
                      <CardDescription>
                        Manage your payment methods for subscription billing
                      </CardDescription>
                    </div>
                    <Dialog open={showAddCardDialog} onOpenChange={setShowAddCardDialog}>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm" className="gap-1">
                          <Plus className="h-4 w-4" /> Add Method
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Add Payment Method</DialogTitle>
                          <DialogDescription>
                            Add a new credit or debit card for your subscription payments.
                          </DialogDescription>
                        </DialogHeader>
                        
                        <form onSubmit={handleAddCard} className="space-y-4">
                          <div className="grid gap-4 py-2">
                            <div className="space-y-2">
                              <label htmlFor="cardNumber" className="text-sm font-medium">
                                Card Number
                              </label>
                              <Input
                                id="cardNumber"
                                name="cardNumber"
                                placeholder="4242 4242 4242 4242"
                                required
                              />
                            </div>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="space-y-2">
                                <label htmlFor="expMonth" className="text-sm font-medium">
                                  Exp. Month
                                </label>
                                <Input
                                  id="expMonth"
                                  name="expMonth"
                                  placeholder="MM"
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <label htmlFor="expYear" className="text-sm font-medium">
                                  Exp. Year
                                </label>
                                <Input
                                  id="expYear"
                                  name="expYear"
                                  placeholder="YYYY"
                                  required
                                />
                              </div>
                              <div className="space-y-2">
                                <label htmlFor="cvc" className="text-sm font-medium">
                                  CVC
                                </label>
                                <Input
                                  id="cvc"
                                  name="cvc"
                                  placeholder="123"
                                  required
                                />
                              </div>
                            </div>
                          </div>
                          
                          <DialogFooter>
                            <Button
                              type="button"
                              variant="outline"
                              onClick={() => setShowAddCardDialog(false)}
                            >
                              Cancel
                            </Button>
                            <Button type="submit" disabled={isAddingCard}>
                              {isAddingCard && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                              Add Card
                            </Button>
                          </DialogFooter>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoadingPaymentMethods ? (
                    <div className="flex items-center justify-center py-6">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : paymentMethods && paymentMethods.length > 0 ? (
                    <div className="space-y-4">
                      {paymentMethods.map((method) => (
                        <div
                          key={method.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-lg border"
                        >
                          <div className="flex items-center gap-3 mb-2 sm:mb-0">
                            <div className="flex-shrink-0">
                              {method.brand === 'visa' && (
                                <div className="bg-blue-100 h-10 w-16 flex items-center justify-center rounded">
                                  <span className="text-blue-800 font-bold text-lg">VISA</span>
                                </div>
                              )}
                              {method.brand === 'mastercard' && (
                                <div className="bg-red-100 h-10 w-16 flex items-center justify-center rounded">
                                  <span className="text-red-800 font-bold text-sm">MASTERCARD</span>
                                </div>
                              )}
                              {method.brand === 'amex' && (
                                <div className="bg-indigo-100 h-10 w-16 flex items-center justify-center rounded">
                                  <span className="text-indigo-800 font-bold text-sm">AMEX</span>
                                </div>
                              )}
                              {method.brand === 'discover' && (
                                <div className="bg-orange-100 h-10 w-16 flex items-center justify-center rounded">
                                  <span className="text-orange-800 font-bold text-sm">DISCOVER</span>
                                </div>
                              )}
                              {!['visa', 'mastercard', 'amex', 'discover'].includes(method.brand) && (
                                <div className="bg-gray-100 h-10 w-16 flex items-center justify-center rounded">
                                  <CreditCard className="h-6 w-6 text-gray-800" />
                                </div>
                              )}
                            </div>
                            <div>
                              <p className="font-medium">
                                {method.brand.charAt(0).toUpperCase() + method.brand.slice(1)} ending in {method.last4}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                Expires {method.expMonth}/{method.expYear}
                                {method.isDefault && <span className="ml-2 text-primary font-medium">Default</span>}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
                            {!method.isDefault && (
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleSetDefaultPaymentMethod(method.id)}
                              >
                                Set Default
                              </Button>
                            )}
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-500 hover:text-red-700 hover:bg-red-100"
                              onClick={() => handleRemoveCard(method.id)}
                            >
                              <Trash2 className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6">
                      <p className="text-muted-foreground mb-4">No payment methods added yet.</p>
                      <Button
                        variant="outline"
                        onClick={() => setShowAddCardDialog(true)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Payment Method
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
              
              {/* Confirmation dialog for removing payment method */}
              <Dialog open={!!cardToRemove} onOpenChange={(open) => !open && setCardToRemove(null)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Remove Payment Method</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to remove this payment method? This action cannot be undone.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex justify-end gap-3 mt-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setCardToRemove(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={confirmRemoveCard}
                      disabled={isRemovingCard}
                    >
                      {isRemovingCard && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Remove
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </TabsContent>

            <TabsContent value="api" className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>OpenAI API Settings</CardTitle>
                  <CardDescription>
                    Manage your OpenAI API key for chart analysis functionality
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ApiKeySettings className="max-w-none" />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}