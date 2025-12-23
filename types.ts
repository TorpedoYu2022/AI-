
export interface Executive {
  name: string;
  position: string;
}

export interface CompanyNews {
  date: string;
  title: string;
  summary: string;
  url?: string;
}

export interface Company {
  id: string;
  name: string;
  industry: string;
  region: string;
  revenue: string;
  employeeCount: string;
  recentNews: CompanyNews[];
  executives: Executive[];
  description: string;
  isVerified: boolean;
  verificationReason?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface SearchResult {
  companies: Company[];
  sources: GroundingSource[];
  rawAnalysis: string;
}
