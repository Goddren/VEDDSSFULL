import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Github } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { importTradingStrategy, saveImportedStrategy } from "@/lib/github-integration";

export function GitHubStrategyImport() {
  const [open, setOpen] = useState(false);
  const [repoUrl, setRepoUrl] = useState("");
  const [filePath, setFilePath] = useState("");
  const [strategyName, setStrategyName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("pattern");
  const [riskLevel, setRiskLevel] = useState("medium");
  const [isLoading, setIsLoading] = useState(false);
  const [strategyCode, setStrategyCode] = useState("");
  const [loadStep, setLoadStep] = useState<"input" | "review" | "success">("input");
  
  const { toast } = useToast();

  const handleImport = async () => {
    if (!repoUrl || !filePath) {
      toast({
        title: "Missing Information",
        description: "Please provide both repository URL and file path",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const importedStrategy = await importTradingStrategy(repoUrl, filePath);
      
      // If it's a string (code), store it for review
      if (typeof importedStrategy === 'string') {
        setStrategyCode(importedStrategy);
      } else {
        // If it's an object (JSON), stringify for review
        setStrategyCode(JSON.stringify(importedStrategy, null, 2));
      }
      
      setLoadStep("review");
      toast({
        title: "Strategy Imported",
        description: "Please review the imported strategy before saving",
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to import strategy";
      toast({
        title: "Import Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!strategyName || !description) {
      toast({
        title: "Missing Information",
        description: "Please provide a name and description for the strategy",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      let strategyData = strategyCode;
      try {
        // Try to parse it as JSON
        strategyData = JSON.parse(strategyCode);
      } catch (e) {
        // If not JSON, it's code - we'll handle it as a string
      }
      
      await saveImportedStrategy(strategyData, {
        name: strategyName,
        description,
        source: `${repoUrl}/${filePath}`,
        category,
        riskLevel: riskLevel as 'low' | 'medium' | 'high',
      });
      
      setLoadStep("success");
      toast({
        title: "Strategy Saved",
        description: "The imported strategy has been saved",
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Failed to save imported strategy";
      toast({
        title: "Save Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const resetDialog = () => {
    setRepoUrl("");
    setFilePath("");
    setStrategyName("");
    setDescription("");
    setCategory("pattern");
    setRiskLevel("medium");
    setStrategyCode("");
    setLoadStep("input");
  };

  const handleClose = (isOpen: boolean) => {
    if (!isOpen) {
      setTimeout(resetDialog, 300); // Reset after close animation
    }
    setOpen(isOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2">
          <Github className="h-4 w-4" />
          Import from GitHub
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[525px]">
        <DialogHeader>
          <DialogTitle>Import Trading Strategy from GitHub</DialogTitle>
          <DialogDescription>
            {loadStep === "input" && "Enter the GitHub repository details to import a trading strategy"}
            {loadStep === "review" && "Review the imported strategy before saving"}
            {loadStep === "success" && "The strategy has been successfully imported"}
          </DialogDescription>
        </DialogHeader>

        {loadStep === "input" && (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="repo-url">GitHub Repository URL</Label>
              <Input
                id="repo-url"
                placeholder="https://github.com/username/repository"
                value={repoUrl}
                onChange={(e) => setRepoUrl(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="file-path">File Path</Label>
              <Input
                id="file-path"
                placeholder="path/to/strategy.json"
                value={filePath}
                onChange={(e) => setFilePath(e.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                The path to the strategy file within the repository
              </p>
            </div>
          </div>
        )}

        {loadStep === "review" && (
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="strategy-name">Strategy Name</Label>
              <Input
                id="strategy-name"
                placeholder="My Imported Strategy"
                value={strategyName}
                onChange={(e) => setStrategyName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Description of the imported trading strategy"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="category">Category</Label>
                <Select value={category} onValueChange={setCategory}>
                  <SelectTrigger id="category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="trend">Trend</SelectItem>
                    <SelectItem value="reversal">Reversal</SelectItem>
                    <SelectItem value="breakout">Breakout</SelectItem>
                    <SelectItem value="oscillator">Oscillator</SelectItem>
                    <SelectItem value="pattern">Pattern</SelectItem>
                    <SelectItem value="range">Range</SelectItem>
                    <SelectItem value="volatility">Volatility</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="risk-level">Risk Level</Label>
                <Select value={riskLevel} onValueChange={setRiskLevel}>
                  <SelectTrigger id="risk-level">
                    <SelectValue placeholder="Select risk level" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="code-preview">Code Preview</Label>
              <div className="rounded-md bg-muted p-4 overflow-auto max-h-[200px]">
                <pre className="text-xs text-muted-foreground">{strategyCode}</pre>
              </div>
            </div>
          </div>
        )}

        {loadStep === "success" && (
          <div className="py-4 flex flex-col items-center justify-center gap-4">
            <div className="rounded-full bg-primary/10 p-3">
              <svg className="h-6 w-6 text-primary" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-center text-sm">
              {`Strategy "${strategyName}" has been successfully imported and saved.`}
              <br />
              <span className="text-muted-foreground">
                You can now use it in the Strategy Wizard.
              </span>
            </p>
          </div>
        )}

        <DialogFooter>
          {loadStep === "input" && (
            <Button onClick={handleImport} disabled={isLoading}>
              {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Import Strategy
            </Button>
          )}
          {loadStep === "review" && (
            <>
              <Button variant="outline" onClick={() => setLoadStep("input")} disabled={isLoading}>
                Back
              </Button>
              <Button onClick={handleSave} disabled={isLoading}>
                {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Save Strategy
              </Button>
            </>
          )}
          {loadStep === "success" && (
            <Button onClick={() => handleClose(false)}>
              Close
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}