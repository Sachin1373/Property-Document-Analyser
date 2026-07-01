export interface Clause {
  text: string;
  classification: 'Standard' | 'Unusual' | 'Red Flag';
  reasoning: string;
  confidence: 'High' | 'Medium' | 'Low';
}

export interface ExtractedFields {
  parties: string[];
  propertyDescription: string;
  propertyAddress: string;
  transactionType: string;
  transactionValue: string;
  dates: { type: string; value: string }[];
  encumbrances: string[];
  missingFields: string[];
}

export interface AnalysisResult {
  extractedFields: ExtractedFields;
  clauses: Clause[];
  summary: string;
  overallRisk: 'Low' | 'Medium' | 'High';
}
