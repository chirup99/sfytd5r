// Dhan OAuth Implementation - 3-Step Partner OAuth Flow
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
  consentId?: string;
  consentStatus?: string;
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

  private partnerId: string;
  private partnerSecret: string;
  private redirectUri: string;
  private consentIds: Map<string, { id: string; createdAt: Date }> = new Map();

  constructor(partnerId?: string, partnerSecret?: string) {
    // For Partner-level authentication (recommended for partners)
    this.partnerId = partnerId || process.env.DHAN_PARTNER_ID || '';
    this.partnerSecret = partnerSecret || process.env.DHAN_PARTNER_SECRET || '';
    
    // Set redirect URI based on environment
    const baseUrl = (process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS)
      ? `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS}`
      : `http://localhost:5000`;
    this.redirectUri = `${baseUrl}/api/broker/dhan/callback`;

    console.log('🔵 [DHAN] Partner OAuth Manager initialized');
    console.log(`🔵 [DHAN] Redirect URI: ${this.redirectUri}`);
    console.log(`🔵 [DHAN] Partner ID configured: ${this.partnerId ? 'YES' : 'NO'}`);
  }

  // Step 1: Generate Consent (Call Partner API to get consentId)
  async generateConsent(): Promise<{ consentId: string; url: string } | null> {
    try {
      if (!this.partnerId || !this.partnerSecret) {
        console.error('🔴 [DHAN] Partner credentials missing');
        return null;
      }

      console.log('🔵 [DHAN] Step 1: Calling partner/generate-consent API...');
      console.log(`🔵 [DHAN] Using Partner ID: ${this.partnerId.substring(0, 4)}...`);

      // Call Dhan Partner API to generate consent - per official documentation
      // POST to https://auth.dhan.co/partner/generate-consent
      // Headers: partner_id, partner_secret
      const response = await axios.post(
        'https://auth.dhan.co/partner/generate-consent',
        {},
        {
          headers: {
            'partner_id': this.partnerId,
            'partner_secret': this.partnerSecret,
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      const consentData: DhanConsentResponse = response.data;
      
      if (!consentData.consentId) {
        console.error('🔴 [DHAN] No consentId in response:', consentData);
        return null;
      }

      // Step 2: Build login URL using the consentId
      const consentId = consentData.consentId;
      const loginUrl = `https://auth.dhan.co/partner-login?consentId=${encodeURIComponent(consentId)}&redirect_url=${encodeURIComponent(this.redirectUri)}`;

      this.consentIds.set(consentId, {
        id: consentId,
        createdAt: new Date(),
      });

      console.log('✅ [DHAN] Consent generated with ID:', consentId);
      console.log('✅ [DHAN] Consent Status:', consentData.consentStatus);
      console.log('✅ [DHAN] Login URL created:', loginUrl);
      
      return {
        consentId: consentId,
        url: loginUrl,
      };
    } catch (error: any) {
      console.error('🔴 [DHAN] Error generating consent:', error.message);
      if (error.response?.status === 400) {
        console.error('🔴 [DHAN] HTTP 400 Error - Check partner credentials and request format');
      }
      if (error.response?.data) {
        console.error('🔴 [DHAN] API Response:', error.response.data);
      }
      return null;
    }
  }

  // Step 3: Consume Consent (server-side, after user logs in and gets tokenId)
  async consumeConsent(tokenId: string): Promise<boolean> {
    try {
      if (!this.partnerId || !this.partnerSecret) {
        console.error('🔴 [DHAN] Partner credentials not configured');
        return false;
      }

      console.log('🔵 [DHAN] Step 3: Consuming consent with tokenId...');

      // Call Dhan Partner API to consume consent
      // POST to https://auth.dhan.co/partner/consumePartner-consent?tokenId=<TOKEN_ID>
      const response = await axios.post(
        `https://auth.dhan.co/partner/consumePartner-consent?tokenId=${tokenId}`,
        {},
        {
          headers: {
            'partner_id': this.partnerId,
            'partner_secret': this.partnerSecret,
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
    this.consentIds.clear();
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
// Initialize with Partner credentials (DHAN_PARTNER_ID and DHAN_PARTNER_SECRET)
export const dhanOAuthManager = new DhanOAuthManager();
