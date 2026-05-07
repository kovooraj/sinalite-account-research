import type { ResearchResult } from './types';

// RGB colour helpers
const GREEN_ROW: [number, number, number] = [220, 255, 220];
const GREEN_CELL: [number, number, number] = [0, 140, 0];
const RED_ROW: [number, number, number] = [255, 220, 220];
const RED_CELL: [number, number, number] = [180, 0, 0];
const YELLOW_ROW: [number, number, number] = [255, 250, 210];
const YELLOW_CELL: [number, number, number] = [140, 100, 0];
const GREY_CELL: [number, number, number] = [120, 120, 120];

function verdictLabel(result: ResearchResult): string {
  if (result.error) return 'Error';
  if (result.verdict === 'reseller') return 'Reseller';
  if (result.verdict === 'not_reseller') return 'Not Reseller';
  return 'Uncertain';
}

export async function generatePdf(results: ResearchResult[]): Promise<void> {
  // Dynamically imported so they never touch the SSR bundle
  const { default: jsPDF } = await import('jspdf');
  const { default: autoTable } = await import('jspdf-autotable');

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  const resellers = results.filter(r => !r.error && r.verdict === 'reseller').length;
  const notResellers = results.filter(r => !r.error && r.verdict === 'not_reseller').length;
  const uncertain = results.filter(r => !r.error && r.verdict === 'uncertain').length;
  const errors = results.filter(r => r.error).length;

  // ── Header bar ──────────────────────────────────────────────────
  doc.setFillColor(2, 70, 120);
  doc.rect(0, 0, pageW, 18, 'F');

  doc.setFontSize(14);
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.text('SinaLite Account Research Report', 10, 11);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  const dateStr = new Date().toLocaleDateString('en-CA', {
    year: 'numeric', month: 'long', day: 'numeric',
  });
  doc.text(`Generated: ${dateStr}`, pageW - 10, 11, { align: 'right' });

  // ── Summary line ────────────────────────────────────────────────
  doc.setFontSize(9);
  doc.setTextColor(40, 40, 40);
  doc.setFont('helvetica', 'normal');
  const summaryParts = [
    `Total: ${results.length}`,
    `Resellers: ${resellers}`,
    `Not Resellers: ${notResellers}`,
    `Uncertain: ${uncertain}`,
    ...(errors > 0 ? [`Errors: ${errors}`] : []),
  ];
  doc.text(summaryParts.join('   |   '), 10, 25);

  // Legend chips
  const chips: Array<{ label: string; fill: [number,number,number]; text: [number,number,number] }> = [
    { label: '  Reseller', fill: GREEN_ROW, text: GREEN_CELL },
    { label: '  Not Reseller', fill: RED_ROW, text: RED_CELL },
    { label: '  Uncertain', fill: YELLOW_ROW, text: YELLOW_CELL },
  ];
  let chipX = pageW - 10;
  chips.reverse().forEach(chip => {
    const w = doc.getTextWidth(chip.label) + 4;
    chipX -= w + 2;
    doc.setFillColor(...chip.fill);
    doc.roundedRect(chipX, 20, w, 6, 1.5, 1.5, 'F');
    doc.setTextColor(...chip.text);
    doc.setFontSize(7);
    doc.text(chip.label, chipX + 2, 24.5);
  });

  // ── Main table ──────────────────────────────────────────────────
  autoTable(doc, {
    startY: 30,
    head: [[
      'Company / Name',
      'Email',
      'Self-Declared Type',
      'Verdict',
      'Confidence',
      'Business Description',
      'Key Signals',
      'Reasoning',
    ]],
    body: results.map(r => [
      r.account.company || r.account.name || '—',
      r.account.email || '—',
      r.account.businessType || '—',
      verdictLabel(r),
      r.error ? '—' : r.confidence,
      r.error ? `Error: ${r.error}` : (r.businessDescription || '—'),
      r.error ? '—' : (r.keySignals || []).join('\n'),
      r.error ? '—' : (r.reasoning || '—'),
    ]),
    styles: {
      fontSize: 7,
      cellPadding: 2.5,
      valign: 'top',
      overflow: 'linebreak',
    },
    headStyles: {
      fillColor: [26, 26, 26],
      textColor: 255,
      fontStyle: 'bold',
      fontSize: 7.5,
    },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 38 },
      2: { cellWidth: 24 },
      3: { cellWidth: 22 },
      4: { cellWidth: 18 },
      5: { cellWidth: 42 },
      6: { cellWidth: 36 },
      7: { cellWidth: 'auto' },
    },
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      const result = results[data.row.index];
      if (!result) return;

      // Row background
      const rowFill: [number, number, number] =
        result.error ? [245, 245, 245] :
        result.verdict === 'reseller' ? GREEN_ROW :
        result.verdict === 'not_reseller' ? RED_ROW :
        YELLOW_ROW;
      data.cell.styles.fillColor = rowFill;

      // Verdict column gets coloured text + bold
      if (data.column.index === 3) {
        data.cell.styles.textColor =
          result.error ? GREY_CELL :
          result.verdict === 'reseller' ? GREEN_CELL :
          result.verdict === 'not_reseller' ? RED_CELL :
          YELLOW_CELL;
        data.cell.styles.fontStyle = 'bold';
      }
    },
  });

  // ── Footer ──────────────────────────────────────────────────────
  const pageCount = (doc.internal as unknown as { getNumberOfPages: () => number }).getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setTextColor(160, 160, 160);
    doc.text(
      'SinaLite Internal Tool · Powered by Claude AI · Results should be reviewed by a team member',
      pageW / 2,
      doc.internal.pageSize.getHeight() - 5,
      { align: 'center' }
    );
    doc.text(`Page ${p} of ${pageCount}`, pageW - 10, doc.internal.pageSize.getHeight() - 5, { align: 'right' });
  }

  const filename = `SinaLite-Account-Research-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
