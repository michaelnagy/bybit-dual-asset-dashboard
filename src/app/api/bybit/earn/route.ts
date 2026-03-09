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
    // List of categories to try. Dual Asset products are sometimes listed under specific category strings.
    const categoriesToTry = ['OnChain', 'FlexibleSaving', 'DualAsset', 'DASH'];
    let allOrders: any[] = [];

    // 1. Try checking the standard Earn Order History
    for (const cat of categoriesToTry) {
      console.log(`Fetching Bybit Earn history for category: ${cat}`);
      const response: any = await client.getEarnOrderHistory({ category: cat, limit: 100 });

      if (response && response.retCode === 0 && response.result.list) {
        const itemsWithCat = response.result.list.map((item: any) => ({ ...item, apiCategory: cat, apiSource: 'earn' }));
        allOrders = [...allOrders, ...itemsWithCat];
      }
    }

    // 2. Try checking Structured Investment records (for Dual Asset details)
    try {
      console.log('Fetching Bybit Structured Investment records...');
      // Manually calling the endpoint as it might not be in the SDK's high-level methods
      const investRes: any = await client.get('/v5/asset/investment/order-record', { limit: 100 });
      if (investRes && investRes.retCode === 0 && investRes.result.list) {
        const items = investRes.result.list.map((item: any) => ({ ...item, apiSource: 'investment' }));
        allOrders = [...allOrders, ...items];
      }
    } catch (e) {
      console.warn('Failed to fetch investment records:', e);
    }

    // 3. Try checking Option Executions (for Dual Asset settlements)
    try {
      console.log('Fetching Bybit Option execution list...');
      const optionExecs = await client.getExecutionList({ category: 'option', limit: 100 });
      if (optionExecs && optionExecs.retCode === 0 && optionExecs.result.list) {
        const items = optionExecs.result.list.map((item: any) => ({ ...item, apiSource: 'execution', apiCategory: 'option' }));
        allOrders = [...allOrders, ...items];
      }
    } catch (e) {
      console.warn('Failed to fetch option executions:', e);
    }

    // 4. Try checking Yield History (to find profits/APR)
    try {
      console.log('Fetching Bybit Earn yield history...');
      for (const cat of ['FlexibleSaving', 'OnChain']) {
        const yieldRes: any = await client.get('/v5/earn/yield', { category: cat, limit: 100 });
        if (yieldRes && yieldRes.retCode === 0 && yieldRes.result) {
          const yieldList = yieldRes.result.list || yieldRes.result.yield || [];
          const items = yieldList.map((item: any) => ({ ...item, apiSource: 'yield', apiCategory: cat }));
          allOrders = [...allOrders, ...items];
        }
      }
    } catch (e) {
      console.warn('Failed to fetch yield history:', e);
    }

    // 5. Try checking Staked Positions (for active orders)
    try {
      console.log('Fetching Bybit Earn positions...');
      for (const cat of ['FlexibleSaving', 'OnChain']) {
        const posRes: any = await client.get('/v5/earn/position', { category: cat });
        if (posRes && posRes.retCode === 0 && posRes.result.list) {
          const items = posRes.result.list.map((item: any) => ({ ...item, apiSource: 'position', apiCategory: cat }));
          allOrders = [...allOrders, ...items];
        }
      }
    } catch (e) {
      console.warn('Failed to fetch earn positions:', e);
    }

    // 6. Enrich with Product Info (to get APRs/Metadata)
    const productIds = Array.from(new Set(allOrders.filter(o => o.productId).map(o => o.productId)));
    let productMetadata: any[] = [];
    if (productIds.length > 0) {
      try {
        console.log(`Fetching Bybit Product info for IDs: ${productIds.join(', ')}`);
        for (const cat of ['FlexibleSaving', 'OnChain']) {
          const prodRes: any = await client.getEarnProduct({ category: cat as any });
          if (prodRes && prodRes.retCode === 0 && prodRes.result.list) {
            productMetadata = [...productMetadata, ...prodRes.result.list];
          }
        }
      } catch (e) {
        console.warn('Failed to fetch product metadata:', e);
      }
    }

    if (allOrders.length === 0) {
      return NextResponse.json({ error: 'No orders found in checked categories or records.', mockFallback: true }, { status: 200 });
    }

    return NextResponse.json({ data: { list: allOrders, metadata: productMetadata } });
  } catch (error: any) {
    console.error('Bybit API Error:', error);
    return NextResponse.json({ error: error.message || 'API Error', mockFallback: true }, { status: 200 });
  }
}
