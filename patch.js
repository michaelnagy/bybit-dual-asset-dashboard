const fs = require('fs');
let code = fs.readFileSync('src/lib/dataService.ts', 'utf8');

const anchor = `    // Process redeems and match with stakes`;

const injection = `    // Process Earn Orders (Flexible Savings / Easy Earn Stakes)
    data.filter(item => item.apiSource === 'earn' && item.orderType === 'Stake').forEach(stake => {
        // Prevent double mapping if already caught as a dual asset
        const isAlreadyMapped = transactions.some(t => t.orderId === stake.orderId);
        if (isAlreadyMapped) return;

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
            productName: stake.coin, // Show just the coin for flexible
            targetPrice: 0,
            investmentAmount: parseFloat(stake.orderValue),
            investmentToken: stake.coin,
            stakingPeriod: 'Flexible',
            settlementPrice: null,
            orderTime,
            orderDirection: 'Buy Low', // Default for standard earn to show nicely
            apr,
            settlementTime: orderTime, // Set settlement time as order time for historical sorting
            proceeds: parseFloat(stake.orderValue),
            proceedsToken: stake.coin,
            status,
            orderId: stake.orderId,
            profitAmount: 0, // In easy earn, profit accumulates over time via yield
            profitToken: stake.coin,
            winOrLoss: 'Win', // Always a win conceptually for pure earn
            realApr: null
        });
    });

`;

code = code.replace(anchor, injection + anchor);
fs.writeFileSync('src/lib/dataService.ts', code);
