'use client';

import { useState, useCallback, useRef } from 'react';
import type { Account, ResearchResult } from '@/lib/types';
import { parseFile } from '@/lib/parseFile';
import { generatePdf } from '@/lib/generatePdf';

// ── Helpers ──────────────────────────────────────────────────────────────────

type AppStatus = 'idle' | 'processing' | 'complete';

function verdictBadge(result: ResearchResult) {
  if (result.error) {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-100 text-gray-500">
        ⚠ Error
      </span>
    );
  }
  if (result.verdict === 'reseller') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-green-100 text-green-800">
        ✓ Reseller
      </span>
    );
  }
  if (result.verdict === 'not_reseller') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-red-100 text-red-700">
        ✗ Not Reseller
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-yellow-100 text-yellow-800">
      ? Uncertain
    </span>
  );
}

function confidenceText(result: ResearchResult) {
  if (result.error) return <span className="text-gray-400">—</span>;
  const colors: Record<string, string> = {
    high: 'text-green-700 font-semibold',
    medium: 'text-yellow-700',
    low: 'text-red-500',
  };
  return (
    <span className={`capitalize text-xs ${colors[result.confidence] ?? 'text-gray-500'}`}>
      {result.confidence}
    </span>
  );
}

function rowBg(result: ResearchResult) {
  if (result.error) return 'bg-gray-50';
  if (result.verdict === 'reseller') return 'bg-green-50';
  if (result.verdict === 'not_reseller') return 'bg-red-50';
  return 'bg-yellow-50';
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Home() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [fileName, setFileName] = useState('');
  const [fileError, setFileError] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [status, setStatus] = useState<AppStatus>('idle');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [currentAccount, setCurrentAccount] = useState('');
  const [results, setResults] = useState<ResearchResult[]>([]);
  const [globalError, setGlobalError] = useState('');
  const abortRef = useRef(false);

  // ── File handling ──────────────────────────────────────────────

  const handleFile = useCallback(async (file: File) => {
    setFileError('');
    try {
      const parsed = await parseFile(file);
      if (parsed.length === 0) {
        setFileError('The file appears to be empty or has no readable rows.');
        return;
      }
      setAccounts(parsed);
      setFileName(file.name);
    } catch (err) {
      setFileError(err instanceof Error ? err.message : 'Failed to parse file.');
    }
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
      e.target.value = '';
    },
    [handleFile]
  );

  // ── Research loop ──────────────────────────────────────────────

  const startResearch = async () => {
    if (accounts.length === 0) { setGlobalError('Please upload a file first.'); return; }

    setGlobalError('');
    setResults([]);
    setStatus('processing');
    abortRef.current = false;

    const allResults: ResearchResult[] = [];

    for (let i = 0; i < accounts.length; i++) {
      if (abortRef.current) break;

      const account = accounts[i];
      const label = account.company || account.name || `Account ${i + 1}`;
      setCurrentIndex(i + 1);
      setCurrentAccount(label);

      try {
        const res = await fetch('/api/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ account }),
        });

        const data = await res.json();

        if (!res.ok) {
          // Auth / rate-limit errors are fatal — stop the loop
          if (res.status === 401) {
            setGlobalError(data.error ?? 'Invalid API key. Stopping research.');
            abortRef.current = true;
            // push an error card for this account then break
            allResults.push({ account, verdict: 'uncertain', confidence: 'low', reasoning: '', businessDescription: '', keySignals: [], error: data.error });
            setResults([...allResults]);
            break;
          }
          allResults.push({
            account,
            verdict: 'uncertain',
            confidence: 'low',
            reasoning: '',
            businessDescription: '',
            keySignals: [],
            error: data.error ?? `HTTP ${res.status}`,
          });
        } else {
          allResults.push(data as ResearchResult);
        }
      } catch {
        allResults.push({
          account,
          verdict: 'uncertain',
          confidence: 'low',
          reasoning: '',
          businessDescription: '',
          keySignals: [],
          error: 'Network error — check your connection.',
        });
      }

      setResults([...allResults]);

      // Small pause between accounts to stay within Claude rate limits
      if (i < accounts.length - 1 && !abortRef.current) {
        await new Promise(r => setTimeout(r, 800));
      }
    }

    setStatus('complete');
  };

  const handleStop = () => {
    abortRef.current = true;
  };

  const handleReset = () => {
    setAccounts([]);
    setFileName('');
    setFileError('');
    setResults([]);
    setGlobalError('');
    setStatus('idle');
    setCurrentIndex(0);
    setCurrentAccount('');
    abortRef.current = false;
  };

  const handleDownloadPdf = async () => {
    try {
      await generatePdf(results);
    } catch (err) {
      alert(`PDF generation failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    }
  };

  // ── Stats ──────────────────────────────────────────────────────

  const total = results.length;
  const resellers = results.filter(r => !r.error && r.verdict === 'reseller').length;
  const notResellers = results.filter(r => !r.error && r.verdict === 'not_reseller').length;
  const uncertain = results.filter(r => !r.error && r.verdict === 'uncertain').length;
  const errors = results.filter(r => r.error).length;
  const pct = accounts.length > 0 ? Math.round((currentIndex / accounts.length) * 100) : 0;

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div className="min-h-screen flex flex-col">
      {/* ── Header ── */}
      <header className="bg-[#024678] shadow-md">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">SinaLite Account Research</h1>
            <p className="text-blue-200 text-xs mt-0.5">AI-powered print reseller classification · For internal use only</p>
          </div>
          <div className="text-blue-200 text-xs text-right hidden sm:block">
            Powered by GPT-4o mini
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8 space-y-6">

        {/* ── IDLE: Setup panel ── */}
        {status === 'idle' && (
          <>
            {/* How it works */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl px-5 py-4 text-sm text-blue-800">
              <strong>How it works:</strong>{' '}
              Upload a CSV or Excel file containing account data (company, email, website, address, business type). GPT-4o will analyze each account — including scraping their website — and classify them as{' '}
              <span className="font-semibold text-green-700">print resellers</span>,{' '}
              <span className="font-semibold text-red-700">non-resellers</span>, or{' '}
              <span className="font-semibold text-yellow-700">uncertain</span> — then generate a colour-coded PDF report.
            </div>

            {/* File Upload */}
            <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-base font-semibold text-gray-900">Upload Account File</h2>
              <p className="text-xs text-gray-500 mb-4 mt-1">
                CSV or Excel (.xlsx). Recognized columns: Company, Email, Website, Name, Address, Business Type.
              </p>
              <div
                onDrop={handleDrop}
                onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                onDragLeave={() => setDragOver(false)}
                className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer ${
                  dragOver ? 'border-[#024678] bg-blue-50' : 'border-gray-300 hover:border-gray-400 hover:bg-gray-50'
                }`}
              >
                <div className="text-3xl mb-2">📂</div>
                <p className="text-sm text-gray-500 mb-3">Drag & drop or</p>
                <label className="inline-block cursor-pointer bg-gray-900 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-700">
                  Choose File
                  <input type="file" accept=".csv,.xlsx,.xls" onChange={handleFileInput} className="hidden" />
                </label>
                {fileName && (
                  <div className="mt-3 text-sm text-green-700 font-medium">
                    ✓ {fileName} — {accounts.length} account{accounts.length !== 1 ? 's' : ''} loaded
                  </div>
                )}
                {fileError && (
                  <div className="mt-3 text-sm text-red-600">⚠ {fileError}</div>
                )}
              </div>
            </div>

            {/* Global error */}
            {globalError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-700">
                ⚠ {globalError}
              </div>
            )}

            {/* Start button */}
            <button
              onClick={startResearch}
              disabled={accounts.length === 0}
              className="w-full bg-[#024678] hover:bg-[#013559] disabled:opacity-40 disabled:cursor-not-allowed text-white py-4 rounded-2xl font-bold text-lg shadow-md"
            >
              {accounts.length > 0
                ? `Start Research — ${accounts.length} account${accounts.length !== 1 ? 's' : ''}`
                : 'Start Research'}
            </button>

            {/* Cost estimate note */}
            {accounts.length > 0 && (
              <p className="text-center text-xs text-gray-400">
                Estimated cost: ~${(accounts.length * 0.001).toFixed(2)} USD on GPT-4o mini · ~{Math.ceil(accounts.length * 10 / 60)} min
              </p>
            )}
          </>
        )}

        {/* ── PROCESSING + COMPLETE: Progress + Results ── */}
        {(status === 'processing' || status === 'complete') && (
          <>
            {/* Progress bar (only while processing) */}
            {status === 'processing' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-5">
                <div className="flex justify-between items-center text-sm mb-3">
                  <span className="text-gray-700">
                    Researching <strong>{currentAccount}</strong>…
                  </span>
                  <span className="text-gray-500 tabular-nums">{currentIndex} / {accounts.length}</span>
                </div>
                <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                  <div
                    className="bg-[#024678] h-3 rounded-full transition-all duration-700 ease-out"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <div className="flex justify-between mt-2">
                  <p className="text-xs text-gray-400">~8 seconds per account · do not close this tab</p>
                  <button
                    onClick={handleStop}
                    className="text-xs text-gray-400 hover:text-red-600 underline"
                  >
                    Stop
                  </button>
                </div>
              </div>
            )}

            {/* Complete summary */}
            {status === 'complete' && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-bold text-gray-900 mb-4">
                  Research Complete {abortRef.current && <span className="text-sm font-normal text-gray-500">(stopped early)</span>}
                </h2>

                {/* Stats */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
                  {[
                    { label: 'Total', value: total, bg: 'bg-gray-50', text: 'text-gray-800' },
                    { label: 'Resellers', value: resellers, bg: 'bg-green-50', text: 'text-green-700' },
                    { label: 'Not Resellers', value: notResellers, bg: 'bg-red-50', text: 'text-red-700' },
                    { label: 'Uncertain', value: uncertain, bg: 'bg-yellow-50', text: 'text-yellow-700' },
                  ].map(s => (
                    <div key={s.label} className={`${s.bg} rounded-xl p-3 text-center`}>
                      <div className={`text-2xl font-bold ${s.text}`}>{s.value}</div>
                      <div className="text-xs text-gray-500 mt-0.5">{s.label}</div>
                    </div>
                  ))}
                </div>
                {errors > 0 && (
                  <p className="text-xs text-amber-600 mb-4">⚠ {errors} account{errors !== 1 ? 's' : ''} had errors — check the Reasoning column.</p>
                )}

                {/* Action buttons */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={handleDownloadPdf}
                    className="flex-1 bg-[#024678] hover:bg-[#013559] text-white py-3 rounded-xl font-bold"
                  >
                    ⬇ Download PDF Report
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-6 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
                  >
                    New Research
                  </button>
                </div>
              </div>
            )}

            {/* Global error */}
            {globalError && (
              <div className="bg-red-50 border border-red-200 rounded-xl px-5 py-3 text-sm text-red-700 flex justify-between items-center">
                <span>⚠ {globalError}</span>
                <button onClick={handleReset} className="text-xs underline ml-4">Start over</button>
              </div>
            )}

            {/* Results table */}
            {results.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="font-semibold text-gray-900 text-sm">
                    Results — {results.length} of {accounts.length}
                  </h3>
                  {/* Legend */}
                  <div className="hidden sm:flex items-center gap-3 text-xs">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-100 inline-block" /> Reseller</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-100 inline-block" /> Not Reseller</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-yellow-100 inline-block" /> Uncertain</span>
                  </div>
                </div>
                <div className="overflow-x-auto table-scroll">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-gray-900 text-white text-left">
                        {['#', 'Company / Name', 'Email', 'Declared Type', 'Verdict', 'Conf.', 'Business Description', 'Key Signals', 'Reasoning'].map(h => (
                          <th key={h} className="px-4 py-3 font-medium text-xs whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {results.map((result, i) => (
                        <tr key={i} className={`border-t border-gray-100 align-top ${rowBg(result)}`}>
                          <td className="px-4 py-3 text-xs text-gray-400 tabular-nums">{i + 1}</td>
                          <td className="px-4 py-3 font-medium text-gray-900 text-xs max-w-[160px]">
                            {result.account.company || result.account.name || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-600 font-mono text-xs max-w-[180px] break-all">
                            {result.account.email || '—'}
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[120px]">
                            {result.account.businessType || '—'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {verdictBadge(result)}
                          </td>
                          <td className="px-4 py-3">
                            {confidenceText(result)}
                          </td>
                          <td className="px-4 py-3 text-gray-600 text-xs max-w-[200px]">
                            {result.error
                              ? <span className="text-red-500">{result.error}</span>
                              : result.businessDescription}
                          </td>
                          <td className="px-4 py-3 text-xs max-w-[180px]">
                            <ul className="space-y-0.5">
                              {(result.keySignals ?? []).map((s, j) => (
                                <li key={j} className="text-gray-500 before:content-['·'] before:mr-1">{s}</li>
                              ))}
                            </ul>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-xs max-w-[260px]">
                            {result.reasoning}
                          </td>
                        </tr>
                      ))}

                      {/* "Waiting" row while processing */}
                      {status === 'processing' && (
                        <tr className="border-t border-gray-100 bg-white">
                          <td colSpan={9} className="px-4 py-4 text-center text-gray-400 text-xs">
                            <span className="animate-pulse">Analysing {currentAccount}…</span>
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>

      {/* ── Footer ── */}
      <footer className="text-center text-xs text-gray-400 py-5 border-t border-gray-200 mt-4">
        SinaLite Internal Tool · Powered by OpenAI ·{' '}
        <span className="italic">Results are AI-generated and should be reviewed by a team member before approval decisions are made.</span>
      </footer>
    </div>
  );
}
