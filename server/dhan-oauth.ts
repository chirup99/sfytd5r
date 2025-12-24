// Dhan OAuth Implementation - 3-Step Consent Flow
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
  consentToken: string | null;
}

interface DhanConsentResponse {
  status?: boolean;
  consentAppId?: string;
  message?: string;
}

interface DhanTokenResponse {
  status?: boolean;
  data?: {
    authToken?: string;
    refreshToken?: string;
    userId?: string;
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
    consentToken: null,
  };

  private apiKey: string;
  private apiSecret: string;
  private redirectUri: string;
  private consentTokens: Map<string, { token: string; createdAt: Date }> = new Map();

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
    console.log(`🔵 [DHAN] API Key (Client ID) configured: ${this.apiKey ? 'YES' : 'NO'}`);
  }

  // Step 1: Generate consent token using app credentials
  async generateConsentToken(): Promise<string | null> {
    try {
      console.log('🔵 [DHAN] Step 1: Generating consent token...');

      const response = await axios.post(
        'https://auth.dhan.co/app/generate-consent',
        {},
        {
          headers: {
            'app_id': this.apiKey,
            'app_secret': this.apiSecret,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const data: DhanConsentResponse = response.data;
      
      if (data.consentAppId) {
        console.log(`✅ [DHAN] Consent token generated: ${data.consentAppId.substring(0, 8)}...`);
        return data.consentAppId;
      }

      console.error('🔴 [DHAN] Failed to generate consent token');
      console.error('🔴 [DHAN] Response:', data);
      return null;
    } catch (error: any) {
      console.error('🔴 [DHAN] Consent generation error:', error.message);
      if (error.response?.data) {
        console.error('🔴 [DHAN] Response:', error.response.data);
      }
      return null;
    }
  }

  // Generate login URL using consent token (Step 2 preparer)
  async generateAuthorizationUrl(): Promise<{ url: string; consentToken: string } | null> {
    try {
      const consentToken = await this.generateConsentToken();
      
      if (!consentToken) {
        throw new Error('Failed to generate consent token');
      }

      // Store consent token for verification
      this.consentTokens.set(consentToken, { token: consentToken, createdAt: new Date() });
      
      // Clean up old tokens (older than 15 minutes)
      const now = new Date();
      const keysToDelete: string[] = [];
      for (const [key, value] of this.consentTokens.entries()) {
        if (now.getTime() - value.createdAt.getTime() > 15 * 60 * 1000) {
          keysToDelete.push(key);
        }
      }
      keysToDelete.forEach(key => this.consentTokens.delete(key));

      // Step 2: Build login URL with consent token
      const loginUrl = `https://auth.dhan.co/consent-login?consentId=${consentToken}`;
      
      console.log(`🔵 [DHAN] Generated login URL with consent token`);
      return { url: loginUrl, consentToken };
    } catch (error: any) {
      console.error('🔴 [DHAN] Authorization URL generation failed:', error.message);
      return null;
    }
  }

  // Step 3: Exchange token ID for access token (called after user logs in)
  async exchangeTokenForAccessToken(tokenId: string, consentId: string): Promise<boolean> {
    try {
      // Verify consent token exists
      const storedToken = this.consentTokens.get(consentId);
      if (!storedToken) {
        console.error('🔴 [DHAN] Invalid consent ID');
        return false;
      }
      this.consentTokens.delete(consentId);

      console.log('🔵 [DHAN] Step 3: Exchanging token ID for access token...');

      const payload = {
        tokenId: tokenId,
      };

      const response = await axios.post(
        'https://api.dhan.co/v2/token',
        payload,
        {
          headers: {
            'app_id': this.apiKey,
            'app_secret': this.apiSecret,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const tokenData: DhanTokenResponse = response.data;
      
      if (tokenData.data?.authToken) {
        // Token expires in 24 hours (86400 seconds)
        const expiryTime = new Date(Date.now() + 86400 * 1000);
        
        this.state.accessToken = tokenData.data.authToken;
        this.state.consentToken = consentId;
        this.state.tokenExpiry = expiryTime;
        this.state.isAuthenticated = true;
        this.state.lastRefresh = new Date();
        this.state.clientId = tokenData.data.userId || '';

        console.log('✅ [DHAN] Access token obtained successfully');
        console.log(`⏰ [DHAN] Token expires at: ${expiryTime.toISOString()}`);

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
      consentToken: null,
    };
    this.consentTokens.clear();
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
