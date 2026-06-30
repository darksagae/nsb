'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LeonIcon, type LeonIconName } from '@/components/admin/leon/LeonIcon';

type MvSettings = {
  locked: boolean;
  month: string;
  rowCount: string;
  importedAt: string;
};

type TaxRow = {
  id: number;
  make: string;
  model: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  engineSizeCC?: number | null;
  fuelType?: string | null;
  totalTaxUGX?: number | null;
  databaseMonth: string;
  serialNumber?: string | null;
  hscCode?: string | null;
  countryOrigin?: string | null;
  description?: string | null;
};

type DiagnoseResult = {
  ok: boolean;
  error?: string;
  summary?: {
    totalLines: number;
    rowsFoundByParser: number;
    rowsWithMakeAndModel: number;
    strategy: string;
  };
  detectedHeaderLine?: string | null;
  rawTextSample?: string;
  firstFiveRows?: Record<string, unknown>[];
};

function fmt(n: number | null | undefined) {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

/** Presigned URL → browser PUT → S3 (required for all MV PDF uploads). */
async function uploadMvPdfToS3(file: File, onProgress?: (msg: string) => void): Promise<string> {
  onProgress?.('Getting S3 upload URL…');
  const presignRes = await fetch(`/api/mv-database/presign?filename=${encodeURIComponent(file.name)}`);
  const presignData = await presignRes.json().catch(() => ({}));
  if (!presignRes.ok) {
    throw new Error(presignData.error || `Failed to get S3 upload URL (${presignRes.status})`);
  }

  const { uploadUrl, key, bucket } = presignData as { uploadUrl: string; key: string; bucket?: string };
  if (!uploadUrl || !key) throw new Error('Invalid presign response from server');

  const sizeMB = (file.size / 1024 / 1024).toFixed(1);
  onProgress?.(`Uploading ${sizeMB} MB to S3${bucket ? ` (${bucket})` : ''}…`);

  const s3Res = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/pdf' },
    body: file,
  });
  if (!s3Res.ok) {
    throw new Error(
      `S3 upload failed (HTTP ${s3Res.status}). Check bucket CORS for ${window.location.origin}.`,
    );
  }

  onProgress?.('S3 upload complete.');
  return key;
}

function MvStatCard({ label, value, icon }: { label: string; value: string | number; icon: LeonIconName }) {
  return (
    <div className="col-6 col-md-3">
      <div className="leon-bezel-outer h-100">
        <div className="leon-bezel-inner h-100 d-flex flex-column justify-content-between">
          <div className="d-flex justify-content-between align-items-center mb-2">
            <span className="leon-section-label">{label}</span>
            <LeonIcon name={icon} size={17} className="text-secondary" />
          </div>
          <span className="h4 fw-bold text-dark mb-0 text-truncate leon-num" data-leon-num="true" title={String(value)}>
            {value}
          </span>
        </div>
      </div>
    </div>
  );
}

export function MvDatabasePanel({ initialSettings, initialRows, initialTotal }: {
  initialSettings: MvSettings;
  initialRows: TaxRow[];
  initialTotal: number;
}) {
  const router = useRouter();
  const [settings, setSettings] = useState(initialSettings);
  const [rows, setRows] = useState(initialRows);
  const [total, setTotal] = useState(initialTotal);

  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState('');
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState('');
  const [importError, setImportError] = useState('');

  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnoseResult, setDiagnoseResult] = useState<DiagnoseResult | null>(null);
  const [showDiagnose, setShowDiagnose] = useState(false);

  const [testFile, setTestFile] = useState<File | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<DiagnoseResult | null>(null);
  const [testMonth, setTestMonth] = useState('');
  const [testImporting, setTestImporting] = useState(false);
  const [testImportMsg, setTestImportMsg] = useState('');
  const [testImportError, setTestImportError] = useState('');

  const [searchMake, setSearchMake] = useState('');
  const [searchModel, setSearchModel] = useState('');
  const [page, setPage] = useState(1);
  const [searching, setSearching] = useState(false);

  async function handleUnlock() {
    if (!window.confirm('Unlock the MV database to allow uploading a new one?')) return;
    try {
      const res = await fetch('/api/mv-database/lock', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'unlock' }) });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      setSettings(s => ({ ...s, locked: false }));
    } catch (err: any) {
      alert('Failed to unlock: ' + (err.message || 'Unknown error'));
    }
  }

  async function handleDiagnose() {
    if (!file) return alert('Please select a PDF file first');
    setDiagnosing(true);
    setDiagnoseResult(null);
    try {
      const key = await uploadMvPdfToS3(file);
      const res = await fetch('/api/mv-database/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3Key: key }),
      });

      let data: DiagnoseResult;
      try {
        data = await res.json();
      } catch {
        throw new Error(res.ok ? 'Failed to parse response' : `Server error (Status: ${res.status}). This may be due to a timeout on Vercel.`);
      }

      setDiagnoseResult(data);
      setShowDiagnose(true);
    } catch (err: any) {
      setDiagnoseResult({ ok: false, error: err.message || 'Diagnosis failed' });
      setShowDiagnose(true);
    } finally {
      setDiagnosing(false);
    }
  }

  async function handleImport() {
    if (!file) return alert('Please select a PDF or CSV file');
    if (!month) return alert('Please select a month');
    setImporting(true);
    setImportMsg('');
    setImportError('');
    try {
      const isPDF = file.name.toLowerCase().endsWith('.pdf') || file.type === 'application/pdf';

      let res: Response;

      if (isPDF) {
        const key = await uploadMvPdfToS3(file, setImportMsg);
        const large = file.size > 15 * 1024 * 1024;
        setImportMsg(large ? 'Parsing large PDF — this may take up to 60 seconds…' : 'Processing PDF from S3…');
        res = await fetch('/api/mv-database/import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ s3Key: key, month }),
        });
      } else {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('month', month);
        res = await fetch('/api/mv-database/import', { method: 'POST', body: fd });
      }

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error(res.ok ? 'Failed to parse response' : `Server returned an error (Status: ${res.status}).`);
      }

      if (res.ok) {
        setImportMsg(`✓ Imported ${data.imported.toLocaleString()} rows for ${data.month} (${data.format?.toUpperCase()})`);
        setImportError('');
        setSettings({ locked: true, month: data.month, rowCount: data.imported.toString(), importedAt: new Date().toISOString() });
        setTotal(data.imported);
        setFile(null);
        setDiagnoseResult(null);
        router.refresh();
      } else {
        setImportError(data.error || 'Import failed');
        setImportMsg('');
      }
    } catch (err: any) {
      setImportError(err.message || 'Import failed');
      setImportMsg('');
    } finally {
      setImporting(false);
    }
  }

  async function handleTestImport() {
    if (!testFile || !testMonth) return;
    setTestImporting(true);
    setTestImportMsg('Getting upload URL…');
    setTestImportError('');
    try {
      const key = await uploadMvPdfToS3(testFile, setTestImportMsg);
      setTestImportMsg('Parsing & saving to database…');
      const res = await fetch('/api/mv-database/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3Key: key, month: testMonth }),
      });
      const data = await res.json();
      if (!res.ok) { setTestImportError(data.error || 'Import failed'); setTestImportMsg(''); return; }
      setTestImportMsg(`✓ Imported ${data.imported.toLocaleString()} rows for ${data.month}. You can now search units in invoice creation!`);
      setSettings({ locked: true, month: data.month, rowCount: data.imported.toString(), importedAt: new Date().toISOString() });
      setTotal(data.imported);
      router.refresh();
    } catch (err: any) {
      setTestImportError(err.message || 'Import failed');
      setTestImportMsg('');
    } finally {
      setTestImporting(false);
    }
  }

  async function handleTest() {
    if (!testFile) return;
    setTesting(true);
    setTestResult(null);
    try {
      const key = await uploadMvPdfToS3(testFile);
      const res = await fetch('/api/mv-database/diagnose', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ s3Key: key }),
      });
      const data = await res.json();
      setTestResult(data);
    } catch (err: any) {
      setTestResult({ ok: false, error: err.message || 'Test failed' });
    } finally {
      setTesting(false);
    }
  }

  async function handleSearch() {
    setSearching(true);
    try {
      const q = new URLSearchParams({ make: searchMake, model: searchModel, page: '1', limit: '50' });
      const res = await fetch(`/api/mv-database?${q}`);

      let data;
      try {
        data = await res.json();
      } catch {
        throw new Error('Failed to parse response or server timed out');
      }

      setRows(data.rows || []);
      setTotal(data.total || 0);
      setPage(1);
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  }

  const importedDate = settings.importedAt
    ? new Date(settings.importedAt).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';

  const statusLabel = settings.locked ? 'Locked' : 'Unlocked';
  const rowCountDisplay = Number(settings.rowCount || total).toLocaleString();

  return (
    <div>
      {/* Telemetry stats */}
      <div className="row g-3 mb-4">
        <MvStatCard label="Status" value={statusLabel} icon={settings.locked ? 'lock' : 'unlock'} />
        <MvStatCard label="Database Month" value={settings.month || '—'} icon="calendar" />
        <MvStatCard label="Tax Rates" value={rowCountDisplay} icon="database" />
        <MvStatCard label="Last Import" value={importedDate} icon="clock" />
      </div>

      {/* Import / lock management */}
      <div className="leon-bezel-outer mb-4">
        <div className="leon-bezel-inner">
          <div className="d-flex justify-content-between align-items-center mb-3">
            <h2 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
              <LeonIcon name="shield-check" size={17} className="text-secondary" />
              Database Control
            </h2>
            {settings.locked ? (
              <span className="badge bg-success-subtle text-success border border-success-subtle rounded-pill font-mono text-[10.5px] uppercase tracking-wider py-1.5 px-3">
                <LeonIcon name="lock" size={12} className="me-1" /> Locked
              </span>
            ) : (
              <span className="badge bg-warning-subtle text-warning border border-warning-subtle rounded-pill font-mono text-[10.5px] uppercase tracking-wider py-1.5 px-3">
                <LeonIcon name="unlock" size={12} className="me-1" /> Open
              </span>
            )}
          </div>

          <p className="text-muted small mb-4" style={{ lineHeight: 1.65 }}>
            Upload the monthly URA Motor Vehicle database PDF or CSV to enable automatic tax lookups when creating invoices.
            Once imported, the database is locked to prevent accidental replacement. Use <strong>Unlock to Replace</strong> when a new monthly update is available.
          </p>

          {settings.locked ? (
            <div className="mv-lock-panel">
              <div className="d-flex flex-column flex-md-row align-items-md-start justify-content-between gap-3">
                <div>
                  <div className="d-flex align-items-center gap-2 mb-2">
                    <LeonIcon name="lock" size={16} className="text-success" />
                    <span className="fw-bold text-success">MV Database Locked</span>
                  </div>
                  <div className="text-muted small font-mono" style={{ lineHeight: 1.8 }}>
                    {settings.month && <div>MONTH: <strong className="text-dark">{settings.month}</strong></div>}
                    {settings.rowCount && <div>ROWS: <strong className="text-dark">{Number(settings.rowCount).toLocaleString()}</strong></div>}
                    {importedDate !== '—' && <div>IMPORTED: <strong className="text-dark">{importedDate}</strong></div>}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleUnlock}
                  className="btn btn-outline-dark btn-sm rounded-pill px-3 font-mono text-[11px] uppercase tracking-wider"
                  style={{ whiteSpace: 'nowrap' }}
                >
                  <LeonIcon name="unlock" size={14} className="me-1" />
                  Unlock to Replace
                </button>
              </div>
            </div>
          ) : (
            <div className="mv-unlock-panel">
              <div className="d-flex align-items-center gap-2 mb-3">
                <LeonIcon name="alert-triangle" size={16} className="text-warning" />
                <span className="fw-bold text-warning small">
                  {settings.month ? 'Unlocked — upload a new URA MV database to replace' : 'No database loaded — upload URA MV database below'}
                </span>
              </div>

              <div className="row g-3 align-items-end mb-3">
                <div className="col-md-7">
                  <label className="glass-label leon-section-label">URA MV Database — PDF or CSV</label>
                  <input
                    type="file"
                    accept=".pdf,.csv"
                    className="glass-input form-control form-control-sm"
                    onChange={(e) => { setFile(e.target.files?.[0] ?? null); setDiagnoseResult(null); setImportError(''); setImportMsg(''); }}
                  />
                </div>
                <div className="col-md-5">
                  <label className="glass-label leon-section-label">Database Month (YYYY-MM)</label>
                  <input
                    type="month"
                    className="glass-input form-control form-control-sm"
                    value={month}
                    onChange={(e) => setMonth(e.target.value)}
                  />
                </div>
              </div>

              <div className="d-flex align-items-center gap-2 flex-wrap">
                <button
                  type="button"
                  onClick={handleImport}
                  disabled={importing || !file || !month}
                  className="btn btn-dark btn-sm rounded-pill px-3 font-mono text-[11px] uppercase tracking-wider"
                >
                  {importing ? (
                    <><span className="spinner-border spinner-border-sm me-2" />Importing…</>
                  ) : (
                    <><LeonIcon name="upload" size={13} className="me-1" />Import &amp; Lock</>
                  )}
                </button>

                {file && file.name.toLowerCase().endsWith('.pdf') && (
                  <button
                    type="button"
                    onClick={handleDiagnose}
                    disabled={diagnosing}
                    className="btn btn-light border btn-sm rounded-pill px-3 font-mono text-[11px] uppercase tracking-wider"
                  >
                    {diagnosing ? (
                      <><span className="spinner-border spinner-border-sm me-2" />Analysing…</>
                    ) : (
                      <><LeonIcon name="search" size={13} className="me-1" />Diagnose PDF</>
                    )}
                  </button>
                )}

                {importMsg && <span className="small text-success fw-semibold">{importMsg}</span>}
              </div>

              {importError && (
                <div className="mt-3 p-3 rounded-3 border border-danger-subtle bg-danger-subtle text-danger small">
                  <LeonIcon name="alert-circle" size={14} className="me-1" />
                  {importError}
                </div>
              )}

              {showDiagnose && diagnoseResult && (
                <div className="liquid-glass-panel mt-3 p-3">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <span className="fw-bold small d-flex align-items-center gap-2" style={{ color: 'var(--admin-accent)' }}>
                      <LeonIcon name="search" size={15} />
                      PDF Diagnosis Results
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowDiagnose(false)}
                      className="btn btn-link btn-sm text-muted p-0"
                    >
                      <LeonIcon name="x" size={14} />
                    </button>
                  </div>

                  {diagnoseResult.ok ? (
                    <>
                      <div className="row g-2 mb-3">
                        {[
                          ['Total Lines', diagnoseResult.summary?.totalLines],
                          ['Rows Found', diagnoseResult.summary?.rowsFoundByParser],
                          ['With Make+Model', diagnoseResult.summary?.rowsWithMakeAndModel],
                          ['Strategy', diagnoseResult.summary?.strategy],
                        ].map(([label, val]) => (
                          <div key={label as string} className="col-6 col-md-3">
                            <div className="leon-stat-chip">
                              <div className="leon-section-label mb-1">{label as string}</div>
                              <div className="fw-semibold text-dark small">{String(val ?? '—')}</div>
                            </div>
                          </div>
                        ))}
                      </div>

                      {diagnoseResult.detectedHeaderLine && (
                        <div className="mb-2 small">
                          <div className="leon-section-label mb-1">Detected header line</div>
                          <code className="d-block p-2 rounded-2 bg-white border small text-success" style={{ wordBreak: 'break-all' }}>
                            {diagnoseResult.detectedHeaderLine}
                          </code>
                        </div>
                      )}

                      {(diagnoseResult.summary?.rowsWithMakeAndModel ?? 0) === 0 && (
                        <div className="text-danger small mb-2">
                          <LeonIcon name="alert-triangle" size={14} className="me-1" />
                          No vehicle rows detected. See raw text below to understand the PDF format.
                        </div>
                      )}

                      {diagnoseResult.firstFiveRows && diagnoseResult.firstFiveRows.length > 0 && (
                        <div className="mb-2 small">
                          <div className="text-success fw-semibold mb-1">First rows found</div>
                          {diagnoseResult.firstFiveRows.map((row, i) => (
                            <div key={i} className="text-success mb-1 font-mono" style={{ fontSize: '0.75rem' }}>
                              {String(row.make)} {String(row.model)} {row.yearFrom ? `${row.yearFrom}–${row.yearTo}` : ''} — Total Tax: {row.totalTaxUGX ? Number(row.totalTaxUGX).toLocaleString() : '—'}
                            </div>
                          ))}
                        </div>
                      )}

                      <div>
                        <div className="leon-section-label mb-2">Raw text sample</div>
                        <textarea
                          readOnly
                          value={diagnoseResult.rawTextSample || ''}
                          className="glass-input form-control font-mono"
                          style={{ fontSize: '0.68rem', maxHeight: 260, resize: 'vertical' }}
                          rows={10}
                        />
                        <button
                          type="button"
                          onClick={() => { if (diagnoseResult?.rawTextSample) navigator.clipboard.writeText(diagnoseResult.rawTextSample); }}
                          className="btn btn-outline-dark btn-sm rounded-pill mt-2 font-mono text-[10px] uppercase tracking-wider"
                        >
                          <LeonIcon name="clipboard" size={13} className="me-1" />Copy raw text
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-danger small">
                      <LeonIcon name="alert-circle" size={14} className="me-1" />
                      {diagnoseResult.error}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="leon-bezel-outer mb-4">
        <div className="leon-bezel-inner">
          <h2 className="h6 fw-bold mb-3 text-dark d-flex align-items-center gap-2">
            <LeonIcon name="filter" size={17} className="text-secondary" />
            Tax Rate Lookup
          </h2>
          <div className="row g-3 align-items-end">
            <div className="col-md-5">
              <label className="glass-label leon-section-label">Search Make</label>
              <input
                className="glass-input form-control form-control-sm"
                placeholder="Toyota…"
                value={searchMake}
                onChange={(e) => setSearchMake(e.target.value)}
              />
            </div>
            <div className="col-md-5">
              <label className="glass-label leon-section-label">Search Model</label>
              <input
                className="glass-input form-control form-control-sm"
                placeholder="Land Cruiser…"
                value={searchModel}
                onChange={(e) => setSearchModel(e.target.value)}
              />
            </div>
            <div className="col-md-2">
              <button
                type="button"
                onClick={handleSearch}
                disabled={searching}
                className="btn btn-dark btn-sm rounded-pill w-100 font-mono text-[11px] uppercase tracking-wider"
              >
                {searching ? '…' : <><LeonIcon name="search" size={13} className="me-1" />Search</>}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Results table */}
      <div className="leon-bezel-outer">
        <div className="leon-bezel-inner p-0 overflow-hidden">
          <div className="d-flex justify-content-between align-items-center px-4 py-3 border-bottom border-white border-opacity-50">
            <h2 className="h6 fw-bold mb-0 text-dark d-flex align-items-center gap-2">
              <LeonIcon name="table" size={17} className="text-secondary" />
              Rate Registry
            </h2>
            <span className="badge bg-light text-dark border font-mono text-[10.5px] uppercase tracking-wider rounded-pill py-1.5 px-3">
              {total.toLocaleString()} records
            </span>
          </div>
          <div className="table-responsive px-2 pb-2">
            <table className="admin-table mb-0">
              <thead>
                <tr>
                  <th className="font-mono text-[10.5px] uppercase tracking-wider">S/N</th>
                  <th className="font-mono text-[10.5px] uppercase tracking-wider">Make</th>
                  <th className="font-mono text-[10.5px] uppercase tracking-wider">Model</th>
                  <th className="font-mono text-[10.5px] uppercase tracking-wider">HS Code</th>
                  <th className="font-mono text-[10.5px] uppercase tracking-wider">Origin</th>
                  <th className="font-mono text-[10.5px] uppercase tracking-wider">Year</th>
                  <th className="font-mono text-[10.5px] uppercase tracking-wider">Engine</th>
                  <th className="font-mono text-[10.5px] uppercase tracking-wider">Fuel</th>
                  <th className="font-mono text-[10.5px] uppercase tracking-wider text-end">Total Tax</th>
                  <th className="font-mono text-[10.5px] uppercase tracking-wider">Month</th>
                  <th className="font-mono text-[10.5px] uppercase tracking-wider">Description</th>
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={11} className="text-center py-5 text-muted font-mono small">
                      <LeonIcon name="inbox" size={40} className="text-secondary opacity-50 mb-2 d-block" />
                      No records found
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id}>
                      <td className="text-muted small font-mono">{r.serialNumber || '—'}</td>
                      <td className="fw-semibold">{r.make}</td>
                      <td>{r.model}</td>
                      <td className="text-muted small font-mono">{r.hscCode || '—'}</td>
                      <td className="text-muted small">{r.countryOrigin || '—'}</td>
                      <td className="text-muted small font-mono">{r.yearFrom}–{r.yearTo}</td>
                      <td className="text-muted small">{r.engineSizeCC ? `${fmt(r.engineSizeCC)}cc` : '—'}</td>
                      <td className="text-muted small">{r.fuelType || '—'}</td>
                      <td className="text-end fw-semibold text-success font-mono small">{fmt(r.totalTaxUGX)}</td>
                      <td className="text-muted small font-mono">{r.databaseMonth}</td>
                      <td
                        className="text-muted small text-truncate"
                        style={{ maxWidth: '200px' }}
                        title={r.description || ''}
                      >
                        {r.description || '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
