'use client';

import { useState, useRef, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react';
import { useRouter } from 'next/navigation';
import { LeonIcon, type LeonIconName } from '@/components/admin/leon/LeonIcon';
import {
  buildInvoiceFormTotalsInput,
  computePhaseOneTotal,
  computePhaseOneTotalUsd,
  computeUraTaxBreakdown,
  deriveMissingUraFeeFields,
  fmtUsd,
  fmtUgx,
  sumUraTaxComponents,
} from '@/lib/invoice-form-calculations';
import { invoicePdfViewPath } from '@/lib/invoice-pdf-url';
import { buildSalesSystemInvoiceNotes } from '@/lib/build-invoice-notes';

type Vehicle = {
  id: number;
  model: string;
  year?: number | null;
  mileage?: number | null;
  chassisNo?: string | null;
  refNo?: string | null;
  fuelType?: string | null;
  engineCc?: number | null;
  transmission?: string | null;
  color?: string | null;
  steering?: string | null;
  passengers?: number | null;
  doors?: number | null;
  brand?: { name: string } | null;
};

type TaxRate = {
  id: number;
  make: string;
  model: string;
  yearFrom?: number | null;
  yearTo?: number | null;
  engineSizeCC?: number | null;
  fuelType?: string | null;
  customsValue?: number | null;
  importDuty?: number | null;
  exciseDuty?: number | null;
  vat?: number | null;
  infrastructureLevy?: number | null;
  environmentalLevy?: number | null;
  withholdingTax?: number | null;
  registrationFee?: number | null;
  totalTaxUGX?: number | null;
  databaseMonth: string;
  serialNumber?: string | null;
  hscCode?: string | null;
  countryOrigin?: string | null;
  description?: string | null;
};

type Props = {
  vehicles: Vehicle[];
  defaultValues?: Record<string, unknown>;
  invoiceId?: number;
  mode: 'create' | 'edit';
};

/** When true, only show fields that exist on the sales_system invoice form. DB + save payload unchanged. */
const SALES_SYSTEM_UI = true;

const FUEL_TYPE_OPTIONS = ['Petrol', 'Diesel', 'Hybrid Petrol', 'Hybrid Diesel', 'Electric (EV)'] as const;
const TRANSMISSION_OPTIONS = ['Automatic', 'Manual', 'Auto/Manual', 'CVT', 'DCT', 'Semi-Auto', 'Sport AT', 'Unspecified'] as const;
const COLOR_OPTIONS = ['White', 'Black', 'Silver', 'Gray', 'Blue', 'Red', 'Green', 'Brown', 'Gold', 'Orange', 'Yellow'] as const;
const COUNTRY_OPTIONS = [
  { code: 'JP', label: 'Japan (JP)' },
  { code: 'AU', label: 'Australia (AU)' },
  { code: 'TH', label: 'Thailand (TH)' },
  { code: 'IN', label: 'India (IN)' },
  { code: 'DE', label: 'Germany (DE)' },
  { code: 'IT', label: 'Italy (IT)' },
  { code: 'US', label: 'United States (US)' },
  { code: 'GB', label: 'United Kingdom (GB/UK)' },
  { code: 'NL', label: 'Netherlands (NL)' },
  { code: 'SE', label: 'Sweden (SE)' },
  { code: 'CN', label: 'China (CN)' },
  { code: 'ZA', label: 'South Africa (ZA)' },
  { code: 'KE', label: 'Kenya (KE)' },
  { code: 'CA', label: 'Canada (CA)' },
  { code: 'FR', label: 'France (FR)' },
  { code: 'AE', label: 'United Arab Emirates (AE)' },
  { code: 'KR', label: 'South Korea (KR)' },
  { code: 'ES', label: 'Spain (ES)' },
  { code: 'AT', label: 'Austria (AT)' },
  { code: 'CH', label: 'Switzerland (CH)' },
  { code: 'BE', label: 'Belgium (BE)' },
  { code: 'BR', label: 'Brazil (BR)' },
  { code: 'MX', label: 'Mexico (MX)' },
  { code: 'RU', label: 'Russia (RU)' },
  { code: 'SG', label: 'Singapore (SG)' },
] as const;

function displayContactField(value: string) {
  return value === 'N/A' ? '' : value;
}

function saveContactField(value: string) {
  const trimmed = value.trim();
  if (!trimmed && SALES_SYSTEM_UI) return 'N/A';
  return trimmed || null;
}

function isRealEmail(value: string) {
  const trimmed = value.trim();
  return !!trimmed && trimmed !== 'N/A';
}

function withCurrentOption<T extends string>(options: readonly T[], current: string): string[] {
  if (current && !options.includes(current as T)) return [...options, current];
  return [...options];
}

function resolveCountryCode(origin?: string | null) {
  if (!origin) return 'JP';
  const upper = origin.trim().toUpperCase();
  const byCode = COUNTRY_OPTIONS.find((c) => c.code === upper);
  if (byCode) return byCode.code;
  const byLabel = COUNTRY_OPTIONS.find((c) => c.label.toUpperCase().includes(upper));
  return byLabel?.code ?? 'JP';
}

function LeonSectionHeader({ title, icon, children }: { title: string; icon: LeonIconName; children?: React.ReactNode }) {
  return (
    <div className="leon-section-header">
      <h2 className="leon-section-header__title">
        <LeonIcon name={icon} size={15} className="leon-icon-accent" />
        {title}
      </h2>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <label className="glass-label leon-label">{label}</label>
      {children}
    </div>
  );
}

function AmountField({ label, value, onChange, placeholder, currency = 'UGX', disabled = false }: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder?: string; currency?: string; disabled?: boolean;
}) {
  const getDisplayValue = (val: string) => {
    if (!val) return '';
    const parts = val.split('.');
    const num = parseFloat(parts[0]);
    if (isNaN(num)) return val;
    const formattedInt = num.toLocaleString('en-US');
    return parts.length > 1 ? `${formattedInt}.${parts[1]}` : formattedInt;
  };
  const displayValue = getDisplayValue(value);
  const num = parseFloat(value);
  
  const handleChange = (val: string) => {
    // Remove commas and spaces
    const raw = val.replace(/,/g, '').replace(/\s/g, '');
    if (raw === '' || /^-?\d*\.?\d*$/.test(raw)) {
      onChange(raw);
    }
  };

  return (
    <div className="mb-3">
      <label className="glass-label leon-label">{label}</label>
      <input
        className="glass-input form-control form-control-sm leon-input"
        type="text"
        value={displayValue}
        onChange={(e) => handleChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        style={disabled ? { backgroundColor: '#e9ecef', opacity: 0.85, cursor: 'not-allowed' } : undefined}
      />
      {!isNaN(num) && num > 0 && (
        <div className="leon-amount-hint" data-leon-num="true">
          {currency} {num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
        </div>
      )}
    </div>
  );
}

function SelectField({ label, value, onChange, options }: {
  label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[];
}) {
  return (
    <Field label={label}>
      <select {...{ className: 'glass-input form-control form-control-sm leon-input' }} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </Field>
  );
}

function ToggleField({ label, checked, onChange, helpText, disabled }: { label: string; checked: boolean; onChange: (c: boolean) => void; helpText?: string; disabled?: boolean }) {
  return (
    <div className="leon-toggle-field" style={disabled ? { opacity: 0.55 } : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        style={{ marginTop: '3px', width: '16px', height: '16px', cursor: disabled ? 'not-allowed' : 'pointer', accentColor: 'var(--admin-accent)' }}
      />
      <div style={{ cursor: disabled ? 'not-allowed' : 'pointer', flex: 1 }} onClick={() => { if (!disabled) onChange(!checked); }}>
        <label className="leon-label mb-0 d-block" style={{ color: '#212529', fontSize: '0.75rem', cursor: 'pointer' }}>
          {label}
        </label>
        {helpText && <div className="text-muted" style={{ fontSize: '0.68rem', marginTop: '2px' }}>{helpText}</div>}
      </div>
    </div>
  );
}

function Phase1UsdUgxTable({
  phase1Rate,
  tickCfMombasa,
  tickClearance,
  tickCfKampala,
  cfMombasa,
  clearanceFee,
  cfKampala,
  ttCharges,
  exchangeRatePhase1,
  onCfMombasaChange,
  onClearanceChange,
  onCfKampalaChange,
  onTtChange,
  onExchangeRatePhase1Change,
}: {
  phase1Rate: number;
  tickCfMombasa: boolean;
  tickClearance: boolean;
  tickCfKampala: boolean;
  cfMombasa: string;
  clearanceFee: string;
  cfKampala: string;
  ttCharges: string;
  exchangeRatePhase1: string;
  onCfMombasaChange: (v: string) => void;
  onClearanceChange: (v: string) => void;
  onCfKampalaChange: (v: string) => void;
  onTtChange: (v: string) => void;
  onExchangeRatePhase1Change: (v: string) => void;
}) {
  const inputProps = { className: 'glass-input form-control form-control-sm leon-input' };
  const cfMombasaUsd = tickCfMombasa ? (n(cfMombasa) ?? 0) : 0;
  const clearanceUsd = tickClearance ? (n(clearanceFee) ?? 0) : 0;
  const cfKampalaUsdVal = tickCfKampala ? (n(cfKampala) ?? 0) : 0;
  const ttUsd = (n(ttCharges) ?? 0) > 0 ? (n(ttCharges) ?? 0) : 40;

  const cellInput = (value: string, onChange: (v: string) => void, enabled: boolean) => (
    <input
      {...inputProps}
      type="number"
      step="0.01"
      value={value}
      disabled={!enabled}
      onChange={(e) => onChange(e.target.value)}
      style={{ width: '100%', opacity: enabled ? 1 : 0.55 }}
    />
  );

  return (
    <div className="table-responsive mb-3">
      <table className="table table-sm table-bordered align-middle mb-0" style={{ fontSize: '0.82rem' }}>
        <thead className="table-light">
          <tr>
            <th>Description</th>
            <th style={{ width: '28%' }}>USD</th>
            <th style={{ width: '28%' }}>UGX</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>C&amp;F Mombasa (Japan → Mombasa)</td>
            <td>{cellInput(cfMombasa, onCfMombasaChange, tickCfMombasa)}</td>
            <td className="text-end leon-num">{fmtUgx(cfMombasaUsd * phase1Rate)}</td>
          </tr>
          <tr>
            <td>Clearance Mombasa → Kampala</td>
            <td>{cellInput(clearanceFee, onClearanceChange, tickClearance)}</td>
            <td className="text-end leon-num">{fmtUgx(clearanceUsd * phase1Rate)}</td>
          </tr>
          <tr>
            <td>C&amp;F Kampala (Japan → Kampala)</td>
            <td>{cellInput(cfKampala, onCfKampalaChange, tickCfKampala)}</td>
            <td className="text-end leon-num">{fmtUgx(cfKampalaUsdVal * phase1Rate)}</td>
          </tr>
          <tr>
            <td>TT Charges</td>
            <td>{cellInput(ttCharges, onTtChange, true)}</td>
            <td className="text-end leon-num">{fmtUgx(ttUsd * phase1Rate)}</td>
          </tr>
          <tr>
            <td>Exchange Rate (UGX/USD)</td>
            <td>1.00</td>
            <td>
              <input
                {...inputProps}
                type="number"
                step="0.01"
                value={exchangeRatePhase1}
                onChange={(e) => onExchangeRatePhase1Change(e.target.value)}
                style={{ width: '100%' }}
              />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function n(v: string): number | null {
  const num = parseFloat(v);
  return isNaN(num) ? null : num;
}

export function InvoiceForm({ vehicles, defaultValues = {}, invoiceId, mode }: Props) {
  const router = useRouter();
  const searchRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);

  const dv = (k: string, fallback = '') => (defaultValues[k] as string) ?? fallback;

  // ── Unit search state ──
  const [vehicleSearch, setVehicleSearch] = useState('');
  const [mvCcFilter, setMvCcFilter] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [mvResults, setMvResults] = useState<TaxRate[]>([]);
  const [mvSearching, setMvSearching] = useState(false);
  const [selectedVehicleLabel, setSelectedVehicleLabel] = useState(() => {
    // In edit mode restore the label from defaultValues
    const make = (defaultValues.vehicleMake as string) || '';
    const model = (defaultValues.vehicleModel as string) || '';
    const year = (defaultValues.vehicleYear as string | number) || '';
    const chassis = (defaultValues.chassisNo as string) || '';
    if (make || model) {
      return [make, model, year, chassis ? `— Chassis: ${chassis}` : ''].filter(Boolean).join(' ');
    }
    return '';
  });

  // Consignee
  const [consigneeName, setConsigneeName] = useState(dv('consigneeName'));
  const [consigneeAddress, setConsigneeAddress] = useState(() => displayContactField(dv('consigneeAddress')));
  const [consigneeCity, setConsigneeCity] = useState(dv('consigneeCity'));
  const [consigneeCountry, setConsigneeCountry] = useState(dv('consigneeCountry'));
  const [consigneePhone, setConsigneePhone] = useState(() => displayContactField(dv('consigneePhone')));
  const [consigneeEmail, setConsigneeEmail] = useState(() => displayContactField(dv('consigneeEmail')));
  const [notifyParty, setNotifyParty] = useState(dv('notifyParty', 'SAME AS CONSIGNEE'));

  // Shipping
  const [portFrom, setPortFrom] = useState(dv('portFrom'));
  const [portTo, setPortTo] = useState(dv('portTo'));
  const [finalDest, setFinalDest] = useState(dv('finalDestination'));
  const [blIssueAt, setBlIssueAt] = useState(dv('blIssueAt'));
  const [prepaidAt, setPrepaidAt] = useState(dv('prepaidAt'));
  const [shippingMark, setShippingMark] = useState(dv('shippingMark'));

  // Vehicle
  const [vehicleId, setVehicleId] = useState(dv('vehicleId'));
  const [chassisNo, setChassisNo] = useState(dv('chassisNo'));
  const [refNo, setRefNo] = useState(dv('refNo'));
  const [vehicleMake, setVehicleMake] = useState(dv('vehicleMake'));
  const [vehicleModel, setVehicleModel] = useState(dv('vehicleModel'));
  const [vehicleYear, setVehicleYear] = useState(dv('vehicleYear'));
  const initialColor = dv('vehicleColor') || 'White';
  const colorIsPreset = (COLOR_OPTIONS as readonly string[]).includes(initialColor);
  const [isCustomColor, setIsCustomColor] = useState(!colorIsPreset && !!initialColor);
  const [customColor, setCustomColor] = useState(colorIsPreset ? '' : initialColor);
  const [vehicleColor, setVehicleColor] = useState(colorIsPreset ? initialColor : (initialColor || 'White'));
  const [vehicleMileage, setVehicleMileage] = useState(dv('vehicleMileage'));
  const [vehicleTransmission, setVehicleTransmission] = useState(dv('vehicleTransmission') || 'Automatic');
  const [vehicleDriveType, setVehicleDriveType] = useState(dv('vehicleDriveType', '4WD'));
  const [vehicleDoors, setVehicleDoors] = useState(dv('vehicleDoors'));
  const [vehiclePassengers, setVehiclePassengers] = useState(dv('vehiclePassengers'));
  const [vehicleFuelType, setVehicleFuelType] = useState(dv('vehicleFuelType') || 'Petrol');
  const [vehicleSteering, setVehicleSteering] = useState(dv('vehicleSteering'));
  const [vehicleEngineCC, setVehicleEngineCC] = useState(dv('vehicleEngineCC'));
  const [vehicleWeightKG, setVehicleWeightKG] = useState(dv('vehicleWeightKG'));
  const [vehicleDimension, setVehicleDimension] = useState(dv('vehicleDimension'));
  const [vehicleInspection, setVehicleInspection] = useState(dv('vehicleInspection', 'With Pre-ship Inspection'));
  const [vehicleCountryOrigin, setVehicleCountryOrigin] = useState(() => {
    const saved = dv('consigneeCountry');
    return COUNTRY_OPTIONS.some((c) => c.code === saved) ? saved : 'JP';
  });

  // Phase 1
  // Phase 1 Toggles
  const [tickCfMombasa, setTickCfMombasa] = useState(defaultValues.tickCfMombasa as boolean ?? true);
  const [tickClearance, setTickClearance] = useState(defaultValues.tickClearance as boolean ?? false);
  const [tickCfKampala, setTickCfKampala] = useState(defaultValues.tickCfKampala as boolean ?? false);

  const [cifUsd, setCifUsd] = useState(dv('cifUsd'));
  const [cfMombasa, setCfMombasa] = useState(dv('cfMombasaUsd'));
  const [clearanceFee, setClearanceFee] = useState(dv('clearanceFeeUsd'));
  const [cfKampala, setCfKampala] = useState(dv('cfKampalaUsd', '0'));
  const [ttCharges, setTtCharges] = useState(dv('ttChargesUsd', '40'));
  const [exchangeRatePhase1, setExchangeRatePhase1] = useState(dv('exchangeRate', '3835'));
  const [exchangeRateTax, setExchangeRateTax] = useState(dv('exchangeRatePhase2') || dv('exchangeRate', '3835'));

  const [includePhaseTwo, setIncludePhaseTwo] = useState(defaultValues.includePhaseTwo as boolean ?? false);
  const [includeTaxToUra, setIncludeTaxToUra] = useState(defaultValues.includeTaxToUra as boolean ?? true);
  const [dutyFree, setDutyFree] = useState(defaultValues.dutyFree as boolean ?? false);

  const handleDutyFreeChange = (checked: boolean) => {
    setDutyFree(checked);
    if (checked) setIncludeTaxToUra(false);
  };

  const handleIncludeTaxToUraChange = (checked: boolean) => {
    setIncludeTaxToUra(checked);
    if (checked) setDutyFree(false);
  };

  const [importDuty, setImportDuty] = useState(dv('importDutyUgx'));
  const [exciseDuty, setExciseDuty] = useState(dv('exciseDutyUgx'));
  const [vat, setVat] = useState(dv('vatUgx'));
  const [infraLevy, setInfraLevy] = useState(dv('infrastructureLevy'));
  const [envLevy, setEnvLevy] = useState(dv('environmentalLevy'));
  const [wht, setWht] = useState(dv('withholdingTax'));
  const [regFee, setRegFee] = useState(dv('registrationFee', '1500000'));
  const [plates, setPlates] = useState(dv('numberPlatesFee', '714300'));
  const [insurance, setInsurance] = useState(dv('thirdPartyInsurance', '70000'));
  const [agencyFees, setAgencyFees] = useState(dv('agencyFees', '400000'));
  const [idf, setIdf] = useState(dv('idfUgx'));
  const [stampDuty, setStampDuty] = useState(dv('stampDutyUgx', '18000'));
  const [regForm, setRegForm] = useState(dv('regFormUgx', '35000'));

  const cfPriceUsd = (n(cfMombasa) ?? 0) + (n(clearanceFee) ?? 0) + (n(ttCharges) ?? 0);

  const taxReferenceYear = new Date().getFullYear();

  const totalsInput = buildInvoiceFormTotalsInput({
    tickCfMombasa,
    tickClearance,
    tickCfKampala,
    cfMombasa,
    clearanceFee,
    cfKampala,
    ttCharges,
    exchangeRatePhase1,
    exchangeRateTax,
    cifUsd,
    vehicleYear,
    referenceYear: taxReferenceYear,
    includeTaxToUra,
    dutyFree,
    includePhaseTwo,
    plates,
    insurance,
    agencyFees,
    regFee,
    stampDuty,
    regForm,
  });

  const phase1Rate = totalsInput.exchangeRatePhase1;
  const phase1TotalUsd = computePhaseOneTotalUsd(totalsInput);
  const phase1Total = computePhaseOneTotal(totalsInput);

  const uraTaxFieldsTotal = sumUraTaxComponents({
    importDuty: n(importDuty) ?? 0,
    vat: n(vat) ?? 0,
    withholdingTax: n(wht) ?? 0,
    environmentalLevy: n(envLevy) ?? 0,
    idf: n(idf) ?? 0,
    infrastructureLevy: n(infraLevy) ?? 0,
    registrationFee: n(regFee) ?? 0,
    stampDuty: n(stampDuty) ?? 0,
    regForm: n(regForm) ?? 0,
  });

  const dutyFreeFeesTotal = (n(regFee) ?? 0) + (n(stampDuty) ?? 0) + (n(regForm) ?? 0);
  const taxesPayableToUra = dutyFree
    ? dutyFreeFeesTotal
    : includeTaxToUra
      ? uraTaxFieldsTotal
      : 0;
  const registrationProcessTotal = includePhaseTwo
    ? taxesPayableToUra + (n(plates) ?? 0) + (n(insurance) ?? 0) + (n(agencyFees) ?? 0)
    : taxesPayableToUra;
  const phase2Total = registrationProcessTotal;
  const grandTotal = phase1Total + registrationProcessTotal;

  // Payment
  const [paymentTerms, setPaymentTerms] = useState(dv('paymentTerms'));
  const [paymentDueDate, setPaymentDueDate] = useState(dv('paymentDueDate', '').slice(0, 10));
  const [status, setStatus] = useState(dv('status', 'draft'));
  const [notes, setNotes] = useState(dv('notes'));

  // UI state
  const [taxLookupStatus, setTaxLookupStatus] = useState<'idle' | 'loading' | 'found' | 'notfound'>('idle');
  const [taxMatch, setTaxMatch] = useState<Record<string, number | string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [genPdf, setGenPdf] = useState(false);
  const [unlocking, setUnlocking] = useState(false);
  const machineFinalized = defaultValues.machineFinalized === true;
  const formLocked = mode === 'edit' && machineFinalized;
  const [error, setError] = useState('');

  // Vehicle PDF import state
  const [pdfParseFile, setPdfParseFile] = useState<File | null>(null);
  const [pdfParsing, setPdfParsing] = useState(false);
  const [pdfExtracted, setPdfExtracted] = useState<Record<string, string | null> | null>(null);
  const [pdfParseError, setPdfParseError] = useState('');

  // Check once on mount if the MV database has any records at all
  const [mvDbEmpty, setMvDbEmpty] = useState<boolean | null>(null);
  useEffect(() => {
    fetch('/api/mv-database?limit=1')
      .then(r => r.json())
      .then(d => setMvDbEmpty((d.total ?? 0) === 0))
      .catch(() => setMvDbEmpty(null));
  }, []);

  // ── Live MV database search (debounced) ──
  useEffect(() => {
    if (vehicleSearch.length < 2) { setMvResults([]); setMvSearching(false); return; }
    setMvSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/mv-database?q=${encodeURIComponent(vehicleSearch)}`);
        const data = await res.json();
        setMvResults(data.rows || []);
      } catch { setMvResults([]); }
      finally { setMvSearching(false); }
    }, 350);
    return () => clearTimeout(timer);
  }, [vehicleSearch]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setSearchOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  function applyTaxRateFromDb(rate: TaxRate) {
    const taxRate = n(exchangeRateTax) ?? n(exchangeRatePhase1) ?? 3835;
    const extras = deriveMissingUraFeeFields(rate.customsValue ?? n(cifUsd) ?? 0, taxRate, {
      idf: n(idf) ?? 0,
      stampDuty: n(stampDuty) ?? 0,
      regForm: n(regForm) ?? 0,
    });

    if (rate.customsValue != null) setCifUsd(rate.customsValue.toString());
    if (rate.importDuty != null) setImportDuty(Math.round(rate.importDuty).toString());
    if (rate.vat != null) setVat(Math.round(rate.vat).toString());
    if (rate.withholdingTax != null) setWht(Math.round(rate.withholdingTax).toString());
    if (rate.infrastructureLevy != null) setInfraLevy(Math.round(rate.infrastructureLevy).toString());
    if (rate.environmentalLevy != null) setEnvLevy(Math.round(rate.environmentalLevy).toString());
    if (rate.registrationFee != null) setRegFee(Math.round(rate.registrationFee).toString());
    if (rate.exciseDuty != null) setExciseDuty(Math.round(rate.exciseDuty).toString());
    setIdf(Math.round(extras.idf).toString());
    setStampDuty(Math.round(extras.stampDuty).toString());
    setRegForm(Math.round(extras.regForm).toString());

    setTaxMatch({
      id: rate.id,
      totalTaxUGX: rate.totalTaxUGX ?? 0,
      databaseMonth: rate.databaseMonth,
      serialNumber: rate.serialNumber ?? '',
    });
    setTaxLookupStatus('found');
  }

  // Auto-compute tax fields from CIF when not locked to an official URA database row.
  useEffect(() => {
    if (!mountedRef.current) { mountedRef.current = true; return; }
    if (taxLookupStatus === 'found' && taxMatch) return;
    const cif = n(cifUsd) ?? 0;
    const rate = n(exchangeRateTax) ?? n(exchangeRatePhase1) ?? 0;
    if (cif <= 0 || rate <= 0) return;
    const breakdown = computeUraTaxBreakdown(
      buildInvoiceFormTotalsInput({
        tickCfMombasa,
        tickClearance,
        tickCfKampala,
        cfMombasa,
        clearanceFee,
        cfKampala,
        ttCharges,
        exchangeRatePhase1,
        exchangeRateTax,
        cifUsd,
        vehicleYear,
        referenceYear: taxReferenceYear,
        includeTaxToUra: true,
        dutyFree: false,
        includePhaseTwo,
        plates,
        insurance,
        agencyFees,
        regFee,
        stampDuty,
        regForm,
      }),
    );
    setImportDuty(Math.round(breakdown.importDuty).toString());
    setInfraLevy(Math.round(breakdown.infrastructureLevy).toString());
    setIdf(Math.round(breakdown.idf).toString());
    setWht(Math.round(breakdown.withholdingTax).toString());
    setVat(Math.round(breakdown.vat).toString());
    setEnvLevy(Math.round(breakdown.environmentalLevy).toString());
    setRegFee(Math.round(breakdown.registrationFee).toString());
    setStampDuty(Math.round(breakdown.stampDuty).toString());
    setRegForm(Math.round(breakdown.regForm).toString());
  }, [cifUsd, exchangeRateTax, exchangeRatePhase1, vehicleYear, taxLookupStatus, taxMatch]);

  function countPhase1Selections() {
    return [tickCfMombasa, tickClearance, tickCfKampala].filter(Boolean).length;
  }

  function handlePhase1Tick(
    key: 'mombasa' | 'clearance' | 'kampala',
    newValue: boolean,
    setTick: (v: boolean) => void,
    setAmount: Dispatch<SetStateAction<string>>,
  ) {
    const currentlyOn = key === 'mombasa' ? tickCfMombasa : key === 'clearance' ? tickClearance : tickCfKampala;
    if (newValue && !currentlyOn && countPhase1Selections() >= 2) {
      setError('You can select maximum 2 Phase 1 options');
      return;
    }
    setError('');
    setTick(newValue);
    if (newValue) {
      setAmount((prev) => (prev.trim() === '' ? '0' : prev));
    } else {
      setAmount('0');
    }
    if (key === 'clearance' || key === 'kampala') {
      if (newValue || (key === 'clearance' ? tickCfKampala : tickClearance)) {
        setIncludePhaseTwo(true);
      }
    }
  }

  // ── Reasoning Logic: Auto-toggle Phase 2 based on Clearance ──
  useEffect(() => {
    if (!mountedRef.current) return;
    if (tickClearance || tickCfKampala) {
      setIncludePhaseTwo(true);
    }
  }, [tickClearance, tickCfKampala]);

  // ── Reasoning Logic: Clear Phase 2 defaults if unchecked ──
  useEffect(() => {
    if (!mountedRef.current) return;
    if (!includePhaseTwo) {
      setPlates('');
      setInsurance('');
      setAgencyFees('');
    } else {
      // Restore defaults if empty
      if (!plates) setPlates('714300');
      if (!insurance) setInsurance('70000');
      if (!agencyFees) setAgencyFees('400000');
    }
  }, [includePhaseTwo]);

  // ── Core: URA tax lookup ──
  async function performTaxLookup(make: string, model: string, year: string, cc?: string, fuel?: string) {
    if (!make || !model) return;
    setTaxLookupStatus('loading');
    try {
      const q = new URLSearchParams({ 
        make, 
        model, 
        ...(year ? { year } : {}),
        ...(cc ? { cc } : {}),
        ...(fuel ? { fuel } : {})
      });
      const res = await fetch(`/api/invoices/tax-lookup?${q}`);
      if (!res.ok) { setTaxLookupStatus('notfound'); return; }
      const data = await res.json();
      // data.id confirms it's a real VehicleTaxRate record
      if (data && data.id) {
        if (data.engineSizeCC != null) setVehicleEngineCC(data.engineSizeCC.toString());
        if (data.fuelType != null) setVehicleFuelType(data.fuelType);
        applyTaxRateFromDb(data);
      } else {
        setTaxMatch(null);
        setTaxLookupStatus('notfound');
      }
    } catch {
      setTaxLookupStatus('notfound');
    }
  }

  function applyVehicleColor(color: string) {
    const trimmed = color.trim();
    if (!trimmed) return;
    const preset = (COLOR_OPTIONS as readonly string[]).includes(trimmed);
    setIsCustomColor(!preset);
    if (preset) {
      setVehicleColor(trimmed);
      setCustomColor('');
    } else {
      setCustomColor(trimmed);
      setVehicleColor(trimmed);
    }
  }

  // ── Select vehicle from search results ──
  async function selectVehicle(v: Vehicle) {
    const make = v.brand?.name || '';
    const model = v.model || '';
    const year = v.year?.toString() || '';

    setVehicleId(v.id.toString());
    setChassisNo(v.chassisNo || '');
    setRefNo(v.refNo || '');
    setVehicleMake(make);
    setVehicleModel(model);
    setVehicleYear(year);
    if (v.color) applyVehicleColor(v.color);
    setVehicleMileage(v.mileage?.toString() || '');
    setVehicleTransmission(v.transmission || '');
    setVehicleFuelType(v.fuelType || '');
    setVehicleSteering(v.steering || '');
    setVehicleEngineCC(v.engineCc?.toString() || '');
    setVehiclePassengers(v.passengers?.toString() || '');
    setVehicleDoors(v.doors?.toString() || '');

    const label = [
      make, model, year,
      v.chassisNo ? `— Chassis: ${v.chassisNo}` : '',
    ].filter(Boolean).join(' ');
    setSelectedVehicleLabel(label);

    // Auto-populate MV search with make + model + year, and filter by CC to narrow results
    const autoSearch = [make, model, year].filter(Boolean).join(' ');
    setVehicleSearch(autoSearch);
    setMvCcFilter(v.engineCc ? v.engineCc.toString() : '');
    setSearchOpen(true);
    setMvResults([]);
  }

  function selectFromMv(rate: TaxRate) {
    // Extract year from search input if available
    let searchedYear = '';
    const yearMatch = vehicleSearch.match(/\b(19[89]\d|20[0-3]\d)\b/);
    if (yearMatch) {
      searchedYear = yearMatch[1];
    }

    const currentYearVal = searchedYear || vehicleYear;
    let yearToSet = '';

    if (currentYearVal) {
      const cy = parseInt(currentYearVal);
      const yFrom = rate.yearFrom ?? 0;
      const yTo = rate.yearTo ?? 9999;
      // If the current/searched year fits within the database row's range, preserve it!
      if (cy >= yFrom && cy <= yTo) {
        yearToSet = currentYearVal;
      }
    }

    // Fallback to rate.yearFrom if no valid year was determined
    if (!yearToSet && rate.yearFrom) {
      yearToSet = rate.yearFrom.toString();
    }

    // Set vehicle info
    if (!vehicleId) {
      setVehicleMake(rate.make);
      setVehicleModel(rate.model);
      if (yearToSet) setVehicleYear(yearToSet);
      if (rate.engineSizeCC) setVehicleEngineCC(rate.engineSizeCC.toString());
      if (rate.fuelType) setVehicleFuelType(rate.fuelType);
    } else {
      // If linked unit exists, we still want to ensure engine CC and year match the selected URA rate to prevent CIF/CC mismatches!
      if (!vehicleMake) setVehicleMake(rate.make);
      if (!vehicleModel) setVehicleModel(rate.model);
      
      // Update year and engine CC to ensure they align with the selected URA customs value
      if (yearToSet) setVehicleYear(yearToSet);
      if (rate.engineSizeCC) setVehicleEngineCC(rate.engineSizeCC.toString());
      
      if (!vehicleFuelType && rate.fuelType) setVehicleFuelType(rate.fuelType);
    }

    // Set CIF and official URA tax components from database row
    applyTaxRateFromDb(rate);
    if (rate.countryOrigin) setVehicleCountryOrigin(resolveCountryCode(rate.countryOrigin));

    const yearRange = rate.yearFrom ? (rate.yearTo && rate.yearTo !== rate.yearFrom ? `${rate.yearFrom}–${rate.yearTo}` : `${rate.yearFrom}`) : '';
    setSelectedVehicleLabel(`${rate.make} ${rate.model}${yearRange ? ' ' + yearRange : ''} — CIF USD ${(rate.customsValue ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (${rate.databaseMonth})`);
    
    setVehicleSearch('');
    setMvResults([]);
    setSearchOpen(false);
  }

  function calculateFromCif() {
    const cif = n(cifUsd) ?? 0;
    const rate = n(exchangeRateTax) ?? n(exchangeRatePhase1) ?? 3835;
    if (!cif || !rate) return alert('Set CIF (USD) and Tax Exchange Rate first');
    setTaxMatch(null);
    setTaxLookupStatus('notfound');
    const breakdown = computeUraTaxBreakdown(
      buildInvoiceFormTotalsInput({
        tickCfMombasa,
        tickClearance,
        tickCfKampala,
        cfMombasa,
        clearanceFee,
        cfKampala,
        ttCharges,
        exchangeRatePhase1,
        exchangeRateTax,
        cifUsd,
        vehicleYear,
        referenceYear: taxReferenceYear,
        includeTaxToUra: true,
        dutyFree: false,
        includePhaseTwo,
        plates,
        insurance,
        agencyFees,
        regFee,
        stampDuty,
        regForm,
      }),
    );
    setImportDuty(Math.round(breakdown.importDuty).toString());
    setInfraLevy(Math.round(breakdown.infrastructureLevy).toString());
    setIdf(Math.round(breakdown.idf).toString());
    setWht(Math.round(breakdown.withholdingTax).toString());
    setVat(Math.round(breakdown.vat).toString());
    setEnvLevy(Math.round(breakdown.environmentalLevy).toString());
    setRegFee(Math.round(breakdown.registrationFee).toString());
    setStampDuty(Math.round(breakdown.stampDuty).toString());
    setRegForm(Math.round(breakdown.regForm).toString());
  }

  async function lookupTax() {
    if (!vehicleMake || !vehicleModel) return alert('Set vehicle make and model first');
    await performTaxLookup(vehicleMake, vehicleModel, vehicleYear, vehicleEngineCC, vehicleFuelType);
  }

  async function handleVehiclePdfParse() {
    if (!pdfParseFile) return;
    setPdfParsing(true);
    setPdfExtracted(null);
    setPdfParseError('');
    try {
      let res: Response;

      // Step 1: Try to get a presigned S3 upload URL
      const presignRes = await fetch(`/api/invoices/parse-vehicle-pdf/presign?filename=${encodeURIComponent(pdfParseFile.name)}`);

      if (!presignRes.ok) {
        // S3 not configured — fall back to direct multipart upload
        const fd = new FormData();
        fd.append('file', pdfParseFile);
        res = await fetch('/api/invoices/parse-vehicle-pdf', { method: 'POST', body: fd });
      } else {
        const { uploadUrl, key } = await presignRes.json();

        // Step 2: Upload directly to S3
        const sizeMB = (pdfParseFile.size / 1024 / 1024).toFixed(1);
        setPdfParsing(true);
        const s3Res = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/pdf' },
          body: pdfParseFile,
        });
        if (!s3Res.ok) throw new Error(`S3 upload failed (${s3Res.status}) — ${sizeMB} MB`);

        // Step 3: POST s3Key to parse endpoint
        res = await fetch('/api/invoices/parse-vehicle-pdf', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ s3Key: key }),
        });
      }

      if (!res.headers.get('content-type')?.includes('application/json')) {
        throw new Error('Server error: ' + res.status);
      }
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setPdfParseError(data.error || 'Failed to parse PDF');
        return;
      }
      setPdfExtracted(data.extracted);
    } catch (err: any) {
      setPdfParseError(err.message || 'Failed to parse PDF');
    } finally {
      setPdfParsing(false);
    }
  }

  function applyPdfExtract(extracted: Record<string, string | null>) {
    if (extracted.chassisNo) setChassisNo(extracted.chassisNo);
    if (extracted.make) setVehicleMake(extracted.make);
    if (extracted.model) setVehicleModel(extracted.model);
    if (extracted.year) setVehicleYear(extracted.year);
    if (extracted.color) applyVehicleColor(extracted.color);
    if (extracted.mileage) setVehicleMileage(extracted.mileage);
    if (extracted.engineCC) setVehicleEngineCC(extracted.engineCC);
    if (extracted.fuelType) setVehicleFuelType(extracted.fuelType);
    if (extracted.transmission) setVehicleTransmission(extracted.transmission);
    if (extracted.steering) setVehicleSteering(extracted.steering);
    if (extracted.doors) setVehicleDoors(extracted.doors);
    setPdfExtracted(null);
    setPdfParseFile(null);
  }

  function buildPayload(forStatus: string) {
    const totalTaxUgx = dutyFree ? dutyFreeFeesTotal : (includeTaxToUra ? uraTaxFieldsTotal : 0);
    const resolvedColor = isCustomColor ? customColor.trim() || vehicleColor : vehicleColor;
    const structuredNotes = buildSalesSystemInvoiceNotes({
      consigneeName,
      consigneePhone,
      consigneeAddress: consigneeAddress.trim() || 'N/A',
      vehicleMake,
      vehicleModel,
      vehicleYear,
      vehicleEngineCC,
      chassisNo,
      tickCfMombasa,
      tickClearance,
      tickCfKampala,
      cfMombasa,
      clearanceFee,
      cfKampala,
      exchangeRatePhase1,
      ttCharges,
      includePhaseTwo,
      includeTaxToUra: dutyFree ? false : includeTaxToUra,
      dutyFree,
      plates,
      insurance,
      agencyFees,
      totalsInput,
      uraTaxesUgx: totalTaxUgx,
      additionalNotes: notes,
    });
    return {
      status: forStatus,
      vehicleId: vehicleId || null,
      consigneeName,
      consigneeAddress: consigneeAddress.trim() || (SALES_SYSTEM_UI ? 'N/A' : null),
      consigneeCity,
      consigneeCountry: SALES_SYSTEM_UI ? vehicleCountryOrigin : consigneeCountry,
      consigneePhone: saveContactField(consigneePhone),
      consigneeEmail: saveContactField(consigneeEmail),
      notifyParty,
      portFrom, portTo, finalDestination: finalDest, blIssueAt, prepaidAt, shippingMark,
      chassisNo, refNo, vehicleMake, vehicleModel,
      vehicleYear: n(vehicleYear), vehicleColor: resolvedColor, vehicleMileage: n(vehicleMileage),
      vehicleTransmission, vehicleDriveType, vehicleDoors: n(vehicleDoors),
      vehiclePassengers: n(vehiclePassengers), vehicleFuelType, vehicleSteering,
      vehicleEngineCC: n(vehicleEngineCC), vehicleWeightKG: n(vehicleWeightKG),
      vehicleDimension, vehicleInspection,
      cifUsd: n(cifUsd), tickCfMombasa, cfMombasaUsd: n(cfMombasa),
      tickClearance, clearanceFeeUsd: n(clearanceFee),
      tickCfKampala, cfKampalaUsd: n(cfKampala), ttChargesUsd: n(ttCharges),
      exchangeRate: n(exchangeRatePhase1),
      exchangeRatePhase2: n(exchangeRateTax),
      firstInstallmentUgx: phase1Total,
      cfPriceUsd: cfPriceUsd || null,
      quantityUnits: 1,
      paymentTerms, paymentDueDate: paymentDueDate || null,
      includePhaseTwo, includeTaxToUra: dutyFree ? false : includeTaxToUra, dutyFree,
      taxesURA: totalTaxUgx || null, numberPlatesFee: n(plates),
      thirdPartyInsurance: n(insurance), agencyFees: n(agencyFees),
      importDutyUgx: Math.round(n(importDuty) ?? 0) || null,
      exciseDutyUgx: n(exciseDuty),
      vatUgx: Math.round(n(vat) ?? 0) || null,
      infrastructureLevy: Math.round(n(infraLevy) ?? 0) || null,
      environmentalLevy: Math.round(n(envLevy) ?? 0) || null,
      withholdingTax: Math.round(n(wht) ?? 0) || null,
      registrationFee: Math.round(n(regFee) ?? 0) || null,
      idfUgx: Math.round(n(idf) ?? 0) || null,
      stampDutyUgx: Math.round(n(stampDuty) ?? 0) || null,
      regFormUgx: Math.round(n(regForm) ?? 0) || null,
      totalTaxUgx: totalTaxUgx || null,
      secondInstallmentUgx: phase2Total || null, grandTotalUgx: grandTotal || null,
      notes: structuredNotes,
    };
  }

  async function unlockForEdit() {
    if (!invoiceId) return;
    setUnlocking(true);
    setError('');
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/unlock-edit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ openEditor: true }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setError(d.error || 'Could not unlock invoice for editing');
        return;
      }
      router.refresh();
    } finally {
      setUnlocking(false);
    }
  }

  async function save(forStatus: string, generatePdfAfter = false) {
    if (formLocked && !generatePdfAfter) {
      setError('Invoice is finalized. Click Unlock Edit to change it on the sales machine.');
      return;
    }
    if (!consigneeName.trim()) return setError(SALES_SYSTEM_UI ? 'Customer name is required' : 'Consignee name is required');
    setError('');
    setSaving(true);
    try {
      const payload = {
        ...buildPayload(generatePdfAfter ? 'sent' : forStatus),
        ...(generatePdfAfter ? { triggerGenerate: true, status: 'sent' } : {}),
      };
      let res: Response;
      if (mode === 'edit' && invoiceId) {
        res = await fetch(`/api/invoices/${invoiceId}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      } else {
        res = await fetch('/api/invoices', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      }
      if (!res.ok) {
        const d = await res.json();
        setError(d.error || 'Save failed');
        return;
      }
      const inv = await res.json();
      if (generatePdfAfter) {
        setGenPdf(true);
        if (inv.pdfUrl) {
          window.open(invoicePdfViewPath(inv.id), '_blank');
        }
        setGenPdf(false);
        router.push('/admin/invoices');
        router.refresh();
        return;
      }
      router.push('/admin/invoices');
      router.refresh();
    } finally {
      setSaving(false);
      setGenPdf(false);
    }
  }

  const inputProps = { className: 'glass-input form-control form-control-sm leon-input' };

  const invoiceNumberDisplay = String(defaultValues?.invoiceNumber || 'Auto-generated');
  const invoiceDateRaw = defaultValues?.createdAt;
  const invoiceDateDisplay = invoiceDateRaw
    ? new Date(String(invoiceDateRaw)).toLocaleDateString('en-CA')
    : new Date().toLocaleDateString('en-CA');

  const uraSearchPanel = (
    <div className="mb-4 p-3 rounded-3 border" style={{ background: 'var(--brand-accent-tint)', borderColor: 'var(--brand-accent-border)', position: 'relative', zIndex: 50, overflow: 'visible' }} ref={searchRef}>
          <h6 className="fw-semibold mb-2 d-flex align-items-center gap-2">
            <LeonIcon name="database-zap" size={15} className="leon-icon-accent" />
            Search URA Database
          </h6>
          <p className="text-muted small mb-3">
            Type make, model, or year — results come from the imported URA PDF. Select a unit to auto-fill vehicle info and taxes.
          </p>

          <div className="leon-search-wrap">
            <LeonIcon name="search" size={15} className="leon-search-icon" />
            <input
              type="text"
              className="glass-input form-control form-control-sm leon-input leon-search-input"
              placeholder="e.g. Toyota, Land Cruiser Prado, Hilux, 2019…"
              value={vehicleSearch}
              onChange={(e) => { setVehicleSearch(e.target.value); setMvCcFilter(''); setSearchOpen(true); }}
              onFocus={() => setSearchOpen(true)}
              autoComplete="off"
            />
            {vehicleSearch && (
              <button
                type="button"
                onClick={() => { setVehicleSearch(''); setMvCcFilter(''); setMvResults([]); }}
                className="btn btn-link btn-sm position-absolute top-50 end-0 translate-middle-y text-muted pe-3"
              >
                <LeonIcon name="x" size={14} />
              </button>
            )}

            {searchOpen && vehicleSearch.length >= 2 && (
              <div className="leon-search-dropdown">
              {mvSearching ? (
                <div style={{ padding: '0.875rem 1rem', color: '#6c757d', fontSize: '0.8rem', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                  <span className="spinner-border spinner-border-sm" style={{ width: 14, height: 14 }} />
                  Searching URA database…
                </div>
              ) : mvResults.length > 0 ? (
                <>
                  <div style={{ padding: '0.35rem 1rem', fontSize: '0.68rem', color: '#6c757d', background: '#f8f9fa', borderBottom: '1px solid #dee2e6' }}>
                    {mvResults.length} result{mvResults.length !== 1 ? 's' : ''} — click to select &amp; auto-fill taxes
                  </div>
                  {mvResults.length > 0 && !mvResults[0].serialNumber && (
                    <div className="px-3 py-2 small text-warning bg-warning-subtle border-bottom d-flex align-items-center gap-2">
                      <LeonIcon name="info" size={14} />
                      <span><strong>S/N, Fuel, Origin, &amp; HS Code are missing</strong> — re-import your URA PDF ({mvResults[0].databaseMonth}) to show all details.</span>
                    </div>
                  )}
                  {mvResults.map((rate, index) => (
                    <div
                      key={`${rate.id || index}-${index}`}
                      onMouseDown={(e) => { e.preventDefault(); selectFromMv(rate); }}
                      className="leon-search-item"
                    >
                      <div style={{ 
                        display: 'flex', 
                        alignItems: 'center', 
                        justifyContent: 'space-between', 
                        gap: '0.75rem',
                        flexWrap: 'wrap'
                      }}>
                        {/* 1. S/N */}
                        <div style={{ minWidth: '75px' }}>
                          <span className="badge bg-dark leon-num" style={{ fontSize: '0.72rem' }}>
                            S/N: {rate.serialNumber || '—'}
                          </span>
                        </div>

                        <div style={{ minWidth: '85px' }}>
                          <span className="badge border leon-num" style={{ fontSize: '0.72rem', color: 'var(--admin-accent)', background: 'var(--brand-accent-light)' }}>
                            Origin: {rate.countryOrigin || '—'}
                          </span>
                        </div>

                        {/* 3. Description (make, model, years, raw line) */}
                        <div style={{ flex: 1, minWidth: '150px' }}>
                          <div style={{ fontWeight: 700, color: '#212529', fontSize: '0.85rem' }}>
                            {rate.make} {rate.model}
                            {(rate.yearFrom || rate.yearTo) && (
                              <span className="leon-num text-muted ms-1" style={{ fontSize: '0.75rem' }}>
                                ({rate.yearFrom}{rate.yearTo && rate.yearTo !== rate.yearFrom ? `–${rate.yearTo}` : ''})
                              </span>
                            )}
                          </div>
                          {rate.description && (
                            <div style={{ fontSize: '0.62rem', color: '#6c757d', fontStyle: 'italic', marginTop: 1 }}>
                              Raw: {rate.description}
                            </div>
                          )}
                        </div>

                        {/* 4. CC */}
                        <div style={{ minWidth: '80px', textAlign: 'center' }}>
                          <span style={{ 
                            background: '#f8f9fa', 
                            border: '1px solid #dee2e6',
                            padding: '3px 7px', 
                            borderRadius: 4, 
                            fontSize: '0.72rem', 
                            fontWeight: 600,
                            color: '#495057'
                          }}>
                            {rate.engineSizeCC ? `${rate.engineSizeCC.toLocaleString()} cc` : '—'}
                          </span>
                        </div>

                        {/* 5. CIF (USD) */}
                        <div style={{ textAlign: 'right', minWidth: '95px' }}>
                          <div className="leon-section-label mb-0">CIF (USD)</div>
                          <div className="leon-num fw-bold" style={{ color: 'var(--admin-accent)', fontSize: '0.9rem' }} data-leon-num="true">
                            ${rate.customsValue != null ? Number(rate.customsValue).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </>
              ) : (
                <div style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                  <div style={{ color: '#6c757d', fontSize: '0.8rem', marginBottom: 4 }}>
                    No vehicles matching &quot;{vehicleSearch}&quot;
                  </div>
                  {mvDbEmpty !== false && (
                    <div className="text-danger small">
                      <LeonIcon name="alert-triangle" size={14} className="me-1" />
                      {mvDbEmpty
                        ? <>The MV database is empty — go to <strong style={{ color: 'var(--admin-accent)' }}>Admin → MV Database</strong> to import the URA PDF first.</>
                        : <>The MV database may be empty — go to <strong style={{ color: 'var(--admin-accent)' }}>Admin → MV Database</strong> to import the URA PDF first.</>
                      }
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {selectedVehicleLabel ? (
          <div className="mt-3 d-flex align-items-center gap-2 flex-wrap">
            <LeonIcon name="circle-check" size={16} className="text-success" />
            <span className="text-success fw-semibold small">{selectedVehicleLabel}</span>
            <button
              type="button"
              onClick={() => { setSelectedVehicleLabel(''); setVehicleId(''); setTaxLookupStatus('idle'); setMvResults([]); setVehicleSearch(''); }}
              className="btn btn-link btn-sm text-muted p-0"
              title="Clear selection"
            >
              <LeonIcon name="x" size={14} />
            </button>
          </div>
        ) : (
          <div className="mt-2 text-muted leon-section-label mb-0">
            Type at least 2 characters to search. Import URA PDF from MV Database if empty.
          </div>
        )}

        {!SALES_SYSTEM_UI && vehicles.length > 0 && (
          <div className="mt-3 pt-3 border-top">
            <label className="glass-label leon-label d-flex align-items-center gap-1 mb-2">
              <LeonIcon name="link" size={13} />
              Link to inventory vehicle (optional)
            </label>
            <select
              className="glass-input form-control form-control-sm leon-input"
              value={vehicleId}
              onChange={(e) => {
                setVehicleId(e.target.value);
                if (e.target.value) {
                  const v = vehicles.find((v) => v.id.toString() === e.target.value);
                  if (v) selectVehicle(v);
                }
              }}
            >
              <option value="">— not linked to a stock unit —</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id.toString()}>
                  {v.brand?.name} {v.model} {v.year}{v.chassisNo ? ` — ${v.chassisNo}` : ''}{v.refNo ? ` (Ref: ${v.refNo})` : ''}
                </option>
              ))}
            </select>
          </div>
        )}
    </div>
  );

  return (
    <div className="pb-5">
      {formLocked && (
        <div className="alert alert-secondary mb-3 small font-mono">
          This invoice is finalized on the sales machine. PDF is generated there automatically when online.
          Use <strong>Unlock Edit on Machine</strong> to allow changes again.
        </div>
      )}
      {error && (
        <div className="alert alert-danger mb-3 p-2 small">
          {error}
        </div>
      )}

      {!SALES_SYSTEM_UI && (
        <div className="leon-bezel-outer mb-4" style={{ position: 'relative', zIndex: 50, overflow: 'visible' }}>
          <div className="leon-bezel-inner">{uraSearchPanel}</div>
        </div>
      )}

      <div className="leon-form-layout" style={SALES_SYSTEM_UI ? { display: 'flex', flexDirection: 'column', gap: '1rem', gridTemplateColumns: '1fr' } : undefined}>

        {/* ── 1. Invoice Information (sales_system order) ── */}
        {SALES_SYSTEM_UI && (
          <div className="leon-bezel-outer" style={{ gridColumn: '1 / -1' }}>
            <div className="leon-bezel-inner">
              <LeonSectionHeader title="Invoice Information" icon="receipt" />
              <div className="leon-form-grid">
                <Field label="Invoice Number">
                  <input {...inputProps} value={invoiceNumberDisplay} readOnly style={{ backgroundColor: '#e9ecef', opacity: 0.85 }} />
                </Field>
                <Field label="Invoice Date">
                  <input {...inputProps} value={invoiceDateDisplay} readOnly style={{ backgroundColor: '#e9ecef', opacity: 0.85 }} />
                </Field>
                <Field label="Due Date">
                  <input {...inputProps} type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} />
                </Field>
                <Field label="Status">
                  <select {...inputProps} value={status} onChange={(e) => setStatus(e.target.value)}>
                    {['draft', 'sent', 'pending', 'paid', 'overdue', 'cancelled'].map((s) => (
                      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                    ))}
                  </select>
                </Field>
              </div>
            </div>
          </div>
        )}

        {/* ── 2/3. Customer & Vehicle (order matches sales_system when SALES_SYSTEM_UI) ── */}
        {SALES_SYSTEM_UI ? (
          <>
        {/* Customer first for sales_system */}
        <div className="leon-bezel-outer" style={{ gridColumn: '1 / -1' }}>
          <div className="leon-bezel-inner">
          <LeonSectionHeader title="Customer Information" icon="mail" />
          <div className="leon-form-grid">
            <Field label="Customer Name *"><input {...inputProps} value={consigneeName} onChange={(e) => setConsigneeName(e.target.value)} placeholder="BYAMUKAMA RAUBEN" /></Field>
            <Field label="Email"><input {...inputProps} value={consigneeEmail} onChange={(e) => setConsigneeEmail(e.target.value)} placeholder="N/A" /></Field>
            <Field label="Phone"><input {...inputProps} value={consigneePhone} onChange={(e) => setConsigneePhone(e.target.value)} placeholder="N/A" /></Field>
            <Field label="Address"><input {...inputProps} value={consigneeAddress} onChange={(e) => setConsigneeAddress(e.target.value)} placeholder="N/A" /></Field>
          </div>
          </div>
        </div>
          </>
        ) : null}

        {/* ── Vehicle Details ── */}
        <div className="leon-bezel-outer" style={{ gridColumn: '1 / -1' }}>
          <div className="leon-bezel-inner">
          <LeonSectionHeader title="Vehicle Details" icon="car">
            {!SALES_SYSTEM_UI && (
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <input
                  type="file"
                  accept=".pdf"
                  id="vehicle-pdf-input"
                  className="d-none"
                  onChange={(e) => { setPdfParseFile(e.target.files?.[0] ?? null); setPdfExtracted(null); setPdfParseError(''); }}
                />
                <label htmlFor="vehicle-pdf-input" className="btn btn-light border btn-sm rounded-pill font-mono text-[10px] uppercase tracking-wider mb-0">
                  <LeonIcon name="file-text" size={13} className="me-1" />
                  {pdfParseFile ? pdfParseFile.name.slice(0, 24) + '…' : 'Import PDF'}
                </label>
                {pdfParseFile && (
                  <button
                    type="button"
                    onClick={handleVehiclePdfParse}
                    disabled={pdfParsing}
                    className="btn btn-dark btn-sm rounded-pill font-mono text-[10px] uppercase tracking-wider"
                  >
                    {pdfParsing
                      ? <><span className="spinner-border spinner-border-sm me-1" />Extracting…</>
                      : <><LeonIcon name="sparkles" size={13} className="me-1" />Extract Data</>}
                  </button>
                )}
              </div>
            )}
          </LeonSectionHeader>

          {SALES_SYSTEM_UI && uraSearchPanel}

          {!SALES_SYSTEM_UI && pdfParseError && (
            <div className="mb-3 p-2 rounded-3 border border-danger-subtle bg-danger-subtle text-danger small d-flex align-items-center gap-1">
              <LeonIcon name="alert-circle" size={14} />
              {pdfParseError}
            </div>
          )}

          {!SALES_SYSTEM_UI && pdfExtracted && (
            <div className="liquid-glass-panel mb-3 p-3">
              <div className="d-flex align-items-center justify-content-between mb-2">
                <span className="leon-section-header__title mb-0">
                  <LeonIcon name="sparkles" size={14} className="leon-icon-accent" />
                  Extracted from PDF
                </span>
                <button type="button" onClick={() => setPdfExtracted(null)} className="btn btn-link btn-sm text-muted p-0">
                  <LeonIcon name="x" size={14} />
                </button>
              </div>
              <div className="row g-2 mb-3">
                {Object.entries(pdfExtracted).filter(([k, v]) => k !== 'rawTextSample' && v).map(([key, val]) => (
                  <div key={key} className="col-6 col-md-4 col-lg-3">
                    <div className="leon-stat-chip">
                      <div className="leon-section-label mb-1">{key.replace(/([A-Z])/g, ' $1').trim()}</div>
                      <div className="small fw-semibold leon-num">{String(val)}</div>
                    </div>
                  </div>
                ))}
              </div>
              {Object.values(pdfExtracted).filter((v, k) => Object.keys(pdfExtracted)[k] !== 'rawTextSample' && v).length === 0 ? (
                <div className="text-danger small">No vehicle fields found in this PDF. Fill in fields manually.</div>
              ) : (
                <button
                  type="button"
                  onClick={() => applyPdfExtract(pdfExtracted)}
                  className="btn btn-dark btn-sm rounded-pill font-mono text-[10px] uppercase tracking-wider"
                >
                  <LeonIcon name="check-check" size={13} className="me-1" />
                  Apply to Form
                </button>
              )}
            </div>
          )}

          <div className="leon-form-grid">
            <Field label="Make">
              <input {...inputProps} value={vehicleMake} onChange={(e) => setVehicleMake(e.target.value)} placeholder="Toyota" />
            </Field>
            <Field label="Model">
              <input {...inputProps} value={vehicleModel} onChange={(e) => setVehicleModel(e.target.value)} placeholder="Land Cruiser Prado" />
            </Field>
            <Field label="Year">
              <input {...inputProps} type="number" value={vehicleYear} onChange={(e) => setVehicleYear(e.target.value)} placeholder="2020" />
            </Field>
            <Field label="Engine CC">
              <input {...inputProps} type="number" value={vehicleEngineCC} onChange={(e) => setVehicleEngineCC(e.target.value)} placeholder="2790" />
            </Field>
            {SALES_SYSTEM_UI && (
              <Field label="CIF USD">
                <input {...inputProps} value={cifUsd} onChange={(e) => setCifUsd(e.target.value)} placeholder="0" disabled={!!taxMatch} style={taxMatch ? { backgroundColor: '#e9ecef', opacity: 0.85 } : undefined} />
              </Field>
            )}
            <Field label="Chassis Number">
              <input {...inputProps} value={chassisNo} onChange={(e) => setChassisNo(e.target.value)} placeholder="GDJ151-0004647" />
            </Field>
            {!SALES_SYSTEM_UI && (
              <Field label="Reference Number">
                <input {...inputProps} value={refNo} onChange={(e) => setRefNo(e.target.value)} placeholder="243172887" />
              </Field>
            )}
            {SALES_SYSTEM_UI ? (
              <>
                <Field label="Fuel Type">
                  <select {...inputProps} value={vehicleFuelType} onChange={(e) => setVehicleFuelType(e.target.value)}>
                    {withCurrentOption(FUEL_TYPE_OPTIONS, vehicleFuelType).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Transmission">
                  <select {...inputProps} value={vehicleTransmission} onChange={(e) => setVehicleTransmission(e.target.value)}>
                    {withCurrentOption(TRANSMISSION_OPTIONS, vehicleTransmission).map((opt) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                </Field>
                <Field label="Color">
                  <div className="d-flex gap-2 flex-wrap">
                    <select
                      {...inputProps}
                      className={`${inputProps.className} flex-grow-1`}
                      style={{ minWidth: '140px' }}
                      value={isCustomColor ? 'Custom...' : vehicleColor}
                      onChange={(e) => {
                        const next = e.target.value;
                        if (next === 'Custom...') {
                          setIsCustomColor(true);
                          const nextCustom = customColor || vehicleColor;
                          setCustomColor(nextCustom);
                          setVehicleColor(nextCustom);
                        } else {
                          setIsCustomColor(false);
                          setVehicleColor(next);
                          setCustomColor('');
                        }
                      }}
                    >
                      {COLOR_OPTIONS.map((color) => (
                        <option key={color} value={color}>{color}</option>
                      ))}
                      <option value="Custom...">Custom...</option>
                    </select>
                    {isCustomColor && (
                      <input
                        {...inputProps}
                        className={`${inputProps.className} flex-grow-1`}
                        value={customColor}
                        onChange={(e) => {
                          setCustomColor(e.target.value);
                          setVehicleColor(e.target.value);
                        }}
                        placeholder="Enter custom color"
                      />
                    )}
                  </div>
                </Field>
                <SelectField
                  label="Country of Origin"
                  value={vehicleCountryOrigin}
                  onChange={setVehicleCountryOrigin}
                  options={COUNTRY_OPTIONS.map((c) => ({ value: c.code, label: c.label }))}
                />
              </>
            ) : (
              <>
                <Field label="Fuel Type">
                  <input {...inputProps} value={vehicleFuelType} onChange={(e) => setVehicleFuelType(e.target.value)} placeholder="Diesel" />
                </Field>
                <Field label="Transmission">
                  <input {...inputProps} value={vehicleTransmission} onChange={(e) => setVehicleTransmission(e.target.value)} placeholder="Automatic" />
                </Field>
                <Field label="Color">
                  <input {...inputProps} value={vehicleColor} onChange={(e) => setVehicleColor(e.target.value)} placeholder="Black" />
                </Field>
              </>
            )}
            {!SALES_SYSTEM_UI && (
              <>
                <Field label="Mileage (km)">
                  <input {...inputProps} type="number" value={vehicleMileage} onChange={(e) => setVehicleMileage(e.target.value)} placeholder="169600" />
                </Field>
                <Field label="Drive Type">
                  <input {...inputProps} value={vehicleDriveType} onChange={(e) => setVehicleDriveType(e.target.value)} placeholder="4WD" />
                </Field>
                <Field label="Steering">
                  <input {...inputProps} value={vehicleSteering} onChange={(e) => setVehicleSteering(e.target.value)} placeholder="Right" />
                </Field>
                <Field label="Doors">
                  <input {...inputProps} type="number" value={vehicleDoors} onChange={(e) => setVehicleDoors(e.target.value)} placeholder="5" />
                </Field>
                <Field label="Passengers">
                  <input {...inputProps} type="number" value={vehiclePassengers} onChange={(e) => setVehiclePassengers(e.target.value)} placeholder="7" />
                </Field>
                <Field label="Weight (KG)">
                  <input {...inputProps} type="number" value={vehicleWeightKG} onChange={(e) => setVehicleWeightKG(e.target.value)} placeholder="2725" />
                </Field>
                <Field label="Dimension (L×W×H)">
                  <input {...inputProps} value={vehicleDimension} onChange={(e) => setVehicleDimension(e.target.value)} placeholder="(L)476.0cm (W)188.0cm (H)188.0cm" />
                </Field>
                <Field label="Inspection">
                  <input {...inputProps} value={vehicleInspection} onChange={(e) => setVehicleInspection(e.target.value)} />
                </Field>
              </>
            )}
          </div>
          </div>
        </div>

        {!SALES_SYSTEM_UI && (
        <div className="leon-bezel-outer">
          <div className="leon-bezel-inner">
          <LeonSectionHeader title="Consignee" icon="mail" />
          <Field label="Customer Name *"><input {...inputProps} value={consigneeName} onChange={(e) => setConsigneeName(e.target.value)} placeholder="BYAMUKAMA RAUBEN" /></Field>
          <Field label="Email"><input {...inputProps} type="email" value={consigneeEmail} onChange={(e) => setConsigneeEmail(e.target.value)} placeholder="buyer@email.com" /></Field>
          <Field label="Phone"><input {...inputProps} value={consigneePhone} onChange={(e) => setConsigneePhone(e.target.value)} placeholder="+256 700 000 000" /></Field>
          <Field label="Address"><input {...inputProps} value={consigneeAddress} onChange={(e) => setConsigneeAddress(e.target.value)} placeholder="Plot 27, Nakawa" /></Field>
          <Field label="City"><input {...inputProps} value={consigneeCity} onChange={(e) => setConsigneeCity(e.target.value)} placeholder="Kampala" /></Field>
          <Field label="Country"><input {...inputProps} value={consigneeCountry} onChange={(e) => setConsigneeCountry(e.target.value)} placeholder="Uganda" /></Field>
          <Field label="Notify Party"><input {...inputProps} value={notifyParty} onChange={(e) => setNotifyParty(e.target.value)} /></Field>
          </div>
        </div>
        )}

        {!SALES_SYSTEM_UI && (
          <div className="leon-bezel-outer">
            <div className="leon-bezel-inner">
            <LeonSectionHeader title="Shipping Logistics" icon="car" />
            <Field label="Port From"><input {...inputProps} value={portFrom} onChange={(e) => setPortFrom(e.target.value)} placeholder="KISARAZU/JAPAN" /></Field>
            <Field label="Port To"><input {...inputProps} value={portTo} onChange={(e) => setPortTo(e.target.value)} placeholder="MOMBASA/KENYA" /></Field>
            <Field label="Final Destination"><input {...inputProps} value={finalDest} onChange={(e) => setFinalDest(e.target.value)} placeholder="Nakawa/UGANDA" /></Field>
            <Field label="B/L Issue At"><input {...inputProps} value={blIssueAt} onChange={(e) => setBlIssueAt(e.target.value)} placeholder="TOKYO" /></Field>
            <Field label="Prepaid At"><input {...inputProps} value={prepaidAt} onChange={(e) => setPrepaidAt(e.target.value)} placeholder="TOKYO" /></Field>
            <Field label="Shipping Mark"><input {...inputProps} value={shippingMark} onChange={(e) => setShippingMark(e.target.value)} placeholder="NSB MOTORS UG — MOMBASA" /></Field>
            <Field label="Payment Due Date"><input {...inputProps} type="date" value={paymentDueDate} onChange={(e) => setPaymentDueDate(e.target.value)} /></Field>
            <Field label="Payment Terms">
              <textarea {...inputProps} rows={3} value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} placeholder="50% on or before due date by T/T remittance&#10;50% due within 3 business days after shipping." style={{ resize: 'vertical' }} />
            </Field>
            </div>
          </div>
        )}

        {/* ── 4. Phase 1 — Upfront Costs ── */}
        <div className="leon-bezel-outer" style={SALES_SYSTEM_UI ? { gridColumn: '1 / -1' } : undefined}>
          <div className="leon-bezel-inner">
          <div className="phase-section" style={{ margin: 0, borderLeft: '4px solid var(--admin-accent)', paddingLeft: '1rem' }}>
            <LeonSectionHeader title={SALES_SYSTEM_UI ? 'Phase 1 — Upfront Costs' : 'Phase 1 — USD Import Costs'} icon="receipt" />

            <div className="leon-form-grid mb-3" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
              <ToggleField
                label="C&F Mombasa"
                checked={tickCfMombasa}
                onChange={(v) => handlePhase1Tick('mombasa', v, setTickCfMombasa, setCfMombasa)}
                helpText="Include in calculation & PDF"
              />
              <ToggleField
                label="Clearance Msa→Kla"
                checked={tickClearance}
                onChange={(v) => handlePhase1Tick('clearance', v, setTickClearance, setClearanceFee)}
                helpText="Include in calculation & PDF"
              />
              <ToggleField
                label="C&F Kampala"
                checked={tickCfKampala}
                onChange={(v) => handlePhase1Tick('kampala', v, setTickCfKampala, setCfKampala)}
                helpText="Include in calculation & PDF"
              />
            </div>

            {SALES_SYSTEM_UI && (
              <>
                <ToggleField label="Phase 2" checked={includePhaseTwo} onChange={setIncludePhaseTwo} helpText="Include settlement (plates, insurance, etc.) in calculation and PDF" />
                <ToggleField label="Duty free" checked={dutyFree} onChange={handleDutyFreeChange} helpText="Only registration fee, stamp duty and reg form — excludes import/VAT/levy taxes" />
                <ToggleField label="Include tax to URA" checked={includeTaxToUra} onChange={handleIncludeTaxToUraChange} disabled={dutyFree} helpText="Include URA taxes in invoice (untick to exclude)" />
              </>
            )}

            <Phase1UsdUgxTable
              phase1Rate={phase1Rate}
              tickCfMombasa={tickCfMombasa}
              tickClearance={tickClearance}
              tickCfKampala={tickCfKampala}
              cfMombasa={cfMombasa}
              clearanceFee={clearanceFee}
              cfKampala={cfKampala}
              ttCharges={ttCharges}
              exchangeRatePhase1={exchangeRatePhase1}
              onCfMombasaChange={setCfMombasa}
              onClearanceChange={setClearanceFee}
              onCfKampalaChange={setCfKampala}
              onTtChange={setTtCharges}
              onExchangeRatePhase1Change={setExchangeRatePhase1}
            />

            {!SALES_SYSTEM_UI && (
              <AmountField label="CIF (USD) — Customs Value for tax calculation" value={cifUsd} onChange={setCifUsd} placeholder="0" currency="USD" disabled={!!taxMatch} />
            )}

            <div className="phase-total-row">
              <span className="phase-total-label leon-section-label mb-0">Phase 1 Total (First Installment)</span>
              <span className="phase-total-amount leon-num" data-leon-num="true">
                US$ {fmtUsd(phase1TotalUsd)} · UGX {fmtUgx(phase1Total)}
              </span>
            </div>
            {!SALES_SYSTEM_UI && (
              <div className="mt-2 text-muted small">
                SBI Total Price: <strong className="leon-num" style={{ color: 'var(--admin-accent)' }} data-leon-num="true">${cfPriceUsd.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
              </div>
            )}
          </div>
          </div>
        </div>

        {/* ── 5. Tax Breakdown (sales_system) / Phase 2 combined (legacy) ── */}
        {SALES_SYSTEM_UI ? (
          <div className="leon-bezel-outer" style={{ gridColumn: '1 / -1' }}>
            <div className="leon-bezel-inner">
              <LeonSectionHeader title="Tax Breakdown" icon="calculator" />
              <AmountField label="Exchange Rate for Tax Calculation (UGX/USD)" value={exchangeRateTax} onChange={setExchangeRateTax} placeholder="3835" currency="" />
              <p className="text-muted small mb-3">
                Tax rate: {(n(exchangeRateTax) ?? 3835).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UGX/USD
                {' · '}
                Phase 1 rate: {(n(exchangeRatePhase1) ?? 3835).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} UGX/USD
              </p>

              <div style={{ marginBottom: '1rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                  <button type="button" onClick={lookupTax} disabled={taxLookupStatus === 'loading'} className="btn btn-dark btn-sm rounded-pill flex-fill font-mono text-[10px] uppercase tracking-wider">
                    {taxLookupStatus === 'loading'
                      ? '…Searching…'
                      : <><LeonIcon name="database-zap" size={13} className="me-1" />Re-lookup URA Tax</>}
                  </button>
                  <button type="button" onClick={calculateFromCif} className="btn btn-light border btn-sm rounded-pill flex-fill font-mono text-[10px] uppercase tracking-wider" title="Calculate all taxes from CIF using standard Uganda customs formulas">
                    <LeonIcon name="calculator" size={13} className="me-1" />Calculate Tax
                  </button>
                </div>
                {taxLookupStatus === 'found' && taxMatch && (
                  <div className="tax-result-panel" style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                    <div style={{ color: '#1b5e20', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                      <span className="d-flex align-items-center gap-1">
                        <LeonIcon name="shield" size={14} className="text-success" />
                        Linked to URA <strong>S/N: {taxMatch.serialNumber || '—'}</strong> ({taxMatch.databaseMonth})
                      </span>
                      <button type="button" className="btn btn-outline-danger btn-sm rounded-pill font-mono text-[10px] uppercase" onClick={() => { setTaxMatch(null); setTaxLookupStatus('notfound'); }}>
                        <LeonIcon name="unlock" size={12} className="me-1" />Unlock
                      </button>
                    </div>
                  </div>
                )}
                {taxLookupStatus === 'notfound' && (
                  <div className="text-danger small p-2 rounded-3 border border-danger-subtle bg-danger-subtle mb-3">
                    <LeonIcon name="alert-triangle" size={14} className="me-1" />
                    No active database match — using standard formula calculations (edit manually below)
                  </div>
                )}
              </div>

              {(n(cifUsd) ?? 0) > 0 && (n(exchangeRateTax) ?? 0) > 0 && (
                <div style={{ background: 'var(--brand-accent-tint)', border: '1px solid var(--brand-accent-border)', borderRadius: 6, padding: '0.5rem 0.75rem', marginBottom: '0.85rem', fontSize: '0.78rem' }}>
                  <span className="text-muted">CV (Customs Value) = ${(n(cifUsd) ?? 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} × {(n(exchangeRateTax) ?? 0).toLocaleString('en-US')} = </span>
                  <strong style={{ color: 'var(--admin-accent)' }}>UGX {Math.round((n(cifUsd) ?? 0) * (n(exchangeRateTax) ?? 3835)).toLocaleString('en-US')}</strong>
                </div>
              )}

              {dutyFree ? (
                <>
                  <AmountField label="Registration Fee (UGX)" value={regFee} onChange={setRegFee} placeholder="1500000" />
                  <AmountField label="Stamp Duty (UGX)" value={stampDuty} onChange={setStampDuty} placeholder="18000" />
                  <AmountField label="Registration Form (UGX)" value={regForm} onChange={setRegForm} placeholder="35000" />
                  <div className="phase-total-row" style={{ background: 'rgba(25,135,84,0.06)', borderColor: 'rgba(25,135,84,0.2)' }}>
                    <span className="phase-total-label leon-section-label mb-0">Duty fees</span>
                    <span className="phase-total-amount leon-num text-success" data-leon-num="true">UGX {dutyFreeFeesTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                  </div>
                </>
              ) : includeTaxToUra ? (
                <>
                  <AmountField label="Import Duty — 25% of CV (UGX)" value={importDuty} onChange={setImportDuty} placeholder="0" disabled={!!taxMatch} />
                  <AmountField label="VAT 18% — on (CV + Import Duty) (UGX)" value={vat} onChange={setVat} placeholder="0" disabled={!!taxMatch} />
                  <AmountField label="Withholding Tax — 6% of CV (UGX)" value={wht} onChange={setWht} placeholder="0" disabled={!!taxMatch} />
                  <AmountField label="Infrastructure Levy — 1.5% of CV (UGX)" value={infraLevy} onChange={setInfraLevy} placeholder="0" disabled={!!taxMatch} />
                  <AmountField
                    label={`Environmental Levy${
                      vehicleYear && (new Date().getFullYear() - (n(vehicleYear) ?? 9999)) >= 10
                        ? ' — 50% of CV (≥10 yrs)'
                        : vehicleYear && (new Date().getFullYear() - (n(vehicleYear) ?? 9999)) >= 5
                          ? ' — 35% of CV (5-10 yrs)'
                          : ' (UGX)'
                    }`}
                    value={envLevy}
                    onChange={setEnvLevy}
                    placeholder="0"
                    disabled={!!taxMatch}
                  />
                  <AmountField label="IDF — 1% of CV (UGX)" value={idf} onChange={setIdf} placeholder="0" disabled={!!taxMatch} />
                  <AmountField label="Registration Fee (UGX)" value={regFee} onChange={setRegFee} placeholder="1500000" />
                  <AmountField label="Stamp Duty (UGX)" value={stampDuty} onChange={setStampDuty} placeholder="18000" />
                  <AmountField label="Registration Form (UGX)" value={regForm} onChange={setRegForm} placeholder="35000" />
                  <div className="phase-total-row" style={{ background: 'rgba(25,135,84,0.06)', borderColor: 'rgba(25,135,84,0.2)' }}>
                    <span className="phase-total-label leon-section-label mb-0">Total Taxes &amp; Fees</span>
                    <span className="phase-total-amount leon-num text-success" data-leon-num="true">UGX {uraTaxFieldsTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
                  </div>
                </>
              ) : (
                <p className="text-muted small text-center mb-0">URA taxes are excluded for this invoice. Tax components are not calculated.</p>
              )}
            </div>
          </div>
        ) : (
        <div className="leon-bezel-outer">
          <div className="leon-bezel-inner">
          <div className="phase-section" style={{ margin: 0, borderLeft: '4px solid #198754', paddingLeft: '1rem' }}>
            <h6 className="phase-section__title text-success">Phase 2 — UGX Registration &amp; Taxes</h6>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginBottom: '1rem' }}>
              <ToggleField label="Phase 2" checked={includePhaseTwo} onChange={setIncludePhaseTwo} helpText="Include settlement (plates, insurance, etc.) in calculation and PDF" />
              <ToggleField label="Include tax to URA" checked={includeTaxToUra} onChange={setIncludeTaxToUra} helpText="Include URA taxes in invoice (untick to exclude)" />
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                <button type="button" onClick={lookupTax} disabled={taxLookupStatus === 'loading'} className="btn btn-dark btn-sm rounded-pill flex-fill font-mono text-[10px] uppercase tracking-wider">
                  {taxLookupStatus === 'loading' ? '…Searching…' : <><LeonIcon name="database-zap" size={13} className="me-1" />Re-lookup URA Tax</>}
                </button>
                <button type="button" onClick={calculateFromCif} className="btn btn-light border btn-sm rounded-pill flex-fill font-mono text-[10px] uppercase tracking-wider" title="Calculate all Phase 2 taxes from CIF using standard Uganda customs formulas">
                  <LeonIcon name="calculator" size={13} className="me-1" />Calculate from CIF
                </button>
              </div>
              {taxLookupStatus === 'found' && taxMatch && (
                <div className="tax-result-panel" style={{ background: '#e8f5e9', border: '1px solid #c8e6c9', borderRadius: 8, padding: '0.75rem 1rem', marginBottom: '1rem' }}>
                  <div style={{ color: '#1b5e20', fontSize: '0.82rem', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                    <span className="d-flex align-items-center gap-1">
                      <LeonIcon name="shield" size={14} className="text-success" />
                      Linked to URA <strong>S/N: {taxMatch.serialNumber || '—'}</strong> ({taxMatch.databaseMonth})
                    </span>
                    <button type="button" className="btn btn-outline-danger btn-sm rounded-pill font-mono text-[10px] uppercase" onClick={() => { setTaxMatch(null); setTaxLookupStatus('notfound'); }}>
                      <LeonIcon name="unlock" size={12} className="me-1" />Unlock
                    </button>
                  </div>
                  <div className="text-muted" style={{ fontSize: '0.72rem', marginTop: 4 }}>
                    All tax values below are coordinated and locked to match the official customs database.
                  </div>
                </div>
              )}
              {taxLookupStatus === 'notfound' && (
                <div className="text-danger small p-2 rounded-3 border border-danger-subtle bg-danger-subtle mb-3">
                  <LeonIcon name="alert-triangle" size={14} className="me-1" />
                  No active database match — using standard formula calculations (edit manually below)
                </div>
              )}
            </div>

            {(n(cifUsd) ?? 0) > 0 && (n(exchangeRateTax) ?? n(exchangeRatePhase1) ?? 0) > 0 && (
              <div style={{ background: 'var(--brand-accent-tint)', border: '1px solid var(--brand-accent-border)', borderRadius: 6, padding: '0.5rem 0.75rem', marginBottom: '0.85rem', fontSize: '0.78rem' }}>
                <span className="text-muted">CV (Customs Value) = ${(n(cifUsd) ?? 0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})} × {(n(exchangeRateTax) ?? n(exchangeRatePhase1) ?? 0).toLocaleString('en-US')} = </span>
                <strong style={{ color: 'var(--admin-accent)' }}>UGX {Math.round((n(cifUsd) ?? 0) * (n(exchangeRateTax) ?? n(exchangeRatePhase1) ?? 3835)).toLocaleString('en-US')}</strong>
              </div>
            )}

            <div className="leon-section-label mb-2 d-block">
              URA Taxes {taxMatch && <span className="badge bg-success ms-2 font-mono" style={{ fontSize: '0.62rem', letterSpacing: 'normal', textTransform: 'none' }}><LeonIcon name="lock" size={10} className="me-1" />S/N: {taxMatch.serialNumber}</span>}
            </div>
            <AmountField label="Exchange Rate for Tax Calculation (UGX/USD)" value={exchangeRateTax} onChange={setExchangeRateTax} placeholder="3835" currency="" />
            <AmountField label="Import Duty — 25% of CV (UGX)" value={importDuty} onChange={setImportDuty} placeholder="0" disabled={!!taxMatch} />
            <AmountField label="VAT 18% — on (CV + Import Duty) (UGX)" value={vat} onChange={setVat} placeholder="0" disabled={!!taxMatch} />
            <AmountField label="Withholding Tax — 6% of CV (UGX)" value={wht} onChange={setWht} placeholder="0" disabled={!!taxMatch} />
            <AmountField
              label={`Environmental Levy${
                vehicleYear && (new Date().getFullYear() - (n(vehicleYear) ?? 9999)) >= 10
                  ? ' — 50% of CV (≥10 yrs)'
                  : vehicleYear && (new Date().getFullYear() - (n(vehicleYear) ?? 9999)) >= 5
                    ? ' — 35% of CV (5-10 yrs)'
                    : ' (UGX)'
              }`}
              value={envLevy}
              onChange={setEnvLevy}
              placeholder="0"
              disabled={!!taxMatch}
            />
            <AmountField label="IDF — 1% of CV (UGX)" value={idf} onChange={setIdf} placeholder="0" disabled={!!taxMatch} />

            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.4rem 0.6rem', background: 'var(--brand-accent-tint)', borderRadius: 5, marginBottom: '1rem', fontSize: '0.8rem' }}>
              <span className="text-muted">URA Taxes Subtotal</span>
              <strong style={{ color: 'var(--admin-accent)' }}>UGX {uraTaxFieldsTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
            </div>

            <div className="leon-section-label mb-2 d-block">Registration Fees</div>
            <AmountField label="Registration Fee (UGX)" value={regFee} onChange={setRegFee} placeholder="1500000" />
            <AmountField label="Stamp Duty (UGX)" value={stampDuty} onChange={setStampDuty} placeholder="18000" />
            <AmountField label="Registration Form (UGX)" value={regForm} onChange={setRegForm} placeholder="35000" />

            <div className="leon-section-label mb-2 d-block">Other Fees</div>
            <AmountField label="Number Plates (UGX) — Kampala only" value={plates} onChange={setPlates} placeholder="714300" />
            <AmountField label="3rd Party Insurance (UGX) — Kampala only" value={insurance} onChange={setInsurance} placeholder="0" />
            <AmountField label="Agency Fees (UGX)" value={agencyFees} onChange={setAgencyFees} placeholder="0" />

            <div className="phase-total-row" style={{ background: 'rgba(25,135,84,0.06)', borderColor: 'rgba(25,135,84,0.2)' }}>
              <span className="phase-total-label leon-section-label mb-0">Phase 2 Total</span>
              <span className="phase-total-amount leon-num text-success" data-leon-num="true">UGX {phase2Total.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
          </div>
        </div>
        )}

        {/* ── 6. Phase 2 — Settlement (sales_system) ── */}
        {SALES_SYSTEM_UI && (
          <div className="leon-bezel-outer" style={{ gridColumn: '1 / -1' }}>
            <div className="leon-bezel-inner">
              <LeonSectionHeader title="Phase 2 — Settlement" icon="circle-check" />
              <div className="leon-stat-chip d-flex justify-content-between align-items-center mb-3">
                <span className="leon-section-label mb-0">{dutyFree ? 'Duty fees' : 'Taxes payable to URA'}</span>
                <strong className="leon-num" style={{ color: 'var(--admin-accent)' }} data-leon-num="true">UGX {taxesPayableToUra.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong>
              </div>
              <AmountField label="Number Plates (UGX)" value={plates} onChange={setPlates} placeholder="714300" />
              <AmountField label="3rd Party Insurance (UGX)" value={insurance} onChange={setInsurance} placeholder="0" />
              <AmountField label="Agency Fees (UGX)" value={agencyFees} onChange={setAgencyFees} placeholder="0" />
              <div className="phase-total-row" style={{ background: 'rgba(25,135,84,0.06)', borderColor: 'rgba(25,135,84,0.2)' }}>
                <span className="phase-total-label leon-section-label mb-0">Registration Process Total</span>
                <span className="phase-total-amount leon-num text-success" data-leon-num="true">UGX {registrationProcessTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>
          </div>
        )}

        {/* ── 7. Quick Actions / Summary ── */}
        <div className="leon-bezel-outer" style={{ gridColumn: '1 / -1' }}>
          <div className="leon-bezel-inner">
          <LeonSectionHeader title={SALES_SYSTEM_UI ? 'Quick Actions' : 'Summary & Status'} icon="receipt" />
          <div className="grand-total-box mb-4 d-flex flex-column">
            <span className="grand-total-label leon-section-label mb-1">Grand Total</span>
            <span className="grand-total-amount leon-num" data-leon-num="true">UGX {grandTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            {(n(exchangeRatePhase1) ?? 0) > 0 && (
              <span className="leon-num mt-1" style={{ fontSize: '0.9rem', color: 'var(--admin-accent)', fontWeight: 600 }} data-leon-num="true">
                US$ {(grandTotal / (n(exchangeRatePhase1) ?? 1)).toLocaleString('en-US', { maximumFractionDigits: 2 })}
              </span>
            )}
          </div>

          <Field label={SALES_SYSTEM_UI ? 'Additional Notes (Optional)' : 'Internal Notes'}>
            <textarea {...inputProps} rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ resize: 'vertical' }} />
          </Field>

          {!SALES_SYSTEM_UI && (
          <div className="row g-3 mt-1">
            <div className="col-md-6">
            <Field label="Invoice Status">
              <select {...inputProps} value={status} onChange={(e) => setStatus(e.target.value)}>
                {['draft', 'sent', 'pending', 'paid', 'overdue', 'cancelled'].map((s) => (
                  <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                ))}
              </select>
            </Field>
            </div>
          </div>
          )}
          </div>
        </div>
      </div>

      <div className="leon-action-bar">
        {formLocked ? (
          <>
            <div className="small text-muted font-mono me-2 align-self-center">
              Finalized — editing is on the sales machine only.
            </div>
            <button
              type="button"
              onClick={unlockForEdit}
              disabled={unlocking}
              className="btn btn-dark rounded-pill font-mono text-[11px] uppercase tracking-wider"
            >
              {unlocking ? 'Unlocking…' : <><LeonIcon name="pencil" size={14} className="me-1" />Unlock Edit on Machine</>}
            </button>
            {invoiceId && defaultValues.pdfUrl ? (
              <a
                href={invoicePdfViewPath(Number(invoiceId))}
                target="_blank"
                rel="noreferrer"
                className="btn btn-outline-dark rounded-pill font-mono text-[11px] uppercase tracking-wider"
              >
                <LeonIcon name="file-text" size={14} className="me-1" />View PDF
              </a>
            ) : (
              <button
                type="button"
                onClick={() => save('sent', true)}
                disabled={saving || genPdf}
                className="btn btn-outline-dark rounded-pill font-mono text-[11px] uppercase tracking-wider"
              >
                {genPdf ? 'Queuing…' : <><LeonIcon name="file-text" size={14} className="me-1" />Generate on Machine</>}
              </button>
            )}
          </>
        ) : (
          <>
        <button type="button" onClick={() => save('draft')} disabled={saving || genPdf} className="btn btn-light border rounded-pill font-mono text-[11px] uppercase tracking-wider">
          {saving && !genPdf ? '…Saving…' : <><LeonIcon name="save" size={14} className="me-1" />Save as Draft</>}
        </button>
        <button type="button" onClick={() => save(status, true)} disabled={saving || genPdf} className="btn btn-dark rounded-pill font-mono text-[11px] uppercase tracking-wider">
          {genPdf ? (
            <><span className="spinner-border spinner-border-sm me-1" />Queuing PDF…</>
          ) : (
            <><LeonIcon name="file-text" size={14} className="me-1" />Save &amp; Generate PDF</>
          )}
        </button>
        <button
          type="button"
          onClick={async () => {
            if (!isRealEmail(consigneeEmail)) {
              alert('Please enter a customer email address to email this invoice.');
              return;
            }
            await save('sent', true);
          }}
          disabled={saving || genPdf}
          className="btn btn-outline-dark rounded-pill font-mono text-[11px] uppercase tracking-wider"
        >
          {saving && genPdf ? (
            <><span className="spinner-border spinner-border-sm me-1" />Sending Email…</>
          ) : (
            <><LeonIcon name="mail" size={14} className="me-1" />Save &amp; Email</>
          )}
        </button>
          </>
        )}
        <button type="button" onClick={() => router.back()} disabled={saving || genPdf || unlocking} className="btn btn-outline-danger rounded-pill font-mono text-[11px] uppercase tracking-wider">
          Cancel
        </button>
      </div>
    </div>
  );
}
