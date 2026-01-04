import axios from 'axios';
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

// MSN Standard IDs for Global Indices (More stable than internal security IDs)
const MSN_INDICES: Record<string, string> = {
  'USA': '126.1.!SPX',        // S&P 500
  'CANADA': '134.1.!GSPTSE',   // S&P/TSX Composite
  'INDIA': '155.1.!NSEI',      // Nifty 50
  'TOKYO': '153.1.!N225',      // Nikkei 225
  'HONG KONG': '151.1.!HSI',   // Hang Seng
};

async function fetchFromMSN(regionName: string, secId: string): Promise<MarketIndex | null> {
  try {
    // Standard MSN quote API with explicit market type for indices
    const url = `https://assets.msn.com/service/finance/quotes/getquotes?apikey=0Q67sPRZSO02i9AFYvMra&ocid=finance-utils-peregrine&cm=en-in&it=Stocks&ids=${secId}`;
    
    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Referer': 'https://www.msn.com/en-in/finance/markets/indices',
        'Origin': 'https://www.msn.com'
      },
      timeout: 10000
    });

    // Extract data from standard MSN responses (usually response.data[0] or response.data.responses[0].value[0])
    let data;
    if (Array.isArray(response.data)) {
      data = response.data[0];
    } else if (response.data?.responses?.[0]?.value?.[0]) {
      data = response.data.responses[0].value[0];
    } else if (response.data?.value?.[0]) {
      data = response.data.value[0];
    }
    
    if (!data) {
      console.warn(`⚠️ MSN returned empty response for ${regionName} (${secId})`);
      return null;
    }

    const price = parseFloat(data.price || data.last || data.lastPrice || data.lp) || 0;
    const change = parseFloat(data.priceChange || data.change || data.chg || data.c) || 0;
    const changePercent = parseFloat(data.priceChangePercent || data.percentChange || data.pChg || data.cp) || 0;

    if (price === 0 && changePercent === 0) {
      console.warn(`⚠️ MSN returned zero values for ${regionName} (${secId})`);
      return null;
    }

    return {
      symbol: data.symbol || secId,
      regionName,
      price,
      change,
      changePercent,
      isUp: change >= 0,
      marketTime: data.lastUpdate || new Date().toISOString(),
      isMarketOpen: data.marketState === 'Open' || data.marketState === 'Regular' || data.marketState === 'Trading',
    };
  } catch (error: any) {
    console.error(`❌ MSN Error for ${regionName} (${secId}):`, error.message);
    return null;
  }
}

    if (price === 0 && changePercent === 0) {
      console.warn(`⚠️ MSN returned zero values for ${regionName} (${secId}) - likely invalid parsing`);
      console.log('DEBUG MSN Data keys:', Object.keys(data));
      return null;
    }

    return {
      symbol: data.symbol || secId,
      regionName,
      price,
      change,
      changePercent,
      isUp: change >= 0,
      marketTime: data.lastUpdate || new Date().toISOString(),
      isMarketOpen: data.marketState === 'Open' || data.marketState === 'Regular' || data.marketState === 'Trading',
    };
  } catch (error: any) {
    console.error(`❌ MSN Error for ${regionName} (${secId}):`, error.message);
    return null;
  }
}

const performFetch = async (): Promise<Record<string, MarketIndex>> => {
  const results: Record<string, MarketIndex> = {};
  
  // Parallel fetch for speed
  const promises = Object.entries(MSN_INDICES).map(async ([region, secId]) => {
    const data = await fetchFromMSN(region, secId);
    if (data) {
      results[region] = data;
    }
  });
  
  await Promise.all(promises);
  
  // No Fallbacks - strictly MSN per user request
  // If MSN fails, the frontend will show zero/loading instead of "fake" data
  for (const region of Object.keys(MSN_INDICES)) {
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

// Production cache: 1 minute
export const getMarketIndices = memoizee(performFetch, {
  promise: true,
  maxAge: 60000, 
  preFetch: true
});

export const getCachedMarketIndices = getMarketIndices;
