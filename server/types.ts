// server/types.ts
// Shared TypeScript types and interfaces for the server-side application.

export type SupportedRail = 'FedNow' | 'RTP' | 'Fedwire' | 'SameDayACH' | 'StandardACH' | 'None';

export interface RailInfo {
  name: SupportedRail;
  // Add other rail-specific metadata if needed
}

export interface PayeeInfo {
  routingNumber: string;
  accountNumber: string;
  name: string;
}

export interface RiskInfo {
  signalDecision: 'ACCEPT' | 'REVIEW' | 'REROUTE' | null;
}

export interface RailPolicyInput {
  payee: PayeeInfo;
  amount: number;
  urgency: 'instant' | 'same_day' | 'standard' | 'final';
  risk: RiskInfo;
  userPreference?: SupportedRail;
}

export interface RailPolicyDecision {
  rail: SupportedRail;
  reason: string;
  required_fields: string[];
}
