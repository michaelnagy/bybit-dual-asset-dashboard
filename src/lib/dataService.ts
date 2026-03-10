/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DualAssetTransaction {
    productName: string;
    targetPrice: number;
    investmentAmount: number;
    investmentToken: string;
    stakingPeriod: string;
    settlementPrice: number | null;
    orderTime: Date;
    orderDirection: 'Buy Low' | 'Sell High';
    apr: number;
    settlementTime: Date;
    proceeds: number | null;
    proceedsToken: string | null;
    status: 'Active' | 'Completed' | string;
    orderId: string;

    // Calculated fields
    profitAmount: number | null;
    profitToken: string | null;
    winOrLoss: 'Win' | 'Loss' | 'Pending' | null; // Win = converted to target currency
    realApr: number | null; // Annualized Percentage Rate based on actual duration and profit
}

// Transform Bybit API v5 data to our standard format
function transformBybitApiData(data: any[], metadata: any[] = []): DualAssetTransaction[] {
    if (!data || data.length === 0) return [];

    const transactions: DualAssetTransaction[] = [];
    const productMap = new Map<string, any>();
    metadata.forEach(p => productMap.set(p.productId, p));


    // Process Structured Investment Records (Dual Asset)
    data.filter(item => item.apiSource === 'structured-product' || item.apiSource === 'investment' || item.apiSource === 'earn-order' || item.apiSource === 'staking-order').forEach(invest => {
        // Handle internal payload fields ending with _e8
        const productName = invest.product_name || invest.productName || (invest.coin ? invest.coin + '-USDT' : 'Unknown');

        let targetPrice = parseFloat(invest.targetPrice || invest.strikePrice || 0);
        if (invest.benchmark_price_e8) targetPrice = parseFloat(invest.benchmark_price_e8) / 1e8;

        let investmentAmount = parseFloat(invest.amount || invest.orderValue || invest.investAmount || 0);
        if (invest.total_locked_amount_e8) investmentAmount = parseFloat(invest.total_locked_amount_e8) / 1e8;

        // Try to determine token, Bybit coin mappings: 18 might be SOL, 5 might be USDT, 2 might be ETH based on the user payload.
        let investmentToken = invest.coin || invest.investCoin || invest.investToken;
        if (typeof investmentToken === 'number') {
           const parts = productName.split(' ')[0].split('-');
           if (parts.length > 1) {
              // Guess based on order direction: 1 usually means Buy Low (stablecoin invested), 2 means Sell High (crypto invested)
              investmentToken = invest.order_direction === 1 ? parts[1] : parts[0];
           }
        }
        if (typeof investmentToken === 'number' || !investmentToken) investmentToken = productName.split('-')[0];

        // Parse Staking Period
        let stakingPeriod = invest.period || invest.stakingPeriod || '< 1 Day';
        if (productName && productName.includes('8h')) stakingPeriod = '< 1 Day';
        else if (invest.duration === 1) stakingPeriod = '1 Day';

        let settlementPrice = invest.settlementPrice ? parseFloat(invest.settlementPrice) : null;
        if (invest.settlement_price_e8 && invest.settlement_price_e8 !== "0") settlementPrice = parseFloat(invest.settlement_price_e8) / 1e8;

        const orderTime = invest.createdAt ? new Date(parseInt(invest.createdAt)) : (invest.created_at ? new Date(parseInt(invest.created_at) * 1000) : new Date());

        let orderDirection = invest.direction || invest.orderType || 'Buy Low';
        if (invest.order_direction === 1) orderDirection = 'Buy Low';
        else if (invest.order_direction === 2) orderDirection = 'Sell High';
        if (orderDirection === 'BuyLow') orderDirection = 'Buy Low';
        if (orderDirection === 'SellHigh') orderDirection = 'Sell High';

        let apr = 0;
        if (invest.apy_e8) apr = parseFloat(invest.apy_e8) / 1e6; // e8 / 1e6 gives percentage i.e 501952606 -> 501.95%
        else {
            const aprStr = invest.apr || invest.yield || invest.estimateApr || "0";
            apr = typeof aprStr === 'string' && aprStr.includes('%') ? parseFloat(aprStr.replace('%', '')) : parseFloat(aprStr);
        }

        const settlementTime = invest.settlementTime ? new Date(parseInt(invest.settlementTime)) : (invest.settlement_time && invest.settlement_time !== "-62135596800" ? new Date(parseInt(invest.settlement_time) * 1000) : new Date(parseInt(invest.apply_end_at || "0") * 1000));

        let proceedsAmount = invest.proceeds || invest.payoff || invest.settlementAmount ? parseFloat(invest.proceeds || invest.payoff || invest.settlementAmount) : null;
        if (invest.cumulate_pnl_e8 && invest.cumulate_pnl_e8 !== "0") {
             // In the payload, cumulate_pnl_e8 seems to be the total returns including principal.
             proceedsAmount = parseFloat(invest.cumulate_pnl_e8) / 1e8;
        }

        // Determine Proceeds Token
        let proceedsToken = invest.proceedsCoin || invest.payoffCoin || invest.settlementCoin || null;
        if (invest.return_coin !== undefined && invest.return_coin !== 0) {
             const parts = productName.split(' ')[0].split('-');
             // In Bybit Dual Asset, coin_x is often the quote (USDT) and coin_y is the base (SOL/ETH)
             if (invest.return_coin === invest.coin_x) proceedsToken = parts[1];
             else if (invest.return_coin === invest.coin_y) proceedsToken = parts[0];
             else if (invest.return_coin === 5) proceedsToken = 'USDT';
             else if (invest.return_coin === 18) proceedsToken = 'SOL';
             else if (invest.return_coin === 2) proceedsToken = 'ETH';
        }

        let status = invest.status || 'Active';
        if (invest.order_status === 4 || invest.order_status_v3 === 3) status = 'Completed';
        else if (invest.order_status === 2 || invest.order_status_v3 === 2) status = 'Active';
        else if (status === 'SUCCESS' || status === 'SETTLED' || status === 'Completed' || status === 'Settled') status = 'Completed';
        else status = 'Active';

        transactions.push({
            productName,
            targetPrice,
            investmentAmount,
            investmentToken,
            stakingPeriod,
            settlementPrice,
            orderTime,
            orderDirection: orderDirection as any,
            apr,
            settlementTime,
            proceeds: proceedsAmount,
            proceedsToken,
            status,
            orderId: invest.order_id || invest.orderId || invest.id || Math.random().toString(),
            profitAmount: null,
            profitToken: proceedsToken,
            winOrLoss: null,
            realApr: null
        });
    });

    // Process Earn Orders (Flexible Savings / Easy Earn Stakes)
    data.filter(item => item.apiSource === 'earn' && item.orderType === 'Stake').forEach(stake => {
        const product = productMap.get(stake.productId);
        const orderTime = new Date(parseInt(stake.createdAt));

        let status = stake.status || 'Active';
        if (status === 'Success' || status === 'SUCCESS' || status === 'Completed') {
             status = 'Completed';
        }

        let apr = 0;
        if (product) {
            const aprStr = product.estimateApr || product.apr || "0";
            apr = typeof aprStr === 'string' && aprStr.includes('%') ? parseFloat(aprStr.replace('%', '')) : parseFloat(aprStr);
            if (apr < 1) { // some APIs return 0.05 instead of 5%
                apr = apr * 100;
            }
        }

        transactions.push({
            productName: stake.coin, // Keep it simple like the UI
            targetPrice: 0,
            investmentAmount: parseFloat(stake.orderValue),
            investmentToken: stake.coin,
            stakingPeriod: 'Flexible',
            settlementPrice: null,
            orderTime,
            orderDirection: 'Buy Low', // Default for standard earn
            apr,
            settlementTime: orderTime, // Set settlement time as order time for historical sorting
            proceeds: parseFloat(stake.orderValue),
            proceedsToken: stake.coin,
            status,
            orderId: stake.orderId,
            profitAmount: 0, // In easy earn, profit accumulates over time, we just show the transaction
            profitToken: stake.coin,
            winOrLoss: 'Win', // Always a win for easy earn conceptually, or could be null
            realApr: null
        });
    });

    // Handle Option Executions (Direct Dual Asset markers)
    data.filter(item => item.apiSource === 'execution' && item.apiCategory === 'option').forEach(exec => {
        // Symbol format: SOL-7MAR26-80-P-USDT
        const parts = exec.symbol.split('-');
        if (parts.length >= 4) {
            const baseCoin = parts[0];
            const strikePrice = parseFloat(parts[2]);
            const type = parts[3]; // P or C

            transactions.push({
                productName: `${baseCoin}-USDT`,
                targetPrice: strikePrice,
                investmentAmount: parseFloat(exec.execQty),
                investmentToken: baseCoin, // Guessing
                stakingPeriod: 'Custom',
                settlementPrice: parseFloat(exec.indexPrice),
                orderTime: new Date(parseInt(exec.execTime) - 24 * 60 * 60 * 1000), // Guessing 1 day prior
                orderDirection: type === 'P' ? 'Buy Low' : 'Sell High',
                apr: 0, // Needs specific lookup
                settlementTime: new Date(parseInt(exec.execTime)),
                proceeds: parseFloat(exec.execValue),
                proceedsToken: 'USDT',
                status: 'Completed',
                orderId: exec.execId,
                profitAmount: parseFloat(exec.execPrice), // The premium is essentially the "profit" here
                profitToken: 'USDT',
                winOrLoss: 'Win',
                realApr: null
            });
        }
    });

    // Return empty if no transactions found
    if (transactions.length === 0) return [];

    // Final pass for calculated fields
    return transactions.map(item => {
        let profitAmount = item.profitAmount;
        let profitToken = item.profitToken;
        let winOrLoss = item.winOrLoss;
        let realApr = item.realApr;

        if (item.status === 'Completed' && item.proceeds !== null && item.proceedsToken !== null && profitAmount === null) {
            if (item.proceedsToken === item.investmentToken) {
                profitAmount = item.proceeds - item.investmentAmount;
                profitToken = item.investmentToken;
                winOrLoss = 'Loss';
            } else {
                let principalInConvertedToken = 0;
                if (item.orderDirection === 'Sell High') {
                    principalInConvertedToken = item.investmentAmount * item.targetPrice;
                } else if (item.orderDirection === 'Buy Low') {
                    principalInConvertedToken = item.investmentAmount / item.targetPrice;
                }
                profitAmount = item.proceeds - principalInConvertedToken;
                profitToken = item.proceedsToken;
                winOrLoss = 'Win';
            }
        }

        if (item.status === 'Completed' && item.proceeds !== null && profitAmount !== null && item.proceedsToken !== null && realApr === null) {
            const durationMs = item.settlementTime.getTime() - item.orderTime.getTime();
            const durationDays = durationMs / (1000 * 60 * 60 * 24);

            let principalForApr = 0;
            if (item.proceedsToken === item.investmentToken) {
                principalForApr = item.investmentAmount;
            } else {
                if (item.orderDirection === 'Sell High') {
                    principalForApr = item.investmentAmount * item.targetPrice;
                } else if (item.orderDirection === 'Buy Low') {
                    principalForApr = item.investmentAmount / item.targetPrice;
                }
            }

            if (principalForApr > 0 && durationDays > 0) {
                realApr = (profitAmount / principalForApr) * (365 / durationDays) * 100;
            }
        }

        return { ...item, profitAmount, profitToken, winOrLoss, realApr };
    });
}

export async function fetchDualAssetTransactions(): Promise<DualAssetTransaction[]> {
    const res = await fetch('/api/bybit/earn');
    const json = await res.json();

    if (!res.ok) {
        throw new Error(json.error || 'Failed to fetch data from Bybit API');
    }

    if (json.data && json.data.list) {
        return transformBybitApiData(json.data.list, json.data.metadata || []);
    }

    return [];
}
