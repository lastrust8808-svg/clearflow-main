export type AppSection =
  | 'overview'
  | 'entities'
  | 'accounting'
  | 'ledger'
  | 'investments'
  | 'assets'
  | 'transactions'
  | 'compliance'
  | 'documents'
  | 'aiStudio'
  | 'settings';

export type EntityType =
  | 'trust'
  | 'llc'
  | 'corporation'
  | 'partnership'
  | 'individual'
  | 'nonprofit'
  | 'other';

export interface InvestmentActionPlanRecord {
  id: string;
  entityId?: string;
  title: string;
  planType: 'real_estate_deal' | '1031_exchange' | 'funding_path' | 'short_term_placement' | 'strategy_lab';
  status: 'draft' | 'review' | 'ready' | 'archived';
  createdAt: string;
  updatedAt: string;
  inputs: Record<string, string | number | boolean>;
  outputs: Record<string, string | number>;
  checklist: Array<{ label: string; completed: boolean }>;
  notes?: string;
}

export type AssetCategory =
  | 'real_estate'
  | 'metal'
  | 'cash'
  | 'receivable'
  | 'security'
  | 'digital_asset'
  | 'tokenized_claim'
  | 'smart_contract_position'
  | 'ip'
  | 'domain'
  | 'equipment'
  | 'other';

export type AssetStatus =
  | 'active'
  | 'restricted'
  | 'pending_review'
  | 'liquidated'
  | 'disputed'
  | 'archived';

export type PaymentMediumClassification =
  | 'specie'
  | 'fiat'
  | 'private_tender'
  | 'digital_asset'
  | 'mixed_contractual_tender';

export type ObligationType =
  | 'public_obligation'
  | 'private_obligation'
  | 'secured_private_obligation'
  | 'pledged_performance_security'
  | 'reserve_backed_claim';

export type InstrumentType =
  | 'promissory_note'
  | 'bill_of_exchange'
  | 'private_bond'
  | 'pledged_metal_reserve'
  | 'contract_right'
  | 'performance_security_posting'
  | 'tender_designation'
  | 'tokenized_note'
  | 'tokenized_equity'
  | 'custody_record'
  | 'other';

export type RealEstateOfferingStructure =
  | 'direct_title'
  | 'tenant_in_common'
  | 'condo_hotel'
  | 'limited_partnership'
  | 'joint_venture'
  | 'syndication'
  | 'other';

export type BorrowingFacilityType =
  | 'revolving_credit'
  | 'term_loan'
  | 'secured_margin'
  | 'bond_program'
  | 'private_credit_line'
  | 'other';

export type BorrowingFacilityStatus =
  | 'draft'
  | 'active'
  | 'watch'
  | 'matured'
  | 'closed';

export type CollateralHoldingStatus =
  | 'available'
  | 'pledged'
  | 'margin_locked'
  | 'liquidating'
  | 'released';

export type FuturesStrategyType =
  | 'hedge'
  | 'basis_trade'
  | 'carry'
  | 'liquidity_overlay'
  | 'speculative'
  | 'other';

export type FuturesStrategyStatus =
  | 'draft'
  | 'active'
  | 'watch'
  | 'closed'
  | 'liquidated';

export type LiquidationPlanStatus =
  | 'ready'
  | 'watch'
  | 'blocked'
  | 'in_progress'
  | 'completed';

export type AuthorityRecordType =
  | 'attorney_of_record'
  | 'private_representative'
  | 'power_of_attorney'
  | 'notice_of_appearance'
  | 'client_authorization'
  | 'trustee_authority'
  | 'manager_authority'
  | 'other';

export type CustodyType =
  | 'self_custody'
  | 'exchange'
  | 'qualified_custodian'
  | 'multisig'
  | 'contract';

export type DigitalAssetSubtype =
  | 'native_coin'
  | 'fungible_token'
  | 'stablecoin'
  | 'nft'
  | 'tokenized_note'
  | 'tokenized_equity'
  | 'staking_position'
  | 'lp_position'
  | 'domain_asset'
  | 'other';

export type DigitalAssetClassification =
  | 'payment'
  | 'utility'
  | 'security_like'
  | 'commodity_like'
  | 'collectible'
  | 'unclassified';

export type CustodyStatus =
  | 'controlled'
  | 'delegated'
  | 'locked'
  | 'disputed';

export type ComplianceStatus =
  | 'ok'
  | 'review'
  | 'restricted'
  | 'unknown';

export type OnChainEventType =
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

export type TransactionType =
  | 'deposit'
  | 'withdrawal'
  | 'transfer'
  | 'journal'
  | 'income'
  | 'expense'
  | 'wallet_transfer'
  | 'token_issuance'
  | 'token_receipt'
  | 'smart_contract_deposit'
  | 'smart_contract_withdrawal'
  | 'swap'
  | 'staking_reward'
  | 'gas_fee'
  | 'mint'
  | 'burn'
  | 'bridge_transfer'
  | 'custody_transfer';

export type SettlementPath =
  | 'ach'
  | 'wire'
  | 'check'
  | 'internal_ledger'
  | 'card'
  | 'cash'
  | 'wallet'
  | 'tokenized_credit'
  | 'tokenized_debit'
  | 'mixed';

export type DischargeMethod =
  | 'internal_ledger_credit'
  | 'instrument_performance'
  | 'bank_rail_payment'
  | 'mixed_discharge';

export type VendorReceiveMethod =
  | 'ach'
  | 'wire'
  | 'paper_check'
  | 'lockbox_coupon'
  | 'digital_wallet'
  | 'manual_review';

export type VendorDeliveryStatus =
  | 'draft'
  | 'delivery_ready'
  | 'sent'
  | 'received'
  | 'manual_review';

export type ExternalRecognitionStatus =
  | 'internal_only'
  | 'delivery_ready'
  | 'pending_vendor_acceptance'
  | 'recognized_by_saved_terms'
  | 'manual_review';

export type SettlementStatus =
  | 'draft'
  | 'routing'
  | 'verifying'
  | 'clearing'
  | 'settled'
  | 'exception';

export type LiquidCashStage =
  | 'unfunded'
  | 'pending_liquidation'
  | 'liquid_cash_pending'
  | 'liquid_cash_available'
  | 'liquid_cash_reserved'
  | 'liquid_cash_released';

export type VerificationMethod =
  | 'bank_confirmation'
  | 'wallet_confirmation'
  | 'internal_control_token'
  | 'reserve_attestation'
  | 'manual_override';

export type VerificationStatus =
  | 'not_started'
  | 'pending'
  | 'verified'
  | 'exception';

export type FundsRightsClassification =
  | 'consumer_household'
  | 'commercial_business'
  | 'fiduciary_administrative'
  | 'mixed_review';

export type FundsApplicationClass =
  | 'consumer_ppd'
  | 'consumer_web'
  | 'consumer_tel'
  | 'commercial_ccd'
  | 'commercial_ctx'
  | 'fiduciary_admin'
  | 'check_issue'
  | 'biller_direct_review'
  | 'manual_review';

export type AutoReconcileStatus = 'pending' | 'matched' | 'partial' | 'exception';
export type BankFeedConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'syncing'
  | 'attention_needed';
export type FinancialConnectionProvider =
  | 'plaid'
  | 'dwolla'
  | 'treasury_prime'
  | 'modern_treasury'
  | 'unit'
  | 'mercury'
  | 'checkbook'
  | 'tyler_payments'
  | 'payit'
  | 'catalis_court_payments'
  | 'lexisnexis_government_payments'
  | 'gov_pay'
  | 'usps_bcg'
  | 'upu_addressing'
  | 'stripe'
  | 'cash_app'
  | 'paypal'
  | 'square'
  | 'lithic'
  | 'issuer_portal'
  | 'manual';
export type FinancialConnectionRail =
  | 'plaid_link'
  | 'api'
  | 'oauth'
  | 'manual_profile'
  | 'bank_channel';

export type WalletConnectionProvider =
  | 'metamask'
  | 'coinbase'
  | 'walletconnect'
  | 'coinbase_exchange'
  | 'kraken'
  | 'binance_us'
  | 'robinhood_crypto'
  | 'manual';

export type WalletConnectionStatus =
  | 'disconnected'
  | 'connected'
  | 'syncing'
  | 'attention_needed';

export type WalletExecutionSupport = 'live_broadcast' | 'manual_release' | 'read_only';
export type RailNamespace =
  | 'commercial_ach'
  | 'federal_ach_green_book'
  | 'treasury_check_gold_book'
  | 'fedwire'
  | 'irs_reporting';

export type InterEntityLedgerSide = 'origin' | 'destination';

export type InterEntitySettlementMode = 'mirrored_halves' | 'cross_entity_clearing';
export type EntityConnectionType =
  | 'internal_entity'
  | 'external_user'
  | 'counterparty_network';
export type EntityConnectionStatus = 'pending' | 'active' | 'restricted' | 'archived';
export type CreditRailType =
  | 'intercompany_credit'
  | 'member_credit'
  | 'reserve_bridge'
  | 'vendor_credit'
  | 'peer_settlement'
  | 'partner_note';
export type CreditRailStatus = 'draft' | 'active' | 'watch' | 'blocked' | 'closed';
export type RailLegalUsePosture =
  | 'internal_controlled_book_entry'
  | 'private_instrument_tracking_only'
  | 'partner_bank_required_external_presentment'
  | 'hybrid_controlled_settlement';
export type ObligationLifecycleStage =
  | 'recognized'
  | 'presentment_due'
  | 'presented'
  | 'cure_running'
  | 'default_review'
  | 'defaulted'
  | 'discharge_pending'
  | 'discharged';
export type ObligationDefaultBasis =
  | 'non_payment'
  | 'non_performance'
  | 'documentation_gap'
  | 'maturity_lapse'
  | 'manual_reservation';
export type BankingOperationClass =
  | 'private_wealth_treasury'
  | 'affiliate_cash_management'
  | 'partner_note_program'
  | 'collateral_control'
  | 'general_settlement';
export type NegotiableInstrumentForm =
  | 'note'
  | 'bill_of_exchange'
  | 'bond'
  | 'future'
  | 'collateral_memorandum'
  | 'other';
export type NegotiableInstrumentStatus =
  | 'draft'
  | 'issued'
  | 'accepted'
  | 'assigned'
  | 'presented'
  | 'performed'
  | 'disputed'
  | 'retired';
export type HolderLedgerEntryType =
  | 'issue'
  | 'assignment'
  | 'deposit'
  | 'presentment'
  | 'dishonor'
  | 'protest'
  | 'performance'
  | 'pledge'
  | 'release';
export type DispatchSubjectType =
  | 'instrument'
  | 'obligation'
  | 'document'
  | 'remittance_statement';
export type DispatchMethod =
  | 'internal_clearflow'
  | 'postal_mail'
  | 'email'
  | 'manual_upload'
  | 'external_courier';
export type DispatchStatus =
  | 'prepared'
  | 'sent'
  | 'delivered'
  | 'response_received'
  | 'accepted'
  | 'dishonored'
  | 'cancelled';
export type DispatchAcceptanceStatus =
  | 'pending'
  | 'accepted'
  | 'dishonored'
  | 'conditional'
  | 'no_response';
export type DispatchOriginalControlStatus =
  | 'unverified'
  | 'issuer_controlled_original'
  | 'executed_copy_only'
  | 'returned_original_received';
export type DispatchServiceEvidenceStatus =
  | 'pending'
  | 'mailing_prepared'
  | 'delivery_receipt_retained'
  | 'executed_return_retained';
export type DispatchCounselReviewStatus =
  | 'not_started'
  | 'recommended'
  | 'completed';

export type TokenStatus = 'draft' | 'issued' | 'verified' | 'revoked';
export type RecurrenceFrequency =
  | 'weekly'
  | 'biweekly'
  | 'semimonthly'
  | 'monthly'
  | 'quarterly'
  | 'annually';

export type TokenSubjectType =
  | 'entity'
  | 'transaction'
  | 'document'
  | 'dispatch'
  | 'seal_usage'
  | 'instrument'
  | 'authority_record'
  | 'settlement'
  | 'digital_asset'
  | 'smart_contract_position';

export type WorkspaceThemeMode =
  | 'ocean_luxe'
  | 'midnight_gold'
  | 'glitter_pop'
  | 'quiet_stewardship';

export type DocumentCategory =
  | 'governing'
  | 'financial'
  | 'compliance'
  | 'contract'
  | 'title'
  | 'tax'
  | 'wallet_control_memo'
  | 'token_issuance_memo'
  | 'smart_contract_summary'
  | 'reserve_attestation'
  | 'custody_resolution'
  | 'digital_asset_policy'
  | 'compliance_classification_memo'
  | 'tx_audit_packet'
  | 'legal_memo'
  | 'authority_record'
  | 'other';

export type DocumentStorageOwner = 'user_owned' | 'clearflow_retained';

export type DocumentRetentionClass =
  | 'operational'
  | 'agreement'
  | 'security_support'
  | 'payroll'
  | 'compliance'
  | 'authority'
  | 'tax'
  | 'financial_evidence';

export type DocumentExternalStorageTarget = 'google_drive';

export type DocumentExternalStorageStatus =
  | 'not_applicable'
  | 'ready'
  | 'routed'
  | 'error';

export interface EntityRecord {
  id: string;
  name: string;
  type: EntityType;
  displayName?: string;
  primaryEmail?: string;
  jurisdiction?: string;
  country?: string;
  formationDate?: string;
  taxId?: string;
  status: 'active' | 'inactive' | 'draft';
  ownerDisplay?: string;
  representativeName?: string;
  representativeRole?: string;
  authorityAttestedAt?: string;
  authorityAttestationStatement?: string;
  authorityProofDocumentId?: string;
  authorityProofUploadedAt?: string;
  authorityProofStatus?: 'missing' | 'review' | 'matched' | 'similar_match' | 'mismatch';
  authorityProofSummary?: string;
  authorityProofNamedPartyNames?: string[];
  authorityProofRequiredPartyNames?: string[];
  authorityTransactionsPaused?: boolean;
  entityAccess?: {
    googleStorageEmail?: string;
    storageMode?: 'operator_google' | 'entity_google' | 'internal_only';
    driveConnectionStatus?:
      | 'not_connected'
      | 'connected'
      | 'needs_google_switch'
      | 'internal_only';
    shareInCollectiveOverview?: boolean;
    shareInOperatorDashboard?: boolean;
    notes?: string;
  };
  branding?: {
    accentColor?: string;
    documentLogoText?: string;
    emailFromName?: string;
    replyToEmail?: string;
    invoiceFooterNote?: string;
    sealTemplate?: 'round' | 'oval' | 'notary' | 'minimal';
    sealPrimaryText?: string;
    sealSecondaryText?: string;
    sealInkColor?: string;
    entitySealSvg?: string;
    sealValueEnabled?: boolean;
    sealUnitValue?: number;
    sealValueCurrency?: string;
    sealReserveTreasuryAccountId?: string;
    sealReserveAssetAccountId?: string;
    sealReserveEquityAccountId?: string;
    sealReserveAssetId?: string;
    sealReserveDigitalAssetId?: string;
    autoGenerateDispatchIdentity?: boolean;
    entityMailingLine?: string;
    entityProofSealCode?: string;
    entityQrPayload?: string;
    entityQrSealSvg?: string;
    entityMailingBarcodeSvg?: string;
  };
  numbering?: {
    invoicePrefix: string;
    quotePrefix: string;
    billPrefix: string;
    receiptPrefix: string;
    journalPrefix: string;
    nextInvoiceSequence: number;
    nextQuoteSequence: number;
    nextBillSequence: number;
    nextReceiptSequence: number;
    nextJournalSequence: number;
  };
  operationalDefaults?: {
    baseCurrency: string;
    fiscalYearStartMonth: number;
    defaultSettlementPath: SettlementPath;
    interEntitySettlementMode: InterEntitySettlementMode;
    autoIssueVerificationTokens: boolean;
    autoReconcileLedgerLinks: boolean;
  };
}

export interface LedgerAccountRecord {
  id: string;
  entityId: string;
  code: string;
  name: string;
  accountType:
    | 'asset'
    | 'liability'
    | 'equity'
    | 'income'
    | 'expense'
    | 'memo';
  currency?: string;
  balance: number;
  remittanceEligible?: boolean;
  remittanceClassification?: 'cash' | 'obligation' | 'receivable' | 'reserve' | 'other';
  linkedAssetIds?: string[];
  linkedWalletIds?: string[];
}

export interface AssetRecord {
  id: string;
  entityId: string;
  name: string;
  category: AssetCategory;
  status: AssetStatus;
  bookValue: number;
  marketValue?: number;
  paymentMedium?: PaymentMediumClassification;
  marketSector?: 'municipal' | 'corporate' | 'sovereign' | 'private' | 'other';
  identifierCode?: string;
  issuerName?: string;
  couponRate?: number;
  maturityDate?: string;
  creditRating?: string;
  taxTreatment?: 'tax_exempt' | 'taxable' | 'private_activity_review' | 'other';
  liquidityProfile?:
    | 'exchange_traded_fund_proxy'
    | 'dealer_market'
    | 'thinly_traded'
    | 'internal_only';
  lastLiquidityReviewDate?: string;
  linkedLedgerAccountId?: string;
  linkedDocumentIds?: string[];
  complianceTagIds?: string[];
  preciousMetalProfile?: {
    metalType?: 'gold' | 'silver' | 'platinum' | 'palladium' | 'mixed' | 'jewelry' | 'other';
    unitOfMeasure?: 'oz' | 'g' | 'kg' | 'piece' | 'bag' | 'lot' | 'other';
    quantity?: number;
    fineness?: string;
    hallmark?: string;
    storageLocation?: string;
    custodyReference?: string;
    itemIdentifiers?: string[];
    liquidationReadiness?: 'ready' | 'review' | 'restricted';
  };
  realEstateSecurityProfile?: {
    offeringStructure?: RealEstateOfferingStructure;
    rentalPoolEnabled?: boolean;
    exclusiveManagerEnabled?: boolean;
    guaranteedReturnOffered?: boolean;
    passiveProfitMarketing?: boolean;
    privatePlacementTargeted?: boolean;
    accreditedInvestorOnly?: boolean;
    occupancyRestrictionDaysPerYear?: number;
    securitiesRiskLevel?: 'low' | 'watch' | 'high';
    securitiesRiskNotes?: string;
    linkedComplianceTagIds?: string[];
  };
  notes?: string;
}

export interface WalletRecord {
  id: string;
  entityId: string;
  name: string;
  network: string;
  address: string;
  custodyType: CustodyType;
  connectionProvider?: WalletConnectionProvider;
  connectionStatus?: WalletConnectionStatus;
  executionSupport?: WalletExecutionSupport;
  executionNotes?: string;
  lastSyncAt?: string;
  linkedTreasuryAccountId?: string;
  linkedLedgerAccountId?: string;
  nativeAssetSymbol?: string;
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface DigitalAssetRecord {
  id: string;
  entityId: string;
  walletId?: string;
  name: string;
  symbol?: string;
  network?: string;
  assetSubtype: DigitalAssetSubtype;
  quantity: number;
  estimatedValue: number;
  basis?: number;
  classification: DigitalAssetClassification;
  custodyStatus: CustodyStatus;
  complianceStatus: ComplianceStatus;
  contractAddress?: string;
  tokenDecimals?: number;
  tokenId?: string;
  explorerUrl?: string;
  linkedLedgerAccountId?: string;
  linkedTokenIds?: string[];
  linkedDocumentIds?: string[];
  linkedComplianceTagIds?: string[];
}

export interface SmartContractPositionRecord {
  id: string;
  entityId: string;
  walletId?: string;
  name: string;
  network: string;
  protocolName?: string;
  contractAddress?: string;
  positionType:
    | 'staking'
    | 'lp'
    | 'vault'
    | 'escrow'
    | 'tokenized_instrument'
    | 'other';
  depositedAssetIds?: string[];
  estimatedValue?: number;
  status: 'active' | 'closed' | 'pending' | 'disputed';
  linkedTokenIds?: string[];
  linkedDocumentIds?: string[];
}

export interface InstrumentRecord {
  id: string;
  entityId: string;
  title: string;
  instrumentType: InstrumentType;
  legalIdentifier?: string;
  sourceClass?: 'note' | 'bond' | 'future' | 'collateral' | 'other';
  marketSector?: 'municipal' | 'corporate' | 'sovereign' | 'private' | 'other';
  identifierCode?: string;
  issuerName?: string;
  issuerEntityId?: string;
  counterpartyEntityId?: string;
  counterpartyLabel?: string;
  issueDate?: string;
  maturityDate?: string;
  denominationValue?: number;
  couponRate?: number;
  creditRating?: string;
  taxTreatment?: 'tax_exempt' | 'taxable' | 'private_activity_review' | 'other';
  liquidityProfile?:
    | 'exchange_traded_fund_proxy'
    | 'dealer_market'
    | 'thinly_traded'
    | 'internal_only';
  paymentMedium?: PaymentMediumClassification;
  obligationType?: ObligationType;
  pledgedCollateralValue?: number;
  reserveDepositEnabled?: boolean;
  linkedTreasuryAccountId?: string;
  liquidationDiscount?: number;
  performanceSecurityStatus?: 'none' | 'posted' | 'called' | 'released';
  issuanceStatus?: 'draft' | 'issued' | 'allocated' | 'pledged' | 'applied' | 'retired';
  applicationProfile?: {
    applicationType?:
      | 'reserve_support'
      | 'collateral_pledge'
      | 'performance_security'
      | 'purchase_funding'
      | 'settlement_support'
      | 'liquidity_bridge';
    applicationStatus?: 'not_applied' | 'ready' | 'active' | 'released' | 'retired';
    linkedObligationId?: string;
    linkedSettlementId?: string;
    linkedTreasuryAccountId?: string;
    linkedCollateralHoldingId?: string;
    applicationNotes?: string;
  };
  linkedTokenIds?: string[];
  linkedAssetIds?: string[];
  linkedDocumentIds?: string[];
  realEstateSecurityProfile?: {
    offeringStructure?: RealEstateOfferingStructure;
    rentalPoolEnabled?: boolean;
    exclusiveManagerEnabled?: boolean;
    guaranteedReturnOffered?: boolean;
    passiveProfitMarketing?: boolean;
    privatePlacementTargeted?: boolean;
    accreditedInvestorOnly?: boolean;
    occupancyRestrictionDaysPerYear?: number;
    securitiesRiskLevel?: 'low' | 'watch' | 'high';
    securitiesRiskNotes?: string;
    linkedComplianceTagIds?: string[];
  };
  notes?: string;
}

export interface ObligationRecord {
  id: string;
  entityId: string;
  title: string;
  linkedVendorId?: string;
  legalIdentifier?: string;
  obligationType: ObligationType;
  amount: number;
  paymentMedium: PaymentMediumClassification;
  status: 'open' | 'satisfied' | 'disputed' | 'defaulted';
  securedByAssetIds?: string[];
  linkedInstrumentIds?: string[];
  linkedDocumentIds?: string[];
  linkedSettlementIds?: string[];
  linkedRemittanceStatementIds?: string[];
  linkedCouponPresentmentIds?: string[];
  gainOrLossOnDischarge?: number;
  lifecycleStage?: ObligationLifecycleStage;
  lastPresentmentDate?: string;
  cureDeadline?: string;
  defaultBasis?: ObligationDefaultBasis;
  defaultNoticeDocumentId?: string;
  defaultDeclaredAt?: string;
  dischargedAt?: string;
  enforcementMemo?: string;
  recurringSchedule?: {
    enabled: boolean;
    frequency?: RecurrenceFrequency;
    interval?: number;
    nextDueDate?: string;
    autoCreatePresentment?: boolean;
    note?: string;
  };
}

export interface AuthorityRecord {
  id: string;
  entityId: string;
  personName: string;
  recordType: AuthorityRecordType;
  signerEmail?: string;
  signerPhone?: string;
  effectiveDate?: string;
  expirationDate?: string;
  clientAuthorizationStatus?: 'active' | 'limited' | 'revoked' | 'unknown';
  approvalStatus?: 'draft' | 'pending_acceptance' | 'accepted' | 'declined';
  acceptedAt?: string;
  acceptedBy?: string;
  linkedTokenIds?: string[];
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface OnChainTransactionRecord {
  id: string;
  entityId: string;
  walletId?: string;
  txHash: string;
  network: string;
  eventType: OnChainEventType;
  assetId?: string;
  linkedPaymentId?: string;
  linkedSettlementId?: string;
  linkedTransactionId?: string;
  timestamp: string;
  feeAmount?: number;
  feeAssetSymbol?: string;
  status: 'pending' | 'confirmed' | 'failed';
}

export interface TransactionRecord {
  id: string;
  entityId: string;
  type: TransactionType;
  title: string;
  amount: number;
  currency: string;
  date: string;
  status: 'draft' | 'posted' | 'pending' | 'failed';
  linkedLedgerAccountIds?: string[];
  linkedAssetIds?: string[];
  linkedDocumentIds?: string[];
  linkedWalletId?: string;
  linkedOnChainRecordId?: string;
  linkedSettlementId?: string;
  linkedPaymentIds?: string[];
  linkedJournalEntryIds?: string[];
  linkedTokenIds?: string[];
  counterpartyEntityId?: string;
  sharedTransferGroupId?: string;
  ledgerSide?: InterEntityLedgerSide;
  txHash?: string;
  notes?: string;
}

export interface InterEntityTransferRecord {
  id: string;
  transferGroupId: string;
  fromEntityId: string;
  toEntityId: string;
  fromTransactionId: string;
  toTransactionId: string;
  amount: number;
  currency: string;
  effectiveDate: string;
  settlementMode: InterEntitySettlementMode;
  status: 'draft' | 'posted' | 'settled';
  linkedEntityConnectionId?: string;
  linkedCreditRailId?: string;
  memo?: string;
}

export interface EntityConnectionRecord {
  id: string;
  ownerEntityId: string;
  connectionName: string;
  connectionType: EntityConnectionType;
  relationshipClass:
    | 'shared_control'
    | 'affiliate'
    | 'member_relationship'
    | 'business_partner'
    | 'user_to_user'
    | 'vendor_credit'
    | 'customer_credit'
    | 'other';
  status: EntityConnectionStatus;
  connectedEntityId?: string;
  connectedUserLabel?: string;
  connectedUserEmail?: string;
  connectedWorkspaceLabel?: string;
  authorityRecordIds?: string[];
  linkedDocumentIds?: string[];
  linkedTokenIds?: string[];
  defaultSettlementPath: SettlementPath;
  defaultCurrency: string;
  validationMode: 'strict' | 'standard' | 'manual_review';
  requireVerificationTokens: boolean;
  requireComplianceValidation: boolean;
  reserveBackedPreferred?: boolean;
  notes?: string;
}

export interface CreditRailRecord {
  id: string;
  ownerEntityId: string;
  entityConnectionId: string;
  railName: string;
  railType: CreditRailType;
  status: CreditRailStatus;
  settlementPath: SettlementPath;
  dischargeMethod: DischargeMethod;
  legalUsePosture?: RailLegalUsePosture;
  bankingOperationClass?: BankingOperationClass;
  identifierNamespace?: string;
  currency: string;
  exposureLimit?: number;
  outstandingExposure?: number;
  availableCredit?: number;
  linkedTreasuryAccountId?: string;
  linkedLedgerAccountId?: string;
  linkedDocumentIds?: string[];
  linkedTokenIds?: string[];
  autoMirrorIntercompanyEntries?: boolean;
  autoIssueTokens?: boolean;
  autoCreateNoteRemittance?: boolean;
  noteSettlementMode?: 'holder_presentment' | 'issuer_performance' | 'manual_review';
  holderRecordRequired?: boolean;
  reserveBacked?: boolean;
  notes?: string;
}

export interface NegotiableInstrumentRegisterRecord {
  id: string;
  entityId: string;
  instrumentId?: string;
  obligationId?: string;
  legalIdentifier: string;
  registerLabel: string;
  instrumentForm: NegotiableInstrumentForm;
  status: NegotiableInstrumentStatus;
  issueDate: string;
  maturityDate?: string;
  issuerEntityId: string;
  currentHolderEntityId?: string;
  currentHolderConnectionId?: string;
  currentHolderLabel?: string;
  backingCreditRailId?: string;
  backingTreasuryAccountId?: string;
  faceAmount: number;
  outstandingAmount: number;
  currency: string;
  linkedSettlementIds?: string[];
  linkedDocumentIds?: string[];
  linkedTokenIds?: string[];
  applicationSummary?: string;
  notes?: string;
}

export interface HolderLedgerEntryRecord {
  id: string;
  entityId: string;
  registerId: string;
  entryDate: string;
  entryType: HolderLedgerEntryType;
  holderEntityId?: string;
  holderConnectionId?: string;
  holderLabel: string;
  amount: number;
  currency: string;
  resultingBalance: number;
  linkedInstrumentId?: string;
  linkedObligationId?: string;
  linkedSettlementId?: string;
  linkedRemittanceStatementId?: string;
  applicationEventType?:
    | 'issuance'
    | 'allocation'
    | 'pledge'
    | 'reserve_deposit'
    | 'settlement_application'
    | 'release'
    | 'retirement';
  linkedDocumentIds?: string[];
  linkedTokenIds?: string[];
  notes?: string;
}

export interface DispatchRecord {
  id: string;
  entityId: string;
  title: string;
  subjectType: DispatchSubjectType;
  subjectId: string;
  linkedInstrumentId?: string;
  linkedObligationId?: string;
  linkedSettlementId?: string;
  linkedRemittanceStatementId?: string;
  recipientLabel: string;
  recipientEntityId?: string;
  recipientConnectionId?: string;
  recipientEmail?: string;
  method: DispatchMethod;
  status: DispatchStatus;
  acceptanceStatus: DispatchAcceptanceStatus;
  originalControlStatus: DispatchOriginalControlStatus;
  serviceEvidenceStatus: DispatchServiceEvidenceStatus;
  counselReviewStatus: DispatchCounselReviewStatus;
  dispatchDate: string;
  expectedResponseDate?: string;
  protestDeadline?: string;
  deliveredAt?: string;
  respondedAt?: string;
  externalReference?: string;
  governingLawLabel?: string;
  governingVenueLabel?: string;
  mailingLine?: string;
  proofSealCode?: string;
  qrPayload?: string;
  returnedEvidenceDocumentId?: string;
  linkedDocumentIds?: string[];
  linkedTokenIds?: string[];
  enforceabilityNotes?: string;
  notes?: string;
}

export interface SettlementRecord {
  id: string;
  entityId: string;
  linkedTransactionId: string;
  linkedPaymentId?: string;
  linkedEntityConnectionId?: string;
  linkedCreditRailId?: string;
  linkedJournalEntryIds?: string[];
  linkedReconciliationId?: string;
  linkedOnChainRecordId?: string;
  linkedInstrumentSettlementId?: string;
  linkedRemittanceStatementId?: string;
  path: SettlementPath;
  dischargeMethod?: DischargeMethod;
  direction: 'incoming' | 'outgoing';
  status: SettlementStatus;
  liquidCashStage: LiquidCashStage;
  verificationMethod: VerificationMethod;
  verificationStatus: VerificationStatus;
  verificationReference?: string;
  tokenizedProofId?: string;
  linkedTokenIds?: string[];
  grossAmount: number;
  settledAmount: number;
  currency: string;
  initiatedAt: string;
  expectedSettlementDate?: string;
  actualSettlementDate?: string;
  originSourceType?: 'bank_account' | 'ledger_account' | 'manual_remittance';
  originSourceId?: string;
  executionMode?: 'live' | 'staged';
  executionProvider?: 'plaid' | 'manual';
  payeeType?: 'bank_payee' | 'biller_direct' | 'manual_payee';
  liveExecution?: boolean;
  externalStatus?:
    | 'draft'
    | 'submitted'
    | 'accepted'
    | 'processing'
    | 'settled'
    | 'failed'
    | 'returned'
    | 'applied'
    | 'manual_review'
    | 'staged';
  executionRail?:
    | 'FedNow'
    | 'RTP'
    | 'Fedwire'
    | 'SameDayACH'
    | 'StandardACH'
    | 'LedgerRemittance'
    | 'None';
  processorStatus?:
    | 'queued'
    | 'processing'
    | 'settled'
    | 'requires_review'
    | 'blocked';
  executionReason?: string;
  executionReference?: string;
  fundsRightsClassification?: FundsRightsClassification;
  fundsApplicationClass?: FundsApplicationClass;
  vendorReceiveMethod?: VendorReceiveMethod;
  vendorDeliveryStatus?: VendorDeliveryStatus;
  externalRecognitionStatus?: ExternalRecognitionStatus;
  vendorDeliveryReference?: string;
  releasedAt?: string;
  releasedBy?: string;
  reserveBacked?: boolean;
  requiresManualReview?: boolean;
  autoReconcileStatus: AutoReconcileStatus;
  notes?: string;
}

export interface ComplianceTagRecord {
  id: string;
  entityId?: string;
  label: string;
  category:
    | 'entity'
    | 'asset'
    | 'digital_asset'
    | 'tax'
    | 'reporting'
    | 'jurisdiction'
    | 'risk'
    | 'authority';
  status: ComplianceStatus;
  dueDate?: string;
  jurisdiction?: string;
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface MunicipalDisclosureRecord {
  id: string;
  entityId: string;
  assetId?: string;
  instrumentId?: string;
  issuerName: string;
  identifierCode?: string;
  emmaUrl?: string;
  disclosureType:
    | 'official_statement'
    | 'continuing_disclosure'
    | 'material_event'
    | 'trade_liquidity_review';
  disclosureDate: string;
  filingDate?: string;
  status: 'current' | 'review' | 'stale' | 'missing';
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface MunicipalEventNoticeRecord {
  id: string;
  entityId: string;
  assetId?: string;
  instrumentId?: string;
  issuerName: string;
  identifierCode?: string;
  emmaUrl?: string;
  eventType:
    | 'rating_change'
    | 'default'
    | 'payment_delinquency'
    | 'tender_offer'
    | 'defeasance'
    | 'tax_opinion'
    | 'liquidity_event'
    | 'other';
  eventDate: string;
  severity: 'info' | 'watch' | 'critical';
  status: 'open' | 'reviewed' | 'closed';
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface KybReviewRecord {
  id: string;
  entityId: string;
  reviewType: 'cip' | 'kyb' | 'beneficial_ownership' | 'risk_refresh';
  status: 'pending' | 'in_review' | 'cleared' | 'restricted';
  reviewDate: string;
  nextReviewDate?: string;
  beneficialOwnerCount?: number;
  documentCoverage: 'complete' | 'partial' | 'missing';
  screeningStatus: 'clear' | 'watch' | 'hit' | 'not_run';
  linkedDocumentIds?: string[];
  linkedComplianceTagIds?: string[];
  notes?: string;
}

export interface WatchlistScreeningRecord {
  id: string;
  entityId?: string;
  subjectType: 'entity' | 'individual' | 'counterparty' | 'wallet';
  subjectLabel: string;
  screeningScope: 'ofac' | 'pep' | 'adverse_media' | 'multi';
  status: 'clear' | 'watch' | 'potential_match' | 'confirmed_match';
  screenedAt: string;
  nextScreeningDate?: string;
  providerLabel?: string;
  matchedListName?: string;
  disposition: 'pending_review' | 'escalated' | 'cleared' | 'reported';
  linkedDocumentIds?: string[];
  linkedCaseIds?: string[];
  notes?: string;
}

export interface AmlCaseRecord {
  id: string;
  entityId?: string;
  caseType: 'watchlist_review' | 'suspicious_activity' | 'currency_activity' | 'kyc_refresh';
  title: string;
  status: 'open' | 'under_review' | 'filed' | 'closed';
  priority: 'standard' | 'elevated' | 'critical';
  openedAt: string;
  dueDate?: string;
  linkedTransactionIds?: string[];
  linkedPaymentIds?: string[];
  linkedWatchlistScreeningIds?: string[];
  linkedKybReviewIds?: string[];
  linkedDocumentIds?: string[];
  filingPath?: 'SAR' | 'CTR' | 'internal_only';
  filingStatus?: 'not_started' | 'draft' | 'ready' | 'submitted';
  retentionUntil?: string;
  notes?: string;
}

export interface BankOnboardingChecklistItem {
  id: string;
  label: string;
  status: 'pending' | 'ready' | 'completed';
  linkedDocumentId?: string;
  notes?: string;
}

export interface DigitalAssetComplianceRecord {
  id: string;
  entityId: string;
  digitalAssetId: string;
  assetType: string;
  custodyModel: CustodyType;
  jurisdictionalRiskTag: string;
  taxTreatmentTag: string;
  securitiesCommodityPaymentFlag:
    | 'security'
    | 'commodity'
    | 'payment_token'
    | 'mixed'
    | 'unclassified';
  reportingRequirements: string[];
  counterpartyOrProtocolRisk: 'low' | 'medium' | 'high' | 'unknown';
  sourceOfFundsRecordStatus: 'complete' | 'partial' | 'missing' | 'unknown';
  notes?: string;
}

export interface DocumentRecord {
  id: string;
  entityId: string;
  title: string;
  category: DocumentCategory;
  date: string;
  status: 'draft' | 'final' | 'archived';
  templateKey?:
    | 'formation_packet'
    | 'signer_assignment'
    | 'banking_setup'
    | 'operating_agreement'
    | 'compliance_kickoff';
  outputStatus?: 'drafting' | 'review' | 'ready' | 'executed';
  generatedBody?: string;
  fileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  uploadedAt?: string;
  sourceFileId?: string;
  sourceRecordType?:
    | 'bill'
    | 'receipt'
    | 'document'
    | 'reconciliation'
    | 'coupon_presentment'
    | 'direct_deposit_request';
  sourceRecordId?: string;
  linkedAssetIds?: string[];
  linkedWalletIds?: string[];
  linkedTransactionIds?: string[];
  linkedInstrumentIds?: string[];
  linkedAuthorityRecordIds?: string[];
  linkedComplianceTagIds?: string[];
  linkedTokenIds?: string[];
  linkedSealUsageIds?: string[];
  vaultPath?: string;
  summary?: string;
  storageOwner?: DocumentStorageOwner;
  retentionClass?: DocumentRetentionClass;
  storageNotes?: string;
  externalStorageTarget?: DocumentExternalStorageTarget;
  externalStorageStatus?: DocumentExternalStorageStatus;
  externalStorageFileId?: string;
  externalStorageLabel?: string;
  externalStorageRoutedAt?: string;
}

export interface TokenRecord {
  id: string;
  entityId: string;
  subjectType: TokenSubjectType;
  subjectId: string;
  label: string;
  status: TokenStatus;
  tokenStandard?: string;
  network?: string;
  contractAddress?: string;
  tokenReference?: string;
  issuedAt: string;
  verifiedAt?: string;
  proofReference?: string;
  notes?: string;
}

export type EntityMarkPlacement =
  | 'signature_block'
  | 'seal_block'
  | 'letterhead'
  | 'dispatch_footer'
  | 'form_execution';

export type EntityMarkRailCode =
  | 'mark_reserve'
  | 'mailing_proof'
  | 'digital_liquidation'
  | 'cash_settlement'
  | 'tax_evidence';

export interface EntityMarkUsageRecord {
  id: string;
  entityId: string;
  documentId: string;
  usageDate: string;
  placement: EntityMarkPlacement;
  markLabel: string;
  unitsIssued: number;
  unitValue: number;
  totalValue: number;
  currency: string;
  proofSealCode?: string;
  qrPayload?: string;
  reserveTreasuryAccountId?: string;
  reserveAssetAccountId?: string;
  reserveEquityAccountId?: string;
  reserveAssetId?: string;
  digitalAssetId?: string;
  linkedTransactionId?: string;
  linkedJournalEntryId?: string;
  linkedTokenId?: string;
  appliedRails?: EntityMarkRailCode[];
  liquidationFocus?: 'none' | 'reserve_to_cash' | 'digital_asset_to_cash';
  status: 'recorded' | 'voided';
  notes?: string;
}

export interface AIWorkflowRecord {
  id: string;
  name: string;
  category:
    | 'legal'
    | 'financial'
    | 'compliance'
    | 'digital_asset'
    | 'operations';
  description: string;
  outputTypes: string[];
}

export interface DashboardSummary {
  entityCount: number;
  accountCount: number;
  assetCount: number;
  digitalAssetCount: number;
  walletCount: number;
  transactionCount: number;
  onChainTransactionCount: number;
  documentCount: number;
  complianceCount: number;
  totalAssetBookValue: number;
  totalDigitalAssetEstimatedValue: number;
  reviewItems: number;
}

export interface WorkspaceSettingsRecord {
  workspaceName: string;
  themeMode: WorkspaceThemeMode;
  baseCurrency: string;
  defaultCountry?: string;
  defaultJurisdiction?: string;
  defaultSettlementPath: SettlementPath;
  defaultInterEntitySettlementMode: InterEntitySettlementMode;
  autoIssueVerificationTokens: boolean;
  autoReconcileJournalEntries: boolean;
  requireDocumentLinksForSettlements: boolean;
  digitalAssetVerificationRequired: boolean;
  requireVerifiedVendorBankInstructions: boolean;
  achReleaseReviewThreshold: number;
  wireReleaseReviewThreshold: number;
  statementImportAbsoluteHoldThreshold: number;
  statementImportHighRiskKeywords: string[];
  supportEmail?: string;
  vaultRetentionPolicy: 'core_records_permanent' | 'seven_years' | 'custom';
  customRetentionNotes?: string;
  autoRouteUserOwnedDocumentsToDrive: boolean;
  preferredAccentColor?: string;
  eftpsEnabled?: boolean;
  eftpsEnrollmentStatus?: 'not_started' | 'pending_pin' | 'active' | 'restricted';
  eftpsEin?: string;
  eftpsOperatorName?: string;
  eftpsDepositMode?: 'manual_site' | 'ach_credit' | 'mixed';
  eftpsLastEvidenceDate?: string;
  eftpsLinkedTreasuryAccountId?: string;
  eftpsLinkedBankAccountId?: string;
  eftpsTaxLedgerAccountId?: string;
  uspsGatewayEnabled?: boolean;
  uspsGatewayStatus?: 'not_started' | 'setup_in_progress' | 'active' | 'restricted';
  uspsCrid?: string;
  uspsMailerId?: string;
  uspsPermitNumber?: string;
  uspsServiceProfile?: 'mailing_only' | 'postalone' | 'evs' | 'pdx' | 'mixed';
  uspsBusinessServiceAdmin?: string;
  uspsLinkedBankAccountId?: string;
  uspsPostageLedgerAccountId?: string;
  uspsEvidenceLedgerAccountId?: string;
}

export interface TreasuryAccountRecord {
  id: string;
  entityId: string;
  name: string;
  treasuryType: 'reserve' | 'operational_cash' | 'remittance_clearing' | 'instrument_pool';
  status: 'active' | 'restricted' | 'archived';
  currency: string;
  availableBalance: number;
  reservedBalance?: number;
  linkedLedgerAccountId?: string;
  originatingAuthority:
    | 'private_ledger_only'
    | 'bank_partner_required'
    | 'instrument_only'
    | 'hybrid';
  remittanceEnabled: boolean;
  linkedBankAccountId?: string;
  linkedObligationIds?: string[];
  notes?: string;
}

export interface BorrowingFacilityRecord {
  id: string;
  entityId: string;
  facilityName: string;
  facilityType: BorrowingFacilityType;
  status: BorrowingFacilityStatus;
  lenderName?: string;
  currency: string;
  commitmentAmount: number;
  drawnAmount: number;
  availableAmount?: number;
  interestRate?: number;
  maturityDate?: string;
  collateralRequirement?: string;
  linkedObligationIds?: string[];
  linkedTreasuryAccountId?: string;
  linkedLedgerAccountId?: string;
  linkedCollateralHoldingIds?: string[];
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface CollateralHoldingRecord {
  id: string;
  entityId: string;
  holdingLabel: string;
  status: CollateralHoldingStatus;
  collateralType: 'cash' | 'security' | 'bond' | 'digital_asset' | 'receivable' | 'other';
  marketValue: number;
  advanceRate?: number;
  lendableValue?: number;
  marginRequirement?: number;
  linkedAssetId?: string;
  linkedInstrumentId?: string;
  linkedBorrowingFacilityId?: string;
  linkedTreasuryAccountId?: string;
  liquidationPriority?: number;
  pledgedItemCount?: number;
  pledgedItemSummary?: string;
  pledgedItems?: Array<{
    label: string;
    quantity?: number;
    unitOfMeasure?: 'oz' | 'g' | 'kg' | 'piece' | 'bag' | 'lot' | 'other';
    identifier?: string;
    assetId?: string;
    metalType?: 'gold' | 'silver' | 'platinum' | 'palladium' | 'mixed' | 'jewelry' | 'other';
    liquidationStatus?: 'held' | 'allocated' | 'liquidating' | 'released';
  }>;
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface FuturesStrategyRecord {
  id: string;
  entityId: string;
  strategyName: string;
  strategyType: FuturesStrategyType;
  status: FuturesStrategyStatus;
  underlyingExposure: string;
  contractMarket?: string;
  contractCode?: string;
  positionSide: 'long' | 'short' | 'spread' | 'hedged';
  notionalExposure: number;
  marginPosted: number;
  realizedPnl?: number;
  unrealizedPnl?: number;
  linkedAssetIds?: string[];
  linkedBorrowingFacilityId?: string;
  linkedCollateralHoldingIds?: string[];
  linkedTreasuryAccountId?: string;
  linkedLedgerAccountIds?: string[];
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface LiquidationPlanRecord {
  id: string;
  entityId: string;
  planName: string;
  status: LiquidationPlanStatus;
  objective:
    | 'working_capital'
    | 'margin_support'
    | 'debt_paydown'
    | 'bond_purchase'
    | 'futures_margin'
    | 'general_cashflow';
  targetAmount: number;
  projectedNetProceeds?: number;
  linkedAssetIds?: string[];
  linkedDigitalAssetIds?: string[];
  linkedCollateralHoldingIds?: string[];
  linkedBorrowingFacilityIds?: string[];
  linkedFuturesStrategyIds?: string[];
  linkedTreasuryAccountId?: string;
  settlementPathPreference?: SettlementPath;
  liquidationMethod?: 'sale' | 'pledge_draw' | 'repo' | 'tokenized_liquidation' | 'manual_review';
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface InstrumentSettlementRecord {
  id: string;
  entityId: string;
  title: string;
  legalIdentifier?: string;
  instrumentId?: string;
  obligationId?: string;
  treasuryAccountId?: string;
  linkedSettlementId?: string;
  linkedTransactionId?: string;
  linkedDocumentIds?: string[];
  linkedTokenIds?: string[];
  dischargeMethod: DischargeMethod;
  recognitionBasis: 'obligation_recognized_before_cash' | 'cash_settled';
  performanceStatus: 'draft' | 'issued' | 'presented' | 'accepted' | 'performed' | 'disputed';
  faceAmount: number;
  performedAmount: number;
  currency: string;
  effectiveDate: string;
  dueDate?: string;
  sourceDepositStatus?: 'not_deposited' | 'deposited_to_reserve' | 'partially_performed';
  remittanceReference?: string;
  applicationStage?:
    | 'issued'
    | 'reserve_posted'
    | 'collateralized'
    | 'presented'
    | 'applied'
    | 'released';
  applicationSummary?: string;
  notes?: string;
}

export interface RemittanceStatementRecord {
  id: string;
  entityId: string;
  title: string;
  statementDate: string;
  payerName: string;
  payeeName: string;
  linkedVendorId?: string;
  amount: number;
  currency: string;
  dischargeMethod: DischargeMethod;
  treasuryAccountId?: string;
  linkedInstrumentSettlementId?: string;
  linkedSettlementId?: string;
  linkedObligationIds?: string[];
  linkedDocumentIds?: string[];
  micrLine?: {
    routingNumber?: string;
    accountNumberMask?: string;
    serialNumber?: string;
    mode: 'informational_only' | 'bank_backed';
  };
  status: 'draft' | 'issued' | 'accepted' | 'performed';
  notes?: string;
}

export interface CouponPresentmentRecord {
  id: string;
  entityId: string;
  title: string;
  couponReference?: string;
  linkedVendorId?: string;
  instrumentId?: string;
  obligationId?: string;
  instrumentSettlementId?: string;
  treasuryAccountId?: string;
  sourceBankAccountId?: string;
  sourceLedgerAccountId?: string;
  receiverName: string;
  receiverAccountLabel?: string;
  presentmentDate: string;
  dueDate?: string;
  amount: number;
  currency: string;
  dischargeMethod: DischargeMethod;
  sourceType: 'photo' | 'upload' | 'manual';
  status: 'draft' | 'presented' | 'accepted' | 'performed' | 'exception';
  linkedPaymentId?: string;
  linkedSettlementId?: string;
  linkedJournalEntryId?: string;
  linkedRemittanceStatementId?: string;
  linkedDocumentIds?: string[];
  linkedTokenIds?: string[];
  extractionSummary?: string;
  extractedReceiverName?: string;
  extractedAmount?: number;
  extractedDueDate?: string;
  notes?: string;
}

export interface MovementIdentifierRecord {
  id: string;
  entityId: string;
  railNamespace: RailNamespace;
  movementType:
    | 'payment'
    | 'return'
    | 'reclamation'
    | 'wire'
    | 'tax_report'
    | 'coupon_presentment';
  linkedPaymentId?: string;
  linkedSettlementId?: string;
  linkedRemittanceStatementId?: string;
  linkedCouponPresentmentId?: string;
  primaryIdentifier: string;
  secondaryIdentifier?: string;
  secCode?: string;
  traceNumber?: string;
  imad?: string;
  omad?: string;
  routingNumber?: string;
  effectiveDate?: string;
  returnDeadline?: string;
  status: 'draft' | 'active' | 'returned' | 'closed' | 'corrected';
  notes?: string;
}

export interface ReturnEventRecord {
  id: string;
  entityId: string;
  railNamespace: Extract<RailNamespace, 'commercial_ach' | 'federal_ach_green_book' | 'fedwire'>;
  linkedMovementIdentifierId: string;
  linkedPaymentId?: string;
  linkedSettlementId?: string;
  eventDate: string;
  code: string;
  reason: string;
  changeCode?: string;
  correctionStatus: 'pending' | 'corrected' | 'waived' | 'closed';
  status: 'open' | 'resolved' | 'exception';
  notes?: string;
}

export interface ReclamationEventRecord {
  id: string;
  entityId: string;
  railNamespace: 'treasury_check_gold_book';
  linkedMovementIdentifierId: string;
  linkedRemittanceStatementId?: string;
  reclamationDate: string;
  reclamationType:
    | 'forged_endorsement'
    | 'post_death'
    | 'material_alteration'
    | 'other';
  claimNumber?: string;
  status: 'open' | 'contested' | 'resolved';
  deadlineDate?: string;
  notes?: string;
}

export interface TaxReportingLinkRecord {
  id: string;
  entityId: string;
  railNamespace: 'irs_reporting';
  linkedPaymentId?: string;
  counterpartyName: string;
  tinLast4?: string;
  tinMatchStatus: 'not_checked' | 'matched' | 'mismatch' | 'pending';
  formType?: '1099-NEC' | '1099-MISC' | '1099-INT' | '1099-DIV' | 'other';
  filingChannel?: 'IRIS' | 'FIRE' | 'manual';
  tcc?: string;
  submissionId?: string;
  correctionStatus: 'none' | 'pending' | 'corrected';
  status: 'draft' | 'filed' | 'accepted' | 'corrected';
  notes?: string;
}

export interface BankFeedRuleRecord {
  id: string;
  entityId: string;
  bankAccountId?: string;
  name: string;
  merchantContains: string;
  direction: 'credit' | 'debit' | 'any';
  transactionType?: 'income' | 'expense' | 'deposit' | 'withdrawal';
  defaultLedgerAccountId?: string;
  counterpartyLabel?: string;
  memoTemplate?: string;
  minAmount?: number;
  maxAmount?: number;
  verificationMode: 'bank_confirmation' | 'internal_control_token' | 'manual_review';
  autoPost: boolean;
  autoReconcile: boolean;
  active: boolean;
}

export interface BankFeedEntryRecord {
  id: string;
  entityId: string;
  bankAccountId: string;
  sourceProvider: 'plaid' | 'manual';
  externalTransactionId: string;
  postedDate: string;
  description: string;
  merchantName?: string;
  amount: number;
  direction: 'credit' | 'debit';
  category?: string;
  importedAt: string;
  status: 'imported' | 'posted' | 'reconciled' | 'exception';
  matchedRuleId?: string;
  linkedTransactionId?: string;
  linkedJournalEntryId?: string;
  linkedReconciliationId?: string;
  linkedTokenIds?: string[];
  verificationStatus: VerificationStatus;
  notes?: string;
}


export interface CustomerRecord {
  id: string;
  entityId: string;
  name: string;
  email?: string;
  phone?: string;
  billingAddress?: string;
  status: 'active' | 'inactive';
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface VendorRecord {
  id: string;
  entityId: string;
  name: string;
  email?: string;
  phone?: string;
  remitAddress?: string;
  vendorSourceProfile?: {
    sourceId: string;
    sourceLabel: string;
    sourceType: 'directory_profile' | 'preset_profile' | 'manual_match';
    canonicalName?: string;
    locationId?: string;
    taxId?: string;
    publicProfileUrl?: string;
    matchedAt: string;
  };
  defaultExpenseAccountId?: string;
  status: 'active' | 'inactive';
  paymentInstructions?: {
    beneficiaryName?: string;
    bankName?: string;
    routingNumber?: string;
    routingMask?: string;
    accountNumber?: string;
    accountMask?: string;
    accountType?: 'checking' | 'savings' | 'business_checking' | 'other';
    railPreference?: 'ach' | 'eft' | 'wire';
    remittanceEmail?: string;
    digitalWalletAddress?: string;
    digitalWalletNetwork?: string;
    digitalAssetSymbol?: string;
    digitalPayoutTemplate?: 'stablecoin' | 'native_asset' | 'manual_confirmation';
    acceptedReceiveMethods?: VendorReceiveMethod[];
    defaultReceiveMethod?: VendorReceiveMethod;
    deliveryDescriptor?: string;
    verificationStatus?: 'unverified' | 'routing_valid' | 'verified' | 'invalid';
    lastValidatedAt?: string;
    storedInVault?: boolean;
  };
  counterpartyTermsProfile?: {
    organizationClass?:
      | 'general'
      | 'large_bank'
      | 'large_corporation'
      | 'utility'
      | 'government'
      | 'servicer';
    termsIntakeMode?: 'none' | 'auto_load' | 'upload_contract' | 'manual_reference';
    autoLoadedPreset?: 'bank_remittance' | 'utility_billing' | 'corporate_ap' | 'government_lockbox';
    remittanceApplicationRule?: string;
    returnInstrumentRule?: string;
    billingErrorProcess?: string;
    disputeResolutionPath?:
      | 'none'
      | 'notice_and_cure'
      | 'notice_mediation_arbitration'
      | 'notice_arbitration'
      | 'court_litigation';
    arbitrationForum?: 'aaa' | 'jams' | 'private_forum' | 'court_only' | 'unspecified';
    mediationStepPresent?: boolean;
    cureOfferRequired?: boolean;
    disputeNoticeDays?: number;
    disputeVenue?: string;
    arbitrationProcedureNotes?: string;
    linkedArbitrationPacketDocumentId?: string;
    contractExtractionSummary?: string;
    referenceLinks?: string[];
    escalationChannel?: string;
    linkedTermsDocumentId?: string;
    linkedAdminProcessDocumentId?: string;
    lastReviewedAt?: string;
  };
  creditLineProfile?: {
    enabled: boolean;
    facilityType?: 'revolving_trade' | 'term_vendor' | 'utility_credit' | 'service_contract';
    creditLimit?: number;
    startingAccountAmount?: number;
    currentBalance?: number;
    availableCredit?: number;
    autoAnnualizeFromBills?: boolean;
    lastActivityAt?: string;
    linkedObligationId?: string;
  };
  creditLineEntries?: Array<{
    id: string;
    entryDate: string;
    direction: 'debit_draw' | 'credit_paydown' | 'fee' | 'adjustment';
    amount: number;
    resultingBalance: number;
    linkedBillId?: string;
    linkedPaymentId?: string;
    linkedObligationId?: string;
    notes?: string;
  }>;
  linkedDocumentIds?: string[];
  notes?: string;
}

export interface InvoiceLineRecord {
  id: string;
  description: string;
  quantity: number;
  unitAmount: number;
  incomeAccountId?: string;
  taxCodeId?: string;
}

export interface InvoiceRecord {
  id: string;
  entityId: string;
  customerId: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate?: string;
  status:
    | 'draft'
    | 'issued'
    | 'sent'
    | 'partially_paid'
    | 'paid'
    | 'disputed'
    | 'void';
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  balanceDue: number;
  deliveryMethod: 'internal_user' | 'email' | 'export' | 'manual';
  deliveryStatus?: 'draft' | 'ready_to_send' | 'sent';
  sentAt?: string;
  viewedAt?: string;
  exportedAt?: string;
  lastPreviewedAt?: string;
  deliveryNotes?: string;
  deliveryJobId?: string;
  exportJobId?: string;
  recipientEmail?: string;
  internalDeliveryTarget?: string;
  paymentRailPreference?: 'ach' | 'wire' | 'card' | 'digital_asset' | 'manual';
  paymentInstructions?: string;
  paymentLinkLabel?: string;
  acceptsDigitalAssets?: boolean;
  verificationRequired?: boolean;
  defaultSettlementPath?: SettlementPath;
  brandingSnapshot?: {
    accentColor?: string;
    logoText?: string;
    footerNote?: string;
    headerStyle?: string;
  };
  linkedLineItems: InvoiceLineRecord[];
  linkedDocumentIds?: string[];
  linkedPaymentIds?: string[];
  linkedTransactionIds?: string[];
  linkedTokenIds?: string[];
  notes?: string;
}

export interface BillLineRecord {
  id: string;
  description: string;
  amount: number;
  expenseAccountId?: string;
  assetAccountId?: string;
  taxCodeId?: string;
}

export interface BillRecord {
  id: string;
  entityId: string;
  vendorId: string;
  billNumber?: string;
  issueDate: string;
  dueDate?: string;
  status:
    | 'draft'
    | 'entered'
    | 'approved'
    | 'partially_paid'
    | 'paid'
    | 'disputed'
    | 'void';
  currency: string;
  subtotal: number;
  taxAmount: number;
  totalAmount: number;
  balanceDue: number;
  linkedLineItems: BillLineRecord[];
  linkedReceiptIds?: string[];
  linkedDocumentIds?: string[];
  linkedPaymentIds?: string[];
  linkedTransactionIds?: string[];
  intakeStatus?: 'manual' | 'extracted' | 'needs_review' | 'failed';
  extractionSummary?: string;
  extractedVendorName?: string;
  extractedAmount?: number;
  extractedDueDate?: string;
  notes?: string;
}

export interface ReceiptRecord {
  id: string;
  entityId: string;
  vendorId?: string;
  receiptDate: string;
  totalAmount: number;
  currency: string;
  sourceType: 'upload' | 'photo' | 'email' | 'internal';
  fileName?: string;
  vaultPath?: string;
  status: 'unreviewed' | 'reviewed' | 'matched' | 'archived';
  linkedExpenseId?: string;
  linkedBillId?: string;
  linkedDocumentIds?: string[];
  intakeStatus?: 'manual' | 'extracted' | 'needs_review' | 'failed';
  extractionSummary?: string;
  extractedMerchantName?: string;
  extractedAmount?: number;
  extractedReceiptDate?: string;
  extractedCategoryHint?: string;
  notes?: string;
}

export interface ExpenseRecord {
  id: string;
  entityId: string;
  vendorId?: string;
  expenseDate: string;
  description: string;
  amount: number;
  currency: string;
  expenseAccountId?: string;
  paymentMethod?: 'cash' | 'bank' | 'card' | 'digital_asset' | 'other';
  reimbursementStatus?: 'none' | 'due' | 'submitted' | 'paid';
  receiptId?: string;
  linkedTransactionIds?: string[];
  status: 'draft' | 'submitted' | 'approved' | 'posted' | 'archived';
}

export interface PaymentRecord {
  id: string;
  entityId: string;
  direction: 'incoming' | 'outgoing';
  counterpartyType: 'customer' | 'vendor' | 'other';
  counterpartyId?: string;
  linkedEntityConnectionId?: string;
  linkedCreditRailId?: string;
  paymentDate: string;
  amount: number;
  currency: string;
  method:
    | 'ach'
    | 'wire'
    | 'check'
    | 'card'
    | 'cash'
    | 'internal_transfer'
    | 'digital_asset'
    | 'other';
  status: 'draft' | 'initiated' | 'settled' | 'failed' | 'reversed';
  linkedInvoiceIds?: string[];
  linkedBillIds?: string[];
  linkedTransactionIds?: string[];
  linkedSettlementId?: string;
  linkedWalletId?: string;
  linkedDigitalAssetId?: string;
  linkedOnChainTransactionId?: string;
  linkedDocumentIds?: string[];
  sourceBankAccountId?: string;
  sourceLedgerAccountId?: string;
  treasuryAccountId?: string;
  dischargeMethod?: DischargeMethod;
  approvalStatus?: 'not_required' | 'pending' | 'approved' | 'rejected';
  approvedBy?: string;
  approvedAt?: string;
  complianceConfirmationStatus?: 'not_required' | 'pending' | 'confirmed';
  complianceConfirmedBy?: string;
  complianceConfirmedAt?: string;
  complianceConfirmationNote?: string;
  releaseStatus?: 'not_applicable' | 'queued' | 'ready_to_release' | 'released';
  releasedBy?: string;
  releasedAt?: string;
  releaseTokenId?: string;
  fundsRightsClassification?: FundsRightsClassification;
  fundsApplicationClass?: FundsApplicationClass;
  settlementExecution?: {
    sourceType: 'bank_account' | 'ledger_account' | 'manual_remittance';
    executionMode?: 'live' | 'staged';
    executionProvider?: 'plaid' | 'manual';
    payeeType?: 'bank_payee' | 'biller_direct' | 'manual_payee';
    liveExecution?: boolean;
    externalStatus?:
      | 'draft'
      | 'submitted'
      | 'accepted'
      | 'processing'
      | 'settled'
      | 'failed'
      | 'returned'
      | 'applied'
      | 'manual_review'
      | 'staged';
    executionRail:
      | 'FedNow'
      | 'RTP'
      | 'Fedwire'
      | 'SameDayACH'
      | 'StandardACH'
      | 'LedgerRemittance'
      | 'None';
    processorStatus:
      | 'queued'
      | 'processing'
      | 'settled'
      | 'requires_review'
      | 'blocked';
    executionReason: string;
    executionReference?: string;
    fundsRightsClassification?: FundsRightsClassification;
    fundsApplicationClass?: FundsApplicationClass;
    vendorInstructionVerified?: boolean;
    simulatedProcessing?: boolean;
  };
  vendorReceiveMethod?: VendorReceiveMethod;
  deliveryStatus?: VendorDeliveryStatus;
  externalRecognitionStatus?: ExternalRecognitionStatus;
  recurringSchedule?: {
    enabled: boolean;
    frequency?: RecurrenceFrequency;
    interval?: number;
    nextRunDate?: string;
    autoPostEnabled?: boolean;
    note?: string;
  };
  notes?: string;
}

export interface EmployeeRecord {
  id: string;
  entityId: string;
  fullName: string;
  email: string;
  phone?: string;
  title?: string;
  department?: string;
  status: 'active' | 'onboarding' | 'inactive';
  employeeType: 'employee' | 'contractor' | 'officer';
  compensationType: 'salary' | 'hourly' | 'contract';
  paySchedule: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  annualSalary?: number;
  hourlyRate?: number;
  defaultHoursPerPeriod?: number;
  startDate?: string;
  linkedDocumentIds?: string[];
  directDepositRequestId?: string;
  notes?: string;
}

export interface DirectDepositAuthorizationRecord {
  id: string;
  entityId: string;
  employeeId: string;
  requestEmail: string;
  status: 'draft' | 'sent' | 'returned' | 'verified' | 'declined';
  formDeliveryMethod: 'email' | 'manual';
  requestedAt?: string;
  returnedAt?: string;
  verifiedAt?: string;
  requestTokenId?: string;
  linkedDocumentIds?: string[];
  routingLast4?: string;
  accountLast4?: string;
  accountType?: 'checking' | 'savings' | 'other';
  signatureName?: string;
  notes?: string;
}

export interface BankAccountRecord {
  id: string;
  entityId: string;
  institutionName: string;
  accountName: string;
  last4?: string;
  accountType: 'checking' | 'savings' | 'credit_card' | 'custodial' | 'other';
  currency: string;
  status: 'active' | 'inactive';
  currentBalance?: number;
  linkedLedgerAccountId?: string;
  linkedDocumentIds?: string[];
  onboardingStatus?: 'draft' | 'collecting' | 'ready' | 'submitted' | 'connected';
  onboardingChecklist?: BankOnboardingChecklistItem[];
  connectionType?:
    | 'plaid_connected'
    | 'manual_bank'
    | 'ledger_proxy'
    | 'external_provider_connected';
  liveFeedEnabled?: boolean;
  liveFeedStatus?: BankFeedConnectionStatus;
  liveConnectionProvider?: FinancialConnectionProvider;
  plaidItemId?: string;
  lastFeedSyncAt?: string;
  autoReconcileEnabled?: boolean;
  statementImportPolicy?:
    | 'review_all'
    | 'auto_post_all'
    | 'auto_post_credits_only'
    | 'auto_post_under_threshold';
  statementAutoPostThreshold?: number;
  routingNumber?: string;
  accountNumber?: string;
  achOriginationEnabled?: boolean;
  wireEnabled?: boolean;
  fundsRightsClassification?: FundsRightsClassification;
  connectedProfile?: {
    providerKey: FinancialConnectionProvider;
    providerLabel: string;
    connectionRail: FinancialConnectionRail;
    sourceInstitutionName?: string;
    externalAccountId?: string;
    externalCustomerId?: string;
    accountSubtypeLabel?: string;
    loginLabel?: string;
    persistentConnectionKey: string;
    supportsLiveSync: boolean;
    supportsTransactionImport: boolean;
    supportsSettlementInitiation: boolean;
    availabilityStatus: 'live' | 'profile_only' | 'bank_dependent';
    connectedAt: string;
    lastProviderSyncAt?: string;
  };
  checkDraftEnabled?: boolean;
  positivePayEnabled?: boolean;
  overdraftPolicy?: 'none' | 'bank_authorized' | 'controlled_sweep' | 'manual_review';
  }

export interface ReconciliationStatementLineRecord {
  id: string;
  postedDate: string;
  description: string;
  amount: number;
  direction: 'credit' | 'debit';
  rawAmountText?: string;
  reference?: string;
  matchStatus: 'unreviewed' | 'suggested' | 'matched' | 'exception';
  suggestedPaymentId?: string;
  suggestedTransactionIds?: string[];
  linkedJournalEntryId?: string;
  confidenceScore?: number;
  resolvedAt?: string;
  notes?: string;
}

export interface ReconciliationRecord {
  id: string;
  entityId: string;
  bankAccountId: string;
  periodStart: string;
  periodEnd: string;
  statementEndingBalance: number;
  clearedTransactionIds: string[];
  unmatchedTransactionIds?: string[];
  status: 'open' | 'in_review' | 'completed';
  statementFileName?: string;
  statementImportedAt?: string;
  statementImportId?: string;
  preparedBy?: string;
  reviewedBy?: string;
  closedAt?: string;
  closeJobId?: string;
  closeSummary?: string;
  exceptionNotes?: string;
  linkedDocumentIds?: string[];
  parsedStatementLines?: ReconciliationStatementLineRecord[];
  matchedStatementLineIds?: string[];
  unmatchedStatementLineIds?: string[];
  statementReviewStatus?: 'not_imported' | 'needs_review' | 'ready_to_close' | 'completed';
  closeApprovalStatus?: 'pending' | 'approved' | 'closed';
  controllerSignoffName?: string;
  controllerSignoffAt?: string;
  closeOverrideReason?: string;
  notes?: string;
}

export interface AccountingPeriodRecord {
  id: string;
  entityId: string;
  periodLabel: string;
  startDate: string;
  endDate: string;
  status: 'open' | 'soft_closed' | 'closed';
}

export interface JournalEntryRecord {
  id: string;
  entityId: string;
  entryNumber: string;
  entryDate: string;
  memo: string;
  debitAccount: string;
  creditAccount: string;
  amount: number;
  status: 'draft' | 'posted';
  source: 'manual' | 'system';
  linkedTransactionIds?: string[];
  linkedSettlementIds?: string[];
  autoReconcileStatus?: AutoReconcileStatus;
  linkedDocumentIds?: string[];
  verificationRequired?: boolean;
}

export interface CoreDataBundle {
  entities: EntityRecord[];
  entityMarkUsageRecords: EntityMarkUsageRecord[];
  entityConnections: EntityConnectionRecord[];
  creditRails: CreditRailRecord[];
  negotiableInstrumentRegisters: NegotiableInstrumentRegisterRecord[];
  holderLedgerEntries: HolderLedgerEntryRecord[];
  dispatchRecords: DispatchRecord[];
  customers: CustomerRecord[];
  vendors: VendorRecord[];
  invoices: InvoiceRecord[];
  bills: BillRecord[];
  receipts: ReceiptRecord[];
  expenses: ExpenseRecord[];
  payments: PaymentRecord[];
  employees: EmployeeRecord[];
  directDepositAuthorizations: DirectDepositAuthorizationRecord[];
  bankAccounts: BankAccountRecord[];
  reconciliations: ReconciliationRecord[];
  accountingPeriods: AccountingPeriodRecord[];
  journalEntries: JournalEntryRecord[];
  settlements: SettlementRecord[];
  treasuryAccounts: TreasuryAccountRecord[];
  borrowingFacilities: BorrowingFacilityRecord[];
  collateralHoldings: CollateralHoldingRecord[];
  futuresStrategies: FuturesStrategyRecord[];
  investmentActionPlans: InvestmentActionPlanRecord[];
  liquidationPlans: LiquidationPlanRecord[];
  instrumentSettlements: InstrumentSettlementRecord[];
  remittanceStatements: RemittanceStatementRecord[];
  couponPresentments: CouponPresentmentRecord[];
  movementIdentifiers: MovementIdentifierRecord[];
  returnEvents: ReturnEventRecord[];
  reclamationEvents: ReclamationEventRecord[];
  taxReportingLinks: TaxReportingLinkRecord[];
  ledgerAccounts: LedgerAccountRecord[];
  assets: AssetRecord[];
  wallets: WalletRecord[];
  digitalAssets: DigitalAssetRecord[];
  smartContractPositions: SmartContractPositionRecord[];
  instruments: InstrumentRecord[];
  obligations: ObligationRecord[];
  authorityRecords: AuthorityRecord[];
  onChainTransactions: OnChainTransactionRecord[];
  transactions: TransactionRecord[];
  interEntityTransfers: InterEntityTransferRecord[];
  complianceTags: ComplianceTagRecord[];
  municipalDisclosures: MunicipalDisclosureRecord[];
  municipalEventNotices: MunicipalEventNoticeRecord[];
  kybReviews: KybReviewRecord[];
  watchlistScreenings: WatchlistScreeningRecord[];
  amlCases: AmlCaseRecord[];
  digitalAssetCompliance: DigitalAssetComplianceRecord[];
  documents: DocumentRecord[];
  tokens: TokenRecord[];
  aiWorkflows: AIWorkflowRecord[];
  bankFeedRules: BankFeedRuleRecord[];
  bankFeedEntries: BankFeedEntryRecord[];
  workspaceSettings: WorkspaceSettingsRecord;
}






