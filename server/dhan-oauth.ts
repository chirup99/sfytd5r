// Dhan OAuth Implementation - 3-Step OAuth Flow (Fixed)
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
  refreshToken: string | null;
}

interface DhanConsentResponse {
  consentAppId?: string;
  consentAppStatus?: string;
  status?: string;
}

interface DhanTokenResponse {
  dhanClientId?: string;
  dhanClientName?: string;
  dhanClientUcc?: string;
  accessToken?: string;
  expiryTime?: string;
  status?: string;
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
    refreshToken: null,
  };

  private apiKey: string;
  private apiSecret: string;
  private redirectUri: string;
  private consentAppIds: Map<string, { id: string; createdAt: Date }> = new Map();

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
    console.log(`🔵 [DHAN] API Key configured: ${this.apiKey ? 'YES' : 'NO'}`);
  }

  // Step 1: Generate Login URL (server-side)
  async generateConsent(): Promise<{ consentAppId: string; url: string } | null> {
    try {
      if (!this.apiKey || !this.apiSecret) {
        console.error('🔴 [DHAN] Credentials missing');
        return null;
      }

      const consentAppId = this.apiKey;
      const loginUrl = `https://auth.dhan.co/user-login?client_id=${encodeURIComponent(this.apiKey)}&redirect_uri=${encodeURIComponent(this.redirectUri)}`;

      this.consentAppIds.set(consentAppId, {
        id: consentAppId,
        createdAt: new Date(),
      });

      console.log('✅ [DHAN] Login URL generated:', loginUrl);
      return {
        consentAppId: consentAppId,
        url: loginUrl,
      };
    } catch (error: any) {
      console.error('🔴 [DHAN] Error generating login URL:', error.message);
      return null;
    }
  }

  // Step 3: Consume Consent (server-side, after user logs in and gets tokenId)
  async consumeConsent(tokenId: string): Promise<boolean> {
    try {
      if (!this.apiKey || !this.apiSecret) {
        console.error('🔴 [DHAN] API Key or Secret not configured');
        return false;
      }

      console.log('🔵 [DHAN] Consuming consent with tokenId...');

      const response = await axios.post(
        `https://auth.dhan.co/app/consumeApp-consent?tokenId=${tokenId}`,
        {},
        {
          headers: {
            'X-API-KEY': this.apiKey,
            'X-API-SECRET': this.apiSecret,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const tokenData: DhanTokenResponse = response.data;
      
      if (tokenData.accessToken) {
        // Parse expiry time
        const expiryTime = tokenData.expiryTime ? new Date(tokenData.expiryTime) : new Date(Date.now() + 86400 * 1000);
        
        this.state.accessToken = tokenData.accessToken;
        this.state.clientId = tokenData.dhanClientId || '';
        this.state.userName = tokenData.dhanClientName || '';
        this.state.tokenExpiry = expiryTime;
        this.state.isAuthenticated = true;
        this.state.lastRefresh = new Date();

        console.log('✅ [DHAN] Access token obtained successfully');
        console.log(`✅ [DHAN] Client ID: ${this.state.clientId}`);
        console.log(`⏰ [DHAN] Token expires at: ${expiryTime.toISOString()}`);
        
        return true;
      }

      console.error('🔴 [DHAN] Failed to get access token');
      console.error('🔴 [DHAN] Response:', tokenData);
      return false;
    } catch (error: any) {
      console.error('🔴 [DHAN] Token consumption error:', error.message);
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
      refreshToken: null,
    };
    this.consentAppIds.clear();
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
