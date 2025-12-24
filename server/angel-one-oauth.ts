// Angel One OAuth 2.0 Implementation
import axios from 'axios';
import crypto from 'crypto';

interface AngelOneOAuthState {
  accessToken: string | null;
  clientId: string | null;
  userEmail: string | null;
  userName: string | null;
  isAuthenticated: boolean;
  tokenExpiry: Date | null;
  lastRefresh: Date | null;
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
  };

  private apiKey: string;
  private apiSecret: string;
  private redirectUri: string;
  private oauthStates: Map<string, { state: string; createdAt: Date }> = new Map();

  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey || process.env.ANGELONE_API_KEY || '';
    this.apiSecret = apiSecret || process.env.ANGELONE_API_SECRET || '';
    
    // Set redirect URI based on environment
    const baseUrl = (process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS)
      ? `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS}`
      : `http://localhost:5000`;
    this.redirectUri = `${baseUrl}/api/angel-one/callback`;

    console.log('🔶 [ANGEL ONE] OAuth Manager initialized');
    console.log(`🔶 [ANGEL ONE] Redirect URI: ${this.redirectUri}`);
  }

  // Generate OAuth authorization URL
  generateAuthorizationUrl(): { url: string; state: string } {
    const state = crypto.randomBytes(32).toString('hex');
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.apiKey,
      redirect_uri: this.redirectUri,
      state: state,
    });

    // Angel One OAuth endpoint
    const authUrl = `https://api.angelone.in/oauth2/auth?${params.toString()}`;
    
    // Store state for verification
    this.oauthStates.set(state, { state, createdAt: new Date() });
    
    // Clean up old states (older than 10 minutes)
    const now = new Date();
    for (const [key, value] of this.oauthStates.entries()) {
      if (now.getTime() - value.createdAt.getTime() > 10 * 60 * 1000) {
        this.oauthStates.delete(key);
      }
    }

    console.log(`🔶 [ANGEL ONE] Generated authorization URL with state: ${state.substring(0, 8)}...`);
    return { url: authUrl, state };
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(code: string, state: string): Promise<boolean> {
    try {
      // Verify state
      const storedState = this.oauthStates.get(state);
      if (!storedState) {
        console.error('🔴 [ANGEL ONE] Invalid state parameter - possible CSRF attack');
        return false;
      }
      this.oauthStates.delete(state);

      console.log('🔶 [ANGEL ONE] Exchanging authorization code for token...');

      const tokenUrl = 'https://api.angelone.in/oauth2/token';
      const params = new URLSearchParams({
        code: code,
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        redirect_uri: this.redirectUri,
        grant_type: 'authorization_code',
      });

      const response = await axios.post(tokenUrl, params, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        timeout: 10000,
      });

      const tokenData: AngelOneTokenResponse = response.data;
      
      if (tokenData.data?.jwtToken) {
        // Token expires in 24 hours (86400 seconds)
        const expiryTime = new Date(Date.now() + 86400 * 1000);
        
        this.state.accessToken = tokenData.data.jwtToken;
        this.state.tokenExpiry = expiryTime;
        this.state.isAuthenticated = true;
        this.state.lastRefresh = new Date();

        console.log('✅ [ANGEL ONE] Access token obtained successfully');
        console.log(`⏰ [ANGEL ONE] Token expires at: ${expiryTime.toISOString()}`);

        // Fetch user profile
        await this.fetchUserProfile();
        
        return true;
      }

      console.error('🔴 [ANGEL ONE] Failed to get access token');
      return false;
    } catch (error: any) {
      console.error('🔴 [ANGEL ONE] Token exchange error:', error.message);
      if (error.response?.data) {
        console.error('🔴 [ANGEL ONE] Response:', error.response.data);
      }
      return false;
    }
  }

  // Fetch user profile using access token
  private async fetchUserProfile(): Promise<void> {
    try {
      if (!this.state.accessToken) {
        console.error('🔴 [ANGEL ONE] No access token available for profile fetch');
        return;
      }

      console.log('🔶 [ANGEL ONE] Fetching user profile...');

      const response = await axios.get(
        'https://api.angelone.in/rest/secure/angelbroking/user/v1/getProfile',
        {
          headers: {
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.state.accessToken}`,
          },
          timeout: 10000,
        }
      );

      const profileData = response.data;
      
      if (profileData.data) {
        this.state.clientId = profileData.data.clientcode || '';
        this.state.userEmail = profileData.data.email || '';
        this.state.userName = profileData.data.name || '';

        console.log(`✅ [ANGEL ONE] User profile fetched: ${this.state.userName} (${this.state.userEmail})`);
      }
    } catch (error: any) {
      console.error('🔴 [ANGEL ONE] Profile fetch error:', error.message);
      // Non-fatal error - continue even if profile fetch fails
    }
  }

  // Get current authentication status
  getStatus() {
    const isTokenExpired = this.state.tokenExpiry && new Date() > this.state.tokenExpiry;
    
    return {
      connected: this.state.isAuthenticated && !isTokenExpired,
      authenticated: this.state.isAuthenticated && !isTokenExpired,
      accessToken: this.state.isAuthenticated && !isTokenExpired ? this.state.accessToken : null,
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
    };
    this.oauthStates.clear();
    console.log('🔶 [ANGEL ONE] Session disconnected');
  }

  // Get access token for API calls
  getAccessToken(): string | null {
    if (!this.state.isAuthenticated || !this.state.accessToken) {
      return null;
    }

    if (this.state.tokenExpiry && new Date() > this.state.tokenExpiry) {
      console.warn('⚠️ [ANGEL ONE] Access token has expired');
      this.disconnect();
      return null;
    }

    return this.state.accessToken;
  }
}

// Singleton instance
export const angelOneOAuthManager = new AngelOneOAuthManager();
