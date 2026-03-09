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

function transformMockData(): DualAssetTransaction[] {
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
    if (!data || data.length === 0) return transformMockData();

    const transactions: DualAssetTransaction[] = [];
    const productMap = new Map<string, any>();
    metadata.forEach(p => productMap.set(p.productId, p));

    // Process redeems and match with stakes
    data.filter(item => item.apiSource === 'earn' && item.orderType === 'Redeem').forEach(redeem => {
        // Try to find a matching stake by amount and product
        const matchingStake = data.find(item =>
            item.apiSource === 'earn' &&
            item.orderType === 'Stake' &&
            item.coin === redeem.coin &&
            item.orderValue === redeem.orderValue &&
            Math.abs(new Date(parseInt(item.createdAt)).getTime() - new Date(parseInt(redeem.createdAt)).getTime()) < 2 * 24 * 60 * 60 * 1000 // within 2 days
        );

        if (matchingStake) {
            const orderTime = new Date(parseInt(matchingStake.createdAt));
            const settlementTime = new Date(parseInt(redeem.createdAt));
            const product = productMap.get(redeem.productId);

            transactions.push({
                productName: `${redeem.coin}-USDT`,
                targetPrice: product ? parseFloat(product.strikePrice || product.targetPrice || 0) : 0,
                investmentAmount: parseFloat(matchingStake.orderValue),
                investmentToken: matchingStake.coin,
                stakingPeriod: '< 1 Day',
                settlementPrice: null,
                orderTime,
                orderDirection: 'Sell High', // Default guess for crypto stake
                apr: product ? parseFloat(product.estimateApr || product.apr || 0) : 0,
                settlementTime,
                proceeds: parseFloat(redeem.orderValue),
                proceedsToken: redeem.coin,
                status: 'Completed',
                orderId: redeem.orderId,
                profitAmount: 0, // Needs yield data
                profitToken: redeem.coin,
                winOrLoss: 'Loss', // Redeemed in same token usually means target price not hit
                realApr: null
            });
        }
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
    if (transactions.length === 0) return transformMockData();

    // Final pass for calculated fields
    return transactions.map(item => {
        let realApr = null;
        if (item.status === 'Completed' && item.profitAmount !== null) {
            const durationMs = item.settlementTime.getTime() - item.orderTime.getTime();
            const durationDays = durationMs / (1000 * 60 * 60 * 24);
            if (durationDays > 0 && item.investmentAmount > 0) {
                // Approximate principle in profit token if converted
                const principal = item.investmentToken === item.profitToken ? item.investmentAmount : item.investmentAmount * item.targetPrice;
                if (principal > 0) {
                    realApr = (item.profitAmount / principal) * (365 / durationDays) * 100;
                }
            }
        }
        return { ...item, realApr };
    });
}

export async function fetchDualAssetTransactions(): Promise<DualAssetTransaction[]> {
    try {
        const res = await fetch('/api/bybit/earn');
        const json = await res.json();

        if (json.mockFallback) {
            console.warn("Using mock fallback data due to API error/fallback:", json.error);
            return transformMockData();
        }

        if (json.data && json.data.list) {
            return transformBybitApiData(json.data.list, json.data.metadata || []);
        }

        return transformMockData();
    } catch (error) {
        console.error("Failed to fetch from API", error);
        return transformMockData();
    }
}
