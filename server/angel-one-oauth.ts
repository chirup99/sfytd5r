// Angel One OAuth Implementation - Fixed to use request_token flow
import axios from "axios";
import crypto from "crypto";

interface AngelOneOAuthState {
  accessToken: string | null;
  clientId: string | null;
  userEmail: string | null;
  userName: string | null;
  isAuthenticated: boolean;
  tokenExpiry: Date | null;
  lastRefresh: Date | null;
  requestToken: string | null;
}

interface AngelOneTokenResponse {
  status: boolean;
  data?: {
    jwtToken: string;
    refreshToken: string;
    feedToken: string;
  };
  message?: string;
}

class AngelOneOAuthManager {
  private state: AngelOneOAuthState = {
    accessToken: null,
    clientId: null,
    userEmail: null,
    userName: null,
    isAuthenticated: false,
    tokenExpiry: null,
    lastRefresh: null,
    requestToken: null,
  };

  private apiKey: string;
  private apiSecret: string;
  private appId: string;
  private redirectUri: string;
  private requestTokens: Map<string, { token: string; createdAt: Date }> =
    new Map();

  constructor(apiKey?: string, apiSecret?: string, appId?: string) {
    this.apiKey = apiKey || process.env.ANGELONE_API_KEY || "";
    this.apiSecret = apiSecret || process.env.ANGELONE_API_SECRET || "";
    this.appId = appId || process.env.ANGELONE_APP_ID || "web-app"; // Default app ID

    // Set redirect URI based on environment
    const baseUrl =
      process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS
        ? `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS}`
        : `http://localhost:5000`;
    this.redirectUri = `${baseUrl}/api/angel-one/callback`;

    console.log("🔶 [ANGEL ONE] OAuth Manager initialized");
    console.log(`🔶 [ANGEL ONE] Redirect URI: ${this.redirectUri}`);
    console.log(`🔶 [ANGEL ONE] App ID: ${this.appId}`);
  }

  // Generate login URL using request_token flow
  generateAuthorizationUrl(): { url: string; requestToken: string } {
    const requestToken = crypto.randomBytes(32).toString("hex");

    // Store request token for verification
    this.requestTokens.set(requestToken, {
      token: requestToken,
      createdAt: new Date(),
    });

    // Clean up old tokens (older than 15 minutes)
    const now = new Date();
    for (const [key, value] of this.requestTokens.entries()) {
      if (now.getTime() - value.createdAt.getTime() > 15 * 60 * 1000) {
        this.requestTokens.delete(key);
      }
    }

    // Build login URL with properly encoded redirect parameter
    const redirectUrl = `${this.redirectUri}?request_token=${encodeURIComponent(requestToken)}`;
    console.log(`🔶 [ANGEL ONE] Redirect URL: ${redirectUrl}`);

    // Use URL parameters matching Sensibull's successful implementation
    const params = new URLSearchParams({
      redirect: redirectUrl,
      ApplicationName: process.env.ANGELONE_APP_NAME || "web-app",
      OS: "Windows",
      AppID: this.appId,
      app: "web", // Additional parameter for compatibility
    });

    // Use the correct Angel One login endpoint
    const authUrl = `https://www.angelone.in/login/?${params.toString()}`;

    console.log(
      `🔶 [ANGEL ONE] Generated login URL with request token: ${requestToken.substring(0, 8)}...`,
    );
    console.log(
      `🔶 [ANGEL ONE] Full auth URL (sanitized): https://www.angelone.in/login/?redirect=[...]&ApplicationName=${params.get("ApplicationName")}&OS=${params.get("OS")}&AppID=${params.get("AppID")}&app=${params.get("app")}`,
    );
    return { url: authUrl, requestToken };
  }

  // Exchange request token for JWT token
  async exchangeTokenForJWT(requestToken: string): Promise<boolean> {
    try {
      // Verify request token exists
      const storedToken = this.requestTokens.get(requestToken);
      if (!storedToken) {
        console.error(
          "🔴 [ANGEL ONE] Invalid request token - possible security issue",
        );
        return false;
      }
      this.requestTokens.delete(requestToken);

      console.log("🔶 [ANGEL ONE] Exchanging request token for JWT...");

      // Use the Angel One generateSession endpoint to exchange request token for JWT
      const tokenUrl =
        "https://api.angelone.in/rest/auth/angelbroking/user/v1/generateSession";

      const payload = {
        clientcode: this.apiKey,
        password: this.apiSecret, // In request_token flow, password acts as secret
        totp: "", // TOTP can be empty for request_token flow
        requestToken: requestToken,
      };

      const response = await axios.post(tokenUrl, payload, {
        headers: {
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        timeout: 10000,
      });

      const tokenData: AngelOneTokenResponse = response.data;

      if (tokenData.data?.jwtToken) {
        // Token expires in 24 hours (86400 seconds)
        const expiryTime = new Date(Date.now() + 86400 * 1000);

        this.state.accessToken = tokenData.data.jwtToken;
        this.state.requestToken = requestToken;
        this.state.tokenExpiry = expiryTime;
        this.state.isAuthenticated = true;
        this.state.lastRefresh = new Date();

        console.log("✅ [ANGEL ONE] JWT token obtained successfully");
        console.log(
          `⏰ [ANGEL ONE] Token expires at: ${expiryTime.toISOString()}`,
        );

        // Fetch user profile
        await this.fetchUserProfile();

        return true;
      }

      console.error("🔴 [ANGEL ONE] Failed to get JWT token");
      console.error("🔴 [ANGEL ONE] Response:", tokenData);
      return false;
    } catch (error: any) {
      console.error("🔴 [ANGEL ONE] Token exchange error:", error.message);
      if (error.response?.data) {
        console.error("🔴 [ANGEL ONE] Response:", error.response.data);
      }
      return false;
    }
  }

  // Fetch user profile using access token
  private async fetchUserProfile(): Promise<void> {
    try {
      if (!this.state.accessToken) {
        console.error(
          "🔴 [ANGEL ONE] No access token available for profile fetch",
        );
        return;
      }

      console.log("🔶 [ANGEL ONE] Fetching user profile...");

      const response = await axios.get(
        "https://api.angelone.in/rest/secure/angelbroking/user/v1/getProfile",
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${this.state.accessToken}`,
          },
          timeout: 10000,
        },
      );

      const profileData = response.data;

      if (profileData.data) {
        this.state.clientId = profileData.data.clientcode || "";
        this.state.userEmail = profileData.data.email || "";
        this.state.userName = profileData.data.name || "";

        console.log(
          `✅ [ANGEL ONE] User profile fetched: ${this.state.userName} (${this.state.userEmail})`,
        );
      }
    } catch (error: any) {
      console.error("🔴 [ANGEL ONE] Profile fetch error:", error.message);
      // Non-fatal error - continue even if profile fetch fails
    }
  }

  // Get current authentication status
  getStatus() {
    const isTokenExpired =
      this.state.tokenExpiry && new Date() > this.state.tokenExpiry;

    return {
      connected: this.state.isAuthenticated && !isTokenExpired,
      authenticated: this.state.isAuthenticated && !isTokenExpired,
      accessToken:
        this.state.isAuthenticated && !isTokenExpired
          ? this.state.accessToken
          : null,
      clientId: this.state.clientId,
      userEmail: this.state.userEmail,
      userName: this.state.userName,
      tokenExpiry: this.state.tokenExpiry?.getTime() || null,
      tokenExpired: isTokenExpired,
      lastRefresh: this.state.lastRefresh?.toISOString() || null,
    };
  }

  // Disconnect/reset session
  disconnect(): void {
    this.state = {
      accessToken: null,
      clientId: null,
      userEmail: null,
      userName: null,
      isAuthenticated: false,
      tokenExpiry: null,
      lastRefresh: null,
      requestToken: null,
    };
    this.requestTokens.clear();
    console.log("🔶 [ANGEL ONE] Session disconnected");
  }

  // Get access token for API calls
  getAccessToken(): string | null {
    if (!this.state.isAuthenticated || !this.state.accessToken) {
      return null;
    }

    if (this.state.tokenExpiry && new Date() > this.state.tokenExpiry) {
      console.warn("⚠️ [ANGEL ONE] Access token has expired");
      this.disconnect();
      return null;
    }

    return this.state.accessToken;
  }

  // Get login URL for popup (Sensibull-compatible)
  getLoginPageUrl(): string {
    const baseUrl = process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS
      ? `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS}`
      : `http://localhost:5000`;
    
    // Return Angel One's login page - user logs in there, then we check status via polling
    const params = new URLSearchParams({
      ApplicationName: process.env.ANGELONE_APP_NAME || "web-app",
      OS: "Windows",
      AppID: this.appId,
      app: "web",
      redirect: `${baseUrl}/api/angel-one/poll-auth`,
    });
    
    return `https://www.angelone.in/login/?${params.toString()}`;
  }
}

// Singleton instance
export const angelOneOAuthManager = new AngelOneOAuthManager();
