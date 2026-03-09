const fs = require('fs');
const file = 'src/lib/dataService.ts';
let code = fs.readFileSync(file, 'utf8');

const regex = /\/\/ Process redeems and match with stakes[\s\S]*?\/\/ Handle Option Executions \(Direct Dual Asset markers\)/;

const replaceCode = `// Process Earn Orders (Flexible Savings / Easy Earn Stakes)
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

    // Handle Option Executions (Direct Dual Asset markers)`;

code = code.replace(regex, replaceCode);
fs.writeFileSync(file, code);
