import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CheckCircle, AlertCircle, ExternalLink } from "lucide-react";

interface ZerodhaOAuthProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (token: string) => void;
}

export function ZerodhaOAuth({ open, onOpenChange, onSuccess }: ZerodhaOAuthProps) {
  const [step, setStep] = useState<"authorize" | "loading" | "waiting" | "success" | "error">("authorize");
  const [error, setError] = useState<string | null>(null);
  const [loginUrl, setLoginUrl] = useState<string | null>(null);
  const [oauthWindow, setOAuthWindow] = useState<Window | null>(null);

  // Listen for token from callback
  useEffect(() => {
    if (!open) return;

    const handleMessage = (event: MessageEvent) => {
      // Only accept messages from same origin
      if (event.origin !== window.location.origin) return;
      
      if (event.data.type === "zerodha_token") {
        const { token } = event.data;
        if (token) {
          setStep("success");
          setTimeout(() => {
            onSuccess(token);
            setTimeout(() => onOpenChange(false), 500);
          }, 1000);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [open, onSuccess, onOpenChange]);

  const handleAuthorize = async () => {
    try {
      setStep("loading");
      setError(null);

      const response = await fetch("/api/broker/zerodha/login-url");
      const data = await response.json();

      if (!data.loginUrl) {
        throw new Error("Failed to get login URL");
      }

      setLoginUrl(data.loginUrl);
      setStep("waiting");

      // Open in popup window
      const width = 500;
      const height = 600;
      const left = (window.innerWidth - width) / 2;
      const top = (window.innerHeight - height) / 2;

      const popup = window.open(
        data.loginUrl,
        "zerodha_auth",
        `width=${width},height=${height},left=${left},top=${top},resizable=yes`
      );

      if (!popup) {
        throw new Error("Popup blocked. Please allow popups for this site.");
      }

      setOAuthWindow(popup);

      // Check if window was closed
      const checkInterval = setInterval(() => {
        if (popup.closed) {
          clearInterval(checkInterval);
          setStep("authorize");
        }
      }, 1000);
    } catch (err) {
      setStep("error");
      setError(err instanceof Error ? err.message : "Failed to initiate authorization");
    }
  };

  const handleRetry = () => {
    setStep("authorize");
    setError(null);
    setLoginUrl(null);
    if (oauthWindow && !oauthWindow.closed) {
      oauthWindow.close();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="text-lg font-semibold">Zerodha Authorization</span>
          </DialogTitle>
          <DialogDescription>
            Authorize Perala to access your Zerodha account
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {step === "authorize" && (
            <>
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-4">
                <h4 className="font-medium text-sm text-blue-900 dark:text-blue-100 mb-2">
                  What you're authorizing:
                </h4>
                <ul className="text-sm text-blue-800 dark:text-blue-200 space-y-1">
                  <li>• View your trading orders and positions</li>
                  <li>• Access account and portfolio information</li>
                  <li>• Import your trade history</li>
                </ul>
              </div>
              <Button
                onClick={handleAuthorize}
                className="w-full"
                data-testid="button-zerodha-authorize"
              >
                <ExternalLink className="mr-2 h-4 w-4" />
                Authorize with Zerodha
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                You'll be redirected to Zerodha to complete the authorization
              </p>
            </>
          )}

          {step === "loading" && (
            <div className="flex flex-col items-center justify-center py-6">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400 mb-3" />
              <p className="text-sm font-medium">Preparing authorization...</p>
              <p className="text-xs text-muted-foreground mt-1">
                A new window will open shortly
              </p>
            </div>
          )}

          {step === "waiting" && (
            <div className="flex flex-col items-center justify-center py-6">
              <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400 mb-3" />
              <p className="text-sm font-medium">Waiting for authorization...</p>
              <p className="text-xs text-muted-foreground mt-2 text-center">
                Complete the authorization in the popup window
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (loginUrl && oauthWindow?.closed !== false) {
                    const width = 500;
                    const height = 600;
                    const left = (window.innerWidth - width) / 2;
                    const top = (window.innerHeight - height) / 2;
                    window.open(
                      loginUrl,
                      "zerodha_auth",
                      `width=${width},height=${height},left=${left},top=${top},resizable=yes`
                    );
                  }
                }}
                className="mt-4"
                data-testid="button-reopen-zerodha-auth"
              >
                Reopen Authorization
              </Button>
            </div>
          )}

          {step === "success" && (
            <div className="flex flex-col items-center justify-center py-6">
              <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400 mb-3" />
              <p className="text-sm font-medium text-green-900 dark:text-green-100">
                Authorization Successful!
              </p>
              <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                Your account is now connected
              </p>
            </div>
          )}

          {step === "error" && (
            <>
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                  <div>
                    <h4 className="font-medium text-sm text-red-900 dark:text-red-100">
                      Authorization Failed
                    </h4>
                    <p className="text-sm text-red-800 dark:text-red-200 mt-1">
                      {error}
                    </p>
                  </div>
                </div>
              </div>
              <Button
                onClick={handleRetry}
                className="w-full"
                variant="outline"
                data-testid="button-retry-zerodha-auth"
              >
                Try Again
              </Button>
            </>
          )}
        </div>

        {step === "authorize" && (
          <div className="flex justify-end">
            <Button
              variant="ghost"
              onClick={() => onOpenChange(false)}
              data-testid="button-cancel-zerodha-auth"
            >
              Cancel
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
