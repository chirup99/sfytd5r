import { useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Loader2, CheckCircle, AlertCircle } from "lucide-react";

export default function ZerodhaCallback() {
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestToken = params.get("request_token");
    
    if (!requestToken) {
      console.error("Missing request_token in callback");
      return;
    }

    // Send token to parent window
    if (window.opener) {
      window.opener.postMessage(
        { type: "zerodha_token", token: requestToken },
        window.location.origin
      );
      
      // Close this window after 2 seconds
      setTimeout(() => window.close(), 2000);
    } else {
      // Fallback: store in localStorage and redirect
      localStorage.setItem("zerodha_request_token", requestToken);
      window.location.href = "/";
    }
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 p-4">
      <Card className="w-full max-w-md">
        <div className="p-8 text-center space-y-4">
          <CheckCircle className="h-12 w-12 text-green-600 dark:text-green-400 mx-auto" />
          <h1 className="text-2xl font-bold">Authorization Successful</h1>
          <p className="text-muted-foreground">
            Your Zerodha account is now connected. This window will close automatically.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground pt-4">
            <Loader2 className="h-4 w-4 animate-spin" />
            Closing...
          </div>
        </div>
      </Card>
    </div>
  );
}
