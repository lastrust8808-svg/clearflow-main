export type ModuleKey =
  | 'overview'
  | 'entities'
  | 'ledger'
  | 'assets'
  | 'transactions'
  | 'compliance'
  | 'documents'
  | 'aiStudio'
  | 'settings';

export type PaymentMedium =
  | 'fiat'
  | 'specie'
  | 'private_tender'
  | 'digital_asset'
  | 'contractual_mixed';

export type ObligationType =
  | 'public_obligation'
  | 'private_obligation'
  | 'secured_private_obligation'
  | 'performance_security'
  | 'reserve_backed_claim';

export interface EntityRecord {
  id: string;
  name: string;
  entityType: 'trust' | 'llc' | 'corporation' | 'partnership' | 'nonprofit' | 'individual';
  jurisdiction: string;
  status: 'active' | 'inactive' | 'pending';
  taxId?: string;
  managers: string[];
  notes?: string;
}

export interface AccountRecord {
  id: string;
  entityId: string;
  name: string;
  accountType: 'bank' | 'credit' | 'ledger' | 'reserve' | 'loan' | 'wallet';
  institution?: string;
  balance: number;
  currency: string;
}

export interface WalletRecord {
  id: string;
  entityId: string;
  name: string;
  network: string;
  address: string;
  custodyType: 'self_custody' | 'exchange' | 'qualified_custodian' | 'multisig' | 'contract';
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface AuthorityRecord {
  id: string;
  entityId?: string;
  name: string;
  role: 'attorney_of_record' | 'private_representative' | 'trustee' | 'manager' | 'agent' | 'other';
  noticeOfAppearanceFiled?: boolean;
  clientAuthorizationStatus?: 'verified' | 'unverified' | 'not_applicable';
  powerOfAttorneyOnFile?: boolean;
  notes?: string;
}

export interface AssetRecord {
  id: string;
  entityId: string;
  name: string;
  assetClass:
    | 'real_estate'
    | 'metal'
    | 'digital'
    | 'vehicle'
    | 'inventory'
    | 'receivable'
    | 'ip'
    | 'document_right'
    | 'private_note'
    | 'beneficial_interest'
    | 'claim'
    | 'collectible'
    | 'other';
  assetSubtype?:
    | 'native_coin'
    | 'fungible_token'
    | 'stablecoin'
    | 'nft'
    | 'tokenized_note'
    | 'tokenized_equity'
    | 'staking_position'
    | 'lp_position'
    | 'domain_asset'
    | 'private_promissory_note'
    | 'private_bond'
    | 'trust_interest'
    | 'contract_right'
    | 'jewelry'
    | 'bullion'
    | 'silver_reserve'
    | 'gold_reserve'
    | 'other';
  walletId?: string;
  estimatedValue: number;
  bookValue?: number;
  marketValue?: number;
  liquidationValue?: number;
  immediateCashValue?: number;
  liquidityClass: 'high' | 'medium' | 'low' | 'illiquid';
  valuationMethod?: 'face_value' | 'market_comp' | 'discounted_cash_flow' | 'appraisal' | 'manual';
  daysToLiquidate?: number;
  basis?: number;
  status: 'active' | 'pending' | 'disposed';
  dispositionStatus?: 'held' | 'marketed' | 'pending_sale' | 'sold' | 'assigned' | 'pledged';
  classification?:
    | 'payment'
    | 'utility'
    | 'security_like'
    | 'commodity_like'
    | 'collectible'
    | 'unclassified';
  paymentMedium?: PaymentMedium;
  obligationType?: ObligationType;
  custodyStatus?: 'controlled' | 'delegated' | 'locked' | 'disputed';
  complianceStatus?: 'ok' | 'review' | 'restricted' | 'unknown';
  contractAddress?: string;
  tokenId?: string;
  explorerUrl?: string;
  encumbranceNotes?: string;
  pledgeStatus?: 'unpledged' | 'pledged' | 'released';
  description?: string;
}

export interface InstrumentRecord {
  id: string;
  entityId: string;
  title: string;
  instrumentType:
    | 'promissory_note'
    | 'private_bond'
    | 'security_agreement'
    | 'pledge_agreement'
    | 'performance_bond'
    | 'assignment'
    | 'other';
  obligationType: ObligationType;
  paymentMedium: PaymentMedium;
  faceValue?: number;
  securedByAssetIds?: string[];
  status: 'draft' | 'active' | 'satisfied' | 'cancelled';
  notes?: string;
}

export interface TransactionRecord {
  id: string;
  entityId: string;
  type:
    | 'income'
    | 'expense'
    | 'transfer'
    | 'notePayment'
    | 'distribution'
    | 'reserveAllocation'
    | 'assetSale'
    | 'partialLiquidation'
    | 'collateralAdvance'
    | 'assignment'
    | 'reserveDraw'
    | 'proceedsReceived'
    | 'pledgePosting'
    | 'tenderDesignation'
    | 'debtDischarge';
  amount: number;
  date: string;
  description: string;
  fromAccountId?: string;
  toAccountId?: string;
  paymentMedium?: PaymentMedium;
  relatedInstrumentId?: string;
  status: 'pending' | 'posted' | 'failed';
}

export interface OnChainTransactionRecord {
  id: string;
  entityId: string;
  walletId?: string;
  txHash: string;
  network: string;
  eventType:
    | 'send'
    | 'receive'
    | 'swap'
    | 'mint'
    | 'burn'
    | 'stake'
    | 'unstake'
    | 'reward'
    | 'bridge'
    | 'contract_interaction';
  assetId?: string;
  timestamp: string;
  feeAmount?: number;
  feeAssetSymbol?: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface ComplianceItem {
  id: string;
  entityId: string;
  title: string;
  dueDate: string;
  category:
    | 'annual_report'
    | 'tax'
    | 'license'
    | 'insurance'
    | 'governance'
    | 'digital_asset_review'
    | 'authority_review'
    | 'custom';
  status: 'ok' | 'upcoming' | 'overdue' | 'blocked';
  notes?: string;
}

export interface DocumentRecord {
  id: string;
  entityId?: string;
  title: string;
  category:
    | 'governing'
    | 'tax'
    | 'banking'
    | 'asset'
    | 'compliance'
    | 'generated'
    | 'wallet_control'
    | 'token_issuance'
    | 'smart_contract_summary'
    | 'reserve_attestation'
    | 'custody_resolution'
    | 'digital_asset_policy'
    | 'valuation'
    | 'liquidation'
    | 'assignment'
    | 'authority'
    | 'legal_memo'
    | 'pledge'
    | 'other';
  createdAt: string;
  status: 'draft' | 'final' | 'archived';
  storageRef?: string;
}

export interface DashboardSummary {
  totalCash: number;
  totalAssets: number;
  totalLiquidationValue: number;
  totalImmediateCashValue: number;
  monthlyInflow: number;
  monthlyOutflow: number;
  netCashFlow: number;
  overdueItems: number;
}
