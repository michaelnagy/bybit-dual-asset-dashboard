import { test } from 'node:test';
import assert from 'node:assert';
import { transformBybitApiData } from './dataService.ts';

test('transformBybitApiData - returns mock data when input is empty', () => {
    const result = transformBybitApiData([]);
    assert.strictEqual(result.length, 6);
    assert.strictEqual(result[0].productName, 'SOL-USDT');
});

test('transformBybitApiData - matches Stake and Redeem events', () => {
    const now = Date.now();
    const data = [
        {
            apiSource: 'earn',
            orderType: 'Stake',
            coin: 'SOL',
            orderValue: '10',
            createdAt: now.toString(),
            productId: 'prod-1'
        },
        {
            apiSource: 'earn',
            orderType: 'Redeem',
            coin: 'SOL',
            orderValue: '10',
            createdAt: (now + 1000 * 60 * 60).toString(), // 1 hour later
            productId: 'prod-1',
            orderId: 'order-1'
        }
    ];
    const metadata = [
        { productId: 'prod-1', strikePrice: '100', estimateApr: '0.1' }
    ];

    const result = transformBybitApiData(data, metadata);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].productName, 'SOL-USDT');
    assert.strictEqual(result[0].investmentAmount, 10);
    assert.strictEqual(result[0].targetPrice, 100);
    assert.strictEqual(result[0].status, 'Completed');
});

test('transformBybitApiData - handles Option Executions (Put)', () => {
    const now = Date.now();
    const data = [
        {
            apiSource: 'execution',
            apiCategory: 'option',
            symbol: 'SOL-7MAR26-80-P-USDT',
            execQty: '5',
            indexPrice: '75',
            execTime: now.toString(),
            execValue: '375',
            execId: 'exec-1',
            execPrice: '2'
        }
    ];

    const result = transformBybitApiData(data);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].productName, 'SOL-USDT');
    assert.strictEqual(result[0].targetPrice, 80);
    assert.strictEqual(result[0].orderDirection, 'Buy Low');
    assert.strictEqual(result[0].profitAmount, 2);
    assert.strictEqual(result[0].winOrLoss, 'Win');
});

test('transformBybitApiData - handles Option Executions (Call)', () => {
    const now = Date.now();
    const data = [
        {
            apiSource: 'execution',
            apiCategory: 'option',
            symbol: 'BTC-7MAR26-60000-C-USDT',
            execQty: '0.1',
            indexPrice: '61000',
            execTime: now.toString(),
            execValue: '6100',
            execId: 'exec-2',
            execPrice: '500'
        }
    ];

    const result = transformBybitApiData(data);
    assert.strictEqual(result.length, 1);
    assert.strictEqual(result[0].productName, 'BTC-USDT');
    assert.strictEqual(result[0].targetPrice, 60000);
    assert.strictEqual(result[0].orderDirection, 'Sell High');
});

test('transformBybitApiData - calculates realApr correctly', () => {
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const data = [
        {
            apiSource: 'execution',
            apiCategory: 'option',
            symbol: 'SOL-7MAR26-100-P-USDT',
            execQty: '10',
            indexPrice: '90',
            execTime: now.toString(), // Settlement time
            execValue: '1000',
            execId: 'exec-1',
            execPrice: '10' // Profit
        }
    ];

    // transformBybitApiData guesses orderTime as 1 day prior for options
    // So duration is exactly 1 day.
    // investmentAmount = 10 (SOL)
    // investmentToken = SOL (guessed)
    // profitToken = USDT
    // targetPrice = 100
    // principal = investmentAmount * targetPrice = 10 * 100 = 1000
    // realApr = (10 / 1000) * (365 / 1) * 100 = 0.01 * 365 * 100 = 365%

    const result = transformBybitApiData(data);
    assert.strictEqual(result.length, 1);
    assert.ok(result[0].realApr !== null);
    // Allow for small floating point differences if any, but it should be exactly 365
    assert.ok(Math.abs(result[0].realApr - 365) < 0.001);
});
