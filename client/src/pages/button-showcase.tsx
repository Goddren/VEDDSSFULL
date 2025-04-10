import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { AnimatedButton } from '@/components/ui/animated-button';
import { AnimatedInput } from '@/components/ui/animated-input';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, Plus, ArrowRight, Download, Trash, User, Settings, Search, Bell, Mail, Key, Globe, Calendar } from 'lucide-react';

export default function ButtonShowcase() {
  const [, setLocation] = useLocation();

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="flex items-center mb-8">
        <Button 
          variant="ghost" 
          onClick={() => setLocation('/')} 
          className="mr-4"
        >
          <ChevronLeft className="mr-2 h-4 w-4" /> Back
        </Button>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-red-500 via-amber-500 to-orange-500 bg-clip-text text-transparent">
            Micro-Interaction Button Effects
          </h1>
          <p className="text-gray-400 mt-1">
            Engaging interactive button animations to enhance user experience
          </p>
        </div>
      </div>

      <Tabs defaultValue="effects" className="w-full">
        <TabsList className="mb-6">
          <TabsTrigger value="effects">Button Effects</TabsTrigger>
          <TabsTrigger value="variants">Button Variants</TabsTrigger>
          <TabsTrigger value="icons">Button With Icons</TabsTrigger>
          <TabsTrigger value="combinations">Combined Effects</TabsTrigger>
          <TabsTrigger value="inputs">Input Effects</TabsTrigger>
        </TabsList>
        
        <TabsContent value="effects" className="space-y-6">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Basic Effects</CardTitle>
              <CardDescription>
                Simple micro-interactions to enhance button engagement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Scale on Hover</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton scaleOnHover>
                      Scale Effect
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Glow Effect</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton scaleOnHover glowColor="rgba(239, 68, 68, 0.5)">
                      Glow Effect
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Pulse Animation</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton scaleOnHover={false} pulseOnHover>
                      Pulse Effect
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Ripple Effect</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton scaleOnHover={false} rippleEffect>
                      Ripple Effect
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Slide Text</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton scaleOnHover={false} slideText>
                      Slide Effect
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Rotate Icon</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton scaleOnHover={false} rotateIcon>
                      <Settings className="mr-2 h-4 w-4" /> Settings
                    </AnimatedButton>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="variants" className="space-y-6">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Button Variants</CardTitle>
              <CardDescription>
                Different button styles with micro-interactions
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Default</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton variant="default" scaleOnHover rippleEffect>
                      Default Button
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Destructive</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton variant="destructive" scaleOnHover rippleEffect>
                      Delete Action
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Outline</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton variant="outline" scaleOnHover rippleEffect>
                      Outline Button
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Secondary</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton variant="secondary" scaleOnHover rippleEffect>
                      Secondary Action
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Ghost</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton variant="ghost" scaleOnHover rippleEffect>
                      Ghost Button
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Link</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton variant="link" scaleOnHover={false} slideText>
                      Link Button
                    </AnimatedButton>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="icons" className="space-y-6">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Button With Icons</CardTitle>
              <CardDescription>
                Buttons with icons and animation effects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Add Button</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton scaleOnHover rippleEffect rotateIcon>
                      <Plus className="mr-2 h-4 w-4" /> Add New
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Download</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton scaleOnHover rippleEffect rotateIcon slideText>
                      <Download className="mr-2 h-4 w-4" /> Download
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Delete</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton variant="destructive" scaleOnHover rippleEffect rotateIcon>
                      <Trash className="mr-2 h-4 w-4" /> Delete
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Profile</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton variant="outline" scaleOnHover rippleEffect rotateIcon>
                      <User className="mr-2 h-4 w-4" /> Profile
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Search</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton variant="secondary" scaleOnHover rippleEffect rotateIcon>
                      <Search className="mr-2 h-4 w-4" /> Search
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Notifications</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton variant="ghost" scaleOnHover pulseOnHover rotateIcon>
                      <Bell className="mr-2 h-4 w-4" /> Alerts
                    </AnimatedButton>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="combinations" className="space-y-6">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Combined Effects</CardTitle>
              <CardDescription>
                Complex interactive buttons with multiple animation effects
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Call to Action</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton 
                      scaleOnHover 
                      rippleEffect 
                      glowColor="rgba(239, 68, 68, 0.5)"
                      slideText
                    >
                      <ArrowRight className="mr-2 h-4 w-4" /> Get Started
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Premium Upgrade</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton 
                      variant="secondary"
                      scaleOnHover 
                      pulseOnHover
                      rippleEffect 
                      rotateIcon
                    >
                      <Download className="mr-2 h-4 w-4" /> Upgrade Now
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Critical Action</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton 
                      variant="destructive"
                      scaleOnHover 
                      rippleEffect 
                      glowColor="rgba(239, 68, 68, 0.8)"
                      rotateIcon
                    >
                      <Trash className="mr-2 h-4 w-4" /> Delete Account
                    </AnimatedButton>
                  </div>
                </div>

                <div className="flex flex-col gap-2 items-center">
                  <span className="text-sm text-gray-400">Subtle Action</span>
                  <div className="h-24 flex items-center justify-center">
                    <AnimatedButton 
                      variant="ghost"
                      scaleOnHover 
                      rippleEffect 
                      slideText
                      rotateIcon
                    >
                      <Settings className="mr-2 h-4 w-4" /> Advanced Settings
                    </AnimatedButton>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <div className="mt-12 bg-black/40 border border-gray-800 rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">Implementation Guide</h2>
        <div className="space-y-4">
          <p className="text-gray-300">
            To use these animated buttons in your interface:
          </p>
          <ol className="list-decimal pl-6 space-y-2 text-gray-300">
            <li>Import the AnimatedButton component from ui/animated-button</li>
            <li>Choose which animation effects you want to enable</li>
            <li>Customize the appearance with standard button variants</li>
            <li>Add icons with the rotateIcon prop for icon animation</li>
            <li>Use the slideText prop for text movement on hover</li>
          </ol>
          <div className="p-4 bg-gray-900/50 rounded-md mt-4">
            <pre className="text-xs text-gray-300 overflow-x-auto">
              {`<AnimatedButton 
  variant="secondary"
  scaleOnHover 
  rippleEffect
  rotateIcon
  slideText
>
  <Plus className="mr-2 h-4 w-4" /> 
  Add New Item
</AnimatedButton>`}
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}