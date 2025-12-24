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

  // Step 1: Generate Consent (server-side)
  async generateConsent(): Promise<{ consentAppId: string; url: string } | null> {
    try {
      if (!this.apiKey || !this.apiSecret) {
        console.error('🔴 [DHAN] API Key or Secret not configured');
        return null;
      }

      console.log('🔵 [DHAN] Generating consent...');

      console.log('🔵 [DHAN] Request URL: https://auth.dhan.co/app/generate-consent?client_id=' + this.apiKey);
      console.log('🔵 [DHAN] Request Headers:', {
        app_id: this.apiKey ? '***' : 'MISSING',
        app_secret: this.apiSecret ? '***' : 'MISSING',
      });

      const response = await axios.post(
        'https://auth.dhan.co/app/generate-consent?client_id=' + this.apiKey,
        {},
        {
          headers: {
            'app_id': this.apiKey,
            'app_secret': this.apiSecret,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      console.log('🔵 [DHAN] Response status:', response.status);
      console.log('🔵 [DHAN] Response data:', response.data);

      const data: DhanConsentResponse = response.data;
      
      if (data.consentAppId) {
        // Store consent app ID for verification later
        this.consentAppIds.set(data.consentAppId, {
          id: data.consentAppId,
          createdAt: new Date(),
        });

        // Clean up old consent IDs (older than 10 minutes)
        const now = new Date();
        const keysToDelete: string[] = [];
        this.consentAppIds.forEach((value, key) => {
          if (now.getTime() - value.createdAt.getTime() > 10 * 60 * 1000) {
            keysToDelete.push(key);
          }
        });
        keysToDelete.forEach(key => this.consentAppIds.delete(key));

        // Build login URL for Step 2
        const loginUrl = `https://auth.dhan.co/login/consentApp-login?consentAppId=${data.consentAppId}`;

        console.log('✅ [DHAN] Consent generated successfully');
        console.log(`✅ [DHAN] Consent App ID: ${data.consentAppId.substring(0, 8)}...`);

        return {
          consentAppId: data.consentAppId,
          url: loginUrl,
        };
      }

      console.error('🔴 [DHAN] Failed to generate consent - no consentAppId in response');
      console.error('🔴 [DHAN] Response:', data);
      return null;
    } catch (error: any) {
      console.error('🔴 [DHAN] Consent generation error:', error.message);
      if (error.response?.status) {
        console.error('🔴 [DHAN] HTTP Status:', error.response.status);
        console.error('🔴 [DHAN] Response Data:', error.response.data);
        console.error('🔴 [DHAN] Response Headers:', error.response.headers);
      } else if (error.request) {
        console.error('🔴 [DHAN] No response received - request error');
        console.error('🔴 [DHAN] Request:', error.request);
      } else {
        console.error('🔴 [DHAN] Error details:', error);
      }
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
            'app_id': this.apiKey,
            'app_secret': this.apiSecret,
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
