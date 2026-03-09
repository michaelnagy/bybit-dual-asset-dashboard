import { NextResponse } from 'next/server';
import { RestClientV5 } from 'bybit-api';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'Earn';

  if (!process.env.BYBIT_API_KEY || !process.env.BYBIT_API_SECRET) {
    return NextResponse.json({ error: 'Missing Bybit API Keys in environment variables.', mockFallback: true }, { status: 200 });
  }

  const client = new RestClientV5({
    key: process.env.BYBIT_API_KEY,
    secret: process.env.BYBIT_API_SECRET,
    demoTrading: process.env.BYBIT_TESTNET === 'true',
  });

  try {
    const response = await client.getEarnOrderHistory({ category });
    
    if (response.retCode !== 0) {
       return NextResponse.json({ error: response.retMsg, mockFallback: true }, { status: 200 });
    }

    return NextResponse.json({ data: response.result });
  } catch (error: any) {
    console.error('Bybit API Error:', error);
    return NextResponse.json({ error: error.message || 'API Error', mockFallback: true }, { status: 200 });
  }
}
