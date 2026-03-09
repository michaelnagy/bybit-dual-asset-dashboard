/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { fetchDualAssetTransactions, DualAssetTransaction } from '@/lib/dataService';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
    PieChart, Pie, Cell
} from 'recharts';
import { ArrowUpRight, Activity, PieChart as PieChartIcon, TrendingUp, DollarSign, Target, Clock, ShieldCheck } from 'lucide-react';

export default function Dashboard() {
    const [transactions, setTransactions] = useState<DualAssetTransaction[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        async function loadData() {
            try {
                const data = await fetchDualAssetTransactions();
                setTransactions(data);
            } catch (err: any) {
                setError(err.message || 'An error occurred while fetching data');
            } finally {
                setLoading(false);
            }
        }
        loadData();
    }, []);

    // Live Expiration Timer
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        if (!loading) {
            const interval = setInterval(() => setNow(new Date()), 1000);
            return () => clearInterval(interval);
        }
    }, [loading]);

    // Compute metrics
    const summary = useMemo(() => {
        if (!transactions.length) return null;

        let totalProfitUsdt = 0;
        const tokenProfits: Record<string, number> = {};
        const winLoss = { wins: 0, losses: 0, totalCompleted: 0 };
        const vwapTargetPriceObj: Record<string, {
            buyLowWeightedSum: number,
            buyLowVolume: number,
            sellHighWeightedSum: number,
            sellHighVolume: number,
        }> = {};
        const capitalAllocation: Record<string, number> = {};

        // Sort transactions by date ascending for line charts
        const sortedTimeline = [...transactions].sort((a, b) => a.settlementTime.getTime() - b.settlementTime.getTime());
        const timelineData: any[] = [];

        let cumulativeUsdtProfit = 0;

        sortedTimeline.forEach(tx => {
            // Volume Weighted Average Cost Basis tracking
            if (!vwapTargetPriceObj[tx.productName]) vwapTargetPriceObj[tx.productName] = {
                buyLowWeightedSum: 0, buyLowVolume: 0,
                sellHighWeightedSum: 0, sellHighVolume: 0
            };

            if (tx.orderDirection === 'Buy Low') {
                vwapTargetPriceObj[tx.productName].buyLowWeightedSum += tx.targetPrice * tx.investmentAmount;
                vwapTargetPriceObj[tx.productName].buyLowVolume += tx.investmentAmount;
            } else if (tx.orderDirection === 'Sell High') {
                vwapTargetPriceObj[tx.productName].sellHighWeightedSum += tx.targetPrice * tx.investmentAmount;
                vwapTargetPriceObj[tx.productName].sellHighVolume += tx.investmentAmount;
            }

            // Capital Allocation (Simplistically using token as proxy for value, ideally we'd normalize to USDT)
            if (!capitalAllocation[tx.investmentToken]) capitalAllocation[tx.investmentToken] = 0;
            capitalAllocation[tx.investmentToken] += tx.investmentAmount;

            if (tx.status === 'Completed' || tx.profitAmount !== null) {
                winLoss.totalCompleted++;
                if (tx.winOrLoss === 'Win') winLoss.wins++;
                else if (tx.winOrLoss === 'Loss') winLoss.losses++;

                const token = tx.profitToken || tx.proceedsToken;
                const profit = tx.profitAmount || 0;

                if (token) {
                    if (token === 'USDT') totalProfitUsdt += profit;
                    if (!tokenProfits[token]) tokenProfits[token] = 0;
                    tokenProfits[token] += profit;
                }

                // Timeline Chart Builder
                if (token === 'USDT') cumulativeUsdtProfit += profit;
                timelineData.push({
                    date: mounted ? tx.settlementTime.toLocaleDateString() : '',
                    name: tx.productName,
                    profit: profit,
                    token: token,
                    cumulativeUsdtProfit
                });
            }
        });

        const avgTargetPrices = Object.keys(vwapTargetPriceObj).map(prod => {
            const data = vwapTargetPriceObj[prod];
            return {
                product: prod,
                buyLowVwap: data.buyLowVolume > 0 ? data.buyLowWeightedSum / data.buyLowVolume : 0,
                sellHighVwap: data.sellHighVolume > 0 ? data.sellHighWeightedSum / data.sellHighVolume : 0,
            };
        });

        const winRatio = winLoss.totalCompleted > 0 ? (winLoss.wins / winLoss.totalCompleted) * 100 : 0;

        const allocationPieData = Object.keys(capitalAllocation).map(token => ({
            name: token,
            value: capitalAllocation[token]
        }));

        return {
            totalProfitUsdt,
            tokenProfits,
            winRatio,
            avgTargetPrices,
            timelineData,
            allocationPieData
        };
    }, [transactions]);

    if (error) return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-slate-950 text-white p-6">
            <div className="bg-red-500/10 border border-red-500/50 rounded-2xl p-8 max-w-md w-full text-center shadow-2xl backdrop-blur-md">
                <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-6">
                    <span className="text-3xl">⚠️</span>
                </div>
                <h2 className="text-2xl font-bold text-red-400 mb-4">Dashboard Error</h2>
                <p className="text-slate-300 mb-8 whitespace-pre-wrap">{error}</p>
                <button
                    onClick={() => window.location.reload()}
                    className="px-6 py-3 bg-red-500 hover:bg-red-600 text-white rounded-xl font-medium transition-colors shadow-lg shadow-red-500/25"
                >
                    Retry Connection
                </button>
            </div>
        </div>
    );

    if (loading) return (
        <div className="flex items-center justify-center min-h-screen bg-slate-950 text-white">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-500"></div>
        </div>
    );

    return (
        <div className="min-h-screen bg-slate-950 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-indigo-900/20 via-slate-950 to-slate-950 text-slate-100 p-6 md:p-10 font-sans selection:bg-emerald-500/30">

            {/* Header */}
            <header className="mb-10 animate-pulse-fade">
                <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400 drop-shadow-sm">
                    Dual Asset Intelligence
                </h1>
                <p className="text-slate-400 mt-2 text-lg">Your automated Bybit yield tracker</p>
            </header>

            {/* Top Metrics Row */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                <MetricCard
                    title="Total USDT Profit"
                    value={`$${summary?.totalProfitUsdt.toFixed(2)}`}
                    icon={<DollarSign className="w-5 h-5 text-emerald-400" />}
                    trend="+12%" // Example static trend for visuals
                />
                <MetricCard
                    title="Conversion Ratio (Win Rate)"
                    value={`${summary?.winRatio.toFixed(1)}%`}
                    icon={<Target className="w-5 h-5 text-amber-400" />}
                />
                <div className="col-span-1 lg:col-span-2 bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group">
                    <div className="absolute w-64 h-64 bg-cyan-500/5 blur-3xl rounded-full -top-10 -right-10 pointer-events-none"></div>
                    <h3 className="text-sm font-medium text-slate-400 mb-4 flex items-center gap-2">
                        <Activity className="w-4 h-4" /> Volume Weighted Avg Price (Cost Basis)
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {summary?.avgTargetPrices.map(tp => (
                            <div key={tp.product} className="bg-slate-900/40 p-3 rounded-xl border border-slate-700/30 flex flex-col gap-2 relative">
                                <p className="text-xs font-semibold text-slate-300 border-b border-slate-700/50 pb-1.5">{tp.product}</p>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Buy Low</p>
                                        <p className="text-xl font-bold font-mono tracking-tight text-emerald-400">
                                            {tp.buyLowVwap > 0 ? tp.buyLowVwap.toFixed(4) : '-'}
                                        </p>
                                    </div>
                                    <div>
                                        <p className="text-[10px] uppercase tracking-wider text-slate-500 mb-1">Sell High</p>
                                        <p className="text-xl font-bold font-mono tracking-tight text-fuchsia-400">
                                            {tp.sellHighVwap > 0 ? tp.sellHighVwap.toFixed(4) : '-'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Main Charts area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">

                {/* Line Chart: Consolidated USDT Profit */}
                <div className="lg:col-span-2 bg-slate-800/30 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl relative overflow-hidden group hover:border-slate-600/50 transition-colors">
                    <div className="absolute inset-0 bg-gradient-to-t from-emerald-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none" />
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-emerald-400" />
                        Consolidated Profit Timeline (USDT)
                    </h3>
                    <div className="h-72 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={summary?.timelineData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(val) => `$${val}`} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)' }}
                                    itemStyle={{ color: '#e2e8f0' }}
                                />
                                <Line type="monotone" dataKey="cumulativeUsdtProfit" stroke="#34d399" strokeWidth={3} dot={{ r: 4, fill: '#059669', strokeWidth: 2 }} activeDot={{ r: 8, stroke: '#10b981', strokeWidth: 2 }} animationDuration={1500} />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Capital Allocation */}
                <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl hover:border-slate-600/50 transition-colors">
                    <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                        <PieChartIcon className="w-5 h-5 text-cyan-400" />
                        Investment Allocation
                    </h3>
                    <div className="h-64 pt-4">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={summary?.allocationPieData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={70}
                                    outerRadius={90}
                                    paddingAngle={8}
                                    dataKey="value"
                                    stroke="none"
                                    animationDuration={1000}
                                >
                                    {summary?.allocationPieData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px' }}
                                />
                                <Legend verticalAlign="bottom" height={36} iconType="circle" />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* Transactions Table */}
            <div className="bg-slate-800/30 backdrop-blur-md border border-slate-700/50 rounded-2xl p-6 shadow-2xl overflow-x-auto hover:border-slate-600/50 transition-colors">
                <h3 className="text-lg font-semibold text-white mb-6 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-indigo-400" />
                    Target Match Transactions
                </h3>
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="border-b border-slate-700 text-xs uppercase tracking-wider text-slate-400">
                            <th className="pb-4 font-medium px-2">Product</th>
                            <th className="pb-4 font-medium px-2">Direction</th>
                            <th className="pb-4 font-medium px-2">Target Price</th>
                            <th className="pb-4 font-medium px-2">Amount</th>
                            <th className="pb-4 font-medium px-2">APR (Promised/Real)</th>
                            <th className="pb-4 font-medium px-2">Earned (Token)</th>
                            <th className="pb-4 font-medium px-2">Earned (USDT)</th>
                            <th className="pb-4 font-medium px-2">Status / Win</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm divide-y divide-slate-700/50">
                        {transactions.slice(0, 10).map((tx, i) => (
                            <tr key={i} className="hover:bg-slate-700/20 transition-colors group">
                                <td className="py-4 px-2 font-medium text-slate-200">{tx.productName}</td>
                                <td className="py-4 px-2">
                                    <span className={`px-2.5 py-1 rounded-md text-xs font-semibold tracking-wide ${tx.orderDirection.includes('Buy') ? 'bg-cyan-500/10 text-cyan-400' : 'bg-fuchsia-500/10 text-fuchsia-400'}`}>
                                        {tx.orderDirection}
                                    </span>
                                </td>
                                <td className="py-4 px-2 font-mono text-slate-300 group-hover:text-white transition-colors">{tx.targetPrice}</td>
                                <td className="py-4 px-2 font-mono text-slate-300">{tx.investmentAmount.toFixed(4)} <span className="text-xs text-slate-500">{tx.investmentToken}</span></td>
                                <td className="py-4 px-2 font-mono">
                                    <div className="flex flex-col gap-0.5">
                                        <span className="text-slate-300" title="Promised APR">{tx.apr.toFixed(2)}%</span>
                                        {tx.realApr !== null && tx.realApr !== undefined && (
                                            <span className={`text-xs ${tx.realApr >= tx.apr ? 'text-emerald-400' : 'text-amber-400'}`} title="Real APR">
                                                {tx.realApr.toFixed(2)}%
                                            </span>
                                        )}
                                    </div>
                                </td>
                                <td className="py-4 px-2 font-mono text-slate-300">
                                    {tx.status === 'Completed' && tx.profitAmount !== null ? (
                                        <>
                                            {tx.profitAmount > 0 ? '+' : ''}{tx.profitAmount.toFixed(4)} <span className="text-xs text-slate-500">{tx.profitToken}</span>
                                        </>
                                    ) : '-'}
                                </td>
                                <td className="py-4 px-2 font-mono text-slate-300">
                                    {tx.status === 'Completed' && tx.profitAmount !== null && tx.profitToken !== 'USDT' && tx.settlementPrice ? (
                                        <span className="text-xs text-slate-400">≈ ${(tx.profitAmount * tx.settlementPrice).toFixed(2)}</span>
                                    ) : tx.status === 'Completed' && tx.profitToken === 'USDT' ? (
                                        <span className="text-xs text-slate-400">≈ ${(tx.profitAmount || 0).toFixed(2)}</span>
                                    ) : '-'}
                                </td>
                                <td className="py-4 px-2">
                                    {tx.status === 'Completed' ? (
                                        <div className="flex items-center gap-2">
                                            <ShieldCheck className="w-4 h-4 text-slate-400" />
                                            <span className={`text-xs font-bold px-2.5 py-1 rounded-md tracking-wide ${tx.winOrLoss === 'Win' ? 'bg-emerald-500/20 text-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.15)]' : 'bg-slate-700 text-slate-300'}`}>
                                                {tx.winOrLoss}
                                            </span>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col gap-1 items-start">
                                            <span className="text-amber-400 text-xs font-semibold bg-amber-400/10 px-2.5 py-1 rounded-md tracking-wide flex items-center gap-1 w-max">
                                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                                Pending
                                            </span>
                                            <span className="text-[10px] text-slate-400 font-mono">
                                                {mounted ? getRemainingTime(tx.settlementTime, now) : 'Loading...'}
                                            </span>
                                        </div>
                                    )}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>

        </div>
    );
}

const COLORS = ['#34d399', '#22d3ee', '#818cf8', '#a78bfa', '#f472b6'];

function MetricCard({ title, value, icon, trend }: { title: string, value: string | number, icon: React.ReactNode, trend?: string }) {
    return (
        <div className="bg-slate-800/40 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-6 shadow-xl relative overflow-hidden group hover:-translate-y-1 transition-transform duration-300">
            <div className="absolute -right-6 -top-6 w-24 h-24 bg-white/5 rounded-full blur-2xl group-hover:bg-white/10 transition-colors duration-500"></div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-medium text-slate-400">{title}</h3>
                <div className="p-2 bg-slate-700/50 rounded-lg text-white shadow-inner">{icon}</div>
            </div>
            <div className="flex items-baseline gap-3">
                <p className="text-3xl font-bold font-mono text-white tracking-tight drop-shadow-sm">{value}</p>
                {trend && (
                    <span className="text-xs font-bold text-emerald-400 bg-emerald-400/10 px-2 py-1 rounded-md flex items-center gap-0.5 shadow-sm">
                        <ArrowUpRight className="w-3 h-3" /> {trend}
                    </span>
                )}
            </div>
        </div>
    );
}

function getRemainingTime(settlementTime: Date, now: Date): string {
    const diff = settlementTime.getTime() - now.getTime();
    if (diff <= 0) return 'Settling...';

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return `${hours}h ${minutes}m ${seconds}s left`;
}
