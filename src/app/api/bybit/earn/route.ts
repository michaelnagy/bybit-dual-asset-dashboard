/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { RestClientV5 } from 'bybit-api';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get('category') || 'Earn';

  if (!process.env.BYBIT_API_KEY || !process.env.BYBIT_API_SECRET) {
    return NextResponse.json({ error: 'Missing Bybit API Keys in environment variables.' }, { status: 401 });
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
    console.log(`Fetching Bybit Earn history for categories: ${categoriesToTry.join(', ')}`);
    const orderPromises = categoriesToTry.map(async (cat) => {
      try {
        const response: any = await client.getEarnOrderHistory({ category: cat, limit: 100 });
        if (response && response.retCode === 0 && response.result.list) {
          return response.result.list.map((item: any) => ({ ...item, apiCategory: cat, apiSource: 'earn' }));
        }
      } catch (e) {
        console.warn(`Failed to fetch earn history for ${cat}:`, e);
      }
      return [];
    });

    const orderResults = await Promise.all(orderPromises);
    allOrders = [...allOrders, ...orderResults.flat()];

            // 2. Try fetching Dual Asset specifically via Staking Order History or Earn Order
    try {
      console.log('Fetching Bybit Dual Asset Staking records...');
      const stakeRes: any = await client.get('/v5/asset/staking/order-history', { category: 'STRUCTURED_PRODUCT', limit: 100 });
      if (stakeRes && stakeRes.retCode === 0 && stakeRes.result.list) {
        const items = stakeRes.result.list.map((item: any) => ({ ...item, apiSource: 'structured-product' }));
        allOrders = [...allOrders, ...items];
      }
    } catch (e) {
      console.warn('Failed to fetch staking records:', e);
    }

    // 2.1 Try checking Asset Earn Order Record
    try {
      console.log('Fetching Bybit Asset Earn Order Record...');
      const earnRes: any = await client.get('/v5/asset/earn/order-record', { category: 'STRUCTURED_PRODUCT', limit: 100 });
      if (earnRes && earnRes.retCode === 0 && earnRes.result.list) {
        const items = earnRes.result.list.map((item: any) => ({ ...item, apiSource: 'structured-product' }));
        allOrders = [...allOrders, ...items];
      }
    } catch (e) {
      console.warn('Failed to fetch earn order record:', e);
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
      const yieldPromises = ['FlexibleSaving', 'OnChain'].map(async (cat) => {
        try {
          const yieldRes: any = await client.get('/v5/earn/yield', { category: cat, limit: 100 });
          if (yieldRes && yieldRes.retCode === 0 && yieldRes.result) {
            const yieldList = yieldRes.result.list || yieldRes.result.yield || [];
            return yieldList.map((item: any) => ({ ...item, apiSource: 'yield', apiCategory: cat }));
          }
        } catch (e) {
          console.warn(`Failed to fetch yield history for ${cat}:`, e);
        }
        return [];
      });
      const yieldResults = await Promise.all(yieldPromises);
      allOrders = [...allOrders, ...yieldResults.flat()];
    } catch (e) {
      console.warn('Failed to fetch yield history:', e);
    }

    // 5. Try checking Staked Positions (for active orders)
    try {
      console.log('Fetching Bybit Earn positions...');
      const posPromises = ['FlexibleSaving', 'OnChain'].map(async (cat) => {
        try {
          const posRes: any = await client.get('/v5/earn/position', { category: cat });
          if (posRes && posRes.retCode === 0 && posRes.result.list) {
            return posRes.result.list.map((item: any) => ({ ...item, apiSource: 'position', apiCategory: cat }));
          }
        } catch (e) {
          console.warn(`Failed to fetch earn positions for ${cat}:`, e);
        }
        return [];
      });
      const posResults = await Promise.all(posPromises);
      allOrders = [...allOrders, ...posResults.flat()];
    } catch (e) {
      console.warn('Failed to fetch earn positions:', e);
    }

            // 7. Check the Transaction Log for Dual Asset subscriptions/refunds
    // Private endpoints must use submitCustomRequest
    try {
      console.log('Fetching Bybit Transaction logs...');
      const logRes: any = await client.get('/v5/account/transaction-log', { accountType: 'UNIFIED', type: 'STRUCTURE_PRODUCT_SUBSCRIPTION', limit: 50 });
      if (logRes && logRes.retCode === 0 && logRes.result.list) {
        const items = logRes.result.list.map((item: any) => ({ ...item, apiSource: 'transaction-log', apiCategory: 'subscription' }));
        allOrders = [...allOrders, ...items];
      }

      const refundRes: any = await client.get('/v5/account/transaction-log', { accountType: 'UNIFIED', type: 'STRUCTURE_PRODUCT_REFUND', limit: 50 });
      if (refundRes && refundRes.retCode === 0 && refundRes.result.list) {
        const items = refundRes.result.list.map((item: any) => ({ ...item, apiSource: 'transaction-log', apiCategory: 'refund' }));
        allOrders = [...allOrders, ...items];
      }
    } catch (e) {
      console.warn('Failed to fetch transaction logs:', e);
    }

    // 8. Try checking Asset Earn Order Record (valid endpoint)
    try {
      console.log('Fetching Bybit Asset Earn Order History...');
      const earnRes: any = await client.get('/v5/earn/order', { category: 'STRUCTURED_PRODUCT', limit: 50 });
      if (earnRes && earnRes.retCode === 0 && earnRes.result.list) {
        const items = earnRes.result.list.map((item: any) => ({ ...item, apiSource: 'earn-order' }));
        allOrders = [...allOrders, ...items];
      }
    } catch (e) {
      console.warn('Failed to fetch earn order record:', e);
    }

    // 6. Enrich with Product Info (to get APRs/Metadata)
    const productIds = Array.from(new Set(allOrders.filter(o => o.productId).map(o => o.productId)));
    let productMetadata: any[] = [];
    if (productIds.length > 0) {
      try {
        console.log(`Fetching Bybit Product info for categories in parallel...`);
        const prodPromises = ['FlexibleSaving', 'OnChain'].map(async (cat) => {
          try {
            const prodRes: any = await client.getEarnProduct({ category: cat as any });
            if (prodRes && prodRes.retCode === 0 && prodRes.result.list) {
              return prodRes.result.list;
            }
          } catch (e) {
            console.warn(`Failed to fetch product metadata for ${cat}:`, e);
          }
          return [];
        });
        const prodResults = await Promise.all(prodPromises);
        productMetadata = prodResults.flat();
      } catch (e) {
        console.warn('Failed to fetch product metadata:', e);
      }
    }

    if (allOrders.length === 0) {
      return NextResponse.json({ error: 'No orders found in checked categories or records.' }, { status: 404 });
    }

    return NextResponse.json({ data: { list: allOrders, metadata: productMetadata } });
  } catch (error: any) {
    console.error('Bybit API Error:', error);
    return NextResponse.json({ error: error.message || 'API Error' }, { status: 500 });
  }
}
