import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";

export interface ApiKeySettingsProps {
  onKeySaved?: () => void;
  className?: string;
}

export function ApiKeySettings({ onKeySaved, className }: ApiKeySettingsProps) {
  const [apiKey, setApiKey] = useState<string>("");
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [keyStatus, setKeyStatus] = useState<'unknown' | 'valid' | 'invalid'>('unknown');
  const { toast } = useToast();

  // Check if the API key is valid on mount
  useEffect(() => {
    async function validateExistingKey() {
      try {
        setIsValidating(true);
        const response = await apiRequest("GET", "/api/validate-key");
        const data = await response.json();
        
        if (data.valid) {
          setKeyStatus('valid');
        } else {
          setKeyStatus('invalid');
        }
      } catch (error) {
        setKeyStatus('invalid');
      } finally {
        setIsValidating(false);
      }
    }

    validateExistingKey();
  }, []);

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      toast({
        title: "API Key Required",
        description: "Please enter your OpenAI API key.",
        variant: "destructive",
      });
      return;
    }

    try {
      setIsValidating(true);
      
      // Make a request to save the API key on the server
      const configResponse = await apiRequest('POST', '/api/configure-key', { apiKey });
      const configData = await configResponse.json();

      // Check if the configuration was successful
      if (configData.valid) {
        toast({
          title: "API Key Saved",
          description: "Your API key has been saved and validated successfully.",
        });
        setKeyStatus('valid');
        if (onKeySaved) onKeySaved();
      } else {
        // Handle known error cases
        if (configData.code === "BILLING_INACTIVE") {
          toast({
            title: "Billing Issue",
            description: "Your OpenAI API key is valid, but you need to add a payment method in your OpenAI account.",
            variant: "destructive",
          });
        } else if (configData.code === "INVALID_API_KEY") {
          toast({
            title: "Invalid API Key",
            description: "The API key format is incorrect or it doesn't exist. Please check and try again.",
            variant: "destructive",
          });
        } else {
          toast({
            title: "API Key Invalid",
            description: configData.error || "The API key could not be validated. Please check and try again.",
            variant: "destructive",
          });
        }
        setKeyStatus('invalid');
      }
    } catch (error: any) {
      console.error("API key configuration error:", error);
      
      // Try to extract error message if available
      const errorMsg = error.message || "There was an error validating your API key.";
      
      toast({
        title: "Error Saving API Key",
        description: errorMsg,
        variant: "destructive",
      });
      setKeyStatus('invalid');
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div className={`space-y-4 ${className}`}>
      <div className="text-lg font-medium">OpenAI API Key</div>
      <p className="text-sm text-muted-foreground">
        This application requires an OpenAI API key with access to gpt-4o to analyze your chart images.
        Your API key is securely stored and never shared.
      </p>
      
      <div className="grid gap-2">
        <div className="flex items-center gap-2">
          <Input 
            type="password"
            placeholder="Enter your OpenAI API key"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="flex-1"
          />
          <Button onClick={handleSaveKey} disabled={isValidating || !apiKey.trim()}>
            {isValidating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Validating
              </>
            ) : (
              "Save & Validate"
            )}
          </Button>
        </div>
        
        {keyStatus !== 'unknown' && (
          <div className={`text-sm flex items-center gap-1 ${keyStatus === 'valid' ? 'text-green-500' : 'text-red-500'}`}>
            {keyStatus === 'valid' ? (
              <>
                <CheckCircle2 className="h-4 w-4" />
                API key is valid and working
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4" />
                API key is invalid or not working
              </>
            )}
          </div>
        )}
      </div>
      
      <div className="space-y-2 text-xs text-muted-foreground">
        <p>
          To get an API key, sign up on <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer" className="underline">OpenAI's platform</a>.
          Note that analyzing images requires a paid account with access to the gpt-4o model.
        </p>
        <p className="text-amber-500">
          <strong>Important:</strong> Your OpenAI account must have active billing set up as this application 
          uses gpt-4o for image analysis, which is a paid API and not available with free credits.
        </p>
      </div>
    </div>
  );
}