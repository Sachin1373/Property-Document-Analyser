'use client';
import { Clause } from '@/types';
import { RiskBadge } from './RiskBadge';
import { useState } from 'react';

export function ClauseList({ clauses }: { clauses: Clause[] }) {
  const [filter, setFilter] = useState<string>('All');

  const filtered = filter === 'All' ? clauses : clauses.filter(c => c.classification === filter);
  const counts = {
    'Red Flag': clauses.filter(c => c.classification === 'Red Flag').length,
    'Unusual': clauses.filter(c => c.classification === 'Unusual').length,
    'Standard': clauses.filter(c => c.classification === 'Standard').length,
  };

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900 mb-3">Clause Analysis</h2>

      <div className="flex gap-2 mb-4 flex-wrap">
        {['All', 'Red Flag', 'Unusual', 'Standard'].map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              filter === f ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:border-gray-400'
            }`}
          >
            {f} {f !== 'All' && `(${counts[f as keyof typeof counts]})`}
          </button>
        ))}
      </div>

      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {filtered.map((clause, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-1">
              <RiskBadge level={clause.classification} />
              <span className="text-xs text-gray-400">{clause.confidence} confidence</span>
            </div>
            <p className="text-sm text-gray-700 mt-2 font-mono bg-gray-50 p-2 rounded text-xs leading-relaxed">
              &quot;{clause.text}&quot;
            </p>
            <p className="text-xs text-gray-500 mt-2">{clause.reasoning}</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">No clauses in this category</p>
        )}
      </div>
    </div>
  );
}
