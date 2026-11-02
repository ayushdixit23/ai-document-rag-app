import assert from 'node:assert/strict';
import { test } from 'node:test';

import JSZip from 'jszip';

import { uploadsSchema } from '../../../core/validation/schemas/documents.schema.js';
import { loadExcel } from './excel-loader.js';
import { assertMagicBytes } from './file-validation.js';
import { loadAndSplit } from './load-document.js';

void test('uploads enforce type/extension, file count, size and safe names', () => {
  const file = { name: 'notes.md', mimeType: 'text/plain', size: 100 };
  assert.equal(uploadsSchema.safeParse({ files: [file] }).success, true);
  for (const files of [
    [],
    Array.from({ length: 6 }, () => file),
    [{ ...file, size: 11 * 1024 * 1024 }],
    [{ ...file, name: '../notes.md' }],
    [{ ...file, name: 'x.exe' }],
    [{ ...file, mimeType: 'application/pdf' }],
    [{ ...file, name: 'a\0.md' }],
  ]) {
    assert.equal(uploadsSchema.safeParse({ files }).success, false);
  }
});

void test('magic-byte validation rejects disguised files and binary/invalid UTF-8 text', async () => {
  await assertMagicBytes(Buffer.from('hello\nworld'), 'txt');
  await assertMagicBytes(Buffer.from('a'), 'md');
  await assert.rejects(assertMagicBytes(Buffer.from('This is not a PDF'), 'pdf'));
  await assert.rejects(assertMagicBytes(Buffer.from('%PDF-1.7\n'), 'txt'));
  await assert.rejects(assertMagicBytes(Buffer.from([0, 1, 2]), 'csv'));
  await assert.rejects(assertMagicBytes(Buffer.from([0xff, 0xfe]), 'txt'));
});

void test('text, Markdown and CSV loaders split usable text and reject empty content', async () => {
  const markdown = await loadAndSplit(
    Buffer.from('# Revenue\n\n' + 'Revenue rose 20%. '.repeat(100)),
    'md',
  );
  assert.ok(markdown.chunks.length > 1);
  assert.equal(markdown.pageCount, null);
  const csv = await loadAndSplit(Buffer.from('name,revenue\nAlpha,120\nBeta,80'), 'csv');
  assert.match(csv.chunks[0]?.pageContent ?? '', /name: Alpha/u);
  await assert.rejects(loadAndSplit(Buffer.from('  \n'), 'txt'), /No usable text/u);
});

void test('Excel loader resolves sheet names, shared strings, inline strings and cached values', async () => {
  const zip = new JSZip();
  zip.file(
    'xl/workbook.xml',
    '<workbook><sheets><sheet name="Sales" r:id="rId1"/></sheets></workbook>',
  );
  zip.file(
    'xl/_rels/workbook.xml.rels',
    '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
  );
  zip.file('xl/sharedStrings.xml', '<sst><si><t>Revenue</t></si></sst>');
  zip.file(
    'xl/worksheets/sheet1.xml',
    '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1"><f>100+20</f><v>120</v></c><c r="C1" t="inlineStr"><is><t>USD</t></is></c></row></sheetData></worksheet>',
  );
  const documents = await loadExcel(await zip.generateAsync({ type: 'uint8array' }));
  assert.equal(documents.length, 1);
  assert.deepEqual(documents[0]?.metadata, { sheet: 'Sales', row: 1 });
  assert.match(documents[0].pageContent, /A1: Revenue\nB1: 120\nC1: USD/u);
  zip.file('xl/sharedStrings.xml', '<!DOCTYPE x [<!ENTITY x "unsafe">]><sst/>');
  await assert.rejects(loadExcel(await zip.generateAsync({ type: 'uint8array' })), /unsupported/u);
});
