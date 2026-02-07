import React from 'react';
import { RiskStatus } from '../services/inventoryEngine.js';

const styles = {
  [RiskStatus.LOW]: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20',
  [RiskStatus.MODERATE]: 'text-amber-500 bg-amber-500/10 border-amber-500/20',
  [RiskStatus.HIGH]: 'text-orange-500 bg-orange-500/10 border-orange-500/20',
  [RiskStatus.CRITICAL]: 'text-red-500 bg-red-500/10 border-red-500/20 shadow-[0_0_10px_rgba(239,68,68,0.2)]',
};

export function RiskBadge({ status }) {
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border transition-all duration-300 mono ${styles[status] ?? ''}`}
    >
      {status}
    </span>
  );
}
