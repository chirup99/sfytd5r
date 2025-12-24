// Angel One Publisher Login Flow Implementation
// Uses Angel One's web-based authentication: https://smartapi.angelone.in/publisher-login
import crypto from 'crypto';

interface AngelOneAuthState {
  authToken: string | null;
  feedToken: string | null;
  clientId: string | null;
  userName: string | null;
  isAuthenticated: boolean;
  tokenExpiry: Date | null;
  lastUpdate: Date | null;
}

class AngelOneOAuthManager {
  private state: AngelOneAuthState = {
    authToken: null,
    feedToken: null,
    clientId: null,
    userName: null,
    isAuthenticated: false,
    tokenExpiry: null,
    lastUpdate: null,
  };

  private apiKey: string;
  private redirectUri: string;
  private stateTokens: Map<string, { state: string; createdAt: Date }> = new Map();

  constructor(apiKey?: string) {
    this.apiKey = apiKey || process.env.ANGELONE_API_KEY || '';
    
    // Set redirect URI based on environment
    const baseUrl = (process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS)
      ? `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS}`
      : `http://localhost:5000`;
    this.redirectUri = `${baseUrl}/api/angel-one/callback`;

    console.log('🔶 [ANGEL ONE] Publisher Login Manager initialized');
    console.log(`🔶 [ANGEL ONE] Redirect URI: ${this.redirectUri}`);
  }

  // Generate Publisher Login URL
  generateAuthorizationUrl(): { url: string; state: string } {
    const state = crypto.randomBytes(32).toString('hex');
    
    // Angel One Publisher Login endpoint
    const params = new URLSearchParams({
      api_key: this.apiKey,
      state: state,
    });

    const authUrl = `https://smartapi.angelone.in/publisher-login?${params.toString()}`;
    
    // Store state for verification
    this.stateTokens.set(state, { state, createdAt: new Date() });
    
    // Clean up old states (older than 15 minutes)
    const now = new Date();
    for (const [key, value] of this.stateTokens.entries()) {
      if (now.getTime() - value.createdAt.getTime() > 15 * 60 * 1000) {
        this.stateTokens.delete(key);
      }
    }

    console.log(`🔶 [ANGEL ONE] Generated Publisher Login URL with state: ${state.substring(0, 8)}...`);
    return { url: authUrl, state };
  }

  // Handle callback from Publisher Login
  // Angel One redirects with: ?auth_token={TOKEN}&feed_token={FEED_TOKEN}&state={STATE}
  async handleCallback(authToken: string, feedToken: string, state: string): Promise<boolean> {
    try {
      // Verify state parameter
      const storedState = this.stateTokens.get(state);
      if (!storedState) {
        console.error('🔴 [ANGEL ONE] Invalid state parameter - possible CSRF attack');
        return false;
      }
      this.stateTokens.delete(state);

      if (!authToken || !feedToken) {
        console.error('🔴 [ANGEL ONE] Missing auth_token or feed_token in callback');
        return false;
      }

      console.log('🔶 [ANGEL ONE] Processing Publisher Login callback...');

      // Tokens are valid until midnight IST
      const now = new Date();
      const midnight = new Date(now);
      midnight.setHours(24, 0, 0, 0); // Next midnight
      
      this.state.authToken = authToken;
      this.state.feedToken = feedToken;
      this.state.tokenExpiry = midnight;
      this.state.isAuthenticated = true;
      this.state.lastUpdate = new Date();

      console.log('✅ [ANGEL ONE] Publisher Login successful');
      console.log(`⏰ [ANGEL ONE] Tokens valid until: ${midnight.toISOString()}`);
      
      return true;
    } catch (error: any) {
      console.error('🔴 [ANGEL ONE] Callback handling error:', error.message);
      return false;
    }
  }

  // Get current authentication status
  getStatus() {
    const isTokenExpired = this.state.tokenExpiry && new Date() > this.state.tokenExpiry;
    
    return {
      connected: this.state.isAuthenticated && !isTokenExpired,
      authenticated: this.state.isAuthenticated && !isTokenExpired,
      authToken: this.state.isAuthenticated && !isTokenExpired ? this.state.authToken : null,
      feedToken: this.state.isAuthenticated && !isTokenExpired ? this.state.feedToken : null,
      clientId: this.state.clientId,
      userName: this.state.userName,
      tokenExpiry: this.state.tokenExpiry?.getTime() || null,
      tokenExpired: isTokenExpired,
      lastUpdate: this.state.lastUpdate?.toISOString() || null,
    };
  }

  // Disconnect/reset session
  disconnect(): void {
    this.state = {
      authToken: null,
      feedToken: null,
      clientId: null,
      userName: null,
      isAuthenticated: false,
      tokenExpiry: null,
      lastUpdate: null,
    };
    this.stateTokens.clear();
    console.log('🔶 [ANGEL ONE] Session disconnected');
  }

  // Get auth token for API calls
  getAuthToken(): string | null {
    if (!this.state.isAuthenticated || !this.state.authToken) {
      return null;
    }

    if (this.state.tokenExpiry && new Date() > this.state.tokenExpiry) {
      console.warn('⚠️ [ANGEL ONE] Auth token has expired');
      this.disconnect();
      return null;
    }

    return this.state.authToken;
  }

  // Get feed token for WebSocket streaming
  getFeedToken(): string | null {
    if (!this.state.isAuthenticated || !this.state.feedToken) {
      return null;
    }

    if (this.state.tokenExpiry && new Date() > this.state.tokenExpiry) {
      console.warn('⚠️ [ANGEL ONE] Feed token has expired');
      this.disconnect();
      return null;
    }

    return this.state.feedToken;
  }
}

// Singleton instance
export const angelOneOAuthManager = new AngelOneOAuthManager();
