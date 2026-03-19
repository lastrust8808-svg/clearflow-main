import { GoogleGenAI, Type } from '@google/genai';
import { AnalysisResult, IdAnalysisResult, JournalEntry } from '../types/app.models';
import { GOVERNANCE_DOCUMENTS_RAW } from '../data/governance-docs';

class GeminiService {
  private ai: GoogleGenAI | null = null;
  readonly isConfigured: boolean = true;

  constructor() {
    // FIX: Access API_KEY from the custom window.process object.
    const apiKey = (window as any).process?.env?.API_KEY;
    if (!apiKey || apiKey === 'MOCK_API_KEY_FOR_GEMINI') {
      console.warn('API_KEY environment variable not set. Gemini Service will not work.');
      this.isConfigured = false;
    } else {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  private fileToGenerativePart(file: File): Promise<{ inlineData: { data: string; mimeType: string; } }> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64data = (reader.result as string).split(',')[1];
        resolve({
          inlineData: {
            data: base64data,
            mimeType: file.type,
          },
        });
      };
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  }
  
  async analyzeFinancialDocumentForJournalEntry(file: File, context: string): Promise<JournalEntry> {
    if (!this.ai) {
      throw new Error('Configuration Error: API Key is missing. The analysis feature is disabled.');
    }
    try {
      const filePart = await this.fileToGenerativePart(file);
      const textPart = {
        text: `You are an expert accountant adhering to GAAP principles. Analyze the provided financial document (e.g., invoice image, receipt, bank statement line in a CSV/text file) and the user-provided context. Your task is to generate a standard, balanced, double-entry journal entry.

User Context: "${context}"
Today's Date: ${new Date().toISOString().split('T')[0]}

Instructions:
1.  Determine the transaction date from the document. If no date is present, use today's date.
2.  Create a concise, clear description for the transaction.
3.  Identify the correct financial accounts. Use standard account names (e.g., Cash, Accounts Payable, Rent Expense, Office Supplies, Service Revenue).
4.  Create the journal entry lines. The total debits MUST equal the total credits.
5.  Return a single JSON object that strictly follows the specified schema. Do not include any other text or markdown. If the document is not a financial document or cannot be processed, return an error in the JSON format.`
      };

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          id: { type: Type.STRING, description: 'A new unique ID for the entry.'},
          date: { type: Type.STRING, description: 'The date of the transaction in YYYY-MM-DD format.' },
          description: { type: Type.STRING, description: 'A concise description of the transaction for the journal entry.' },
          lines: {
            type: Type.ARRAY,
            description: 'An array of journal entry lines. There must be at least two. Debits must equal credits.',
            items: {
              type: Type.OBJECT,
              properties: {
                account: { type: Type.STRING, description: 'The name of the account being debited or credited.' },
                debit: { type: Type.NUMBER, description: 'The debit amount. Use 0 if it is a credit.' },
                credit: { type: Type.NUMBER, description: 'The credit amount. Use 0 if it is a debit.' },
              }
            }
          }
        },
        required: ['id', 'date', 'description', 'lines']
      };
      
      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [textPart, filePart] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        }
      });
      
      const jsonText = response.text?.trim();
      if (!jsonText) throw new Error('Received an empty response from the transaction analysis service.');
      
      const result = JSON.parse(jsonText) as JournalEntry;
      const totalDebits = result.lines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredits = result.lines.reduce((sum, line) => sum + line.credit, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new Error(`AI analysis failed: Debits (${totalDebits}) do not equal credits (${totalCredits}).`);
      }
      
      result.id = crypto.randomUUID(); // Ensure a unique ID is generated client-side
      return result;

    } catch (error) {
      console.error('Error analyzing financial document with Gemini:', error);
      let message = 'An error occurred during analysis. The document might not be a recognizable financial document, or the service may be temporarily unavailable.';
      if (error instanceof Error) {
          message = error.message;
      }
      throw new Error(message);
    }
  }


  async analyzeDocument(file: File): Promise<AnalysisResult> {
     if (!this.ai) {
      throw new Error('Configuration Error: API Key is missing. The analysis feature is disabled.');
    }
    try {
      const filePart = await this.fileToGenerativePart(file);
      const textPart = {
        text: `Analyze the provided financial document (e.g., bank statement, IRS form like CP575, ledger). Extract key information and return it as a JSON object matching the specified schema. The summary should be a concise overview of the document's purpose and contents.`
      };

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          documentType: { type: Type.STRING, description: 'Type of the document (e.g., "Bank Statement", "IRS Form CP575").' },
          entityName: { type: Type.STRING, description: 'The name of the business or individual entity found.' },
          ein: { type: Type.STRING, description: 'The Employer Identification Number (EIN) if present. Format as XX-XXXXXXX.' },
          summary: { type: Type.STRING, description: 'A brief summary of the document.' },
          keyDates: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: 'The name of the date (e.g., "Statement Period", "Notice Date").' },
                date: { type: Type.STRING, description: 'The date value.' },
              }
            }
          },
          financialHighlights: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                label: { type: Type.STRING, description: 'The name of the financial metric (e.g., "Total Deposits", "Tax Amount Due").' },
                value: { type: Type.STRING, description: 'The value of the metric, including currency symbols.' },
              }
            }
          }
        },
      };

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [textPart, filePart] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        }
      });
      
      const jsonText = response.text?.trim();
      if (!jsonText) {
        throw new Error('Received an empty response from the analysis service.');
      }
      return JSON.parse(jsonText) as AnalysisResult;

    } catch (error) {
      console.error('Error analyzing document with Gemini:', error);
      let message = 'An error occurred during analysis. The document might be unreadable or the service may be temporarily unavailable.';
      if (error instanceof Error) {
          message += ` Details: ${error.message}`;
      }
      throw new Error(message);
    }
  }

  async analyzeIdDocument(file: File): Promise<IdAnalysisResult> {
    if (!this.ai) {
      throw new Error('Configuration Error: API Key is missing. The analysis feature is disabled.');
    }
    try {
      const filePart = await this.fileToGenerativePart(file);
      const textPart = {
        text: `Analyze the provided image of an identification document (like a driver's license). Extract the full name of the person. Return a JSON object matching the specified schema. The name should be formatted as 'First Last', ignoring any middle names or initials.`
      };

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          fullName: {
            type: Type.STRING,
            description: 'The full name found on the identification document.'
          },
        },
      };

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [textPart, filePart] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        }
      });

      const jsonText = response.text?.trim();
      if (!jsonText) {
        throw new Error('Received an empty response from the ID analysis service.');
      }
      return JSON.parse(jsonText) as IdAnalysisResult;

    } catch (error) {
      console.error('Error analyzing ID document with Gemini:', error);
      let message = 'An error occurred during ID analysis. The document might be unreadable or the service may be temporarily unavailable.';
      if (error instanceof Error) {
        message += ` Details: ${error.message}`;
      }
      throw new Error(message);
    }
  }

  async analyzeTransaction(description: string): Promise<{ date: string; description: string; entries: { account: string; debit: number; credit: number }[] }> {
    if (!this.ai) {
      throw new Error('Configuration Error: API Key is missing. The analysis feature is disabled.');
    }
    try {
      const textPart = {
        text: `You are an expert bookkeeper. Analyze the following natural language transaction description and convert it into a standard double-entry journal entry.

Transaction: "${description}"

Today's date is ${new Date().toISOString().split('T')[0]}. Use today's date if no specific date is mentioned in the transaction.

Identify the accounts affected. Use standard account names from a typical chart of accounts (e.g., Cash, Accounts Receivable, Office Supplies, Rent Expense, Service Revenue, Accounts Payable, etc.).

Return a single JSON object that strictly follows this schema. Do not include any other text or markdown formatting. The debits and credits must balance.`
      };

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          date: { type: Type.STRING, description: 'The date of the transaction in YYYY-MM-DD format.' },
          description: { type: Type.STRING, description: 'A concise description of the transaction for the journal entry.' },
          entries: {
            type: Type.ARRAY,
            description: 'An array of journal entry lines. There must be at least two. Debits must equal credits.',
            items: {
              type: Type.OBJECT,
              properties: {
                account: { type: Type.STRING, description: 'The name of the account being debited or credited.' },
                debit: { type: Type.NUMBER, description: 'The debit amount. Use 0 if it is a credit.' },
                credit: { type: Type.NUMBER, description: 'The credit amount. Use 0 if it is a debit.' },
              }
            }
          }
        },
        required: ['date', 'description', 'entries']
      };

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [textPart] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        }
      });
      
      const jsonText = response.text?.trim();
      if (!jsonText) {
        throw new Error('Received an empty response from the transaction analysis service.');
      }
      const cleanedJson = jsonText.replace(/^```json\s*|```$/g, '');
      return JSON.parse(cleanedJson);

    } catch (error) {
      console.error('Error analyzing transaction with Gemini:', error);
      let message = 'An error occurred during transaction analysis. The service may be temporarily unavailable.';
      if (error instanceof Error) {
          message += ` Details: ${error.message}`;
      }
      throw new Error(message);
    }
  }

  async queryDocuments(question: string): Promise<string> {
    if (!this.ai) {
      throw new Error('Configuration Error: API Key is missing. The Q&A feature is disabled.');
    }
    try {
      const systemInstruction = `You are an expert assistant for Clear-Flow Integrated Financial Management, LLC. Your role is to answer questions based *only* on the content of the official company documents provided below. Do not use any external knowledge. If the answer cannot be found in the documents, state that clearly.

      Here are the documents:
      ---
      ${GOVERNANCE_DOCUMENTS_RAW}
      ---
      `;

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: question,
        config: {
          systemInstruction: systemInstruction,
        }
      });
      
      return response.text;

    } catch (error) {
      console.error('Error querying documents with Gemini:', error);
      let message = 'An error occurred while getting an answer. The service may be temporarily unavailable.';
      if (error instanceof Error) {
          message += ` Details: ${error.message}`;
      }
      throw new Error(message);
    }
  }

  async analyzeSystemHealth(statuses: any[]): Promise<any> {
    if (!this.ai) {
      throw new Error('Configuration Error: API Key is missing. The system health analysis feature is disabled.');
    }
    try {
      const textPart = {
        text: `You are a system reliability engineer. Analyze the following system statuses and provide a structured health report.
        
        System Statuses:
        ${JSON.stringify(statuses, null, 2)}
        
        Your report should include:
        1. An overall health score (0-100).
        2. A summary of the current state.
        3. Specific recommendations for any degraded or offline services.
        4. Predicted impact on business operations.
        
        Return a JSON object matching the specified schema.`
      };

      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          overallScore: { type: Type.NUMBER, description: 'Overall system health score from 0 to 100.' },
          summary: { type: Type.STRING, description: 'A concise summary of the system health.' },
          recommendations: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                service: { type: Type.STRING, description: 'The name of the service.' },
                action: { type: Type.STRING, description: 'The recommended action to take.' },
                severity: { type: Type.STRING, enum: ['low', 'medium', 'high', 'critical'], description: 'The severity of the issue.' }
              }
            }
          },
          businessImpact: { type: Type.STRING, description: 'The predicted impact on business operations.' }
        },
        required: ['overallScore', 'summary', 'recommendations', 'businessImpact']
      };

      const response = await this.ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [textPart] },
        config: {
          responseMimeType: 'application/json',
          responseSchema: responseSchema,
        }
      });

      const jsonText = response.text?.trim();
      if (!jsonText) throw new Error('Received an empty response from the system health analysis service.');
      return JSON.parse(jsonText);

    } catch (error) {
      console.error('Error analyzing system health with Gemini:', error);
      throw error;
    }
  }
}

export const geminiService = new GeminiService();
