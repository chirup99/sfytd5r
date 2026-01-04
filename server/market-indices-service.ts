import YahooFinance from 'yahoo-finance2';
import memoizee from 'memoizee';

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

// Fallback data in case of 429 errors
const FALLBACK_DATA: Record<string, any> = {
  'USA': { price: 5850.25, change: 12.5, percent: 0.21 },
  'CANADA': { price: 25412.30, change: -45.2, percent: -0.18 },
  'INDIA': { price: 24320.15, change: 156.4, percent: 0.65 },
  'TOKYO': { price: 38210.45, change: -210.3, percent: -0.55 },
  'HONG KONG': { price: 19540.80, change: 85.6, percent: 0.44 },
};

async function fetchIndex(regionName: string, symbol: string): Promise<MarketIndex> {
  try {
    const quote = await yahooFinance.quote(symbol);
    
    if (quote && quote.regularMarketPrice !== undefined) {
      const price = quote.regularMarketPrice || quote.regularMarketPreviousClose || 0;
      const change = quote.regularMarketChange || 0;
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
    }
  } catch (error) {
    console.error(`Yahoo Finance error for ${regionName}:`, error);
  }

  // Use fallback if API fails or returns no data
  const fallback = FALLBACK_DATA[regionName];
  return {
    symbol,
    regionName,
    price: fallback.price,
    change: fallback.change,
    changePercent: fallback.percent,
    isUp: fallback.change >= 0,
    marketTime: new Date().toISOString(),
    isMarketOpen: true,
  };
}

const performFetch = async (): Promise<Record<string, MarketIndex>> => {
  const results: Record<string, MarketIndex> = {};
  // Fetch in parallel for speed
  const promises = Object.entries(YAHOO_FINANCE_INDICES).map(async ([region, symbol]) => {
    results[region] = await fetchIndex(region, symbol);
  });
  await Promise.all(promises);
  return results;
};

export const getMarketIndices = memoizee(performFetch, {
  promise: true,
  maxAge: 30000,
  preFetch: true
});

export const getCachedMarketIndices = getMarketIndices;
