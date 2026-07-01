'use client';
import { ExtractedFields as EF } from '@/types';

export function ExtractedFields({ fields }: { fields: EF }) {
  const rows = [
    { label: 'Transaction Type', value: fields.transactionType },
    { label: 'Transaction Value', value: fields.transactionValue },
    { label: 'Property', value: fields.propertyDescription },
    { label: 'Address', value: fields.propertyAddress },
    { label: 'Parties', value: fields.parties.join(', ') },
    { label: 'Encumbrances', value: fields.encumbrances.length ? fields.encumbrances.join('; ') : 'None found' },
    { label: 'Missing Fields', value: fields.missingFields.length ? fields.missingFields.join(', ') : 'None' },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900 mb-4">Extracted Fields</h2>
      <div className="space-y-3">
        {rows.map(row => (
          <div key={row.label} className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-500 uppercase tracking-wide">{row.label}</span>
            <span className="text-sm text-gray-800">{row.value || 'Not found'}</span>
          </div>
        ))}
        {fields.dates.length > 0 && (
          <div className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-500 uppercase tracking-wide">Dates</span>
            {fields.dates.map((d, i) => (
              <span key={i} className="text-sm text-gray-800">{d.type}: {d.value}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
