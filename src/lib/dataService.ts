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

// Mock data provided by user
const MOCK_DATA_RAW = [
    { p: 'SOL-USDT', tp: 85.0, ia: 0.71909407, iat: 'SOL', sp: '1 Day', sep: null, ot: '2026-03-09T01:03:32Z', od: 'Sell High', apr: 1.2582, st: '2026-03-10T07:59:59Z', pr: null, prt: null, stat: 'Active', id: '1e39aa07' },
    { p: 'ETH-USDT', tp: 1925.0, ia: 20.0, iat: 'USDT', sp: '< 1 Day', sep: 1980.9652, ot: '2026-03-08T13:03:35Z', od: 'Buy Low', apr: 9.0579, st: '2026-03-09T07:59:59Z', pr: 20.1654, prt: 'USDT', stat: 'Completed', id: '749c97e0' },
    { p: 'SOL-USDT', tp: 83.0, ia: 30.0, iat: 'USDT', sp: '< 1 Day', sep: 82.8857, ot: '2026-03-07T21:35:04Z', od: 'Buy Low', apr: 6.6780, st: '2026-03-08T07:59:59Z', pr: 0.36365012, prt: 'SOL', stat: 'Completed', id: '76e0f63d' },
    { p: 'SOL-USDT', tp: 82.0, ia: 30.0, iat: 'USDT', sp: '< 1 Day', sep: 82.8857, ot: '2026-03-07T20:27:46Z', od: 'Buy Low', apr: 3.0236, st: '2026-03-08T07:59:59Z', pr: 30.0828, prt: 'USDT', stat: 'Completed', id: '097659e3' },
    { p: 'SOL-USDT', tp: 84.0, ia: 0.35466338, iat: 'SOL', sp: '< 1 Day', sep: 82.8857, ot: '2026-03-07T20:23:54Z', od: 'Sell High', apr: 2.3903, st: '2026-03-08T07:59:59Z', pr: 0.35543761, prt: 'SOL', stat: 'Completed', id: '25f24a06' },
    { p: 'SOL-USDT', tp: 85.0, ia: 30.0, iat: 'USDT', sp: '1 Day', sep: 84.2205, ot: '2026-03-06T03:55:32Z', od: 'Buy Low', apr: 1.7810, st: '2026-03-07T07:59:59Z', pr: 0.35466338, prt: 'SOL', stat: 'Completed', id: 'f4db1613' },
];

export function transformMockData(): DualAssetTransaction[] {
    return MOCK_DATA_RAW.map(item => {
        // Calculate Profit
        let profitAmount = null;
        let profitToken = null;
        let winOrLoss = null;

        if (item.stat === 'Completed' && item.pr !== null && item.prt !== null) {
            if (item.prt === item.iat) {
                // Returned in same token
                profitAmount = item.pr - item.ia;
                profitToken = item.iat;
                winOrLoss = 'Loss'; // Did not hit target price
            } else {
                // Converted! Win!
                // To get pure premium in the converted token, we need the initial investment 
                // in terms of the converted token to subtract from total proceeds.
                // Or mathematically, the pure profit is simply total proceeds minus the 
                // principal converted at the target price.

                let principalInConvertedToken = 0;

                if (item.od === 'Sell High') {
                    // Investment was crypto (e.g. SOL), returned in stable (e.g. USDT)
                    principalInConvertedToken = item.ia * item.tp;
                } else if (item.od === 'Buy Low') {
                    // Investment was stable (e.g. USDT), returned in crypto (e.g. SOL)
                    principalInConvertedToken = item.ia / item.tp;
                }

                profitAmount = item.pr - principalInConvertedToken;
                profitToken = item.prt;
                winOrLoss = 'Win';
            }
        }

        let realApr = null;
        if (item.stat === 'Completed' && item.pr !== null && profitAmount !== null && item.prt !== null) {
            const durationMs = new Date(item.st).getTime() - new Date(item.ot).getTime();
            const durationDays = durationMs / (1000 * 60 * 60 * 24);

            let principalForApr = 0;
            if (item.prt === item.iat) {
                principalForApr = item.ia;
            } else {
                if (item.od === 'Sell High') {
                    principalForApr = item.ia * item.tp;
                } else if (item.od === 'Buy Low') {
                    principalForApr = item.ia / item.tp;
                }
            }

            if (principalForApr > 0 && durationDays > 0) {
                realApr = (profitAmount / principalForApr) * (365 / durationDays) * 100;
            }
        }

        return {
            productName: item.p,
            targetPrice: item.tp,
            investmentAmount: item.ia,
            investmentToken: item.iat,
            stakingPeriod: item.sp,
            settlementPrice: item.sep,
            orderTime: new Date(item.ot),
            orderDirection: item.od as any,
            apr: item.apr,
            settlementTime: new Date(item.st),
            proceeds: item.pr,
            proceedsToken: item.prt,
            status: item.stat,
            orderId: item.id,
            profitAmount,
            profitToken,
            winOrLoss: winOrLoss as any,
            realApr,
        };
    });
}

// Transform Bybit API v5 data to our standard format
function transformBybitApiData(data: any[], metadata: any[] = []): DualAssetTransaction[] {
    if (!data || data.length === 0) return [];

    const transactions: DualAssetTransaction[] = [];
    const productMap = new Map<string, any>();
    metadata.forEach(p => productMap.set(p.productId, p));


    // Process Structured Investment Records (Dual Asset)
    data.filter(item => item.apiSource === 'investment').forEach(invest => {
        const productName = invest.productName || (invest.coin + '-USDT');
        const targetPrice = parseFloat(invest.targetPrice || invest.strikePrice || 0);
        const investmentAmount = parseFloat(invest.amount || invest.orderValue || invest.investAmount || 0);
        const investmentToken = invest.coin || invest.investCoin || invest.investToken || productName.split('-')[0];
        const stakingPeriod = invest.period || invest.stakingPeriod || '< 1 Day';
        const settlementPrice = invest.settlementPrice ? parseFloat(invest.settlementPrice) : null;
        const orderTime = invest.createdAt ? new Date(parseInt(invest.createdAt)) : (invest.orderTime ? new Date(invest.orderTime) : new Date());

        let orderDirection = invest.direction || invest.orderType || 'Buy Low';
        if (orderDirection === 'BuyLow') orderDirection = 'Buy Low';
        if (orderDirection === 'SellHigh') orderDirection = 'Sell High';

        const aprStr = invest.apr || invest.yield || invest.estimateApr || "0";
        const apr = typeof aprStr === 'string' && aprStr.includes('%') ? parseFloat(aprStr.replace('%', '')) : parseFloat(aprStr);

        const settlementTime = invest.settlementTime ? new Date(parseInt(invest.settlementTime)) : (invest.settleTime ? new Date(parseInt(invest.settleTime)) : new Date());

        const proceeds = invest.proceeds || invest.payoff || invest.settlementAmount;
        const proceedsAmount = proceeds ? parseFloat(proceeds) : null;
        const proceedsToken = invest.proceedsCoin || invest.payoffCoin || invest.settlementCoin || null;

        let status = invest.status || 'Active';
        if (status === 'SUCCESS' || status === 'SETTLED' || status === 'Completed' || status === 'Settled') status = 'Completed';
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
            orderId: invest.orderId || invest.id || Math.random().toString(),
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

    // If we couldn't find meaningful transactions, return mock for now to not break the UI
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
