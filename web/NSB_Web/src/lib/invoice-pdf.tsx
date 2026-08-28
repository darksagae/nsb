import {
  Document,
  Page,
  View,
  Text,
  Image,
  StyleSheet,
  Font,
} from '@react-pdf/renderer';
import { resolveInvoiceLogoSrc } from '@/lib/nsb-logo';
import { getPdfIconDataUris, type PdfIconKey } from '@/lib/invoice-pdf-icons';
import {
  amountInWordsUgx,
  computeInvoicePdfTotals,
  fmtDateMdY,
  fmtMoney,
  isPlaceholderEmail,
  modelForPdf,
  sanitizeEmail,
  type InvoicePdfInput,
} from '@/lib/invoice-pdf-calculations';

Font.register({
  family: 'Roboto',
  fonts: [
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf',
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf',
      fontWeight: 'bold',
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-italic-webfont.ttf',
      fontStyle: 'italic',
    },
    {
      src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bolditalic-webfont.ttf',
      fontWeight: 'bold',
      fontStyle: 'italic',
    },
  ],
});

const C = {
  black: '#000000',
  white: '#ffffff',
  headerGray: '#E0E0E0',
  footerGray: '#F5F5F5',
  gold: '#D4AF37',
  red: '#B71C1C',
  muted: '#757575',
  greyDivider: '#9E9E9E',
  border: '#000000',
};

const BW = 0.9; // renders a 2px rule at 150dpi, matching the machine's
/** sales_system goods table flex ratios (0.8 + 1.8 + 5.2 + 0.8 + 2.0 = 10.6) */
const COL = {
  sno: '7.55%',
  chassis: '16.98%',
  desc: '49.06%',
  qty: '7.55%',
  amt: '18.86%',
  grandLabel: '73.58%',
};

const s = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 9,
    // react-pdf defaults to ~1.5, which sets every line looser than the sales
    // machine's output and pushed the invoice onto a second page. The machine
    // renders roughly a 1.27 pitch.
    lineHeight: 1.27,
    color: C.black,
    backgroundColor: C.white,
    padding: 8,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 5,
    paddingVertical: 2,
  },
  logoBox: { width: 160 },
  logo: { width: 140, height: 70, objectFit: 'contain' },
  logoPlaceholder: {
    width: 140,
    height: 70,
    backgroundColor: '#16a34a',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  goldLine: { width: 2, height: 70, backgroundColor: C.gold },
  addressCol: { flex: 1, alignItems: 'center', paddingHorizontal: 4 },
  locationIcon: { width: 24, height: 24, marginBottom: 1, objectFit: 'contain' },
  contactCol: { width: 200, paddingHorizontal: 20 },
  contactRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  contactIcon: { width: 14, height: 14, marginRight: 6, objectFit: 'contain' },
  contactLine: { fontSize: 8, flex: 1 },
  contactItalic: { fontSize: 8, fontStyle: 'italic', flex: 1 },
  socialRow: { flexDirection: 'row', alignItems: 'center' },
  socialIcon: { width: 14, height: 14, marginRight: 4, objectFit: 'contain' },
  socialLabel: { fontSize: 7, color: C.muted, marginLeft: 2 },
  hr: { height: 1, backgroundColor: '#bdbdbd', marginVertical: 2 },
  titleCenter: {
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    marginTop: 8,
  },
  mainBox: { border: `${BW} solid ${C.border}` },
  // Inside mainBox already, so only the bottom edge is this element's to draw;
  // a full border doubled the box's own rules to ~5px where the machine has 2.
  sectionHeader: {
    backgroundColor: C.headerGray,
    borderBottom: `${BW} solid ${C.border}`,
    paddingVertical: 5,
    paddingHorizontal: 6,
    fontSize: 10,
    fontWeight: 'bold',
  },
  customerRow: { flexDirection: 'row' },
  customerLeft: { flex: 7 },
  customerRight: { flex: 4, borderLeft: `${BW} solid ${C.border}` },
  pad8: { padding: 8 },
  labelBold: { fontSize: 10, fontWeight: 'bold' },
  valueText: { fontSize: 10 },
  valueTextSm: { fontSize: 9 },
  invoiceRed: { fontSize: 10.5, fontWeight: 'bold', color: C.red },
  tableTop: { borderTop: `${BW} solid ${C.border}`, marginTop: 2 },
  tableRow: { flexDirection: 'row', borderBottom: `${BW} solid ${C.border}` },
  tableRowNoBottom: { flexDirection: 'row' },
  th: {
    backgroundColor: C.headerGray,
    paddingVertical: 3,
    paddingHorizontal: 6,
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
    borderRight: `${BW} solid ${C.border}`,
  },
  thLast: {
    backgroundColor: C.headerGray,
    paddingVertical: 3,
    paddingHorizontal: 6,
    fontSize: 9,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  // Goods description runs 9 lines; the machine sets them on a ~1.17 pitch.
  td: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    fontSize: 9,
    lineHeight: 1.17,
  },
  tdLast: { paddingVertical: 4, paddingHorizontal: 6, fontSize: 9, lineHeight: 1.17 },
  bodyCellRule: { borderRight: `${BW} solid ${C.border}` },
  // The machine runs its grey header bars to the very edge of the box, with
  // no side border; pull them out over mainBox's own rule to match.
  headerBleed: { marginHorizontal: -1.4 },
  phaseHeaderBleedLeft: { marginLeft: -1.4 },
  phaseHeaderBleedRight: { marginRight: -1.4 },
  colSno: { width: COL.sno },
  colChassis: { width: COL.chassis },
  colDesc: { width: COL.desc },
  colQty: { width: COL.qty },
  colAmt: { width: COL.amt },
  grandLabelCell: { width: COL.grandLabel },
  phaseTable: {
    borderTop: `${BW} solid ${C.border}`,
    borderBottom: `${BW} solid ${C.border}`,
  },
  // The machine rules the block top, above the total, and the bottom only —
  // never between the individual breakdown rows.
  phaseTableRow: {
    flexDirection: 'row',
  },
  phaseTableRowLast: { flexDirection: 'row' },
  // Row metrics tuned to the machine's line pitch (~10pt per breakdown row).
  phaseColLabel: {
    flex: 2,
    fontSize: 8.5,
    lineHeight: 1.1,
    paddingVertical: 0.75,
    paddingHorizontal: 2,
    borderRight: `${BW} solid ${C.border}`,
  },
  phaseColUsd: {
    flex: 1,
    fontSize: 8.5,
    lineHeight: 1.1,
    textAlign: 'center',
    paddingVertical: 0.75,
    paddingHorizontal: 2,
    borderRight: `${BW} solid ${C.border}`,
  },
  phaseColUgx: {
    flex: 1,
    fontSize: 8.5,
    lineHeight: 1.1,
    textAlign: 'right',
    paddingVertical: 0.75,
    paddingHorizontal: 2,
  },
  // Gap above the total rule, and the rule itself — both carried by real
  // cells so the column borders stay continuous.
  phaseGapBelow: { paddingBottom: 5 },
  phaseRuleAbove: { borderTop: `${BW} solid ${C.border}`, paddingTop: 2 },
  // The machine leaves noticeably more air around the Phase 2 dividers.
  greyDivider: {
    borderTop: `${BW} solid ${C.greyDivider}`,
    marginVertical: 6,
  },
  grandRow: { flexDirection: 'row', borderTop: `${BW} solid ${C.border}` },
  grandLabel: {
    flex: 1,
    textAlign: 'right',
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontSize: 10,
    fontWeight: 'bold',
  },
  phaseSplit: { flexDirection: 'row', borderTop: `${BW} solid ${C.border}` },
  phaseCol: { flex: 1, borderRight: `${BW} solid ${C.border}` },
  phaseColLast: { flex: 1 },
  // Match the sales machine: the breakdown sits at the top of the column and
  // the column's height is driven by its content, not a fixed minimum.
  // Height matched to the machine's phase columns (~140pt of content).
  phaseInner: { padding: 6, justifyContent: 'flex-start', minHeight: 145 },
  phaseLine: { flexDirection: 'row', marginBottom: 2 },
  phaseLineLabel: { flex: 2, fontSize: 8.5 },
  phaseLineUsd: { flex: 1, fontSize: 8.5, textAlign: 'center' },
  phaseLineUgx: { flex: 1, fontSize: 8.5, textAlign: 'right' },
  phaseBold: { fontWeight: 'bold' },
  phaseDivider: { borderTop: `${BW} solid ${C.black}`, marginVertical: 2 },
  phaseDividerThin: { borderTop: `${BW} solid ${C.black}`, marginTop: 4, marginBottom: 2 },
  summaryLine: { flexDirection: 'row', marginBottom: 1 },
  summaryLabel: { flex: 6, fontSize: 8.5, lineHeight: 1.1 },
  summaryValue: { flex: 4, fontSize: 8.5, lineHeight: 1.1, textAlign: 'right' },
  summaryBold: { fontWeight: 'bold' },
  amountWords: {
    fontSize: 11,
    lineHeight: 1.15,
    fontWeight: 'bold',
    color: C.red,
    marginTop: 4,
  },
  footerBox: {
    marginTop: 8,
    padding: 13.5,
    backgroundColor: C.footerGray,
    border: `${BW} solid ${C.border}`,
    position: 'relative',
  },
  footerWatermark: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    opacity: 0.12,
  },
  footerWatermarkImg: { width: 300, height: 150, objectFit: 'contain' },
  footerContent: { position: 'relative' },
  noticeBadge: { width: 110, marginBottom: 6 },
  noticeBar: { backgroundColor: C.black, paddingVertical: 2 },
  noticeText: { color: C.white, fontSize: 10, fontWeight: 'bold', textAlign: 'center' },
  // The machine underlines only the width of the heading, and sets the bank
  // lines on a ~14.7pt pitch rather than the looser default.
  bankTitle: {
    fontSize: 16,
    lineHeight: 1.2,
    fontWeight: 'bold',
    alignSelf: 'flex-start',
    paddingRight: 30,
    borderBottom: `${BW} solid ${C.border}`,
    paddingBottom: 5,
    marginBottom: 4,
  },
  bankLine: { fontSize: 12, lineHeight: 1.1, marginBottom: 1 },
  bankAccount: {
    fontSize: 13,
    lineHeight: 1.1,
    fontWeight: 'bold',
    color: C.red,
    marginLeft: 15,
    marginBottom: 1,
  },
  footerTag: {
    marginTop: 5,
    backgroundColor: C.black,
    paddingVertical: 8,
    paddingHorizontal: 8,
    textAlign: 'center',
  },
  // The machine sets this banner in regular weight, not bold italic.
  footerTagText: {
    color: C.white,
    fontSize: 17,
    lineHeight: 1.2,
  },
});

type Settings = Record<string, string>;
type InvoiceData = InvoicePdfInput;

function HeaderCell({ children, last }: { children: string; last?: boolean }) {
  return <Text style={last ? s.thLast : s.th}>{children}</Text>;
}

function BodyCell({
  children,
  last,
  center,
  bold,
}: {
  children: string;
  last?: boolean;
  center?: boolean;
  bold?: boolean;
}) {
  return (
    <Text
      style={[
        last ? s.tdLast : s.td,
        center ? { textAlign: 'center' } : {},
        bold ? { fontWeight: 'bold' } : {},
      ]}
    >
      {children}
    </Text>
  );
}

function SummaryRow({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <View style={s.summaryLine}>
      <Text style={[s.summaryLabel, bold ? s.summaryBold : {}]}>{label}</Text>
      <Text style={[s.summaryValue, bold ? s.summaryBold : {}]}>{value}</Text>
    </View>
  );
}

function GreyDivider() {
  return <View style={s.greyDivider} />;
}

function Phase1BreakdownTable({ t }: { t: ReturnType<typeof computeInvoicePdfTotals> }) {
  return (
    <View style={s.phaseTable}>
      <View style={s.phaseTableRow}>
        <Text style={s.phaseColLabel}> </Text>
        <Text style={[s.phaseColUsd, s.phaseBold]}>(USD)</Text>
        <Text style={[s.phaseColUgx, s.phaseBold]}>(UGX)</Text>
      </View>
      {t.cfMombasaUsd > 0 && (
        <View style={s.phaseTableRow}>
          <Text style={s.phaseColLabel}>C&F Mombasa</Text>
          <Text style={s.phaseColUsd}>{fmtMoney(t.cfMombasaUsd)}</Text>
          <Text style={s.phaseColUgx}>{fmtMoney(t.cfMombasaUgx)}</Text>
        </View>
      )}
      {t.clearanceUsd > 0 && (
        <View style={s.phaseTableRow}>
          <Text style={s.phaseColLabel}>Clearance</Text>
          <Text style={s.phaseColUsd}>{fmtMoney(t.clearanceUsd)}</Text>
          <Text style={s.phaseColUgx}>{fmtMoney(t.clearanceUgx)}</Text>
        </View>
      )}
      {t.cfKampalaUsd > 0 && (
        <View style={s.phaseTableRow}>
          <Text style={s.phaseColLabel}>C&F Kampala</Text>
          <Text style={s.phaseColUsd}>{fmtMoney(t.cfKampalaUsd)}</Text>
          <Text style={s.phaseColUgx}>{fmtMoney(t.cfKampalaUgx)}</Text>
        </View>
      )}
      <View style={s.phaseTableRow}>
        <Text style={s.phaseColLabel}>TT</Text>
        <Text style={s.phaseColUsd}>{fmtMoney(t.ttUsd)}</Text>
        <Text style={s.phaseColUgx}>{fmtMoney(t.ttUgx)}</Text>
      </View>
      {/* The gap above the total rule is padding on the row before it, and the
          rule itself is the total row's own borderTop. Spacer Views were used
          here before, but their column borders did not render, breaking the
          vertical rules the machine draws unbroken through this block. */}
      <View style={s.phaseTableRow}>
        <Text style={[s.phaseColLabel, s.phaseGapBelow, { paddingTop: 2 }]}>
          Dollar Rate ({fmtMoney(t.phase1Rate)})
        </Text>
        <Text style={[s.phaseColUsd, s.phaseGapBelow]}> </Text>
        <Text style={[s.phaseColUgx, s.phaseGapBelow]}> </Text>
      </View>
      <View style={s.phaseTableRowLast}>
        <Text style={[s.phaseColLabel, s.phaseBold, s.phaseRuleAbove]}>Phase 1 Total</Text>
        <Text style={[s.phaseColUsd, s.phaseBold, s.phaseRuleAbove]}>
          {fmtMoney(t.phase1TotalUsd)}
        </Text>
        <Text style={[s.phaseColUgx, s.phaseBold, s.phaseRuleAbove]}>
          {fmtMoney(t.phase1)}
        </Text>
      </View>
    </View>
  );
}

function ContactIcon({ name, icons }: { name: PdfIconKey; icons: Partial<Record<PdfIconKey, string>> }) {
  const src = icons[name];
  if (!src) return <View style={s.contactIcon} />;
  return <Image src={src} style={s.contactIcon} />;
}

function DocumentHeader({
  logoSrc,
  icons,
}: {
  logoSrc: string | null;
  icons: Partial<Record<PdfIconKey, string>>;
}) {
  return (
    <View>
        <View style={s.headerRow}>
        <View style={s.logoBox}>
          {logoSrc ? (
            <Image src={logoSrc} style={s.logo} />
          ) : (
            <View style={s.logoPlaceholder}>
              <Text style={{ color: C.white, fontSize: 20, fontWeight: 'bold' }}>NSB</Text>
            </View>
          )}
          </View>
        <View style={s.goldLine} />
        <View style={s.addressCol}>
          {icons.location ? <Image src={icons.location} style={s.locationIcon} /> : null}
          <Text style={{ fontSize: 10, textAlign: 'center' }}>P.O. Box 110833, Kampala - Uganda</Text>
          <Text style={{ fontSize: 10, textAlign: 'center' }}>Kamu Kamu Plaza, Suite No. SF-31</Text>
        </View>
        <View style={s.goldLine} />
        <View style={s.contactCol}>
          <View style={s.contactRow}>
            <ContactIcon name="whatsapp" icons={icons} />
            <Text style={s.contactLine}>+256 394 836253 / +256 752 128406</Text>
          </View>
          <View style={s.contactRow}>
            <ContactIcon name="gmail" icons={icons} />
            <Text style={s.contactItalic}>nsbbsolutions@gmail.com</Text>
          </View>
          <View style={s.contactRow}>
            <ContactIcon name="facebook" icons={icons} />
            <ContactIcon name="x" icons={icons} />
            <ContactIcon name="tiktok" icons={icons} />
            <ContactIcon name="instagram" icons={icons} />
            <Text style={s.socialLabel}>nsb motors ug</Text>
          </View>
        </View>
          </View>
      <View style={s.hr} />
          </View>
  );
}

function BankFooter({ watermarkSrc }: { watermarkSrc: string | null }) {
  return (
    <View style={s.footerBox}>
      {watermarkSrc ? (
        <View style={s.footerWatermark}>
          <Image src={watermarkSrc} style={s.footerWatermarkImg} />
        </View>
      ) : null}
      <View style={s.footerContent}>
        <View style={s.noticeBadge}>
          <View style={s.noticeBar}>
            <Text style={s.noticeText}>IMPORTANT</Text>
          </View>
          <View style={s.noticeBar}>
            <Text style={s.noticeText}>NOTICE</Text>
          </View>
        </View>
        <Text style={s.bankTitle}>Bank Information</Text>
        <Text style={s.bankLine}>Payee: NSB BUSINESS SOLUTIONS (U) LTD</Text>
        <Text style={s.bankLine}>Bank Name: EQUITY BANK</Text>
        <Text style={s.bankLine}>Bank Address: EQUITY BANK, CHURCH HOUSE, GF, KAMPALA RD</Text>
        <Text style={s.bankLine}>Bank Code: 30</Text>
        <Text style={s.bankLine}>Branch Code: 1001</Text>
        <Text style={s.bankLine}>SWIFT CODE: EQBLUGKA</Text>
        <Text style={s.bankLine}>Account No:</Text>
        <Text style={s.bankAccount}>UGX: 1001202951908</Text>
        <Text style={s.bankAccount}>USD: 1001203004471</Text>
        <View style={s.footerTag}>
          <Text style={s.footerTagText}>.... Business & Logistics Partner</Text>
        </View>
      </View>
    </View>
  );
}

export function buildInvoicePDF(invoice: InvoiceData, settings: Settings) {
  const logoSrc = resolveInvoiceLogoSrc(settings.company_logo_url);
  const icons = getPdfIconDataUris();
  const salesPerson = (settings.sales_person_name || 'NSB SALES TEAM').toUpperCase();
  const t = computeInvoicePdfTotals(invoice);

  const customerName = (invoice.consigneeName?.trim() || 'N/A').toUpperCase();
  const customerAddress = (invoice.consigneeAddress?.trim() || 'N/A').toUpperCase();
  const phoneRaw = invoice.consigneePhone?.trim() || 'N/A';
  const customerPhone = phoneRaw === 'N/A' ? 'N/A' : phoneRaw.toUpperCase();
  const customerEmail = !isPlaceholderEmail(invoice.consigneeEmail)
    ? sanitizeEmail(invoice.consigneeEmail)
    : 'N/A';

  const engineCc = invoice.vehicleEngineCC ? `${invoice.vehicleEngineCC}` : 'N/A';
  const origin = invoice.consigneeCountry?.trim() || 'N/A';

  const goodsDescription =
    `MAKE: ${invoice.vehicleMake?.trim() || 'N/A'}\n` +
    `MODEL: ${modelForPdf(invoice.vehicleModel)}\n` +
    `YEAR: ${invoice.vehicleYear ?? 'N/A'}\n` +
    `Engine: ${engineCc}cc\n` +
    `TRANS: ${invoice.vehicleTransmission?.trim() || 'N/A'}\n` +
    `FUEL: ${invoice.vehicleFuelType?.trim() || 'N/A'}\n` +
    `COLOR: ${invoice.vehicleColor?.trim() || 'N/A'}\n` +
    `ORIGIN: ${origin}\n` +
    (t.taxesUra > 0 ? `TAX SHEET: ${t.taxSheet}` : '');

  const dateText = fmtDateMdY(invoice.createdAt);
  const dueText = fmtDateMdY(invoice.paymentDueDate);

  return (
    <Document title={`${invoice.invoiceNumber} — NSB Motors Ug`} author="NSB Motors Ug">
      <Page size="A4" style={s.page}>
        <DocumentHeader logoSrc={logoSrc} icons={icons} />

        <Text style={s.titleCenter}>PROFORMA INVOICE</Text>

        <View style={s.mainBox}>
          <View style={s.customerRow}>
            <View style={s.customerLeft}>
              <Text style={s.sectionHeader}>CUSTOMER INFO:</Text>
              <View style={s.pad8}>
                <Text>
                  <Text style={s.labelBold}>NAME: </Text>
                  <Text style={s.valueText}>{customerName}</Text>
                </Text>
                <Text style={{ marginTop: 3 }}>
                  <Text style={[s.labelBold, { fontSize: 9 }]}>ADDRESS: </Text>
                  <Text style={s.valueTextSm}>{customerAddress}</Text>
                </Text>
                <Text style={{ marginTop: 3 }}>
                  <Text style={[s.labelBold, { fontSize: 9 }]}>PHONE: </Text>
                  <Text style={s.valueTextSm}>{customerPhone}</Text>
          </Text>
                <Text style={{ marginTop: 2 }}>
                  <Text style={[s.labelBold, { fontSize: 9 }]}>EMAIL: </Text>
                  <Text style={s.valueTextSm}>{customerEmail}</Text>
          </Text>
        </View>
          </View>
            <View style={s.customerRight}>
              <Text style={s.sectionHeader}>INVOICE DETAILS:</Text>
              <View style={[s.pad8, { paddingVertical: 8 }]}>
            <Text>
                  <Text style={s.labelBold}>DATE              : </Text>
                  <Text style={{ fontSize: 10.5 }}>{dateText}</Text>
                </Text>
                <Text style={{ marginTop: 6 }}>
                  <Text style={s.labelBold}>DUE DATE         : </Text>
                  <Text style={{ fontSize: 10.5 }}>{dueText}</Text>
            </Text>
                <Text style={{ marginTop: 6 }}>
                  <Text style={s.labelBold}>INVOICE NUMBER : </Text>
                  <Text style={s.invoiceRed}>{invoice.invoiceNumber || 'N/A'}</Text>
            </Text>
                <Text style={{ marginTop: 6 }}>
                  <Text style={s.labelBold}>SALES PERSON   : </Text>
                  <Text style={{ fontSize: 10.5 }}>{salesPerson}</Text>
            </Text>
              </View>
            </View>
          </View>

          <View style={s.tableTop}>
            <View style={[s.tableRow, s.headerBleed]}>
              <View style={s.colSno}><HeaderCell>SNO</HeaderCell></View>
              <View style={s.colChassis}><HeaderCell>CHASSIS NO</HeaderCell></View>
              <View style={s.colDesc}><HeaderCell>DESCRIPTION OF GOODS</HeaderCell></View>
              <View style={s.colQty}><HeaderCell>QTY</HeaderCell></View>
              <View style={s.colAmt}><HeaderCell last>AMOUNT</HeaderCell></View>
            </View>
            {/* Column rules live on the cell wrappers, not the Text: the row is
                as tall as the 9-line description, and a border on the Text would
                only run the height of its own single line. */}
            <View style={s.tableRowNoBottom}>
              <View style={[s.colSno, s.bodyCellRule]}><BodyCell center>1</BodyCell></View>
              <View style={[s.colChassis, s.bodyCellRule]}>
                <BodyCell center>{invoice.chassisNo?.trim() || 'N/A'}</BodyCell>
              </View>
              <View style={[s.colDesc, s.bodyCellRule]}>
                <BodyCell>{goodsDescription}</BodyCell>
              </View>
              <View style={[s.colQty, s.bodyCellRule]}><BodyCell center>1</BodyCell></View>
              <View style={s.colAmt}>
                <BodyCell center last>{fmtMoney(t.grandTotal)}</BodyCell>
              </View>
            </View>

            <View style={s.grandRow}>
              <View style={s.grandLabelCell}>
                <Text style={s.grandLabel}>Grand Total</Text>
              </View>
              <View style={[s.colQty, { borderRight: `${BW} solid ${C.border}` }]}>
                <Text style={{ textAlign: 'center', paddingVertical: 4, fontWeight: 'bold', fontSize: 10 }}>1</Text>
              </View>
              <View style={s.colAmt}>
                <Text style={{ textAlign: 'center', paddingVertical: 4, fontWeight: 'bold', fontSize: 10 }}>
                  {fmtMoney(t.grandTotal)}
                </Text>
          </View>
        </View>

            <View style={s.phaseSplit}>
              <View style={s.phaseCol}>
                <View style={[{ borderBottom: `${BW} solid ${C.border}` }, s.phaseHeaderBleedLeft]}>
                  <Text style={s.th}>PHASE 1 BREAKDOWN</Text>
                </View>
                <View style={s.phaseInner}>
                  <Phase1BreakdownTable t={t} />
                </View>
        </View>

              <View style={s.phaseColLast}>
                <View style={[{ borderBottom: `${BW} solid ${C.border}` }, s.phaseHeaderBleedRight]}>
                  <Text style={s.thLast}>
                    {t.taxesUra > 0 ? 'PHASE 2 / REGISTRATION BREAKDOWN' : 'PHASE 2'}
            </Text>
                </View>
                <View style={s.phaseInner}>
                  {t.taxesUra > 0 && (
                    <SummaryRow label="Taxes to URA" value={fmtMoney(t.taxesUra)} />
                  )}
                  {t.includePhase2 && (
                    <>
                      <SummaryRow label="Number Plates" value={fmtMoney(t.numberPlates)} />
                      <SummaryRow label="3rd Party Insurance" value={fmtMoney(t.insurance)} />
                      <SummaryRow label="Agency Fees" value={fmtMoney(t.agentFees)} />
          </>
        )}
                  {(t.taxesUra > 0 || t.includePhase2) && <GreyDivider />}
                  <SummaryRow label="Registration Process" value={fmtMoney(t.registrationProcess)} bold />
                  <SummaryRow label="Phase 1 Total" value={fmtMoney(t.phase1)} bold />
                  <GreyDivider />
                  <SummaryRow label="Grand Total (UGX)" value={fmtMoney(t.grandTotal)} bold />
                  <Text style={s.amountWords}>{amountInWordsUgx(t.grandTotal)}</Text>
                  </View>
              </View>
            </View>
          </View>
        </View>

        <BankFooter watermarkSrc={logoSrc} />
      </Page>
    </Document>
  );
}
