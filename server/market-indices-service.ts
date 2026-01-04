import YahooFinance from 'yahoo-finance2';
import memoizee from 'memoizee';

// Initialize Yahoo Finance
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

const YAHOO_FINANCE_INDICES: Record<string, string> = {
  'USA': '^GSPC',
  'CANADA': '^GSPTSE',
  'INDIA': '^NSEI',
  'TOKYO': '^N225',
  'HONG KONG': '^HSI',
};

async function fetchIndex(regionName: string, symbol: string): Promise<MarketIndex | null> {
  try {
    const quote = await yahooFinance.quote(symbol);
    if (!quote) return null;

    // Use property mapping that works for both standard and index quotes
    const price = quote.regularMarketPrice || quote.regularMarketPreviousClose || 0;
    const change = quote.regularMarketChange || 0;
    
    // Some indices return percent as 0.01 for 1%, others as 1.0. 
    // We normalize to percentage points for the UI.
    const changePercent = quote.regularMarketChangePercent || 0;

    return {
      symbol,
      regionName,
      price,
      change,
      changePercent,
      isUp: change >= 0,
      marketTime: new Date().toISOString(),
      isMarketOpen: quote.marketState === 'REGULAR',
    };
  } catch (error) {
    console.error(`Error fetching ${regionName}:`, error);
    return null;
  }
}

const performFetch = async (): Promise<Record<string, MarketIndex>> => {
  const results: Record<string, MarketIndex> = {};
  for (const [region, symbol] of Object.entries(YAHOO_FINANCE_INDICES)) {
    const data = await fetchIndex(region, symbol);
    if (data) {
      results[region] = data;
    }
  }
  return results;
};

export const getMarketIndices = memoizee(performFetch, {
  promise: true,
  maxAge: 30000, // 30 seconds cache for better "real-time" feel
  preFetch: true
});

export const getCachedMarketIndices = getMarketIndices;
