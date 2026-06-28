import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Redirect } from "wouter";
import { insertUserSchema, loginUserSchema } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertTriangle } from "lucide-react";
import logoPath from "@assets/IMG_3645.png";

type LoginFormValues = z.infer<typeof loginUserSchema> & { acceptDisclaimer: boolean };
type RegisterFormValues = z.infer<typeof insertUserSchema>;

export default function AuthPage() {
  const [activeTab, setActiveTab] = useState<string>("login");
  const [referralCode, setReferralCode] = useState<string | null>(null);
  const { user, isLoading, loginMutation, registerMutation } = useAuth();

  // Capture referral code from URL and store in sessionStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    const stored = sessionStorage.getItem('referralCode');
    const code = ref || stored;
    if (code) {
      sessionStorage.setItem('referralCode', code);
      setReferralCode(code);
      // Switch to register tab automatically when a referral link is used
      if (ref) setActiveTab("register");
      // Track the visit server-side (only if it came from URL param)
      if (ref) {
        fetch('/api/referral/track', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ referralCode: code }),
        }).catch(() => {});
      }
    }
  }, []);
  
  // Apply dark mode from localStorage on component mount
  useEffect(() => {
    const savedTheme = localStorage.getItem('veddTheme');
    if (savedTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const loginFormSchema = loginUserSchema.extend({
    acceptDisclaimer: z.boolean().refine(val => val === true, {
      message: "You must accept the disclaimer to continue"
    })
  });
  
  const loginForm = useForm<LoginFormValues>({
    resolver: zodResolver(loginFormSchema),
    defaultValues: {
      username: "",
      password: "",
      acceptDisclaimer: false,
    },
  });

  type RegisterFormValuesWithConfirm = RegisterFormValues & { confirmPassword: string };
  
  const registerFormSchema = insertUserSchema.extend({
    confirmPassword: z.string(),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });
  
  const registerForm = useForm<RegisterFormValuesWithConfirm>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: "",
      password: "",
      email: "",
      fullName: "",
      profileImage: "",
      confirmPassword: "",
    },
  });

  const onLoginSubmit = (values: LoginFormValues) => {
    // Remove acceptDisclaimer from values before sending to server
    const { acceptDisclaimer, ...loginData } = values;
    loginMutation.mutate(loginData);
  };

  const onRegisterSubmit = (values: RegisterFormValues) => {
    // Remove confirmPassword which is not in the schema
    const { confirmPassword, ...registerData } = values as RegisterFormValues & { confirmPassword: string };
    // Attach referral code if present
    const dataWithRef = referralCode ? { ...registerData, referralCode } : registerData;
    registerMutation.mutate(dataWithRef as any, {
      onSuccess: () => { sessionStorage.removeItem('referralCode'); setReferralCode(null); }
    });
  };

  // Redirect if already logged in
  if (user) {
    return <Redirect to="/dashboard" />;
  }

  return (
    <div className="flex min-h-screen w-full bg-app">
      {/* Auth Form Section */}
      <div className="flex flex-col items-center justify-center w-full md:w-1/2 p-6 md:p-8">
        <div className="max-w-md w-full">
          <div className="mb-8 text-center">
            <img src={logoPath} alt="Vedd Logo" className="h-12 mx-auto mb-4" />
            <h2 className="text-3xl font-black text-grad-red">Welcome to VEDD</h2>
            <p className="text-gray-500 text-sm mt-1">Your AI-powered trading intelligence platform</p>
          </div>

          <Tabs defaultValue="login" value={activeTab} onValueChange={setActiveTab} className="w-full">
            {/* Pill-style tab selector */}
            <TabsList className="grid w-full grid-cols-2 mb-6 p-1 rounded-2xl" style={{ background: '#0D1117', border: '1px solid rgba(255,255,255,0.07)' }}>
              <TabsTrigger
                value="login"
                className="rounded-xl text-sm font-semibold data-[state=active]:bg-red-500 data-[state=active]:text-white data-[state=inactive]:text-gray-500 transition-all"
              >
                Log In
              </TabsTrigger>
              <TabsTrigger
                value="register"
                className="rounded-xl text-sm font-semibold data-[state=active]:bg-red-500 data-[state=active]:text-white data-[state=inactive]:text-gray-500 transition-all"
              >
                Register
              </TabsTrigger>
            </TabsList>

            <TabsContent value="login">
              <div className="smart-card p-6 space-y-5">
                <div>
                  <h3 className="text-white font-bold text-lg">Log In</h3>
                  <p className="text-gray-500 text-xs mt-0.5">Enter your credentials to access your account</p>
                </div>
                <Form {...loginForm}>
                  <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4">
                    <FormField
                      control={loginForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your username"
                              className="bg-[#161D2E] border-white/10 rounded-xl h-11 text-white placeholder:text-gray-600"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={loginForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Enter your password"
                              className="bg-[#161D2E] border-white/10 rounded-xl h-11 text-white placeholder:text-gray-600"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />

                    {/* Trading Disclaimer */}
                    <FormField
                      control={loginForm.control}
                      name="acceptDisclaimer"
                      render={({ field }) => (
                        <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-2xl p-4" style={{ background: '#161D2E', border: '1px solid rgba(255,255,255,0.07)' }}>
                          <FormControl>
                            <Checkbox
                              checked={field.value}
                              onCheckedChange={(checked) => field.onChange(checked === true)}
                              data-testid="checkbox-disclaimer"
                            />
                          </FormControl>
                          <div className="space-y-1 leading-none">
                            <FormLabel className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                                Trading Risk Acknowledgment
                              </div>
                            </FormLabel>
                            <p className="text-xs text-gray-500">
                              I acknowledge that trading involves substantial risk of loss and is not suitable for all investors.
                              All trading signals, analysis, and recommendations provided by AI Trading Vault are for educational purposes only
                              and should not be considered as financial advice. Past performance does not guarantee future results.
                              Market conditions may not follow predicted patterns, and I understand that I trade at my own risk
                              and discretion.
                            </p>
                            <FormMessage />
                          </div>
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full h-12 rounded-2xl font-semibold bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white border-0"
                      disabled={loginMutation.isPending}
                    >
                      {loginMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Log In
                    </Button>
                  </form>
                </Form>
                <div className="flex items-center justify-between">
                  <button onClick={() => setActiveTab("register")} className="text-sm text-gray-500 hover:text-red-400 transition-colors">
                    Don't have an account? <span className="text-red-400 font-semibold">Register</span>
                  </button>
                  <a href="/forgot-password" className="text-sm text-gray-500 hover:text-red-400 transition-colors">
                    Forgot password?
                  </a>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="register">
              {referralCode && (
                <div className="mb-3 p-3 rounded-2xl flex items-center gap-2 text-sm" style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  <span className="text-amber-400">🎁</span>
                  <span className="text-amber-300 font-medium">Referral link active!</span>
                  <span className="text-gray-500 text-xs">You and your referrer both earn credits when you join.</span>
                </div>
              )}
              <div className="smart-card p-6 space-y-5">
                <div>
                  <h3 className="text-white font-bold text-lg">Create an Account</h3>
                  <p className="text-gray-500 text-xs mt-0.5">Enter your details to create a new account</p>
                </div>
                <Form {...registerForm}>
                  <form onSubmit={registerForm.handleSubmit(onRegisterSubmit)} className="space-y-4">
                    <FormField
                      control={registerForm.control}
                      name="username"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Username</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Choose a username"
                              className="bg-[#161D2E] border-white/10 rounded-xl h-11 text-white placeholder:text-gray-600"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="email"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Email</FormLabel>
                          <FormControl>
                            <Input
                              type="email"
                              placeholder="Enter your email"
                              className="bg-[#161D2E] border-white/10 rounded-xl h-11 text-white placeholder:text-gray-600"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="fullName"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Full Name</FormLabel>
                          <FormControl>
                            <Input
                              placeholder="Enter your full name"
                              className="bg-[#161D2E] border-white/10 rounded-xl h-11 text-white placeholder:text-gray-600"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="password"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Choose a password"
                              className="bg-[#161D2E] border-white/10 rounded-xl h-11 text-white placeholder:text-gray-600"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={registerForm.control}
                      name="confirmPassword"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel className="text-xs text-gray-400 font-semibold uppercase tracking-wide">Confirm Password</FormLabel>
                          <FormControl>
                            <Input
                              type="password"
                              placeholder="Confirm your password"
                              className="bg-[#161D2E] border-white/10 rounded-xl h-11 text-white placeholder:text-gray-600"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="submit"
                      className="w-full h-12 rounded-2xl font-semibold bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white border-0"
                      disabled={registerMutation.isPending}
                    >
                      {registerMutation.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Create Account
                    </Button>
                  </form>
                </Form>
                <div className="text-center">
                  <button onClick={() => setActiveTab("login")} className="text-sm text-gray-500 hover:text-red-400 transition-colors">
                    Already have an account? <span className="text-red-400 font-semibold">Log in</span>
                  </button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {/* Hero Section */}
      <div className="hidden md:flex md:w-1/2" style={{ background: 'linear-gradient(135deg, #0F1628 0%, #080B14 100%)', borderLeft: '1px solid rgba(255,255,255,0.05)' }}>
        <div className="flex flex-col justify-center px-12 py-12">
          <div className="mb-8">
            <span className="status-online status-pill mb-4 inline-flex">
              <span className="live-pulse" />
              AI Engine Active
            </span>
            <h1 className="text-4xl font-black text-white mt-3 mb-2 leading-tight">Advanced Chart<br /><span className="text-grad-red">Analysis with AI</span></h1>
            <p className="text-gray-500 text-sm">Professional-grade trading intelligence at your fingertips.</p>
          </div>
          <ul className="space-y-4">
            {[
              { title: 'Smart Chart Analysis', desc: 'Upload screenshots from MT5, TradingView, or TradeLocker to get instant analysis' },
              { title: 'Actionable Trading Signals', desc: 'Get buy/sell signals, stop loss, and take profit recommendations' },
              { title: 'Pattern Recognition', desc: 'Identify chart patterns and technical indicators automatically' },
              { title: 'Historical Analysis', desc: 'Track your chart analysis history and improve your trading' },
            ].map((item) => (
              <li key={item.title} className="flex items-start gap-3">
                <div className="icon-box-sm icon-box-red mt-0.5 shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </div>
                <div>
                  <h3 className="font-semibold text-white text-sm">{item.title}</h3>
                  <p className="text-gray-500 text-xs mt-0.5">{item.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}