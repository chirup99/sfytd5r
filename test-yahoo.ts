import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

async function test() {
  try {
    const symbol = '^GSPC';
    console.log(`Testing symbol: ${symbol}`);
    const quote = await yahooFinance.quote(symbol);
    console.log('Quote result:', JSON.stringify(quote, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

test();
