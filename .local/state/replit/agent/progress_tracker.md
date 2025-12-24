# Project Import Progress Tracker - Dhan OAuth Fixed

## Import Workflow Status - COMPLETED

[x] 1. Install the required packages  
[x] 2. Restart the workflow to see if the project is working  
[x] 3. Verify the project is working using the feedback tool  
[x] 4. Inform user the import is completed and they can start building

## Zerodha Profile Fetch - COMPLETED

[x] Removed complex/wrong code that was overcomplicating the fetch
[x] Fixed backend to return `userName` instead of `username` to match frontend expectations
[x] Frontend properly reads `data.profile.userId` and `data.profile.userName`
[x] Workflow restarted - now properly fetching live user data from Zerodha API

### Simple Implementation:

**Backend (server/routes.ts line 20231):**
- Calls Zerodha API: `GET https://api.kite.trade/user/profile`
- Auth header: `token api_key:access_token` (proper format per Zerodha Kite API v3 docs)
- Returns profile object with `userId` and `userName` extracted from API response

**Frontend (client/src/pages/home.tsx line 3880):**
- Calls `/api/broker/zerodha/profile` with Bearer token
- Extracts `data.profile.userId` and `data.profile.userName`
- Displays both values: "id: {userId} | name: {userName}"
- No more hardcoded IDs, values update when user connects to broker

### How It Works:
1. User authenticates with Zerodha broker
2. Frontend fetches `/api/broker/zerodha/profile` with access token
3. Backend queries Zerodha: `https://api.kite.trade/user/profile`
4. Zerodha returns user_id and user_name in response
5. Backend extracts and returns as `userId` and `userName`
6. Frontend receives and displays live data: e.g., "id: AB1234 | name: AxAx Bxx"

**Status:** ✅ Complete and working. User ID and name now display correctly from live Zerodha API data.

## Dhan Partner OAuth Implementation - READY

To enable: Add `DHAN_PARTNER_ID` and `DHAN_PARTNER_SECRET` to Secrets tab.

## Orders & Positions Dialog Profile Persistence - FIXED (Dec 24, 2025 11:54)

**Problem:** Broker profile (userId and userName) displayed "N/A" after page restart, even though orders were displaying correctly.

**Root Cause:** 
- Profile was only fetched when the popup callback returned the token
- On page reload, token was restored from localStorage, but profile fetch was NOT triggered
- userName was never being saved to localStorage, so it was lost on reload

**Solution Applied:**
[x] Added localStorage restoration of userName on component mount (line 3765)
[x] Modified popup callback to save userName to localStorage when profile is fetched (line 3887)
[x] Updated the profile fetch useEffect (line 3768) to:
  - Call our backend endpoint `/api/broker/zerodha/profile` instead of just Kite API
  - Fetch both userId and userName together
  - Save both to localStorage for persistence across reloads
  - Auto-trigger this fetch whenever zerodhaAccessToken changes (including on reload)

**Changed Files:**
- client/src/pages/home.tsx: 
  - Lines 3765-3768: Added userName restoration from localStorage on mount
  - Lines 3887-3888: Added userName save to localStorage in popup callback
  - Lines 3768-3806: Rewrote profile fetch useEffect to call backend endpoint and persist both values

**Status:** ✅ FIXED. Profile now persists across page reloads and displays correctly on initial load and after restart.

## Latest Migration Check - December 24, 2025

[x] Verified dotenv package installed via npm install
[x] Workflow "Start application" restarted and running successfully
[x] Express server serving on port 5000
[x] Angel One broker auto-connected with live WebSocket streaming
[x] Real-time price data streaming (BANKNIFTY, SENSEX, GOLD)
[x] All services initialized successfully
[x] Broker profile persistence fix deployed and verified

## Orders & Positions Funds Display - UPDATED (Dec 24, 2025 12:15)

**Changes Made:**
[x] Restored brokerFunds state variable to Orders & Positions dialog
[x] Re-added useEffect for restoring funds from localStorage on component mount
[x] Re-added useEffect for fetching funds when dialog opens (with 2-second polling)
[x] Restored funds display in dialog header showing "Available Funds" with amount
[x] Updated backend `/api/broker/zerodha/margins` to use `.net` field instead of `available.cash`

**Backend Update (server/routes.ts line 20169):**
- Changed from: `const availableCash = equity.available?.cash || 0;`
- Changed to: `const availableCash = equity.net || 0;`
- Now properly extracts the `.net` field from Zerodha API response at `data.equity.net`
- Zerodha API endpoint: `https://api.kite.trade/user/margins`
- Response format: `{ "data": { "equity": { "net": 99725.05 } } }`

**Frontend Display:**
- Shows "Available Funds" label with formatted amount in dialog header
- Loading state shows "Loading funds..." while fetching
- Auto-refreshes every 2 seconds while dialog is open
- Persists value to localStorage for offline access
- Displays formatted as: ₹{amount} in en-IN locale

**Status:** ✅ COMPLETE. Funds display now properly shows net available margin from Zerodha API using the `.net` field value. Workflow restarted successfully with no errors.