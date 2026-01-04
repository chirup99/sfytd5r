import yahooFinance from 'yahoo-finance2';
import memoizee from 'memoizee';

export interface MarketIndex {
  symbol: string;
  regionName: string;
  price: number;
  change: number;
  changePercent: number;
  isUp: boolean;
  marketTime: string;
  isMarketOpen: boolean;
}

// Yahoo Finance symbols for major global indices
const YAHOO_INDICES: Record<string, string> = {
  'USA': '^GSPC',        // S&P 500
  'CANADA': '^GSPTSE',   // S&P/TSX Composite
  'INDIA': '^NSEI',      // NIFTY 50
  'TOKYO': '^N225',      // Nikkei 225
  'HONG KONG': '^HSI',   // Hang Seng Index
};

async function fetchFromYahoo(regionName: string, symbol: string): Promise<MarketIndex | null> {
  try {
    // yahoo-finance2 v2+ default export is already configured
    const quote = await yahooFinance.quote(symbol);
    
    if (!quote) {
      console.warn(`⚠️ Yahoo Finance returned no data for ${regionName} (${symbol})`);
      return null;
    }

    const price = quote.regularMarketPrice || 0;
    const change = quote.regularMarketChange || 0;
    const changePercent = quote.regularMarketChangePercent || 0;

    return {
      symbol: quote.symbol || symbol,
      regionName,
      price,
      change,
      changePercent,
      isUp: change >= 0,
      marketTime: quote.regularMarketTime?.toISOString() || new Date().toISOString(),
      isMarketOpen: quote.marketState === 'REGULAR',
    };
  } catch (error: any) {
    if (error.message?.includes('429')) {
      console.error(`🛑 Yahoo Finance Rate Limited (429) for ${regionName}. Caching will help.`);
    } else {
      console.error(`❌ Yahoo Finance Error for ${regionName} (${symbol}):`, error.message);
    }
    return null;
  }
}

const performFetch = async (): Promise<Record<string, MarketIndex>> => {
  const results: Record<string, MarketIndex> = {};
  
  // Sequential fetch with delay to avoid bursting and 429s
  for (const [region, symbol] of Object.entries(YAHOO_INDICES)) {
    const data = await fetchFromYahoo(region, symbol);
    if (data) {
      results[region] = data;
    }
    await new Promise(resolve => setTimeout(resolve, 500)); // Increased delay to 500ms
  }
  
  // Ensure we have entries for all regions
  for (const region of Object.keys(YAHOO_INDICES)) {
    if (!results[region]) {
      results[region] = {
        symbol: region,
        regionName: region,
        price: 0,
        change: 0,
        changePercent: 0,
        isUp: true,
        marketTime: new Date().toISOString(),
        isMarketOpen: false
      };
    }
  }

  return results;
};

// CRITICAL: Cache for 15 minutes (900,000ms) to strictly avoid 429 errors
// This matches the client-side polling interval
export const getMarketIndices = memoizee(performFetch, {
  promise: true,
  maxAge: 900000, 
  preFetch: true
});

export const getCachedMarketIndices = getMarketIndices;
