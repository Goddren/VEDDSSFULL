import { useState } from "react";
import { z } from "zod";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useToast } from "@/hooks/use-toast";
import { useMutation } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { SendIcon, PhoneIcon, TrashIcon } from "lucide-react";

const smsFormSchema = z.object({
  phoneNumber: z
    .string()
    .min(10, { message: "Phone number must be at least 10 digits" })
    .regex(/^\+?[0-9]+$/, { message: "Phone number can only contain digits and an optional + prefix" }),
  message: z
    .string()
    .min(10, { message: "Message must be at least 10 characters" })
    .max(160, { message: "Message cannot exceed 160 characters (standard SMS limit)" }),
});

type SmsFormValues = z.infer<typeof smsFormSchema>;

export function SmsNotification({ analysisData }: { analysisData?: any }) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [savedNumbers, setSavedNumbers] = useState<string[]>(() => {
    const stored = localStorage.getItem("savedPhoneNumbers");
    return stored ? JSON.parse(stored) : [];
  });

  const defaultMessage = analysisData 
    ? `Trading Signal for ${analysisData.symbol}: ${analysisData.direction} at ${analysisData.currentPrice}. Entry: ${analysisData.entryPoint}, SL: ${analysisData.stopLoss}, TP: ${analysisData.takeProfit}`
    : "";

  const form = useForm<SmsFormValues>({
    resolver: zodResolver(smsFormSchema),
    defaultValues: {
      phoneNumber: savedNumbers[0] || "",
      message: defaultMessage,
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async (values: SmsFormValues) => {
      const res = await apiRequest("POST", "/api/send-signal", values);
      return await res.json();
    },
    onSuccess: () => {
      toast({
        title: "Message Sent",
        description: "Your trading signal has been sent successfully.",
      });
      
      // Save the phone number if it's not already saved
      const phoneNumber = form.getValues("phoneNumber");
      if (!savedNumbers.includes(phoneNumber)) {
        const updatedNumbers = [phoneNumber, ...savedNumbers].slice(0, 5); // Keep only the 5 most recent
        setSavedNumbers(updatedNumbers);
        localStorage.setItem("savedPhoneNumbers", JSON.stringify(updatedNumbers));
      }
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Send Message",
        description: error.message || "There was an error sending your message. Please try again.",
        variant: "destructive",
      });
    },
  });

  function onSubmit(values: SmsFormValues) {
    if (!user) {
      toast({
        title: "Authentication Required",
        description: "Please log in to send SMS notifications.",
        variant: "destructive",
      });
      return;
    }
    
    sendMessageMutation.mutate(values);
  }

  function usePhoneNumber(number: string) {
    form.setValue("phoneNumber", number);
  }

  function removePhoneNumber(number: string) {
    const updatedNumbers = savedNumbers.filter(n => n !== number);
    setSavedNumbers(updatedNumbers);
    localStorage.setItem("savedPhoneNumbers", JSON.stringify(updatedNumbers));
    
    if (form.getValues("phoneNumber") === number) {
      form.setValue("phoneNumber", updatedNumbers[0] || "");
    }
  }

  return (
    <Card className="w-full shadow-lg border-2 bg-gradient-to-br from-background/80 to-background">
      <CardHeader className="pb-3">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <SendIcon className="h-5 w-5 text-primary" />
          SMS Trading Signals
        </CardTitle>
        <CardDescription>
          Send trading signals directly to your phone or another recipient
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Phone Number</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <PhoneIcon className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="+1234567890"
                        className="pl-8"
                        {...field}
                      />
                    </div>
                  </FormControl>
                  <FormDescription>
                    Include country code (e.g., +1 for US)
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="message"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Trading Signal</FormLabel>
                  <FormControl>
                    <Textarea 
                      placeholder="Enter your trading signal details..." 
                      className="min-h-[100px]"
                      {...field} 
                    />
                  </FormControl>
                  <div className="flex justify-between">
                    <FormMessage />
                    <span className="text-xs text-muted-foreground">
                      {field.value ? field.value.length : 0}/160
                    </span>
                  </div>
                </FormItem>
              )}
            />

            <Button 
              type="submit" 
              className="w-full"
              disabled={sendMessageMutation.isPending}>
              {sendMessageMutation.isPending ? "Sending..." : "Send Trading Signal"}
            </Button>
          </form>
        </Form>

        {savedNumbers.length > 0 && (
          <div className="mt-6">
            <Separator className="my-4" />
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Recent Phone Numbers</h4>
              <div className="space-y-2">
                {savedNumbers.map((number) => (
                  <div key={number} className="flex items-center justify-between rounded-md border px-3 py-2">
                    <div className="flex items-center">
                      <PhoneIcon className="mr-2 h-4 w-4 text-muted-foreground" />
                      <span className="text-sm">{number}</span>
                    </div>
                    <div className="flex gap-2">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => usePhoneNumber(number)}>
                        Use
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => removePhoneNumber(number)}>
                        <TrashIcon className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-2 pb-4 flex flex-col">
        <p className="text-xs text-muted-foreground">
          Standard SMS charges may apply based on your carrier. We don't store message content after delivery.
        </p>
      </CardFooter>
    </Card>
  );
}