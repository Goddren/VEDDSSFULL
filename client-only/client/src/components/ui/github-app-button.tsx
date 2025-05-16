import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Github, ExternalLink, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface GitHubAppButtonProps {
  // Size can be default, small, or large
  size?: "default" | "sm" | "lg";
  // Variant can be default, ghost, link, etc.
  variant?: "default" | "outline" | "ghost" | "link";
  // Custom class for styling
  className?: string;
}

export function GitHubAppButton({
  size = "default",
  variant = "default",
  className = "",
}: GitHubAppButtonProps) {
  const [isConfigOpen, setIsConfigOpen] = useState(false);
  const [appUrl, setAppUrl] = useState(localStorage.getItem("githubAppUrl") || "");
  const [appName, setAppName] = useState(localStorage.getItem("githubAppName") || "My GitHub App");
  const { toast } = useToast();

  const handleSaveConfig = () => {
    if (!appUrl) {
      toast({
        title: "URL Required",
        description: "Please enter the GitHub app URL",
        variant: "destructive",
      });
      return;
    }

    // Validate URL format
    try {
      new URL(appUrl);
    } catch (e) {
      toast({
        title: "Invalid URL",
        description: "Please enter a valid URL starting with http:// or https://",
        variant: "destructive",
      });
      return;
    }

    // Save to localStorage
    localStorage.setItem("githubAppUrl", appUrl);
    localStorage.setItem("githubAppName", appName || "My GitHub App");
    
    toast({
      title: "Configuration Saved",
      description: `Your GitHub app link has been saved`,
    });
    
    setIsConfigOpen(false);
  };

  const openGitHubApp = () => {
    const url = localStorage.getItem("githubAppUrl");
    if (url) {
      window.open(url, "_blank");
    } else {
      setIsConfigOpen(true);
    }
  };

  return (
    <>
      <Button
        variant={variant}
        size={size}
        className={className}
        onClick={openGitHubApp}
      >
        <Github className="mr-2 h-4 w-4" />
        {appName || "GitHub App"}
        <ExternalLink className="ml-2 h-3 w-3" />
      </Button>

      <Dialog open={isConfigOpen} onOpenChange={setIsConfigOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>GitHub App Configuration</DialogTitle>
            <DialogDescription>
              Set up your GitHub app link to access it directly from VEDDAI
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <label htmlFor="app-name">App Name</label>
              <Input
                id="app-name"
                placeholder="My Trading Bot"
                value={appName}
                onChange={(e) => setAppName(e.target.value)}
              />
            </div>
            
            <div className="grid gap-2">
              <label htmlFor="app-url">GitHub App URL</label>
              <Input
                id="app-url"
                placeholder="https://github.com/yourusername/yourapp"
                value={appUrl}
                onChange={(e) => setAppUrl(e.target.value)}
              />
              <p className="text-sm text-muted-foreground">
                This can be your GitHub repository, website, or application URL
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={handleSaveConfig}>Save Configuration</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}