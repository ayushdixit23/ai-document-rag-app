import { Document } from '@langchain/core/documents';
import { DOMParser } from '@xmldom/xmldom';
import JSZip from 'jszip';

const MAX_XML_LENGTH = 30 * 1024 * 1024;

const parseXml = (value: string) => {
  if (value.length > MAX_XML_LENGTH || /<!DOCTYPE|<!ENTITY/iu.test(value)) {
    throw new Error('Workbook XML is too large or unsupported.');
  }
  return new DOMParser({
    errorHandler: { warning: () => {}, error: failXml, fatalError: failXml },
  }).parseFromString(value, 'application/xml');
};

const failXml = (): never => {
  throw new Error('Invalid workbook XML.');
};

const textNodes = (node: Element): string =>
  Array.from(node.getElementsByTagName('t'))
    .map((item) => item.textContent)
    .join('');

const readCell = (cell: Element, shared: string[]): string => {
  if (cell.getAttribute('t') === 'inlineStr') return textNodes(cell);
  const value = cell.getElementsByTagName('v')[0]?.textContent ?? '';
  return cell.getAttribute('t') === 's' ? (shared[Number(value)] ?? '') : value;
};

const sheetDocuments = (xml: string, sheetName: string, shared: string[]): Document[] => {
  return Array.from(parseXml(xml).getElementsByTagName('row')).flatMap((row) => {
    const cells = Array.from(row.getElementsByTagName('c'));
    if (!cells.some((cell) => readCell(cell, shared).trim())) return [];
    const content = cells
      .map((cell) => `${cell.getAttribute('r') ?? ''}: ${readCell(cell, shared)}`)
      .join('\n');
    return [
      new Document({
        pageContent: `Sheet: ${sheetName}\n${content}`,
        metadata: { sheet: sheetName, row: Number(row.getAttribute('r')) },
      }),
    ];
  });
};

/** Read cached cell values only; spreadsheet formulas and external links are never executed. */
export const loadExcel = async (bytes: Uint8Array): Promise<Document[]> => {
  const zip = await JSZip.loadAsync(bytes);
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string');
  const shared = sharedXml
    ? Array.from(parseXml(sharedXml).getElementsByTagName('si')).map(textNodes)
    : [];
  const workbookXml = await zip.file('xl/workbook.xml')?.async('string');
  const relationsXml = await zip.file('xl/_rels/workbook.xml.rels')?.async('string');
  if (!workbookXml || !relationsXml) throw new Error('Invalid XLSX workbook.');
  const relations = Array.from(parseXml(relationsXml).getElementsByTagName('Relationship'));
  const sheets = Array.from(parseXml(workbookXml).getElementsByTagName('sheet'));
  const documents: Document[] = [];
  for (const sheet of sheets) {
    const target = relations
      .find((item) => item.getAttribute('Id') === sheet.getAttribute('r:id'))
      ?.getAttribute('Target');
    if (!target) continue;
    const path = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const sheetXml = await zip.file(path)?.async('string');
    if (!sheetXml) continue;
    documents.push(...sheetDocuments(sheetXml, sheet.getAttribute('name') ?? '', shared));
  }
  return documents;
};
