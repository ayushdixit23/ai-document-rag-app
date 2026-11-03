import { Document } from '@langchain/core/documents';

import { CHUNK_VERSION } from '../config.js';
import { recursiveSplit } from './recursive-split.js';
import { textSections } from './sections.js';

export const splitDocuments = (documents: Document[], headings: boolean): Document[] => {
  const chunks: Document[] = [];
  for (const document of documents) {
    const text = document.pageContent;
    const sections = headings ? textSections(text) : [{ text, start: 0, heading: '' }];
    for (const section of sections) {
      for (const { text: content, start } of recursiveSplit(section.text)) {
        chunks.push(
          new Document({
            pageContent: content,
            metadata: {
              ...document.metadata,
              heading: section.heading,
              sourceStart: section.start + start,
              sourceEnd: section.start + start + content.length,
              chunkVersion: CHUNK_VERSION,
            },
          }),
        );
      }
    }
  }
  return chunks;
};
