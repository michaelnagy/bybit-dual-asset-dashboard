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
                profitAmount = item.pr; // Simplification: Total proceeds in new token
                profitToken = item.prt;
                winOrLoss = 'Win';
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
        };
    });
}

// Transform Bybit API v5 EARN Order History to our standard format
function transformBybitApiData(data: any[]): DualAssetTransaction[] {
    // We don't have exact fields for Earn Dual Asset from Bybit SDK response at hand right now,
    // This is a placeholder for real mapping when connected.
    // In production with real keys, you'll map the exact Bybit Earn API response `list` here.
    console.warn("Bybit API transforming: assuming similar payload structure or fallback to mock.");
    return transformMockData(); // fallback temporarily
}

export async function fetchDualAssetTransactions(): Promise<DualAssetTransaction[]> {
    try {
        const res = await fetch('/api/bybit/earn');
        const json = await res.json();

        if (json.mockFallback) {
            console.warn("Using mock fallback data:", json.error);
            return transformMockData();
        }

        if (json.data && json.data.list) {
            return transformBybitApiData(json.data.list);
        }

        return transformMockData();
    } catch (error) {
        console.error("Failed to fetch from API", error);
        return transformMockData();
    }
}
