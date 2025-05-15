// GitHub integration module for importing external trading strategies
import { toast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";

/**
 * Fetch a file from a GitHub repository
 * @param owner The GitHub username or organization
 * @param repo The repository name
 * @param path Path to the file within the repository
 * @returns The file content as string
 */
export async function fetchGitHubFile(
  owner: string,
  repo: string,
  path: string
): Promise<string> {
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Failed to fetch from GitHub: ${response.statusText}`);
    }
    
    const data = await response.json();
    // GitHub API returns file content as base64 encoded
    return atob(data.content);
  } catch (error) {
    console.error("GitHub file fetch error:", error);
    throw error;
  }
}

/**
 * Import a trading strategy from GitHub
 * @param repoUrl GitHub repository URL (format: https://github.com/owner/repo)
 * @param strategyPath Path to the strategy file within the repository
 * @returns The imported strategy
 */
export async function importTradingStrategy(
  repoUrl: string,
  strategyPath: string
): Promise<any> {
  try {
    // Parse repository URL
    const urlParts = repoUrl.replace('https://github.com/', '').split('/');
    if (urlParts.length < 2) {
      throw new Error("Invalid GitHub repository URL");
    }
    
    const [owner, repo] = urlParts;
    
    // Fetch the strategy file
    const strategyCode = await fetchGitHubFile(owner, repo, strategyPath);
    
    // You might need to handle different file types differently
    // For example, JSON can be parsed, while JS/TS files might need to be dynamically evaluated
    
    // For JSON files
    if (strategyPath.endsWith('.json')) {
      return JSON.parse(strategyCode);
    }
    
    // For JS/TS files, you might want to save them locally first
    // and then import them, or use a dynamic import approach
    
    // This is a simplistic approach - in a real implementation you'd need
    // to handle this more securely and robustly
    return strategyCode;
  } catch (error: unknown) {
    console.error("Error importing trading strategy:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    toast({
      title: "Import Failed",
      description: `Failed to import strategy: ${errorMessage}`,
      variant: "destructive"
    });
    throw error;
  }
}

/**
 * Save an imported strategy to the database
 * @param strategy The strategy to save
 * @param metadata Additional metadata about the strategy
 * @returns The saved strategy
 */
export async function saveImportedStrategy(
  strategy: any,
  metadata: {
    name: string;
    description: string;
    source: string;
    category: string;
    riskLevel: 'low' | 'medium' | 'high';
  }
): Promise<any> {
  try {
    const response = await apiRequest("POST", "/api/strategies/import", {
      strategy,
      metadata
    });
    
    if (!response.ok) {
      throw new Error("Failed to save imported strategy");
    }
    
    return await response.json();
  } catch (error: unknown) {
    console.error("Error saving imported strategy:", error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';
    toast({
      title: "Save Failed",
      description: `Failed to save strategy: ${errorMessage}`,
      variant: "destructive"
    });
    throw error;
  }
}