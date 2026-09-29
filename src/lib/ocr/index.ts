/**
 * Single OCR abstraction for the UI:
 *
 *   const result = await scanReceipt(file, onProgress);
 *
 * Pipeline: validate -> preprocess -> Puter OCR (Mistral, Textract fallback)
 * -> parse -> validate. Presentation code must not touch Puter directly.
 */
import { checkUploadFile } from '../security';
import { preprocessForOcr } from '../images';
import { recognizeWithPuter } from './puter';
import { parseStructuredReceipt } from './parser';
import { checkStructuredMath } from './validator';
import type { OcrProgress, ScanResult } from './types';

export type { OcrProgress, ScanResult };
export * from './types';

export async function scanReceipt(
  file: File,
  onProgress: (p: OcrProgress) => void = () => undefined,
): Promise<ScanResult> {
  onProgress({ stage: 'validating', fraction: null, status: 'Checking the photo…' });
  const check = checkUploadFile(file);
  if (!check.ok) throw new Error(check.reason);

  onProgress({ stage: 'preparing', fraction: null, status: 'Cleaning up the image…' });
  const blob = await preprocessForOcr(file);

  onProgress({ stage: 'recognizing', fraction: null, status: 'Reading the receipt…' });
  const ocr = await recognizeWithPuter(blob, onProgress);
  if (!ocr.text.trim()) throw new Error('empty-ocr');

  onProgress({ stage: 'parsing', fraction: null, status: 'Preparing your expense…' });
  const structured = parseStructuredReceipt(ocr.text, { meanConfidence: ocr.meanConfidence });
  const math = checkStructuredMath(structured);

  const warnings: string[] = [];
  if (structured.items.length === 0) {
    warnings.push('Line items were hard to separate — totals were kept, add items by hand.');
  }
  if (structured.grand_total === null) {
    warnings.push('No receipt total detected — confirm the bottom of the photo.');
  }
  if (math.status === 'needs-verification') {
    warnings.push(math.detail);
  }
  if (ocr.meanConfidence !== null && ocr.meanConfidence < 55) {
    warnings.push('Scan quality is low — expect a few misreads to fix.');
  }

  return {
    rawText: ocr.text.slice(0, 20000),
    structured,
    math,
    warnings,
    provider: ocr.provider as ScanResult['provider'],
    meanConfidence: ocr.meanConfidence,
  };
}
