// Angel One OAuth - Simple Credential-Based Authentication
import axios from "axios";

interface AngelOneSession {
  accessToken: string | null;
  clientCode: string | null;
  userName: string | null;
  isAuthenticated: boolean;
}

class AngelOneOAuthManager {
  private session: AngelOneSession = {
    accessToken: null,
    clientCode: null,
    userName: null,
    isAuthenticated: false,
  };

  private clientCode: string;
  private apiKey: string;

  constructor() {
    this.clientCode = process.env.ANGELONE_CLIENT_CODE || "P176266";
    this.apiKey = process.env.ANGELONE_API_KEY || "";

    console.log("✅ [ANGEL ONE] OAuth Manager initialized");
    console.log(`   Client Code: ${this.clientCode}`);
  }

  // Authenticate with Angel One using credentials and TOTP
  async authenticateWithTotp(totp: string, password: string): Promise<{ 
    success: boolean; 
    token?: string; 
    clientCode?: string;
    message?: string;
  }> {
    try {
      console.log("🔶 [ANGEL ONE] Authenticating with TOTP...");

      const response = await axios.post(
        "https://api.angelone.in/rest/auth/angelbroking/user/v1/generateSession",
        {
          clientcode: this.clientCode,
          password: password,
          totp: totp,
        },
        {
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          timeout: 10000,
        }
      );

      if (response.data?.status === true && response.data?.data?.jwtToken) {
        this.session.accessToken = response.data.data.jwtToken;
        this.session.clientCode = this.clientCode;
        this.session.isAuthenticated = true;
        this.session.userName = response.data.data?.userName || this.clientCode;

        console.log("✅ [ANGEL ONE] Successfully authenticated!");
        console.log(`   User: ${this.session.userName}`);

        return {
          success: true,
          token: response.data.data.jwtToken,
          clientCode: this.clientCode,
        };
      }

      console.error("🔴 [ANGEL ONE] Authentication failed - Invalid response");
      return {
        success: false,
        message: response.data?.message || "Authentication failed",
      };
    } catch (error: any) {
      console.error("🔴 [ANGEL ONE] Authentication error:", error.message);
      return {
        success: false,
        message: error.response?.data?.message || "Authentication error: " + error.message,
      };
    }
  }

  // Get current session
  getSession() {
    return {
      authenticated: this.session.isAuthenticated,
      accessToken: this.session.accessToken,
      clientCode: this.session.clientCode,
      userName: this.session.userName,
    };
  }

  // Get access token only
  getAccessToken(): string | null {
    return this.session.accessToken;
  }

  // Disconnect
  disconnect() {
    this.session = {
      accessToken: null,
      clientCode: null,
      userName: null,
      isAuthenticated: false,
    };
    console.log("🔶 [ANGEL ONE] Disconnected");
  }
}

export const angelOneOAuthManager = new AngelOneOAuthManager();
