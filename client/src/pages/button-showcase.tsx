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
            UI Micro-Interactions
          </h1>
          <p className="text-gray-400 mt-1">
            Engaging interactive animations for buttons and inputs to enhance user experience
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

        <TabsContent value="inputs" className="space-y-6">
          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Animated Input Fields</CardTitle>
              <CardDescription>
                Interactive form fields with micro-animations for improved user engagement
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                <div className="space-y-2">
                  <span className="text-sm text-gray-400">Glow Effect</span>
                  <AnimatedInput 
                    label="Email Address" 
                    placeholder="Enter your email" 
                    animation="glow"
                    glowColor="rgba(239, 68, 68, 0.3)"
                  />
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-gray-400">Float Effect</span>
                  <AnimatedInput 
                    label="Username" 
                    placeholder="Choose a username" 
                    animation="float"
                  />
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-gray-400">Expand Effect</span>
                  <AnimatedInput 
                    label="Password"
                    type="password" 
                    placeholder="Enter password"
                    animation="expand"
                  />
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-gray-400">Border Effect</span>
                  <AnimatedInput 
                    label="Full Name" 
                    placeholder="John Doe" 
                    animation="border"
                  />
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-gray-400">Error State</span>
                  <AnimatedInput 
                    label="Phone Number" 
                    placeholder="Enter phone number" 
                    animation="border"
                    error="Please enter a valid phone number"
                  />
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-gray-400">Helper Text</span>
                  <AnimatedInput 
                    label="Password"
                    type="password" 
                    placeholder="Create a password"
                    animation="glow"
                    helperText="Password must be at least 8 characters"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-black/40 border-gray-800">
            <CardHeader>
              <CardTitle>Input Fields with Icons</CardTitle>
              <CardDescription>
                Form inputs with interactive icons and validation states
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-4">
                <div className="space-y-2">
                  <span className="text-sm text-gray-400">Email Input</span>
                  <div className="relative">
                    <AnimatedInput 
                      label="Email Address" 
                      placeholder="Enter your email" 
                      animation="border"
                      className="pl-10"
                    />
                    <Mail className="h-4 w-4 text-gray-400 absolute left-3 top-[38px]" />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-gray-400">Password Input</span>
                  <div className="relative">
                    <AnimatedInput 
                      label="Password" 
                      type="password"
                      placeholder="Enter password" 
                      animation="border"
                      className="pl-10"
                    />
                    <Key className="h-4 w-4 text-gray-400 absolute left-3 top-[38px]" />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-gray-400">Search Input</span>
                  <div className="relative">
                    <AnimatedInput 
                      label="Search" 
                      placeholder="Search anything..." 
                      animation="glow"
                      className="pl-10"
                    />
                    <Search className="h-4 w-4 text-gray-400 absolute left-3 top-[38px]" />
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-sm text-gray-400">Website Input</span>
                  <div className="relative">
                    <AnimatedInput 
                      label="Website" 
                      placeholder="https://example.com" 
                      animation="expand"
                      className="pl-10"
                    />
                    <Globe className="h-4 w-4 text-gray-400 absolute left-3 top-[38px]" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
      
      <div className="mt-12 bg-black/40 border border-gray-800 rounded-lg p-6">
        <h2 className="text-2xl font-semibold mb-4">Implementation Guide</h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {/* Button Implementation Guide */}
          <div className="space-y-4">
            <h3 className="text-xl font-medium text-amber-500">Animated Buttons</h3>
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
          
          {/* Input Implementation Guide */}
          <div className="space-y-4">
            <h3 className="text-xl font-medium text-amber-500">Animated Inputs</h3>
            <p className="text-gray-300">
              To use these animated inputs in your forms:
            </p>
            <ol className="list-decimal pl-6 space-y-2 text-gray-300">
              <li>Import the AnimatedInput component from ui/animated-input</li>
              <li>Choose an animation type: glow, float, expand, border, shake</li>
              <li>Customize the appearance with labels and helper text</li>
              <li>Add validation with the error prop for error states</li>
              <li>Combine with icons by using relative positioning</li>
            </ol>
            <div className="p-4 bg-gray-900/50 rounded-md mt-4">
              <pre className="text-xs text-gray-300 overflow-x-auto">
                {`<AnimatedInput 
  label="Email Address"
  placeholder="Enter your email"
  animation="glow"
  glowColor="rgba(239, 68, 68, 0.3)"
  helperText="We'll never share your email"
/>`}
              </pre>
            </div>
          </div>
        </div>
        
        <div className="mt-8 pt-6 border-t border-gray-800">
          <h3 className="text-lg font-medium mb-2">Combining with Form Libraries</h3>
          <p className="text-gray-300">
            Both components are fully compatible with react-hook-form and other form libraries. 
            Simply pass the ref from useForm register to the component.
          </p>
        </div>
      </div>
    </div>
  );
}