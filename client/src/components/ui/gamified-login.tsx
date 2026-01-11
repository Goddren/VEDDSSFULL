import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { insertUserSchema, loginUserSchema } from "@shared/schema";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertTriangle, Lock, Unlock, Sparkles, Shield, Eye, EyeOff, ChevronUp, X, Wallet, Coins, Award } from "lucide-react";
import { WalletLoginButton } from "@/components/wallet/wallet-login-button";
import logoPath from "@assets/IMG_3645.png";

type LoginFormValues = z.infer<typeof loginUserSchema> & { acceptDisclaimer: boolean };
type RegisterFormValues = z.infer<typeof insertUserSchema> & { confirmPassword: string };

interface GamifiedLoginProps {
  isOpen: boolean;
  onClose: () => void;
}

export function GamifiedLogin({ isOpen, onClose }: GamifiedLoginProps) {
  const [activeTab, setActiveTab] = useState<"login" | "register" | "wallet">("login");
  const [showPassword, setShowPassword] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [, navigate] = useLocation();
  const { loginMutation, registerMutation } = useAuth();

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

  const registerFormSchema = insertUserSchema.extend({
    confirmPassword: z.string(),
    password: z.string().min(6, "Password must be at least 6 characters"),
  }).refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

  const registerForm = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: {
      username: "",
      password: "",
      email: "",
      fullName: "",
      confirmPassword: "",
    },
  });

  const onLoginSubmit = (values: LoginFormValues) => {
    setIsUnlocking(true);
    const { acceptDisclaimer, ...loginData } = values;
    loginMutation.mutate(loginData, {
      onSuccess: () => {
        setShowCelebration(true);
        setTimeout(() => {
          onClose();
          navigate("/dashboard");
        }, 2500);
      },
      onError: () => setIsUnlocking(false)
    });
  };

  const onRegisterSubmit = (values: RegisterFormValues) => {
    setIsUnlocking(true);
    const { confirmPassword, ...registerData } = values;
    registerMutation.mutate(registerData, {
      onSuccess: () => {
        setShowCelebration(true);
        setTimeout(() => {
          onClose();
          navigate("/dashboard");
        }, 2500);
      },
      onError: () => setIsUnlocking(false)
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50"
            onClick={!showCelebration ? onClose : undefined}
          />

          {showCelebration ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2 }}
              className="fixed inset-0 z-50 flex items-center justify-center"
            >
              <div className="relative flex flex-col items-center">
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: "spring", duration: 0.8 }}
                  className="relative"
                >
                  <div className="absolute inset-0 bg-green-500/40 rounded-full blur-3xl animate-pulse" />
                  <div className="absolute inset-0 bg-amber-500/30 rounded-full blur-2xl animate-ping" />
                  <div className="relative p-8 rounded-full bg-gradient-to-br from-green-600 to-green-700 border-4 border-green-400 shadow-2xl shadow-green-500/50">
                    <motion.div
                      animate={{ rotate: [0, -15, 15, -10, 10, 0] }}
                      transition={{ duration: 0.6, delay: 0.3 }}
                    >
                      <Unlock className="h-16 w-16 text-white" />
                    </motion.div>
                  </div>
                </motion.div>

                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                  className="mt-8 text-3xl font-bold text-white text-center"
                >
                  Vault Unlocked!
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6 }}
                  className="mt-2 text-green-400 text-lg"
                >
                  Welcome to AI Trading Vault
                </motion.p>
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.8 }}
                  className="mt-4 flex items-center gap-2 text-amber-400"
                >
                  <Sparkles className="h-5 w-5" />
                  <span>Preparing your dashboard...</span>
                  <Sparkles className="h-5 w-5" />
                </motion.div>

                {[...Array(12)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, scale: 0 }}
                    animate={{ 
                      opacity: [0, 1, 0],
                      scale: [0, 1, 0.5],
                      x: Math.cos(i * 30 * Math.PI / 180) * 150,
                      y: Math.sin(i * 30 * Math.PI / 180) * 150,
                    }}
                    transition={{ duration: 1.5, delay: 0.2 + i * 0.05 }}
                    className="absolute w-3 h-3 bg-amber-400 rounded-full"
                  />
                ))}
              </div>
            </motion.div>
          ) : (
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed inset-x-0 bottom-0 z-50 max-h-[95vh] overflow-hidden"
          >
            <div className="relative bg-gradient-to-b from-gray-900 via-gray-900 to-black rounded-t-3xl border-t-2 border-red-500/50 shadow-2xl shadow-red-500/20">
              <div className="absolute inset-0 overflow-hidden pointer-events-none">
                <div className="absolute top-0 left-1/4 w-64 h-64 bg-red-500/10 rounded-full blur-3xl animate-pulse" />
                <div className="absolute top-20 right-1/4 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl animate-pulse delay-1000" />
                <div className="absolute bottom-0 left-1/2 w-72 h-72 bg-red-600/5 rounded-full blur-3xl animate-pulse delay-500" />
              </div>

              <div className="relative">
                <button
                  onClick={onClose}
                  className="absolute right-4 top-4 p-2 rounded-full bg-gray-800/80 hover:bg-gray-700 transition-colors z-10"
                >
                  <X className="h-5 w-5 text-gray-400" />
                </button>

                <div className="flex flex-col items-center pt-6 pb-4">
                  <motion.div
                    initial={{ scale: 0, rotate: -180 }}
                    animate={{ scale: 1, rotate: 0 }}
                    transition={{ delay: 0.2, type: "spring" }}
                    className="relative"
                  >
                    <div className="absolute inset-0 bg-red-500/30 rounded-full blur-xl animate-pulse" />
                    <div className="relative p-4 rounded-full bg-gradient-to-br from-gray-800 to-gray-900 border-2 border-red-500/50 shadow-lg shadow-red-500/30">
                      <motion.div
                        animate={{ rotate: isUnlocking ? [0, -10, 10, -10, 0] : 0 }}
                        transition={{ duration: 0.5 }}
                      >
                        {isUnlocking ? (
                          <Unlock className="h-8 w-8 text-green-400" />
                        ) : (
                          <Lock className="h-8 w-8 text-red-400" />
                        )}
                      </motion.div>
                    </div>
                  </motion.div>

                  <motion.h2
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3 }}
                    className="mt-4 text-2xl font-bold text-white flex items-center gap-2"
                  >
                    <Sparkles className="h-5 w-5 text-amber-400" />
                    Enter the Trading Vault
                    <Sparkles className="h-5 w-5 text-amber-400" />
                  </motion.h2>
                  <motion.p
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-gray-400 text-sm mt-1"
                  >
                    Unlock powerful AI trading insights
                  </motion.p>
                </div>

                <div className="flex justify-center gap-2 px-6 mb-4 flex-wrap">
                  <button
                    onClick={() => setActiveTab("login")}
                    className={`relative px-5 py-2 rounded-full font-medium transition-all ${
                      activeTab === "login"
                        ? "text-white"
                        : "text-gray-400 hover:text-gray-300"
                    }`}
                  >
                    {activeTab === "login" && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-500 rounded-full"
                        transition={{ type: "spring", duration: 0.5 }}
                      />
                    )}
                    <span className="relative z-10">Log In</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("register")}
                    className={`relative px-5 py-2 rounded-full font-medium transition-all ${
                      activeTab === "register"
                        ? "text-white"
                        : "text-gray-400 hover:text-gray-300"
                    }`}
                  >
                    {activeTab === "register" && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-gradient-to-r from-red-600 to-red-500 rounded-full"
                        transition={{ type: "spring", duration: 0.5 }}
                      />
                    )}
                    <span className="relative z-10">Register</span>
                  </button>
                  <button
                    onClick={() => setActiveTab("wallet")}
                    className={`relative px-5 py-2 rounded-full font-medium transition-all flex items-center gap-2 ${
                      activeTab === "wallet"
                        ? "text-white"
                        : "text-gray-400 hover:text-gray-300"
                    }`}
                  >
                    {activeTab === "wallet" && (
                      <motion.div
                        layoutId="activeTab"
                        className="absolute inset-0 bg-gradient-to-r from-purple-600 to-indigo-500 rounded-full"
                        transition={{ type: "spring", duration: 0.5 }}
                      />
                    )}
                    <span className="relative z-10 flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      Wallet
                    </span>
                  </button>
                </div>

                <div className="px-6 pb-8 max-h-[60vh] overflow-y-auto">
                  <AnimatePresence mode="wait">
                    {activeTab === "login" ? (
                      <motion.div
                        key="login"
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Form {...loginForm}>
                          <form onSubmit={loginForm.handleSubmit(onLoginSubmit)} className="space-y-4 max-w-md mx-auto">
                            <FormField
                              control={loginForm.control}
                              name="username"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-gray-300">Username</FormLabel>
                                  <FormControl>
                                    <div className="relative">
                                      <Input
                                        placeholder="Enter your username"
                                        className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 pr-10"
                                        {...field}
                                      />
                                      <Shield className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-500" />
                                    </div>
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
                                  <FormLabel className="text-gray-300">Password</FormLabel>
                                  <FormControl>
                                    <div className="relative">
                                      <Input
                                        type={showPassword ? "text" : "password"}
                                        placeholder="Enter your password"
                                        className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500 pr-10"
                                        {...field}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => setShowPassword(!showPassword)}
                                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300"
                                      >
                                        {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                      </button>
                                    </div>
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />

                            <FormField
                              control={loginForm.control}
                              name="acceptDisclaimer"
                              render={({ field }) => (
                                <FormItem className="flex flex-row items-start space-x-3 space-y-0 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value}
                                      onCheckedChange={(checked) => field.onChange(checked === true)}
                                      className="border-amber-500 data-[state=checked]:bg-amber-500"
                                    />
                                  </FormControl>
                                  <div className="space-y-1 leading-none">
                                    <FormLabel className="text-sm font-medium text-amber-400 flex items-center gap-2">
                                      <AlertTriangle className="h-4 w-4" />
                                      Trading Risk Acknowledgment
                                    </FormLabel>
                                    <p className="text-xs text-gray-400">
                                      I acknowledge that trading involves substantial risk and is for educational purposes only.
                                    </p>
                                    <FormMessage />
                                  </div>
                                </FormItem>
                              )}
                            />

                            <motion.div
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <Button
                                type="submit"
                                className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-semibold py-6 rounded-xl shadow-lg shadow-red-500/30"
                                disabled={loginMutation.isPending}
                              >
                                {loginMutation.isPending ? (
                                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                  <Lock className="mr-2 h-5 w-5" />
                                )}
                                {isUnlocking ? "Unlocking Vault..." : "Enter the Vault"}
                              </Button>
                            </motion.div>
                          </form>
                        </Form>
                      </motion.div>
                    ) : activeTab === "register" ? (
                      <motion.div
                        key="register"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                      >
                        <Form {...registerForm}>
                          <form onSubmit={registerForm.handleSubmit(onRegisterSubmit as any)} className="space-y-4 max-w-md mx-auto">
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={registerForm.control as any}
                                name="username"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-gray-300">Username</FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder="Choose username"
                                        className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                                        {...field}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={registerForm.control as any}
                                name="fullName"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-gray-300">Full Name</FormLabel>
                                    <FormControl>
                                      <Input
                                        placeholder="Your full name"
                                        className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                                        {...field}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>
                            <FormField
                              control={registerForm.control as any}
                              name="email"
                              render={({ field }) => (
                                <FormItem>
                                  <FormLabel className="text-gray-300">Email</FormLabel>
                                  <FormControl>
                                    <Input
                                      type="email"
                                      placeholder="your@email.com"
                                      className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                                      {...field}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              )}
                            />
                            <div className="grid grid-cols-2 gap-4">
                              <FormField
                                control={registerForm.control as any}
                                name="password"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-gray-300">Password</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="password"
                                        placeholder="Choose password"
                                        className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                                        {...field}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                              <FormField
                                control={registerForm.control as any}
                                name="confirmPassword"
                                render={({ field }) => (
                                  <FormItem>
                                    <FormLabel className="text-gray-300">Confirm</FormLabel>
                                    <FormControl>
                                      <Input
                                        type="password"
                                        placeholder="Confirm password"
                                        className="bg-gray-800/50 border-gray-700 text-white placeholder:text-gray-500"
                                        {...field}
                                      />
                                    </FormControl>
                                    <FormMessage />
                                  </FormItem>
                                )}
                              />
                            </div>

                            <motion.div
                              whileHover={{ scale: 1.02 }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <Button
                                type="submit"
                                className="w-full bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 text-white font-semibold py-6 rounded-xl shadow-lg shadow-red-500/30"
                                disabled={registerMutation.isPending}
                              >
                                {registerMutation.isPending ? (
                                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                                ) : (
                                  <Sparkles className="mr-2 h-5 w-5" />
                                )}
                                Create Your Vault Access
                              </Button>
                            </motion.div>
                          </form>
                        </Form>
                      </motion.div>
                    ) : activeTab === "wallet" ? (
                      <motion.div
                        key="wallet"
                        initial={{ opacity: 0, x: 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -20 }}
                        transition={{ duration: 0.2 }}
                        className="max-w-md mx-auto"
                      >
                        <div className="mb-6 text-center">
                          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/20 border border-purple-500/30 rounded-full mb-4">
                            <Coins className="h-4 w-4 text-purple-400" />
                            <span className="text-purple-300 text-sm font-medium">VEDD Token Holders</span>
                          </div>
                          <h3 className="text-white text-lg font-semibold mb-2">Connect with Pump.fun Wallet</h3>
                          <p className="text-gray-400 text-sm">
                            Connect your Solana wallet to verify VEDD tokens and ambassador NFT
                          </p>
                        </div>

                        <WalletLoginButton 
                          onWalletLogin={(data) => {
                            console.log('Wallet login:', data);
                            onClose();
                          }}
                        />

                        <div className="mt-6 space-y-3">
                          <div className="flex items-center gap-3 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50">
                            <Award className="h-5 w-5 text-green-400 flex-shrink-0" />
                            <div>
                              <p className="text-white text-sm font-medium">Ambassador NFT</p>
                              <p className="text-gray-400 text-xs">Unlock exclusive features with your certification NFT</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50">
                            <Coins className="h-5 w-5 text-amber-400 flex-shrink-0" />
                            <div>
                              <p className="text-white text-sm font-medium">Token-Gated Access</p>
                              <p className="text-gray-400 text-xs">VEDD holders get 3 months free subscription</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 p-3 bg-gray-800/40 rounded-lg border border-gray-700/50">
                            <Shield className="h-5 w-5 text-purple-400 flex-shrink-0" />
                            <div>
                              <p className="text-white text-sm font-medium">Governance Voting</p>
                              <p className="text-gray-400 text-xs">Vote on AI Trading Vault proposals with your tokens</p>
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>

                <div className="absolute bottom-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-red-500 to-transparent opacity-50" />
              </div>
            </div>
          </motion.div>
          )}
        </>
      )}
    </AnimatePresence>
  );
}
