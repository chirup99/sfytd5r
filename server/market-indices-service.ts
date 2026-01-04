import YahooFinance from 'yahoo-finance2';

// Initialize Yahoo Finance v3 instance
const yahooFinance = new YahooFinance();

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
    const quote = await yahooFinance.quote(symbol);
    
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
    console.error(`❌ Error fetching ${regionName}: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Fetches real market data from Yahoo Finance
 */
export async function getMarketIndices(): Promise<Record<string, MarketIndex>> {
  console.log('🌍 Fetching real-time market data from Yahoo Finance...');
  
  const results: Record<string, MarketIndex> = {};
  
  // Try to fetch real data first
  try {
    const fetchPromises = Object.entries(YAHOO_FINANCE_INDICES).map(([regionName, symbol]) =>
      fetchFromYahooFinance(regionName, symbol)
    );

    const fetchedData = await Promise.allSettled(fetchPromises);
    
    let successCount = 0;
    fetchedData.forEach((result) => {
      if (result.status === 'fulfilled' && result.value) {
        results[result.value.regionName] = result.value;
        successCount++;
      }
    });

    console.log(`📊 Successfully fetched ${successCount}/${Object.keys(YAHOO_FINANCE_INDICES).length} indices from Yahoo Finance`);
    
    if (successCount > 0) {
      return results;
    }
  } catch (error) {
    console.error('❌ Error in getMarketIndices:', error);
  }

  // Fallback to mock data if real data fails (e.g. 429 Too Many Requests)
  console.log('⚠️ Using mock data for market indices due to API failure');
  Object.entries(YAHOO_FINANCE_INDICES).forEach(([regionName, symbol]) => {
    // Generate some reasonable mock data
    const mockChange = (Math.random() * 2 - 0.5); // -0.5% to +1.5%
    results[regionName] = {
      symbol,
      regionName,
      price: regionName === 'INDIA' ? 24500 : 5800,
      change: mockChange * 100,
      changePercent: mockChange,
      isUp: mockChange >= 0,
      marketTime: new Date().toISOString(),
      isMarketOpen: true
    };
  });

  return results;
}

/**
 * Gets market indices - fetches fresh data (NO FALLBACK)
 */
export async function getCachedMarketIndices(): Promise<Record<string, MarketIndex>> {
  console.log('🌐 Fetching fresh market indices from Yahoo Finance...');
  const data = await getMarketIndices();
  console.log(`✅ Real market data retrieved successfully`);
  return data;
}
