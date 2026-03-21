import { geminiService } from './gemini.service';
import type { AnalysisResult } from '../types/app.models';

type IntakeKind = 'bill' | 'receipt';

export interface IntakeExtractionResult {
  status: 'manual' | 'extracted' | 'needs_review' | 'failed';
  summary: string;
  vendorOrMerchantName?: string;
  amount?: number;
  date?: string;
  categoryHint?: string;
  rawAnalysis?: AnalysisResult;
}

function parseCurrencyValue(value: string | undefined) {
  if (!value) return undefined;
  const numeric = Number(value.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : undefined;
}

function extractDateFromText(text: string | undefined) {
  if (!text) return undefined;
  const isoMatch = text.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (isoMatch) return isoMatch[1];

  const slashMatch = text.match(/\b(\d{1,2}\/\d{1,2}\/20\d{2})\b/);
  if (!slashMatch) return undefined;

  const parsed = new Date(slashMatch[1]);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString().slice(0, 10);
}

function categorizeDocument(documentType: string | undefined) {
  if (!documentType) return undefined;
  const normalized = documentType.toLowerCase();
  if (normalized.includes('fuel')) return 'Fuel';
  if (normalized.includes('travel')) return 'Travel';
  if (normalized.includes('meal')) return 'Meals';
  if (normalized.includes('office')) return 'Office';
  if (normalized.includes('utility')) return 'Utilities';
  if (normalized.includes('insurance')) return 'Insurance';
  return undefined;
}

function fallbackExtraction(kind: IntakeKind, file: File): IntakeExtractionResult {
  const nameWithoutExtension = file.name.replace(/\.[^.]+$/, '');
  const normalizedName = nameWithoutExtension.replace(/[-_]+/g, ' ').trim();

  return {
    status: 'needs_review',
    summary: `Automatic ${kind} extraction is not configured, so ClearFlow stored the source file and created a review-ready draft from file metadata.`,
    vendorOrMerchantName: normalizedName || undefined,
  };
}

export async function analyzeAccountingUpload(
  kind: IntakeKind,
  file: File | null | undefined,
): Promise<IntakeExtractionResult> {
  if (!file) {
    return {
      status: 'manual',
      summary: `Manual ${kind} entry saved without a source document.`,
    };
  }

  if (!geminiService.isConfigured) {
    return fallbackExtraction(kind, file);
  }

  try {
    const analysis = await geminiService.analyzeDocument(file);
    const amount =
      analysis.financialHighlights
        ?.map((item) => parseCurrencyValue(item.value))
        .find((value) => value !== undefined) ?? undefined;
    const detectedDate =
      analysis.keyDates
        ?.map((item) => extractDateFromText(item.date))
        .find((value) => value !== undefined) ?? undefined;

    return {
      status: 'extracted',
      summary: analysis.summary || `Automatic ${kind} extraction completed.`,
      vendorOrMerchantName: analysis.entityName || undefined,
      amount,
      date: detectedDate,
      categoryHint: categorizeDocument(analysis.documentType),
      rawAnalysis: analysis,
    };
  } catch (error) {
    console.warn(`Automatic ${kind} extraction failed. Falling back to review mode.`, error);
    return {
      ...fallbackExtraction(kind, file),
      status: 'failed',
      summary:
        error instanceof Error
          ? `Automatic ${kind} extraction failed: ${error.message}`
          : `Automatic ${kind} extraction failed and needs review.`,
    };
  }
}
