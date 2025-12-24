// Dhan OAuth Implementation - Request Token Flow
import axios from 'axios';
import crypto from 'crypto';

interface DhanOAuthState {
  accessToken: string | null;
  clientId: string | null;
  userEmail: string | null;
  userName: string | null;
  isAuthenticated: boolean;
  tokenExpiry: Date | null;
  lastRefresh: Date | null;
  requestToken: string | null;
}

interface DhanTokenResponse {
  status: boolean;
  data?: {
    authToken: string;
    refreshToken: string;
    userId: string;
  };
  message?: string;
}

class DhanOAuthManager {
  private state: DhanOAuthState = {
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
  private redirectUri: string;
  private requestTokens: Map<string, { token: string; createdAt: Date }> = new Map();

  constructor(apiKey?: string, apiSecret?: string) {
    this.apiKey = apiKey || process.env.DHAN_API_KEY || '';
    this.apiSecret = apiSecret || process.env.DHAN_API_SECRET || '';
    
    // Set redirect URI based on environment
    const baseUrl = (process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS)
      ? `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS}`
      : `http://localhost:5000`;
    this.redirectUri = `${baseUrl}/api/broker/dhan/callback`;

    console.log('🔵 [DHAN] OAuth Manager initialized');
    console.log(`🔵 [DHAN] Redirect URI: ${this.redirectUri}`);
  }

  // Generate login URL using request_token flow
  generateAuthorizationUrl(): { url: string; requestToken: string } {
    const requestToken = crypto.randomBytes(32).toString('hex');
    
    // Store request token for verification
    this.requestTokens.set(requestToken, { token: requestToken, createdAt: new Date() });
    
    // Clean up old tokens (older than 15 minutes)
    const now = new Date();
    for (const [key, value] of this.requestTokens.entries()) {
      if (now.getTime() - value.createdAt.getTime() > 15 * 60 * 1000) {
        this.requestTokens.delete(key);
      }
    }

    // Build Dhan login URL
    const params = new URLSearchParams({
      client_id: this.apiKey,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      state: requestToken,
    });

    // Dhan OAuth endpoint
    const authUrl = `https://api.dhan.co/oauth/authorize?${params.toString()}`;
    
    console.log(`🔵 [DHAN] Generated login URL with request token: ${requestToken.substring(0, 8)}...`);
    return { url: authUrl, requestToken };
  }

  // Exchange authorization code for access token
  async exchangeCodeForToken(code: string, state: string): Promise<boolean> {
    try {
      // Verify request token exists
      const storedToken = this.requestTokens.get(state);
      if (!storedToken) {
        console.error('🔴 [DHAN] Invalid state parameter');
        return false;
      }
      this.requestTokens.delete(state);

      console.log('🔵 [DHAN] Exchanging authorization code for token...');

      // Use Dhan's token exchange endpoint
      const tokenUrl = 'https://api.dhan.co/oauth/token';
      
      const payload = {
        grant_type: 'authorization_code',
        code: code,
        client_id: this.apiKey,
        client_secret: this.apiSecret,
        redirect_uri: this.redirectUri,
      };

      const response = await axios.post(tokenUrl, payload, {
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      });

      const tokenData: DhanTokenResponse = response.data;
      
      if (tokenData.data?.authToken) {
        // Token expires in 24 hours (86400 seconds)
        const expiryTime = new Date(Date.now() + 86400 * 1000);
        
        this.state.accessToken = tokenData.data.authToken;
        this.state.requestToken = state;
        this.state.tokenExpiry = expiryTime;
        this.state.isAuthenticated = true;
        this.state.lastRefresh = new Date();
        this.state.clientId = tokenData.data.userId || '';

        console.log('✅ [DHAN] Access token obtained successfully');
        console.log(`⏰ [DHAN] Token expires at: ${expiryTime.toISOString()}`);

        // Fetch user profile
        await this.fetchUserProfile();
        
        return true;
      }

      console.error('🔴 [DHAN] Failed to get access token');
      console.error('🔴 [DHAN] Response:', tokenData);
      return false;
    } catch (error: any) {
      console.error('🔴 [DHAN] Token exchange error:', error.message);
      if (error.response?.data) {
        console.error('🔴 [DHAN] Response:', error.response.data);
      }
      return false;
    }
  }

  // Fetch user profile using access token
  private async fetchUserProfile(): Promise<void> {
    try {
      if (!this.state.accessToken) {
        console.error('🔴 [DHAN] No access token available for profile fetch');
        return;
      }

      console.log('🔵 [DHAN] Fetching user profile...');

      const response = await axios.get(
        'https://api.dhan.co/user/profile',
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
        this.state.userEmail = profileData.data.email || '';
        this.state.userName = profileData.data.name || '';

        console.log(`✅ [DHAN] User profile fetched: ${this.state.userName} (${this.state.userEmail})`);
      }
    } catch (error: any) {
      console.error('🔴 [DHAN] Profile fetch error:', error.message);
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
      requestToken: null,
    };
    this.requestTokens.clear();
    console.log('🔵 [DHAN] Session disconnected');
  }

  // Get access token for API calls
  getAccessToken(): string | null {
    if (!this.state.isAuthenticated || !this.state.accessToken) {
      return null;
    }

    if (this.state.tokenExpiry && new Date() > this.state.tokenExpiry) {
      console.warn('⚠️ [DHAN] Access token has expired');
      this.disconnect();
      return null;
    }

    return this.state.accessToken;
  }
}

// Singleton instance
export const dhanOAuthManager = new DhanOAuthManager();
