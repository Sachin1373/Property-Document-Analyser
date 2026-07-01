# Property Document Analyser — Complete Build Guide

> **What you're building:** Upload a property document (sale deed, title doc, lease agreement) → extract key fields → flag risky clauses → show structured output with risk levels. Built with Next.js + Node/Express + OpenAI API. Directly mirrors what Teal India does.

---

## Table of Contents
1. [What This Is (Plain English)](#what-this-is)
2. [Tech Stack + Why Each Tool](#tech-stack)
3. [Architecture Overview](#architecture)
4. [Folder Structure](#folder-structure)
5. [Every Term Explained](#terms-explained)
6. [Step-by-Step Build Plan](#build-plan)
7. [Prompts (Copy-Paste Ready)](#prompts)
8. [API Design](#api-design)
9. [Frontend Screens](#frontend-screens)
10. [Error Handling](#error-handling)
11. [Environment Variables](#env-vars)
12. [Deploy](#deploy)
13. [README (For GitHub)](#readme)

---

## 1. What This Is (Plain English) {#what-this-is}

A user uploads a PDF of a property document. The backend:
1. Extracts raw text from the PDF
2. Sends the text (in chunks if large) to OpenAI API
3. Asks the model to return structured JSON: extracted fields + clause risk analysis
4. Returns the result to the frontend
5. Frontend renders it: clean summary on the left, color-coded risk flags on the right

**Why this impresses Teal:** This is literally their core product — document extraction + legal vetting for property due diligence. You're not building a generic chatbot. You're mirroring their business.

---

## 2. Tech Stack {#tech-stack}

| Layer | Tool | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) | Teal's actual stack. SSR for fast initial load. |
| Styling | Tailwind CSS | Fast, no separate CSS files |
| PDF Extraction | `pdf-parse` (Node) | Extracts raw text from uploaded PDFs |
| File Upload | `multer` (Express middleware) | Handles multipart/form-data uploads |
| Backend | Node.js + Express.js | Your existing stack, Teal's stack |
| LLM | OpenAI API (`gpt-4o-mini`) | Cheap, fast, good JSON output |
| HTTP Client | Axios | For frontend → backend calls |
| Runtime | Node.js 18+ | Required for Next.js 14 |

### What is Next.js vs plain React?
- **React** = UI library, runs in browser only
- **Next.js** = Framework on top of React. Adds:
  - **SSR (Server Side Rendering):** page HTML generated on server → faster first load, better SEO
  - **SSG (Static Site Generation):** pages pre-built at deploy time
  - **App Router:** folder-based routing — `app/page.tsx` = homepage, `app/about/page.tsx` = /about
  - **API Routes:** you can write backend endpoints inside Next.js at `app/api/...` — but here we're keeping Express separate for clarity

### What is `pdf-parse`?
Node.js library that reads a PDF buffer and returns its raw text content. No OCR (can't read scanned image PDFs, only text-based PDFs — fine for this project).

### What is `multer`?
Express middleware that intercepts file uploads from `multipart/form-data` requests and makes the file available on `req.file`. Without it, Express can't handle file uploads.

### What is `gpt-4o-mini`?
OpenAI's cheapest capable model. ~$0.00015 per 1K input tokens. A typical property document is ~2000 tokens → costs < $0.001 per analysis. Use this, not GPT-4.

---

## 3. Architecture {#architecture}

```
┌─────────────────────────────────────────────────────────┐
│                    USER BROWSER                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐   │
│  │           Next.js Frontend (Port 3000)          │   │
│  │                                                 │   │
│  │  [Upload PDF] ──► FormData POST                 │   │
│  │                        │                        │   │
│  │  [Results Page] ◄── JSON response               │   │
│  │  • Extracted Fields                             │   │
│  │  • Risk-flagged Clauses (green/yellow/red)      │   │
│  └─────────────────────────────────────────────────┘   │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTP POST /api/analyse
                       ▼
┌─────────────────────────────────────────────────────────┐
│              Express Backend (Port 5000)                │
│                                                         │
│  1. multer receives PDF file                            │
│  2. pdf-parse extracts raw text                         │
│  3. Text → chunked if > 3000 words                     │
│  4. Each chunk → OpenAI API with structured prompt      │
│  5. Validate JSON response                              │
│  6. Merge chunks → single result object                 │
│  7. Return JSON to frontend                             │
└──────────────────────┬──────────────────────────────────┘
                       │ HTTPS POST
                       ▼
┌─────────────────────────────────────────────────────────┐
│                  OpenAI API                             │
│                                                         │
│  Model: gpt-4o-mini                                     │
│  Input: property document text + system prompt          │
│  Output: strict JSON with extracted fields + risks      │
└─────────────────────────────────────────────────────────┘
```

### Data Flow (step by step)
```
User uploads PDF
      │
      ▼
multer saves to memory buffer (not disk)
      │
      ▼
pdf-parse(buffer) → raw string of text
      │
      ▼
Split text into chunks of ~3000 words each
(OpenAI has token limits; chunking prevents overflow)
      │
      ▼
For each chunk:
  POST to OpenAI with system prompt + chunk as user message
  Receive JSON string back
  JSON.parse() it
  Validate shape (has required fields?)
  If malformed → retry once with stricter prompt
      │
      ▼
Merge results from all chunks
      │
      ▼
Return final JSON to Next.js frontend
      │
      ▼
Frontend renders:
  Left panel: extracted fields (parties, dates, property details)
  Right panel: clauses list with risk badges (Standard/Unusual/Red Flag)
```

---

## 4. Folder Structure {#folder-structure}

```
property-doc-analyser/
│
├── frontend/                    # Next.js app
│   ├── app/
│   │   ├── layout.tsx           # Root layout (html, body tags, global styles)
│   │   ├── page.tsx             # Homepage — upload form
│   │   ├── results/
│   │   │   └── page.tsx         # Results page — shows analysis
│   │   └── globals.css          # Global styles + Tailwind imports
│   ├── components/
│   │   ├── UploadForm.tsx       # Drag-drop PDF upload component
│   │   ├── ExtractedFields.tsx  # Left panel: key fields display
│   │   ├── ClauseList.tsx       # Right panel: risk-flagged clauses
│   │   └── RiskBadge.tsx        # Green/yellow/red badge component
│   ├── lib/
│   │   └── api.ts               # Axios calls to backend
│   ├── types/
│   │   └── index.ts             # TypeScript types for API response
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── tsconfig.json
│   └── package.json
│
├── backend/                     # Express app
│   ├── src/
│   │   ├── index.ts             # Entry point, Express setup
│   │   ├── routes/
│   │   │   └── analyse.ts       # POST /api/analyse route
│   │   ├── services/
│   │   │   ├── pdfExtractor.ts  # pdf-parse wrapper
│   │   │   ├── openaiService.ts # OpenAI API calls + retry logic
│   │   │   └── chunkText.ts     # Text splitting utility
│   │   ├── middleware/
│   │   │   └── upload.ts        # multer config
│   │   └── types/
│   │       └── index.ts         # Shared TypeScript types
│   ├── .env                     # OPENAI_API_KEY here
│   ├── tsconfig.json
│   └── package.json
│
├── .gitignore
└── README.md
```

---

## 5. Every Term Explained {#terms-explained}

### Next.js App Router
Next.js 13+ introduced the "App Router." Every folder inside `app/` becomes a route. A file named `page.tsx` inside a folder is the UI for that route. Example:
- `app/page.tsx` → renders at `/`
- `app/results/page.tsx` → renders at `/results`

### `layout.tsx`
Wraps every page. Put your `<html>`, `<body>`, navbar, footer here. Every `page.tsx` renders inside it.

### Server Component vs Client Component (Next.js)
- **Server Component (default):** runs on server, can fetch data, can't use `useState`/`useEffect`/browser APIs. Add `"use client"` at top to opt out.
- **Client Component:** runs in browser, can use hooks, event handlers, browser APIs.
- **Rule for this project:** Make the upload form and results display Client Components (they need `useState`). Everything else can be server components.

### `multipart/form-data`
The encoding type used when sending files over HTTP. A normal form sends `application/x-www-form-urlencoded` (key=value pairs). Files need `multipart/form-data` because they're binary. On the frontend: `new FormData()` + `axios.post(url, formData)` automatically sets this header.

### Token (in LLM context)
Not a JWT. In LLM world, a token ≈ ~4 characters or ~0.75 words. OpenAI charges per token. `gpt-4o-mini` has a 128K token context window — but keeping your prompt under 4000 tokens is safer and cheaper. A 10-page PDF ≈ 3000-5000 tokens of text.

### Chunking
If a document is too large for one API call, you split it into overlapping chunks, analyse each, then merge results. Overlap (e.g. last 200 words of chunk 1 = first 200 words of chunk 2) ensures clauses spanning a boundary aren't missed.

### Structured Output / JSON Mode
When you prompt an LLM to "respond ONLY in JSON with this exact schema," it usually complies. You can also use OpenAI's `response_format: { type: "json_object" }` parameter to force JSON output. Always `JSON.parse()` the result and validate the shape — models occasionally miss fields or add extra ones.

### CORS (Cross-Origin Resource Sharing)
Browser security blocks frontend (port 3000) from calling backend (port 5000) unless the backend explicitly allows it. Fix: add `cors` middleware to Express. `app.use(cors({ origin: 'http://localhost:3000' }))`.

### `multer` memory storage vs disk storage
- `memoryStorage()` → file lives in RAM as a Buffer. Good for small files, no cleanup needed.
- `diskStorage()` → file saved to disk. Need to delete after processing.
- Use memory storage for this project. PDFs are small.

### Risk Classification
The three levels you'll use:
- **Standard** → normal boilerplate clause, no concern
- **Unusual** → not illegal but worth noting, review recommended
- **Red Flag** → potentially problematic, legal review required

---

## 6. Step-by-Step Build Plan {#build-plan}

### Phase 1: Backend (2-3 hours)

#### Step 1: Init backend
```bash
mkdir property-doc-analyser && cd property-doc-analyser
mkdir backend && cd backend
npm init -y
npm install express cors multer pdf-parse openai dotenv
npm install -D typescript ts-node @types/express @types/multer @types/cors @types/node nodemon
npx tsc --init
```

Update `tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true
  }
}
```

Add to `package.json` scripts:
```json
"scripts": {
  "dev": "nodemon --exec ts-node src/index.ts",
  "build": "tsc",
  "start": "node dist/index.js"
}
```

#### Step 2: Express entry point (`src/index.ts`)
```typescript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import analyseRoute from './routes/analyse';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

app.use('/api', analyseRoute);

app.listen(PORT, () => {
  console.log(`Backend running on port ${PORT}`);
});
```

#### Step 3: multer middleware (`src/middleware/upload.ts`)
```typescript
import multer from 'multer';

const storage = multer.memoryStorage(); // file in RAM as Buffer

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf') {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files allowed'));
    }
  }
});

export default upload;
```

#### Step 4: PDF extractor (`src/services/pdfExtractor.ts`)
```typescript
import pdfParse from 'pdf-parse';

export async function extractTextFromPDF(buffer: Buffer): Promise<string> {
  const data = await pdfParse(buffer);
  return data.text;
}
```

#### Step 5: Text chunker (`src/services/chunkText.ts`)
```typescript
export function chunkText(text: string, maxWords = 3000): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  const overlap = 200; // words of overlap between chunks

  for (let i = 0; i < words.length; i += maxWords - overlap) {
    const chunk = words.slice(i, i + maxWords).join(' ');
    chunks.push(chunk);
    if (i + maxWords >= words.length) break;
  }

  return chunks;
}
```

#### Step 6: OpenAI service (`src/services/openaiService.ts`)
```typescript
import OpenAI from 'openai';

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface Clause {
  text: string;
  classification: 'Standard' | 'Unusual' | 'Red Flag';
  reasoning: string;
  confidence: 'High' | 'Medium' | 'Low';
}

export interface ExtractedFields {
  parties: string[];
  propertyDescription: string;
  propertyAddress: string;
  transactionType: string;
  transactionValue: string;
  dates: { type: string; value: string }[];
  encumbrances: string[];
  missingFields: string[];
}

export interface AnalysisResult {
  extractedFields: ExtractedFields;
  clauses: Clause[];
  summary: string;
  overallRisk: 'Low' | 'Medium' | 'High';
}

const SYSTEM_PROMPT = `You are a legal document analyser specialising in Indian property due diligence.
Analyse the property document text provided and return ONLY a valid JSON object with NO markdown, NO backticks, NO preamble.

Return this exact JSON schema:
{
  "extractedFields": {
    "parties": ["list of buyer, seller, witnesses"],
    "propertyDescription": "type and description of property",
    "propertyAddress": "full address",
    "transactionType": "Sale Deed / Lease / Mortgage / etc",
    "transactionValue": "amount in INR",
    "dates": [{"type": "execution/registration/possession", "value": "DD-MM-YYYY"}],
    "encumbrances": ["list of any liens, mortgages, disputes mentioned"],
    "missingFields": ["fields expected but not found"]
  },
  "clauses": [
    {
      "text": "exact clause text (max 150 chars)",
      "classification": "Standard | Unusual | Red Flag",
      "reasoning": "1-2 sentence explanation",
      "confidence": "High | Medium | Low"
    }
  ],
  "summary": "2-3 sentence plain English summary of the document",
  "overallRisk": "Low | Medium | High"
}

Classification guide:
- Standard: Normal boilerplate, no concern
- Unusual: Not illegal but worth noting, warrants review  
- Red Flag: Potentially problematic, legal review required

If information is not found, use "Not found" as the value. Never fabricate details.`;

async function analyseChunk(chunk: string): Promise<AnalysisResult> {
  const response = await client.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 2000,
    response_format: { type: 'json_object' }, // forces JSON output
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Analyse this property document section:\n\n${chunk}` }
    ]
  });

  const content = response.choices[0].message.content;
  if (!content) throw new Error('Empty response from OpenAI');

  try {
    const parsed = JSON.parse(content) as AnalysisResult;
    // Basic validation
    if (!parsed.extractedFields || !parsed.clauses) {
      throw new Error('Invalid response shape');
    }
    return parsed;
  } catch {
    throw new Error(`Failed to parse OpenAI response: ${content.slice(0, 200)}`);
  }
}

export async function analyseDocument(text: string): Promise<AnalysisResult> {
  const { chunkText } = await import('./chunkText');
  const chunks = chunkText(text);

  if (chunks.length === 1) {
    return analyseChunk(chunks[0]);
  }

  // Multiple chunks: analyse all, merge results
  const results = await Promise.all(chunks.map(analyseChunk));

  // Merge: use first chunk's fields, combine all clauses
  const merged: AnalysisResult = {
    extractedFields: results[0].extractedFields,
    clauses: results.flatMap(r => r.clauses),
    summary: results[0].summary,
    overallRisk: results.some(r => r.overallRisk === 'High') ? 'High'
      : results.some(r => r.overallRisk === 'Medium') ? 'Medium' : 'Low'
  };

  return merged;
}
```

#### Step 7: Analyse route (`src/routes/analyse.ts`)
```typescript
import { Router, Request, Response } from 'express';
import upload from '../middleware/upload';
import { extractTextFromPDF } from '../services/pdfExtractor';
import { analyseDocument } from '../services/openaiService';

const router = Router();

router.post('/analyse', upload.single('document'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No PDF file uploaded' });
    }

    // Step 1: Extract text
    const text = await extractTextFromPDF(req.file.buffer);
    
    if (!text || text.trim().length < 100) {
      return res.status(400).json({ 
        error: 'Could not extract text from PDF. File may be scanned/image-based.' 
      });
    }

    // Step 2: Analyse with OpenAI
    const result = await analyseDocument(text);

    return res.json({ success: true, data: result });

  } catch (error) {
    console.error('Analysis error:', error);
    return res.status(500).json({ 
      error: error instanceof Error ? error.message : 'Analysis failed' 
    });
  }
});

export default router;
```

#### Step 8: `.env` file
```
OPENAI_API_KEY=sk-your-key-here
PORT=5000
```

---

### Phase 2: Frontend (2-3 hours)

#### Step 1: Init Next.js
```bash
cd .. # back to root
npx create-next-app@latest frontend --typescript --tailwind --app --no-src-dir --import-alias "@/*"
cd frontend
npm install axios
```

#### Step 2: TypeScript types (`types/index.ts`)
```typescript
export interface Clause {
  text: string;
  classification: 'Standard' | 'Unusual' | 'Red Flag';
  reasoning: string;
  confidence: 'High' | 'Medium' | 'Low';
}

export interface ExtractedFields {
  parties: string[];
  propertyDescription: string;
  propertyAddress: string;
  transactionType: string;
  transactionValue: string;
  dates: { type: string; value: string }[];
  encumbrances: string[];
  missingFields: string[];
}

export interface AnalysisResult {
  extractedFields: ExtractedFields;
  clauses: Clause[];
  summary: string;
  overallRisk: 'Low' | 'Medium' | 'High';
}
```

#### Step 3: API lib (`lib/api.ts`)
```typescript
import axios from 'axios';
import { AnalysisResult } from '@/types';

const BACKEND_URL = process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000';

export async function analyseDocument(file: File): Promise<AnalysisResult> {
  const formData = new FormData();
  formData.append('document', file);

  const response = await axios.post(`${BACKEND_URL}/api/analyse`, formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
    timeout: 60000 // 60 seconds — LLM calls can be slow
  });

  return response.data.data as AnalysisResult;
}
```

#### Step 4: RiskBadge component (`components/RiskBadge.tsx`)
```typescript
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
```

#### Step 5: ExtractedFields component (`components/ExtractedFields.tsx`)
```typescript
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
```

#### Step 6: ClauseList component (`components/ClauseList.tsx`)
```typescript
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
      
      {/* Filter pills */}
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

      {/* Clause list */}
      <div className="space-y-3 max-h-[600px] overflow-y-auto">
        {filtered.map((clause, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-3 hover:bg-gray-50 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-1">
              <RiskBadge level={clause.classification} />
              <span className="text-xs text-gray-400">{clause.confidence} confidence</span>
            </div>
            <p className="text-sm text-gray-700 mt-2 font-mono bg-gray-50 p-2 rounded text-xs leading-relaxed">
              "{clause.text}"
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
```

#### Step 7: Homepage (`app/page.tsx`)
```typescript
'use client';
import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { analyseDocument } from '@/lib/api';
import { AnalysisResult } from '@/types';

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
    } catch (e: any) {
      setError(e.response?.data?.error || 'Analysis failed. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (result) {
    // Inline results (or navigate to /results with state)
    return <ResultsView result={result} onReset={() => setResult(null)} />;
  }

  return (
    <main className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-lg w-full">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-gray-900">Property Document Analyser</h1>
          <p className="text-gray-500 mt-2 text-sm">Upload a sale deed, title document, or lease agreement to extract key fields and flag risky clauses.</p>
        </div>

        {/* Drop zone */}
        <div
          className="border-2 border-dashed border-gray-300 rounded-xl p-10 text-center cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors"
          onClick={() => inputRef.current?.click()}
          onDragOver={e => e.preventDefault()}
          onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
        >
          <input ref={inputRef} type="file" accept=".pdf" className="hidden" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} />
          {file ? (
            <div>
              <p className="text-blue-600 font-medium">{file.name}</p>
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

// Inline results component
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
            <button onClick={onReset} className="px-4 py-2 border border-gray-300 rounded-lg text-sm hover:bg-gray-100">
              New Document
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Import and use components here */}
          <ExtractedFieldsInline fields={result.extractedFields} />
          <ClauseListInline clauses={result.clauses} />
        </div>
      </div>
    </main>
  );
}

// You can replace these with imported components from /components
function ExtractedFieldsInline({ fields }: { fields: any }) {
  const rows = [
    ['Transaction Type', fields.transactionType],
    ['Value', fields.transactionValue],
    ['Property', fields.propertyDescription],
    ['Address', fields.propertyAddress],
    ['Parties', fields.parties?.join(', ')],
    ['Encumbrances', fields.encumbrances?.join('; ') || 'None'],
  ];
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900 mb-4">Extracted Fields</h2>
      <div className="space-y-3">
        {rows.map(([label, val]) => (
          <div key={label} className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-400 uppercase">{label}</span>
            <span className="text-sm text-gray-800">{val || 'Not found'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ClauseListInline({ clauses }: { clauses: any[] }) {
  const colours: any = {
    'Standard': 'bg-green-100 text-green-800',
    'Unusual': 'bg-yellow-100 text-yellow-800',
    'Red Flag': 'bg-red-100 text-red-800',
  };
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <h2 className="font-semibold text-gray-900 mb-4">Clause Analysis ({clauses.length})</h2>
      <div className="space-y-3 max-h-[500px] overflow-y-auto">
        {clauses.map((c, i) => (
          <div key={i} className="border border-gray-100 rounded-lg p-3">
            <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colours[c.classification]}`}>
              {c.classification}
            </span>
            <p className="text-xs text-gray-600 mt-2 font-mono bg-gray-50 p-2 rounded">"{c.text}"</p>
            <p className="text-xs text-gray-500 mt-1">{c.reasoning}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## 7. Prompts {#prompts}

Already included in `openaiService.ts` above. Key decisions made in the prompt:

- **"Return ONLY valid JSON, NO markdown, NO backticks"** — critical. Without this, the model wraps output in ```json ``` blocks that break `JSON.parse()`
- **Exact schema defined** — the model fills it in, you validate shape
- **"Never fabricate details"** — reduces hallucination in legal context
- **Classification guide** — tells the model exactly what each level means

---

## 8. API Design {#api-design}

```
POST /api/analyse
Content-Type: multipart/form-data
Body: { document: <PDF file> }

Response 200:
{
  "success": true,
  "data": {
    "extractedFields": { ... },
    "clauses": [ ... ],
    "summary": "...",
    "overallRisk": "Medium"
  }
}

Response 400: { "error": "No PDF file uploaded" }
Response 400: { "error": "Could not extract text from PDF" }
Response 500: { "error": "Analysis failed" }
```

---

## 9. Environment Variables {#env-vars}

**Backend `.env`:**
```
OPENAI_API_KEY=sk-...
PORT=5000
```

**Frontend `.env.local`:**
```
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
```

---

## 10. Error Handling {#error-handling}

| Scenario | Handling |
|---|---|
| No file uploaded | 400 from multer check |
| Non-PDF file | 400 from multer fileFilter |
| Scanned/image PDF | 400 — text extraction returns < 100 chars |
| OpenAI returns malformed JSON | Catch in JSON.parse, throw with context |
| OpenAI timeout | axios timeout: 60000ms |
| OpenAI rate limit | Will surface as 500 — add retry if needed |
| File too large | 400 from multer limits (10MB) |

---

## 11. Deploy {#deploy}

**Backend → Render:**
1. Push `backend/` to GitHub
2. New Web Service on Render → connect repo
3. Build command: `npm install && npm run build`
4. Start command: `node dist/index.js`
5. Add env var: `OPENAI_API_KEY`

**Frontend → Vercel:**
1. Push `frontend/` to GitHub
2. Import project on Vercel
3. Add env var: `NEXT_PUBLIC_BACKEND_URL=https://your-render-url.onrender.com`
4. Deploy

---

## 12. README (For GitHub) {#readme}

```markdown
# Property Document Analyser

Upload any Indian property document (sale deed, title doc, lease agreement) and get:
- Extracted key fields: parties, value, dates, encumbrances
- Clause-by-clause risk analysis: Standard / Unusual / Red Flag
- Plain English summary + overall risk rating

Built to demonstrate LLM API integration for document intelligence use cases.

## Stack
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS
- **Backend:** Node.js, Express.js
- **AI:** OpenAI API (gpt-4o-mini) with structured JSON output
- **PDF Processing:** pdf-parse

## How It Works
1. PDF uploaded via drag-drop
2. `pdf-parse` extracts raw text server-side
3. Text chunked if large (3000 word chunks, 200 word overlap)
4. Each chunk sent to OpenAI with a structured prompt forcing JSON schema output
5. Results merged and validated server-side
6. Frontend renders extracted fields + color-coded clause analysis

## Local Setup
\`\`\`bash
# Backend
cd backend && npm install
echo "OPENAI_API_KEY=your-key" > .env
npm run dev

# Frontend
cd frontend && npm install
echo "NEXT_PUBLIC_BACKEND_URL=http://localhost:5000" > .env.local
npm run dev
\`\`\`

## Live Demo
[link here]
```

---

## Quick Checklist Before You Sleep

- [ ] Backend starts on port 5000 without errors
- [ ] Upload a sample PDF → raw text logs to console
- [ ] OpenAI returns valid JSON (log it before parsing)
- [ ] Frontend uploads and shows result
- [ ] Deployed: backend on Render, frontend on Vercel
- [ ] Live link works with a real property doc PDF
