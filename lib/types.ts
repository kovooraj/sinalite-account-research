export interface Account {
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  company?: string;
  email?: string;
  website?: string;
  phone?: string;
  address?: string;
  city?: string;
  province?: string;
  country?: string;
  postalCode?: string;
  businessType?: string;
  [key: string]: string | undefined;
}

export type Verdict = 'reseller' | 'not_reseller' | 'uncertain';
export type Confidence = 'high' | 'medium' | 'low';

export interface ResearchResult {
  account: Account;
  verdict: Verdict;
  confidence: Confidence;
  reasoning: string;
  businessDescription: string;
  keySignals: string[];
  error?: string;
}
