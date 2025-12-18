import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import fileUpload from 'express-fileupload';
import path from "path";
import fs from "fs";
import { registerRoutes } from "./routes";
import { liveWebSocketStreamer } from "./live-websocket-streamer";
import { angelOneApi } from "./angel-one-api";

// Simple logging function (inline to avoid vite dependency in production)
function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

// Serve static files in production (inline to avoid vite dependency)
function serveStatic(app: express.Express) {
  const distPath = path.resolve(process.cwd(), "dist", "public");

  if (!fs.existsSync(distPath)) {
    throw new Error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`,
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}


const app = express();

// Health check endpoint - MUST come first for Cloud Run
app.get('/health', (_req, res) => {
  res.status(200).json({ 
    status: 'healthy', 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// API status endpoint (not the root route)
app.get('/api/status', (_req, res) => {
  res.status(200).json({ 
    status: 'ok',
    message: 'Trading Platform API',
    version: '1.0.0'
  });
});

// Enhanced CORS and security headers
app.use((req, res, next) => {
  const origin = req.headers.origin;
  
  // Define trusted origins - explicitly list all allowed domains for security
  const allowedOrigins = [
    // Production custom domains
    'https://perala.in',
    'https://www.perala.in',
    // Production deployments
    'https://perala-808950990883.us-central1.run.app',
    'https://perala-zup2rskmja-uc.a.run.app',
    // Backend API URL
    process.env.VITE_API_URL ? process.env.VITE_API_URL : null,
    // Frontend URL (for deployments)
    process.env.FRONTEND_URL ? process.env.FRONTEND_URL : null,
    // Replit development domain
    process.env.REPLIT_DEV_DOMAIN ? `https://${process.env.REPLIT_DEV_DOMAIN}` : null,
  ].filter(Boolean);
  
  // Function to check if origin is trusted
  const isTrustedOrigin = (origin: string | undefined): boolean => {
    if (!origin) return false;
    
    // Check exact matches against allowlist
    if (allowedOrigins.includes(origin)) return true;
    
    // Production: Allow all deployment URLs (*.run.app domains with multiple subdomains)
    if (origin.match(/^https:\/\/[a-zA-Z0-9\-\.]+\.run\.app$/)) {
      log(`✅ CORS allowed for deployment domain: ${origin}`);
      return true;
    }
    
    // Development mode only: allow localhost and Replit domains
    if (process.env.NODE_ENV === 'development') {
      if (origin.match(/^https?:\/\/localhost(:\d+)?$/)) return true;
      if (origin.match(/^https:\/\/.*\.replit\.dev$/)) return true;
      if (origin.match(/^https:\/\/.*\.repl\.co$/)) return true;
      return true; // Allow all origins in development mode for testing
    }
    
    return false;
  };
  
  // Set CORS headers for trusted origins only
  if (origin && isTrustedOrigin(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
    log(`✅ CORS allowed for origin: ${origin}`);
  } else if (origin) {
    // Log rejected origins in production for debugging
    log(`❌ CORS rejected for untrusted origin: ${origin}`);
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD');
  res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie, X-CSRF-Token, X-API-Key');
  res.header('Access-Control-Expose-Headers', 'Content-Length, X-JSON-Response-Size');
  res.header('Access-Control-Max-Age', '86400');

  // Additional headers for security
  res.header('X-Frame-Options', 'SAMEORIGIN');
  res.header('X-Content-Type-Options', 'nosniff');
  res.header('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Handle preflight OPTIONS requests immediately
  if (req.method === 'OPTIONS') {
    log(`✅ Preflight OPTIONS request from ${origin || 'unknown'} - responding 204`);
    res.status(204).end();
    return;
  }

  next();
});

// Increase body size limits for image uploads (base64 encoded images can be large)
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: false, limit: '50mb' }));

// File upload middleware for profile images
app.use(fileUpload({
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max file size
  abortOnLimit: true,
  createParentPath: true
}));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Try to register routes, but don't crash if it fails
  let server;
  try {
    server = await registerRoutes(app);
    log('✅ Routes registered successfully');
  } catch (error) {
    console.error('⚠️ Error registering routes:', error);
    console.log('⚠️ Server will start with minimal routes only');
    // Create minimal HTTP server if route registration fails
    const http = await import('http');
    server = http.createServer(app);
  }

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    console.error('Error:', err);
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    try {
      // Dynamic import to avoid loading vite in production
      const { setupVite } = await import("./vite");
      await setupVite(app, server);
    } catch (error) {
      console.error('⚠️ Error setting up Vite:', error);
    }
  } else {
    try {
      serveStatic(app);
    } catch (error) {
      console.error('⚠️ Error serving static files:', error);
      console.log('⚠️ API-only mode activated');
    }
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Cloud Run provides PORT dynamically, default to 8080 for production, 5000 for development
  // this serves both the API and the client.
  const port = parseInt(process.env.PORT || (app.get("env") === "development" ? '5000' : '8080'), 10);

// Configure server options - simple config for Cloud Run compatibility
const listenOptions: any = {
  port,
  host: '0.0.0.0',
};

// Only add reusePort in development (not on Cloud Run)
if (process.env.NODE_ENV === 'development' && process.platform !== 'win32') {
  listenOptions.reusePort = true;
}

server.listen(listenOptions, () => {
    log(`serving on port ${port}`);
    log(`Server ready - environment: ${app.get("env")}`);
    
    // Start background tasks AFTER server is ready and health check passes
    // Delay startup to ensure Cloud Run health check succeeds first
    setTimeout(async () => {
      // AUTO-CONNECT: Angel One API using environment credentials at server startup
      console.log('🔶 [STARTUP] Checking Angel One auto-connect...');
      try {
        // Guard: Skip if already connected
        if (angelOneApi.isConnected()) {
          console.log('✅ [STARTUP] Angel One already connected, skipping auto-connect');
        } else {
          const clientCode = process.env.ANGEL_ONE_CLIENT_CODE;
          const pin = process.env.ANGEL_ONE_PIN;
          const apiKey = process.env.ANGEL_ONE_API_KEY;
          const totpSecret = process.env.ANGEL_ONE_TOTP_SECRET;

          if (clientCode && pin && apiKey && totpSecret) {
            console.log('🔶 [STARTUP] Angel One credentials found, auto-connecting...');
            
            angelOneApi.setCredentials({
              clientCode: clientCode.trim(),
              pin: pin.trim(),
              apiKey: apiKey.trim(),
              totpSecret: totpSecret.trim()
            });

            const session = await angelOneApi.generateSession();
            if (session) {
              console.log('✅ [STARTUP] Angel One auto-connected successfully!');
              console.log(`   Client Code: ${clientCode}`);
              // Notify live price streamer
              liveWebSocketStreamer.onAngelOneAuthenticated();
            } else {
              console.log('⚠️ [STARTUP] Angel One auto-connect failed - session not created');
            }
          } else {
            console.log('⚠️ [STARTUP] Angel One credentials not found in environment, skipping auto-connect');
            console.log(`   CLIENT_CODE: ${clientCode ? 'SET' : 'MISSING'}`);
            console.log(`   PIN: ${pin ? 'SET' : 'MISSING'}`);
            console.log(`   API_KEY: ${apiKey ? 'SET' : 'MISSING'}`);
            console.log(`   TOTP_SECRET: ${totpSecret ? 'SET' : 'MISSING'}`);
          }
        }
      } catch (error: any) {
        console.error('❌ [STARTUP] Angel One auto-connect error:', error.message);
        console.log('⚠️ [STARTUP] Server will continue - user can manually connect later');
      }

      // Start the live WebSocket price streaming system using Angel One API
      console.log('🚀 Initializing live WebSocket price streaming system (Angel One)...');
      liveWebSocketStreamer.startStreaming()
        .then(() => {
          console.log('✅ Live WebSocket price streaming system started successfully');
        })
        .catch((error) => {
          console.error('❌ Failed to start live WebSocket price streaming system:', error);
          console.log('⚠️  Server will continue running without live streaming');
        });
    }, 5000); // Delay background tasks by 5 seconds for Cloud Run health check
  });
})();
