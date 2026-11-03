import assert from 'node:assert/strict';
import { test } from 'node:test';

import JSZip from 'jszip';

import { assertMagicBytes } from './file-validation.js';
import { loadAndSplit } from './load-document.js';

const pdfBytes = (text: string): Buffer => {
  const stream = `BT /F1 12 Tf 50 700 Td (${text}) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${String(stream.length)} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${String(index + 1)} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${String(xref)}\n%%EOF`;
  return Buffer.from(pdf);
};

void test('PDF loader preserves page metadata and rejects pages without usable text', async () => {
  const bytes = pdfBytes(
    'Annual revenue increased from one hundred to one hundred twenty dollars in the report.',
  );
  await assertMagicBytes(bytes, 'pdf');
  const result = await loadAndSplit(bytes, 'pdf');
  assert.equal(result.pageCount, 1);
  assert.match(result.chunks[0]?.pageContent ?? '', /Annual revenue/u);
  assert.deepEqual(result.chunks[0]?.metadata.loc, { pageNumber: 1 });
  await assert.rejects(loadAndSplit(pdfBytes(''), 'pdf'), /No usable text/u);
});

void test('DOCX loader extracts text from a verified OOXML document', async () => {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  );
  zip.file(
    '_rels/.rels',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  );
  zip.file(
    'word/document.xml',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Annual revenue increased by twenty percent.</w:t></w:r></w:p></w:body></w:document>',
  );
  const bytes = await zip.generateAsync({ type: 'uint8array' });
  await assertMagicBytes(bytes, 'docx');
  const result = await loadAndSplit(bytes, 'docx');
  assert.match(result.chunks[0]?.pageContent ?? '', /twenty percent/u);
});
