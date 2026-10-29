// src/PatentFiling/PatentAnalytics.jsx
// Executive Drafter Workload & Capacity Analytics Platform for Firm Leadership
// Faithfully matches the executive dashboard design with live capacity tracking,
// load vs average balancing, color-coded health indicators, and CSV export.

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
  Activity
} from 'lucide-react';

import {
  DEFAULT_DRAFTERS,
  DRAFTER_WORKLOAD_STORAGE_KEY
} from './drafterWorkloadConstants.js';

export { DEFAULT_DRAFTERS };

export default function PatentAnalytics({ currentUser, allEmployees = [] }) {
  const [drafters, setDrafters] = useState(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return DEFAULT_DRAFTERS;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'OVERLOAD' | 'NORMAL' | 'LIGHT'
  const [sortField, setSortField] = useState('DEFAULT'); // 'DEFAULT' | 'ACTIVE_DESC' | 'ACTIVE_ASC' | 'NAME'
  const [editingDrafter, setEditingDrafter] = useState(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newDrafterName, setNewDrafterName] = useState('');
  const [newDrafterActive, setNewDrafterActive] = useState('');

  // Persist to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafters));
    } catch (e) {}
  }, [drafters]);

  // Baseline load calculations (Baseline target avg = 110 or dynamic total/count)
  const stats = useMemo(() => {
    const totalActive = drafters.reduce((sum, d) => sum + (Number(d.active) || 0), 0);
    const count = drafters.length || 1;
    // Standard baseline average (110 per reference benchmark, or exact dynamic mean)
    const avgLoad = 110;
    const dynamicMean = Math.round(totalActive / count);

    let overloadedCount = 0;
    let normalCount = 0;
    let lightCount = 0;

    drafters.forEach(d => {
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
  }, [drafters]);

  // Calculate percentage and styling for each drafter
  const draftersWithMetrics = useMemo(() => {
    const maxActive = Math.max(...drafters.map(d => Number(d.active) || 0), 280);

    return drafters.map(d => {
      const active = Number(d.active) || 0;
      const pct = Math.round((active / stats.avgLoad) * 100);

      // Color coding rule matching screenshot:
      // Red: > 120% (Overloaded, e.g. Anusha 251%, Pratham 144%)
      // Blue: 75% - 120% (Normal load, e.g. Thanush 115%, Thilak 80%)
      // Green: < 75% (Light load, e.g. Abhishek 59%, Ayush 70%, Amith 72%, Pramith 72%)
      let category = 'NORMAL';
      let barColor = 'bg-[#3b82f6]';
      let textColor = 'text-[#3b82f6]';
      let borderGlow = 'border-blue-500/30';

      if (pct > 120) {
        category = 'OVERLOAD';
        barColor = 'bg-[#ef4444]';
        textColor = 'text-[#ef4444]';
        borderGlow = 'border-red-500/30';
      } else if (pct < 75) {
        category = 'LIGHT';
        barColor = 'bg-[#22c55e]';
        textColor = 'text-[#22c55e]';
        borderGlow = 'border-emerald-500/30';
      }

      // Bar fill width relative to highest load (e.g. 251% is ~95% width)
      const barFillPercent = Math.min(100, Math.max(10, Math.round((active / maxActive) * 100)));

      return {
        ...d,
        active,
        pct,
        category,
        barColor,
        textColor,
        borderGlow,
        barFillPercent
      };
    });
  }, [drafters, stats.avgLoad]);

  // Filtered & Sorted Drafters
  const displayDrafters = useMemo(() => {
    let list = draftersWithMetrics.filter(d => {
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        if (!d.name.toLowerCase().includes(q)) return false;
      }
      if (statusFilter !== 'ALL' && d.category !== statusFilter) {
        return false;
      }
      return true;
    });

    if (sortField === 'ACTIVE_DESC') {
      list.sort((a, b) => b.active - a.active);
    } else if (sortField === 'ACTIVE_ASC') {
      list.sort((a, b) => a.active - b.active);
    } else if (sortField === 'NAME') {
      list.sort((a, b) => a.name.localeCompare(b.name));
    }

    return list;
  }, [draftersWithMetrics, searchQuery, statusFilter, sortField]);

  // Reset to default reference numbers
  const handleReset = () => {
    if (window.confirm('Reset Drafter Workload to standard benchmark numbers?')) {
      setDrafters(DEFAULT_DRAFTERS);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    const headers = ['Drafter,Active Matters,Load Vs Avg %,Status'];
    const rows = draftersWithMetrics.map(d => `"${d.name}",${d.active},${d.pct}%,${d.category}`);
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers, ...rows].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `drafter_workload_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Add new drafter
  const handleAddDrafter = (e) => {
    e.preventDefault();
    if (!newDrafterName.trim()) return;
    const name = newDrafterName.trim();
    const active = Math.max(0, parseInt(newDrafterActive, 10) || 0);
    const initials = name.slice(0, 2).toUpperCase();

    const newRecord = {
      id: `draft-${Date.now()}`,
      name,
      initials,
      active
    };

    setDrafters(prev => [...prev, newRecord]);
    setNewDrafterName('');
    setNewDrafterActive('');
    setShowAddModal(false);
  };

  // Save edit
  const handleSaveEdit = (id, newActive) => {
    const parsed = Math.max(0, parseInt(newActive, 10) || 0);
    setDrafters(prev => prev.map(d => d.id === id ? { ...d, active: parsed } : d));
    setEditingDrafter(null);
  };

  // Remove drafter
  const handleRemoveDrafter = (id) => {
    if (window.confirm('Remove this drafter from workload tracking?')) {
      setDrafters(prev => prev.filter(d => d.id !== id));
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
              Leadership Analytics Platform
            </h1>
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-500/30">
              Leaders Only
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Real-time drafter capacity distribution, workload balancing, and load-versus-average intelligence.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => setShowAddModal(true)}
            className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_15px_rgba(37,99,235,0.4)] transition cursor-pointer"
          >
            <Plus size={14} /> Add Drafter
          </button>
          <button
            onClick={handleExportCsv}
            className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 text-slate-200 border border-white/10 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
            title="Export CSV"
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
          <p className="text-[11px] text-slate-400 mt-1">Active matters across {stats.count} drafters</p>
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
            <span className="text-xs font-medium uppercase tracking-wider">Overloaded Drafters</span>
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

      {/* Main Drafter Workload Platform Container - Exact Match to Screenshot */}
      <div className="bg-[#141210] border border-[#29241f] rounded-2xl p-6 shadow-xl max-w-3xl">
        {/* Table Title matching screenshot */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-white tracking-tight">
            Drafter workload
          </h2>

          {/* Quick Filter & Sort */}
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400" />
              <input
                type="text"
                placeholder="Search drafter..."
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

        {/* Table Header matching screenshot: DRAFTER | ACTIVE | LOAD VS. AVG */}
        <div className="grid grid-cols-12 text-stone-400 text-[11px] font-bold uppercase tracking-wider pb-3 border-b border-[#29241f] select-none">
          <div className="col-span-5 pl-2">DRAFTER</div>
          <div className="col-span-3 text-center">ACTIVE</div>
          <div className="col-span-4 text-left pl-6">LOAD VS. AVG</div>
        </div>

        {/* Table Rows matching screenshot */}
        <div className="divide-y divide-[#221e1a]">
          {displayDrafters.map((drafter) => (
            <div
              key={drafter.id}
              className="grid grid-cols-12 items-center py-3.5 hover:bg-white/[0.02] transition px-2 rounded-xl group"
            >
              {/* 1. Drafter Avatar + Name */}
              <div className="col-span-5 flex items-center gap-3.5 min-w-0">
                {/* Avatar: Circle with light background & dark bold blue 2-letter uppercase initials */}
                <div className="w-9 h-9 rounded-full bg-white flex items-center justify-center shrink-0 shadow-sm">
                  <span className="text-[#1e40af] font-bold text-xs tracking-tight">
                    {drafter.initials || drafter.name.slice(0, 2).toUpperCase()}
                  </span>
                </div>
                {/* Drafter Name */}
                <span className="text-white font-semibold text-sm truncate">
                  {drafter.name}
                </span>
              </div>

              {/* 2. Active Matters Count */}
              <div className="col-span-3 text-center">
                {editingDrafter === drafter.id ? (
                  <input
                    type="number"
                    defaultValue={drafter.active}
                    autoFocus
                    onBlur={(e) => handleSaveEdit(drafter.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit(drafter.id, e.currentTarget.value);
                      if (e.key === 'Escape') setEditingDrafter(null);
                    }}
                    className="w-16 bg-[#25211c] border border-blue-500 rounded px-1.5 py-0.5 text-center text-sm font-bold text-white focus:outline-none"
                  />
                ) : (
                  <span
                    onClick={() => setEditingDrafter(drafter.id)}
                    title="Click to edit active load count"
                    className="text-white font-bold text-base cursor-pointer hover:text-blue-400 transition"
                  >
                    {drafter.active}
                  </span>
                )}
              </div>

              {/* 3. Load vs. Avg Progress Bar & Percentage */}
              <div className="col-span-4 flex items-center justify-between pl-6 gap-3">
                {/* Dark Track & Colored Fill Bar matching screenshot */}
                <div className="flex-1 h-1.5 bg-[#2d2822] rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${drafter.barColor}`}
                    style={{ width: `${drafter.barFillPercent}%` }}
                  />
                </div>

                {/* Percentage text matching color */}
                <span className={`text-sm font-bold tracking-tight min-w-[44px] text-right ${drafter.textColor}`}>
                  {drafter.pct}%
                </span>

                {/* Quick edit & delete icons on hover */}
                <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 pl-1">
                  <button
                    onClick={() => setEditingDrafter(drafter.id)}
                    className="text-stone-400 hover:text-white p-1 rounded"
                    title="Edit Count"
                  >
                    <Edit2 size={12} />
                  </button>
                  <button
                    onClick={() => handleRemoveDrafter(drafter.id)}
                    className="text-stone-400 hover:text-red-400 p-1 rounded"
                    title="Remove Drafter"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          ))}

          {displayDrafters.length === 0 && (
            <div className="text-center py-8 text-stone-500 text-xs">
              No drafters match your search filter.
            </div>
          )}
        </div>
      </div>

      {/* Add Drafter Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181614] border border-[#38322b] rounded-2xl w-full max-w-sm p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-white mb-3">Add Drafter to Workload</h3>
            <form onSubmit={handleAddDrafter} className="space-y-4">
              <div>
                <label className="text-xs text-stone-400 block mb-1">Drafter Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kavana"
                  value={newDrafterName}
                  onChange={(e) => setNewDrafterName(e.target.value)}
                  className="w-full bg-[#25211c] border border-[#38322b] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div>
                <label className="text-xs text-stone-400 block mb-1">Active Matters Count</label>
                <input
                  type="number"
                  required
                  placeholder="e.g. 85"
                  value={newDrafterActive}
                  onChange={(e) => setNewDrafterActive(e.target.value)}
                  className="w-full bg-[#25211c] border border-[#38322b] rounded-xl px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-3 py-1.5 rounded-xl text-xs text-stone-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold"
                >
                  Save Drafter
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
