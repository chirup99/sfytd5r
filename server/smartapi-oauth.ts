// Smart API OAuth Manager - Configured with correct redirect URL
import crypto from 'crypto';

interface SmartAPISession {
  clientCode: string;
  jwtToken: string;
  feedToken: string;
  refreshToken?: string;
}

class SmartAPIOAuthManager {
  private redirectUri: string;
  private appId: string;

  constructor() {
    // Get Replit domain for redirect URI
    const baseUrl = (process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS)
      ? `https://${process.env.REPLIT_DEV_DOMAIN || process.env.REPLIT_DOMAINS}`
      : `http://localhost:5000`;
    
    this.redirectUri = `${baseUrl}/api/smartapi/callback`;
    this.appId = process.env.SMARTAPI_APP_ID || 'web-app';

    console.log('🔵 [SMART API] OAuth Manager initialized');
    console.log(`🔵 [SMART API] Redirect URI: ${this.redirectUri}`);
    console.log(`🔵 [SMART API] App ID: ${this.appId}`);
  }

  /**
   * Get the correct configuration for SmartAPI dashboard
   * This should be entered in the SmartAPI app configuration:
   * - App Name: Your application name
   * - Redirect URL: The URL below
   * - Primary Static IP: Will be your Replit domain IP
   */
  getConfiguration() {
    return {
      appName: process.env.SMARTAPI_APP_NAME || 'trading-app',
      redirectUrl: this.redirectUri,
      postbackUrl: `${this.redirectUri.replace('/callback', '/postback')}`,
      primaryStaticIp: this.getPrimaryStaticIP(),
      description: 'SmartAPI OAuth Configuration for Angel One Trading Platform'
    };
  }

  /**
   * Extract primary static IP from Replit domain
   * For Replit: Use the full domain as the IP reference
   */
  private getPrimaryStaticIP(): string {
    const domain = process.env.REPLIT_DOMAINS || process.env.REPLIT_DEV_DOMAIN || 'localhost:5000';
    console.log(`🔵 [SMART API] Primary Static IP/Domain: ${domain}`);
    return domain;
  }

  /**
   * Get redirect URI for SmartAPI authorization
   */
  getRedirectUri(): string {
    return this.redirectUri;
  }

  /**
   * Get configuration for logging
   */
  logConfiguration(): void {
    const config = this.getConfiguration();
    console.log('\n' + '='.repeat(70));
    console.log('🔵 [SMART API] Configuration Summary');
    console.log('='.repeat(70));
    console.log(`App Name:              ${config.appName}`);
    console.log(`Redirect URL:          ${config.redirectUrl}`);
    console.log(`Postback URL:          ${config.postbackUrl}`);
    console.log(`Primary Static IP:     ${config.primaryStaticIp}`);
    console.log('='.repeat(70));
    console.log('\nEnter the above details in SmartAPI Dashboard:');
    console.log('1. Go to: https://smartapi.angelbroking.com/');
    console.log('2. Click "Apps" -> "Add New App"');
    console.log('3. Fill in the Redirect URL and Primary Static IP from above');
    console.log('='.repeat(70) + '\n');
  }
}

// Singleton instance
export const smartAPIManager = new SmartAPIOAuthManager();
