import YahooFinance from 'yahoo-finance2';
import memoizee from 'memoizee';

// Initialize Yahoo Finance v3 instance
// Using suppressNotices to keep logs clean
const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

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

// Yahoo Finance symbols for global indices
const YAHOO_FINANCE_INDICES: Record<string, string> = {
  'USA': '^GSPC',           // S&P 500
  'CANADA': '^GSPTSE',      // TSX Composite
  'INDIA': '^NSEI',         // Nifty 50
  'TOKYO': '^N225',         // Nikkei 225
  'HONG KONG': '^HSI',      // Hang Seng
};

/**
 * Fetches market data from Yahoo Finance using yahoo-finance2 library v3
 */
async function fetchFromYahooFinance(
  regionName: string,
  symbol: string
): Promise<MarketIndex | null> {
  try {
    console.log(`📡 Fetching ${regionName} (${symbol}) from Yahoo Finance...`);
    
    // Use yahoo-finance2 v3 instance
    const quote = await yahooFinance.quote(symbol, { validateResult: false });
    
    if (!quote) {
      console.warn(`⚠️ No quote data found for ${regionName}`);
      return null;
    }

    // Access properties safely with type assertions
    const quoteData = quote as any;
    const regularMarketPrice = quoteData.regularMarketPrice || quoteData.regularMarketPreviousClose || 0;
    const regularMarketChange = quoteData.regularMarketChange || 0;
    const changePercent = quoteData.regularMarketChangePercent || 0;
    const marketState = quoteData.marketState || '';

    if (regularMarketPrice > 0 || regularMarketChange !== 0) {
      console.log(`✅ ${regionName}: ${regularMarketPrice.toFixed(2)} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(2)}%)`);

      return {
        symbol,
        regionName,
        price: regularMarketPrice,
        change: regularMarketChange,
        changePercent: changePercent,
        isUp: changePercent >= 0,
        marketTime: new Date().toISOString(),
        isMarketOpen: marketState === 'REGULAR' || marketState === 'PRE' || marketState === 'POST',
      };
    }

    console.warn(`⚠️ Invalid price for ${regionName}: ${regularMarketPrice}`);
    return null;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error(`❌ Error fetching ${regionName}: ${errorMsg}`);
    
    // If we hit 429, we should propagate it up so we know to rely on cache
    if (errorMsg.includes('429')) {
      throw error;
    }
    return null;
  }
}

/**
 * Core fetching logic with parallel requests
 */
async function performMarketIndicesFetch(): Promise<Record<string, MarketIndex>> {
  console.log('🌍 Executing fresh parallel fetch from Yahoo Finance...');
  
  const results: Record<string, MarketIndex> = {};
  const fetchPromises = Object.entries(YAHOO_FINANCE_INDICES).map(([regionName, symbol]) =>
    fetchFromYahooFinance(regionName, symbol)
  );

  const fetchedData = await Promise.allSettled(fetchPromises);
  
  let successCount = 0;
  fetchedData.forEach((result) => {
    if (result.status === 'fulfilled' && result.value) {
      results[result.value.regionName] = result.value;
      successCount++;
    } else if (result.status === 'rejected') {
      const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
      console.error('❌ Promise rejected during fetch:', reason);
    }
  });

  // If we couldn't fetch anything, we fail so memoizee doesn't cache an empty result
  if (successCount === 0) {
    throw new Error('Failed to fetch any market data from Yahoo Finance');
  }

  return results;
}

/**
 * Memoized version of the fetch function to prevent 429 errors
 * Cache for 5 minutes (300000ms)
 * This is the proper way to handle rate limits: fetch once, share result
 */
const getMemoizedMarketIndices = memoizee(performMarketIndicesFetch, {
  promise: true,
  maxAge: 300000, // 5 minutes
  preFetch: true
});

/**
 * Gets market indices - using server-side caching to respect API limits
 */
export async function getCachedMarketIndices(): Promise<Record<string, MarketIndex>> {
  try {
    console.log('🌐 Requesting market indices (respecting rate limits via cache)...');
    return await getMemoizedMarketIndices();
  } catch (error) {
    console.error('❌ Error in getCachedMarketIndices:', error);
    
    // If we have a massive failure, we should handle it gracefully
    // But since the user asked to NOT use mock data, we will propagate the error
    // and let the system handle it at the route level.
    throw error;
  }
}

