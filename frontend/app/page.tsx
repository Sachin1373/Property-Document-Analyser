'use client';
import { useState, useRef } from 'react';
import { analyseDocument } from '@/lib/api';
import { AnalysisResult } from '@/types';
import { ExtractedFields } from '@/components/ExtractedFields';
import { ClauseList } from '@/components/ClauseList';

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = (f: File) => {
    if (f.type !== 'application/pdf') {
      setError('Please upload a PDF file');
      return;
    }
    setFile(f);
    setError('');
  };

  const handleAnalyse = async () => {
    if (!file) return;
    setLoading(true);
    setError('');
    try {
      const data = await analyseDocument(file);
      setResult(data);
    } catch (e: unknown) {
      const err = e as { response?: { data?: { error?: string } } };
      setError(err.response?.data?.error || 'Analysis failed. Try again.');
    } finally {
      setLoading(false);
    }
  };


  const truncateFileName = (name :string, maxLength = 30) => {
  const lastDot = name.lastIndexOf(".");

  if (lastDot === -1 || name.length <= maxLength) return name;

  const ext = name.slice(lastDot);
  const base = name.slice(0, lastDot);

  return `${base.slice(0, maxLength - ext.length - 3)}...${ext}`;
};

  if (result) {
    return <ResultsView result={result} onReset={() => { setResult(null); setFile(null); }} />;
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Property Document Analyser</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Upload a sale deed, title document, or lease agreement to extract key fields and flag risky clauses.
          </p>
        </div>

        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <input
            ref={inputRef}
            type="file"
            accept=".pdf"
            className="hidden"
            onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }}
          />
          {file ? (
            <div>
              <p className="text-blue-600 font-medium">{truncateFileName(file.name)}</p>
              <p className="text-gray-400 text-sm mt-1">{(file.size / 1024).toFixed(1)} KB</p>
            </div>
          ) : (
            <div>
              <p className="text-gray-500">Drag and drop your PDF here</p>
              <p className="text-gray-400 text-sm mt-1">or click to browse</p>
            </div>
          )}
        </div>

        {error && <p className="text-red-500 text-sm mt-3 text-center">{error}</p>}

        <button
          onClick={handleAnalyse}
          disabled={!file || loading}
          className="mt-4 w-full bg-blue-600 text-white py-3 rounded-xl font-medium disabled:opacity-50 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
        >
          {loading ? 'Analysing... (this may take 20-30s)' : 'Analyse Document'}
        </button>
      </div>
    </main>
  );
}

function ResultsView({ result, onReset }: { result: AnalysisResult; onReset: () => void }) {
  const riskColour = { Low: 'text-green-600', Medium: 'text-yellow-600', High: 'text-red-600' };

  return (
    <main className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Analysis Complete</h1>
            <p className="text-sm text-gray-500 mt-0.5">{result.summary}</p>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-gray-400">Overall Risk</p>
              <p className={`font-bold ${riskColour[result.overallRisk]}`}>{result.overallRisk}</p>
            </div>
            <button
              onClick={onReset}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100"
            >
              New Document
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ExtractedFields fields={result.extractedFields} />
          <ClauseList clauses={result.clauses} />
        </div>
      </div>
    </main>
  );
}
