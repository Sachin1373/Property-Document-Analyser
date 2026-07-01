'use client';

const colours = {
  'Standard': 'bg-green-100 text-green-800 border-green-200',
  'Unusual': 'bg-yellow-100 text-yellow-800 border-yellow-200',
  'Red Flag': 'bg-red-100 text-red-800 border-red-200',
};

export function RiskBadge({ level }: { level: 'Standard' | 'Unusual' | 'Red Flag' }) {
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${colours[level]}`}>
      {level}
    </span>
  );
}
