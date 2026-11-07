// src/PatentFiling/PatentAnalytics.jsx
// Executive Filer Workload & Capacity Analytics Platform for Firm Leadership
// Tracks real-time patent filer capacity, active matters balancing, load-vs-average intelligence,
// and provides rich executive report exports (CSV, detailed Excel, and printable PDF).

import React, { useState, useMemo, useEffect } from 'react';
import {
  BarChart3,
  Users,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  Download,
  RotateCcw,
  Search,
  ArrowUpDown,
  Filter,
  Plus,
  Edit2,
  Trash2,
  ShieldCheck,
  Activity,
  FileText,
  Printer,
  X
} from 'lucide-react';

import { supabase } from '../supabaseClient.js';
import { isSameMemberName } from '../patent/patentRoles.js';
import {
  DEFAULT_FILERS,
  FILER_WORKLOAD_STORAGE_KEY
} from './filerWorkloadConstants.js';
import {
  DEFAULT_DRAFTERS
} from './drafterWorkloadConstants.js';

export { DEFAULT_DRAFTERS, DEFAULT_FILERS };

const STORAGE_KEY = FILER_WORKLOAD_STORAGE_KEY;

export default function PatentAnalytics({ currentUser, allEmployees = [] }) {
  const [filers, setFilers] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_FILERS;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'OVERLOAD' | 'NORMAL' | 'LIGHT'
  const [sortField, setSortField] = useState('DEFAULT'); // 'DEFAULT' | 'ACTIVE_DESC' | 'ACTIVE_ASC' | 'NAME'
  const [editingFiler, setEditingFiler] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showReportModal, setShowReportModal] = useState(false);
  const [newFilerName, setNewFilerName] = useState('');
  const [newFilerActive, setNewFilerActive] = useState('');

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(filers));
    } catch (e) {}
  }, [filers]);

  // Live sync with active patent filings from Supabase & local storage cache
  useEffect(() => {
    let isMounted = true;
    async function loadLiveFilerCounts() {
      try {
        const { data: filings } = await supabase
          .from('patent_filings')
          .select('id, code, assignee_id, status');

        const { data: members } = await supabase
          .from('members')
          .select('id, name');

        const memberMap = {};
        (members || []).forEach(m => { memberMap[m.id] = m.name; });

        if (Array.isArray(filings) && filings.length > 0) {
          const liveCounts = {};
          filings.forEach(f => {
            if (f.status === 'CLOSED') return; // only count active matters
            const name = memberMap[f.assignee_id] || f.assignee_id || 'Unassigned';
            for (const baseFiler of DEFAULT_FILERS) {
              if (isSameMemberName(name, baseFiler.name)) {
                liveCounts[baseFiler.name] = (liveCounts[baseFiler.name] || 0) + 1;
              }
            }
          });

          if (isMounted) {
            setFilers(prev => prev.map(f => ({
              ...f,
              active: typeof liveCounts[f.name] === 'number' ? liveCounts[f.name] : f.active
            })));
          }
        }
      } catch (err) {
        console.warn('Live filer counts sync fallback:', err);
      }
    }
    loadLiveFilerCounts();
    return () => { isMounted = false; };
  }, []);

  // Baseline load calculations
  const stats = useMemo(() => {
    const totalActive = filers.reduce((sum, d) => sum + (Number(d.active) || 0), 0);
    const count = filers.length || 1;
    const dynamicMean = Math.round(totalActive / count) || 1;
    // Standard baseline average (minimum benchmark of 5 or dynamic mean)
    const avgLoad = Math.max(5, dynamicMean);

    let overloadedCount = 0;
    let normalCount = 0;
    let lightCount = 0;

    filers.forEach(d => {
      const active = Number(d.active) || 0;
      const pct = Math.round((active / avgLoad) * 100);
      if (pct > 120) overloadedCount++;
      else if (pct >= 75) normalCount++;
      else lightCount++;
    });

    return {
      totalActive,
      count,
      avgLoad,
      dynamicMean,
      overloadedCount,
      normalCount,
      lightCount
    };
  }, [filers]);

  // Calculate percentage and styling for each filer
  const filersWithMetrics = useMemo(() => {
    const maxActive = Math.max(...filers.map(d => Number(d.active) || 0), 15);

    return filers.map(d => {
      const active = Number(d.active) || 0;
      const pct = Math.round((active / stats.avgLoad) * 100);

      // Color coding rule:
      // Red: > 120% (Overloaded)
      // Blue: 75% - 120% (Normal load)
      // Green: < 75% (Light load)
      let category = 'NORMAL';
      let label = 'Balanced';
      let barColor = 'bg-[#3b82f6]';
      let textColor = 'text-[#3b82f6]';
      let borderGlow = 'border-blue-500/30';
      let recommendation = 'Capacity balanced. Maintain steady allocation.';

      if (pct > 120) {
        category = 'OVERLOAD';
        label = 'Overloaded';
        barColor = 'bg-[#ef4444]';
        textColor = 'text-[#ef4444]';
        borderGlow = 'border-red-500/30';
        recommendation = 'Exceeds capacity. Pause new matters and reassign pending filings.';
      } else if (pct < 75) {
        category = 'LIGHT';
        label = 'Light Load';
        barColor = 'bg-[#22c55e]';
        textColor = 'text-[#22c55e]';
        borderGlow = 'border-emerald-500/30';
        recommendation = 'Ample capacity. Prioritize for upcoming patent filings and office actions.';
      }

      // Bar fill width relative to highest load
      const barFillPercent = Math.min(100, Math.max(8, Math.round((active / maxActive) * 100)));

      return {
        ...d,
        active,
        pct,
        category,
        label,
        barColor,
        textColor,
        borderGlow,
        barFillPercent,
        recommendation
      };
    });
  }, [filers, stats.avgLoad]);

  // Filtered & Sorted Filers
  const displayFilers = useMemo(() => {
    let list = filersWithMetrics.filter(d => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        return d.name.toLowerCase().includes(q) || d.initials.toLowerCase().includes(q);
      }
      return true;
    });

    if (statusFilter === 'OVERLOAD') {
      list = list.filter(d => d.category === 'OVERLOAD');
    } else if (statusFilter === 'NORMAL') {
      list = list.filter(d => d.category === 'NORMAL');
    } else if (statusFilter === 'LIGHT') {
      list = list.filter(d => d.category === 'LIGHT');
    }

    if (sortField === 'ACTIVE_DESC') {
      list.sort((a, b) => b.active - a.active);
    } else if (sortField === 'ACTIVE_ASC') {
      list.sort((a, b) => a.active - b.active);
    } else if (sortField === 'NAME') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [filersWithMetrics, searchQuery, statusFilter, sortField]);

  // Reset to default reference numbers
  const handleReset = () => {
    if (window.confirm('Reset Filer Workload to baseline patent filer numbers?')) {
      setFilers(DEFAULT_FILERS);
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    }
  };

  // Export raw CSV
  const handleExportCsv = () => {
    const headers = ['Filer,Active Filings,Load Vs Avg %,Capacity Status,Recommendation'];
    const rows = filersWithMetrics.map(d => `"${d.name}",${d.active},${d.pct}%,${d.label},"${d.recommendation}"`);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `patent_filer_workload_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Detailed Executive Report Download (CSV / Excel formatted with Metadata & KPIs)
  const handleDownloadDetailedReport = () => {
    const generatedDate = new Date().toLocaleString();
    const leaderName = currentUser?.name || 'Firm Leadership';

    const reportLines = [
      '========================================================================================================',
      'LEXTRIA IP ECOSYSTEM — EXECUTIVE PATENT FILER WORKLOAD & CAPACITY REPORT',
      '========================================================================================================',
      `Report Generated: "${generatedDate}"`,
      `Generated By: "${leaderName}"`,
      'Department: Patent Filing & Prosecution',
      '',
      '--- EXECUTIVE KPI SUMMARY ---',
      `Total Active Patent Filings: ${stats.totalActive}`,
      `Total Active Filers: ${stats.count}`,
      `Target Benchmark Average Load: ${stats.avgLoad} matters/filer`,
      `Overloaded Filers (>120% capacity): ${stats.overloadedCount}`,
      `Balanced & Light Capacity Filers: ${stats.normalCount + stats.lightCount}`,
      '',
      '--- INDIVIDUAL FILER WORKLOAD BREAKDOWN ---',
      'Filer Name,Active Filings,Load vs Benchmark %,Status,Recommended Leadership Action',
      ...filersWithMetrics.map(f =>
        `"${f.name}",${f.active},${f.pct}%,${f.label},"${f.recommendation}"`
      ),
      '',
      '========================================================================================================',
      'CONFIDENTIAL — FOR INTERNAL FIRM LEADERSHIP USE ONLY',
      '========================================================================================================'
    ];

    const csvContent = 'data:text/csv;charset=utf-8,' + reportLines.join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `Lextria_Patent_Filer_Executive_Report_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Printable / Save as PDF Executive Report
  const handlePrintReport = () => {
    const generatedDate = new Date().toLocaleString();
    const leaderName = currentUser?.name || 'Firm Leadership';

    const printWindow = window.open('', '_blank', 'width=900,height=750');
    if (!printWindow) return;

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Lextria IP - Patent Filer Workload Report</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 32px; color: #1e293b; }
            h1 { font-size: 20px; font-weight: bold; margin-bottom: 4px; color: #0f172a; }
            .sub { font-size: 12px; color: #64748b; margin-bottom: 24px; }
            .kpi-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 28px; }
            .kpi-card { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; background: #f8fafc; }
            .kpi-label { font-size: 10px; text-transform: uppercase; font-weight: bold; color: #64748b; }
            .kpi-val { font-size: 22px; font-weight: bold; margin-top: 4px; color: #0f172a; }
            table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 28px; }
            th { text-align: left; padding: 8px 12px; background: #f1f5f9; border-bottom: 2px solid #cbd5e1; font-size: 11px; text-transform: uppercase; color: #475569; }
            td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }
            .status-badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-weight: bold; font-size: 10px; }
            .status-overload { background: #fee2e2; color: #991b1b; }
            .status-normal { background: #dbeafe; color: #1e40af; }
            .status-light { background: #dcfce7; color: #166534; }
            .footer { font-size: 10px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; margin-top: 32px; text-align: center; }
          </style>
        </head>
        <body>
          <h1>LEXTRIA IP ECOSYSTEM — PATENT FILER CAPACITY & WORKLOAD REPORT</h1>
          <div class="sub">Generated on ${generatedDate} | Authorized by ${leaderName} | Confidential Leadership Report</div>

          <div class="kpi-grid">
            <div class="kpi-card">
              <div class="kpi-label">Total Active Load</div>
              <div class="kpi-val">${stats.totalActive}</div>
              <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Across ${stats.count} filers</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Benchmark Average</div>
              <div class="kpi-val" style="color: #0d9488;">${stats.avgLoad}</div>
              <div style="font-size: 10px; color: #64748b; margin-top: 2px;">Target load / filer</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Overloaded Filers</div>
              <div class="kpi-val" style="color: #dc2626;">${stats.overloadedCount}</div>
              <div style="font-size: 10px; color: #dc2626; margin-top: 2px;">> 120% benchmark</div>
            </div>
            <div class="kpi-card">
              <div class="kpi-label">Balanced / Light</div>
              <div class="kpi-val" style="color: #16a34a;">${stats.normalCount + stats.lightCount}</div>
              <div style="font-size: 10px; color: #16a34a; margin-top: 2px;">Healthy capacity</div>
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th>Filer Name</th>
                <th style="text-align: center;">Active Filings</th>
                <th style="text-align: center;">Load vs Avg</th>
                <th>Capacity Status</th>
                <th>Leadership Recommendation</th>
              </tr>
            </thead>
            <tbody>
              ${filersWithMetrics.map(f => `
                <tr>
                  <td><strong>${f.name}</strong></td>
                  <td style="text-align: center; font-weight: bold;">${f.active}</td>
                  <td style="text-align: center;">${f.pct}%</td>
                  <td>
                    <span class="status-badge ${
                      f.category === 'OVERLOAD' ? 'status-overload' : f.category === 'LIGHT' ? 'status-light' : 'status-normal'
                    }">
                      ${f.label}
                    </span>
                  </td>
                  <td style="color: #475569;">${f.recommendation}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>

          <div class="footer">
            Confidential Internal Intelligence Report • Lextria Research & Management Ecosystem
          </div>
        </body>
      </html>
    `;

    printWindow.document.write(htmlContent);
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
    }, 300);
  };

  // Add new filer
  const handleAddFiler = (e) => {
    e.preventDefault();
    if (!newFilerName.trim()) return;
    const name = newFilerName.trim();
    const active = Math.max(0, parseInt(newFilerActive, 10) || 0);
    const initials = name.slice(0, 2).toUpperCase();

    const newRecord = {
      id: `filer-${Date.now()}`,
      name,
      initials,
      active
    };

    setFilers(prev => [...prev, newRecord]);
    setNewFilerName('');
    setNewFilerActive('');
    setShowAddModal(false);
  };

  // Save edit
  const handleSaveEdit = (id, newActive) => {
    const parsed = Math.max(0, parseInt(newActive, 10) || 0);
    setFilers(prev => prev.map(d => d.id === id ? { ...d, active: parsed } : d));
    setEditingFiler(null);
  };

  // Remove filer
  const handleRemoveFiler = (id) => {
    if (window.confirm('Remove this filer from workload tracking?')) {
      setFilers(prev => prev.filter(d => d.id !== id));
    }
  };

  return (
    <div className="flex-1 min-h-0 bg-[#0a0a0c] text-white p-6 overflow-y-auto custom-scrollbar">
      {/* Header Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2.5">
              <BarChart3 className="text-blue-400" size={26} />
              Filer Workload & Capacity Analytics
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Leaders Only
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time patent filer capacity distribution, workload balancing, and load-versus-average intelligence.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_15px_rgba(37,99,235,0.4)] transition cursor-pointer"
          >
            <Plus size={14} /> Add Filer
          </button>
          <button
            onClick={() => setShowReportModal(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-600/80 hover:bg-indigo-600 text-white border border-indigo-500/30 text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_15px_rgba(99,102,241,0.3)] transition cursor-pointer"
            title="Export full executive report"
          >
            <FileText size={14} /> Export Report
          </button>
          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Export raw CSV"
          >
            <Download size={14} /> Export CSV
          </button>
          <button
            onClick={handleReset}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Reset to benchmark values"
          >
            <RotateCcw size={14} /> Reset
          </button>
        </div>
      </div>

      {/* KPI Overview Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 mb-6">
        <div className="bg-[#121110] border border-[#262320] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Total Active Load</span>
            <Activity size={16} className="text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">{stats.totalActive}</div>
          <p className="text-[11px] text-slate-400 mt-1">Active matters across {stats.count} filers</p>
        </div>

        <div className="bg-[#121110] border border-[#262320] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Baseline Avg Load</span>
            <TrendingUp size={16} className="text-teal-400" />
          </div>
          <div className="text-2xl font-bold text-teal-400 tracking-tight">{stats.avgLoad}</div>
          <p className="text-[11px] text-slate-400 mt-1">Target benchmark average</p>
        </div>

        <div className="bg-[#121110] border border-[#262320] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Overloaded Filers</span>
            <AlertTriangle size={16} className="text-red-400" />
          </div>
          <div className="text-2xl font-bold text-red-400 tracking-tight">{stats.overloadedCount}</div>
          <p className="text-[11px] text-red-400/80 mt-1">Exceeding 120% average load</p>
        </div>

        <div className="bg-[#121110] border border-[#262320] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1">
            <span className="text-xs font-medium uppercase tracking-wider">Balanced / Light</span>
            <CheckCircle2 size={16} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 tracking-tight">
            {stats.normalCount + stats.lightCount}
          </div>
          <p className="text-[11px] text-emerald-400/80 mt-1">Healthy load capacity</p>
        </div>
      </div>

      {/* Main Filer Workload Platform Container */}
      <div className="bg-[#141210] border border-[#29241f] rounded-2xl p-6 shadow-xl max-w-3xl">
        {/* Table Title */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Filer workload
          </h2>

          {/* Quick Filter & Sort */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Search filer..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-[#1d1a16] border border-[#38322b] rounded-lg text-xs text-white pl-8 pr-2.5 py-1 w-36 focus:outline-none focus:border-stone-400"
              />
            </div>
            <select
              value={sortField}
              onChange={(e) => setSortField(e.target.value)}
              className="bg-[#1d1a16] border border-[#38322b] rounded-lg text-xs text-stone-300 px-2 py-1 focus:outline-none cursor-pointer"
            >
              <option value="DEFAULT">Original Order</option>
              <option value="ACTIVE_DESC">Highest Load</option>
              <option value="ACTIVE_ASC">Lowest Load</option>
              <option value="NAME">Name (A-Z)</option>
            </select>
          </div>
        </div>

        {/* Table Header: FILER | ACTIVE | LOAD VS. AVG */}
        <div className="grid grid-cols-12 text-stone-400 text-[11px] font-bold uppercase tracking-wider pb-3 border-b border-[#29241f] select-none">
          <div className="col-span-5 pl-2">FILER</div>
          <div className="col-span-3 text-center">ACTIVE</div>
          <div className="col-span-4 text-left pl-6">LOAD VS. AVG</div>
        </div>

        {/* Table Rows */}
        <div className="divide-y divide-[#221e1a]">
          {displayFilers.map((filer) => (
            <div
              key={filer.id}
              className="grid grid-cols-12 items-center py-3.5 hover:bg-white/[0.02] transition px-2 rounded-xl group"
            >
              {/* 1. Filer Avatar + Name */}
              <div className="col-span-5 flex items-center gap-3.5 min-w-0">
                <div className="w-8 h-8 rounded-full bg-white text-black font-bold text-xs flex items-center justify-center shrink-0 shadow-sm">
                  {filer.initials}
                </div>
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-white truncate block">
                    {filer.name}
                  </span>
                  <span className="text-[10px] text-stone-400 block truncate">
                    {filer.label}
                  </span>
                </div>
              </div>

              {/* 2. Active Matters (Editable by Leader) */}
              <div className="col-span-3 text-center">
                {editingFiler === filer.id ? (
                  <div className="inline-flex items-center gap-1.5">
                    <input
                      type="number"
                      defaultValue={filer.active}
                      onBlur={(e) => handleSaveEdit(filer.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleSaveEdit(filer.id, e.target.value);
                        if (e.key === 'Escape') setEditingFiler(null);
                      }}
                      className="w-16 bg-[#1f1b16] border border-blue-500 rounded px-1.5 py-0.5 text-center text-sm font-bold text-white focus:outline-none"
                      autoFocus
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-1.5">
                    <span className="text-sm font-bold text-white tracking-wide">
                      {filer.active}
                    </span>
                    <button
                      onClick={() => setEditingFiler(filer.id)}
                      className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-white/10 rounded text-stone-400 hover:text-white cursor-pointer"
                      title="Edit active count"
                    >
                      <Edit2 size={11} />
                    </button>
                    <button
                      onClick={() => handleRemoveFiler(filer.id)}
                      className="opacity-0 group-hover:opacity-100 transition p-1 hover:bg-red-500/20 rounded text-stone-400 hover:text-red-400 cursor-pointer"
                      title="Remove filer"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                )}
              </div>

              {/* 3. Load vs Avg Progress Bar + Pct Tag */}
              <div className="col-span-4 flex items-center gap-3 pl-6">
                {/* Horizontal Progress Bar matching screenshot */}
                <div className="flex-1 h-1.5 bg-[#25201b] rounded-full overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${filer.barColor}`}
                    style={{ width: `${filer.barFillPercent}%` }}
                  />
                </div>

                {/* Percentage Tag */}
                <span className={`text-xs font-bold w-12 text-right ${filer.textColor}`}>
                  {filer.pct}%
                </span>
              </div>
            </div>
          ))}

          {displayFilers.length === 0 && (
            <div className="py-8 text-center text-xs text-stone-500 italic">
              No filers found matching your search.
            </div>
          )}
        </div>
      </div>

      {/* Add Filer Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-[#141210] border border-[#29241f] rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="text-base font-bold text-white mb-4">Add Patent Filer</h3>
            <form onSubmit={handleAddFiler} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1">
                  Filer Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Nikhil"
                  value={newFilerName}
                  onChange={(e) => setNewFilerName(e.target.value)}
                  className="w-full bg-[#1d1a16] border border-[#38322b] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-stone-300 mb-1">
                  Active Matters Load
                </label>
                <input
                  type="number"
                  placeholder="e.g. 8"
                  value={newFilerActive}
                  onChange={(e) => setNewFilerActive(e.target.value)}
                  className="w-full bg-[#1d1a16] border border-[#38322b] rounded-xl px-3 py-2 text-xs text-white focus:outline-none focus:border-blue-500"
                  min="0"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-xs font-semibold text-stone-300 transition cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white transition cursor-pointer"
                >
                  Save Filer
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Executive Report Export Preview Modal */}
      {showReportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#121110] border border-[#2a241e] rounded-2xl p-6 w-full max-w-2xl shadow-2xl flex flex-col max-h-[85vh]">
            {/* Modal Header */}
            <div className="flex items-start justify-between pb-4 border-b border-[#29241f]">
              <div className="flex items-center gap-2.5">
                <FileText className="text-indigo-400" size={22} />
                <div>
                  <h3 className="text-base font-bold text-white">Executive Patent Filer Capacity Report</h3>
                  <p className="text-[11px] text-stone-400">Formal leadership report ready for download or printable PDF</p>
                </div>
              </div>
              <button
                onClick={() => setShowReportModal(false)}
                className="text-stone-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition"
              >
                <X size={18} />
              </button>
            </div>

            {/* Modal Body Preview */}
            <div className="flex-1 overflow-y-auto py-4 space-y-4 custom-scrollbar text-xs">
              <div className="p-3.5 rounded-xl bg-white/5 border border-white/10 grid grid-cols-2 md:grid-cols-4 gap-3 text-center">
                <div>
                  <div className="text-[10px] text-stone-400 font-bold uppercase">Total Active Load</div>
                  <div className="text-lg font-bold text-white mt-0.5">{stats.totalActive}</div>
                </div>
                <div>
                  <div className="text-[10px] text-teal-400 font-bold uppercase">Benchmark Avg</div>
                  <div className="text-lg font-bold text-teal-400 mt-0.5">{stats.avgLoad}</div>
                </div>
                <div>
                  <div className="text-[10px] text-red-400 font-bold uppercase">Overloaded</div>
                  <div className="text-lg font-bold text-red-400 mt-0.5">{stats.overloadedCount}</div>
                </div>
                <div>
                  <div className="text-[10px] text-emerald-400 font-bold uppercase">Healthy Capacity</div>
                  <div className="text-lg font-bold text-emerald-400 mt-0.5">{stats.normalCount + stats.lightCount}</div>
                </div>
              </div>

              <div className="border border-[#29241f] rounded-xl overflow-hidden">
                <table className="w-full text-left">
                  <thead className="bg-[#1c1915] text-[10px] uppercase text-stone-400 font-bold">
                    <tr>
                      <th className="p-2.5">Filer</th>
                      <th className="p-2.5 text-center">Active Load</th>
                      <th className="p-2.5 text-center">Load %</th>
                      <th className="p-2.5">Status</th>
                      <th className="p-2.5">Recommendation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#221e1a]">
                    {filersWithMetrics.map(f => (
                      <tr key={f.id} className="hover:bg-white/[0.02]">
                        <td className="p-2.5 font-semibold text-white">{f.name}</td>
                        <td className="p-2.5 text-center font-bold text-stone-200">{f.active}</td>
                        <td className={`p-2.5 text-center font-bold ${f.textColor}`}>{f.pct}%</td>
                        <td className="p-2.5">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${f.borderGlow} ${f.textColor} bg-white/5`}>
                            {f.label}
                          </span>
                        </td>
                        <td className="p-2.5 text-[11px] text-stone-400">{f.recommendation}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Modal Footer Controls */}
            <div className="pt-4 border-t border-[#29241f] flex items-center justify-between">
              <span className="text-[11px] text-stone-500">
                Generated by {currentUser?.name || 'Leadership'}
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleDownloadDetailedReport}
                  className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer shadow-lg"
                >
                  <Download size={14} /> Download Detailed Report (.csv)
                </button>
                <button
                  type="button"
                  onClick={handlePrintReport}
                  className="px-3.5 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white flex items-center gap-1.5 transition cursor-pointer shadow-lg"
                >
                  <Printer size={14} /> Print / Save as PDF
                </button>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/15 text-xs font-semibold text-stone-300 transition cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
