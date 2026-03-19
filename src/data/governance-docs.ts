
export interface GovernanceDocument {
  title: string;
  content: string;
}

const iamPolicy = {
  title: 'Identity and Access Management (IAM) Policy',
  content: `Effective Date: February 1, 2026

This Identity and Access Management (IAM) Policy defines how Clear-Flow Integrated Financial Management, LLC ("Clear-Flow") controls and limits access to production systems, sensitive data, and internal resources.

1. Purpose
The purpose of this policy is to ensure that access to Clear-Flow systems and data is granted only to authorized individuals, services, and systems, based on business necessity and security principles.

2. Scope
This policy applies to all Clear-Flow production and non-production systems, applications, APIs, cloud infrastructure, and data assets, including systems that process consumer financial data.

3. Access Control Framework
Clear-Flow enforces a layered access control framework that includes:
- A defined and documented access control policy
- Role-Based Access Control (RBAC)
- Least-privilege access principles
- Segregation of duties where applicable

4. Identity and Authentication
Clear-Flow utilizes centralized identity and access management solutions to authenticate users and systems. Authentication mechanisms may include federated identity providers, OAuth-based authentication, and secure credential management.

5. Privileged and Production Access
Access to production systems and sensitive data is restricted to authorized personnel only. Privileged access is logged, monitored, and reviewed periodically. Access is revoked promptly upon role change or termination.

6. Periodic Access Reviews
Clear-Flow conducts periodic access reviews to validate that user and system access remains appropriate. Reviews are performed in accordance with operational requirements and risk assessments.

7. Non-Human Access
Service-to-service authentication and non-human access utilize secure mechanisms such as OAuth tokens, API keys, and TLS certificates. Secrets are stored securely and rotated as appropriate.

8. Zero Trust Principles
Clear-Flow applies zero trust access principles, requiring authentication, authorization, and validation for all access requests, regardless of network location.

9. Enforcement and Review
Compliance with this policy is enforced through technical controls and operational procedures. This policy is reviewed periodically and updated to reflect changes in technology, risk, and business needs.

Approved by: Governing Managers
Organization: Clear-Flow Integrated Financial Management, LLC`
};

const securityPolicy = {
  title: 'Information Security Policy & Procedures',
  content: `Effective Date: Feb. 1, 2026

1. PURPOSE
This Information Security Policy establishes the principles, controls, and procedures used by Clear-Flow Integrated Financial Management, LLC (“Clear-Flow”) to protect the confidentiality, integrity, and availability of information processed, stored, or transmitted through the Clear.Flow platform. Clear-Flow operates as a software, infrastructure, and record-keeping provider. This policy is designed to identify, mitigate, and monitor information security risks appropriate to that role.

2. SCOPE
This policy applies to:
• All Clear-Flow systems, applications, APIs, and environments
• All data processed or stored by the Clear.Flow platform
• All officers, managers, members, contractors, and authorized users
• All third-party service providers and integrations

3. GOVERNANCE & RESPONSIBILITY
Clear-Flow maintains defined accountability for information security oversight.
• Security Oversight: Designated by management
• Policy Ownership: Governing Managers
• Operational Enforcement: Authorized officers and technical administrators
Security responsibilities are reviewed periodically and adjusted as the organization scales.

4. RISK MANAGEMENT
Clear-Flow identifies and manages information security risks through:
• System architecture review
• Integration and vendor risk evaluation
• Access control review
• Monitoring of operational and security events
Risks are assessed based on likelihood and potential impact and addressed through administrative, technical, or procedural controls.

5. ACCESS CONTROL
• Role-based access control (RBAC) is enforced
• Least-privilege principles are applied
• Access is granted only to authorized users
• Administrative access is restricted and logged
• Access is reviewed upon role change or termination

6. DATA PROTECTION
• Data is encrypted in transit using TLS or equivalent secure protocols
• Sensitive data is encrypted at rest where applicable
• Cryptographic keys are protected and access-controlled
• Data retention is limited to operational and legal requirements

7. AUTHENTICATION & AUTHORIZATION
• Secure authentication mechanisms are required for system access
• Multi-factor authentication is implemented where feasible
• Authorization is enforced at the application and API levels

8. LOGGING, MONITORING & AUDITABILITY
• System access and significant actions are logged
• Logs are protected from unauthorized modification
• Audit trails support operational review and compliance needs
• Monitoring is used to identify anomalous or unauthorized activity

9. INCIDENT MANAGEMENT
Clear-Flow maintains procedures to:
• Identify security incidents
• Escalate incidents to appropriate personnel
• Contain and remediate issues
• Document incidents and corrective actions
Incidents are reviewed to improve controls and prevent recurrence.

10. VENDOR & INTEGRATION SECURITY
• Third-party services are evaluated prior to integration
• Integrations are limited to necessary permissions
• Data sharing is governed by contractual and technical controls

11. POLICY REVIEW & MAINTENANCE
This policy is reviewed periodically and updated as necessary to reflect:
• Changes in technology
• New integrations or services
• Evolving security risks
• Regulatory or contractual expectations

12. COMPLIANCE
Failure to comply with this policy may result in access revocation, disciplinary action, or termination of contractual relationships.

Approved by: Governing Managers
Organization: Clear-Flow Integrated Financial Management, LLC`
};

const operatingAgreement = {
  title: 'Operating Agreement',
  content: `This Operating Agreement (the “Agreement”) is entered into and effective as of the date of execution by the Members (the “Effective Date”), by and among the undersigned Members of Clear-Flow Integrated Financial Management, LLC, a limited liability company organized under the laws of the State of Delaware (the “Company”).

ARTICLE I — FORMATION, STATUS & DEFINITIONS
Section 1.00 — Definitions
For purposes of this Agreement, the following terms shall have the meanings set forth below:
• “Act” means the Delaware Limited Liability Company Act, as amended.
• “Charter” means the Foundational Governance, Authority & Operations Charter of Clear-Flow.
• “Clear.Flow Platform” means the proprietary software, systems, APIs, ledgers, logic, and infrastructure operated by the Company.
• “Governing Managers” means the Managers acting collectively as the Company’s governing authority.
• “Intellectual Property” includes all code, schemas, architectures, documentation, workflows, trade secrets, and derivative works.
Section 1.01 — Formation
The Company was formed as a limited liability company pursuant to the Delaware Limited Liability Company Act (the “Act”) by the filing of a Certificate of Formation with the Delaware Secretary of State.
Section 1.02 — Name
The name of the Company is Clear-Flow Integrated Financial Management, LLC. The Company may conduct business under the trade name Clear.Flow or Clear-Flow.
Section 1.03 — Principal Office
The principal office of the Company shall be located at such place as the Managers may determine from time to time.
Section 1.04 — Term
The Company shall continue in perpetuity unless dissolved in accordance with this Agreement or applicable law.

ARTICLE II — PURPOSE, SCOPE & AUTHORITY
Section 2.01 — Purpose
The purpose of the Company is to design, develop, operate, license, and maintain software platforms, infrastructure, and systems for financial management, ledgering, clearing and settlement orchestration, compliance automation, fiduciary performance verification, and related lawful activities.
Section 2.02 — Lawful Authority
The Company may engage in any lawful activity permitted to limited liability companies under the Act and applicable law, whether or not such activity is specifically described herein.
Section 2.03 — Regulatory Posture
The Company operates as a technology, infrastructure, and record-keeping provider and does not act as a bank, depository institution, lender of record, or money services business unless separately licensed or expressly contracted as such.

ARTICLE III — MEMBERS
Section 3.01 — Members
The Company shall have five (5) Members, whose names, ownership interests, and capital accounts are reflected in the Company’s records.
Section 3.02 — Limited Liability
No Member shall be personally liable for the debts, obligations, or liabilities of the Company solely by reason of being a Member.
Section 3.03 — Capital Contributions
Initial and additional capital contributions, if any, shall be determined by the Members and recorded in the Company’s books.

ARTICLE IV — MANAGEMENT, CONTROL & DECISION AUTHORITY
Section 4.01 — Manager-Managed Structure
The Company is a manager-managed limited liability company. Management of the Company is vested in the Managers.
Section 4.02 — Managers
The Company shall be managed by five (5) Managers (the “Governing Managers”), who may also be Members. Collectively, the Managers constitute the Company’s Governing Council.
Section 4.03 — Authority of Managers
The Managers have full, exclusive, and complete authority to manage and control the business and affairs of the Company, including but not to:
- Setting strategic direction and platform governance
- Approving system architecture, APIs, and integrations
- Authorizing financial rails, settlement methods, and compliance frameworks
- Protecting, licensing, and enforcing intellectual property
- Appointing and removing officers
- Entering into contracts and agreements
Section 4.04 — Fiduciary Duties
Managers shall act in good faith, with reasonable care, and in a manner reasonably believed to be in the best interests of the Company.
Section 4.05 — Reliance on Records
Managers may rely on Company records, ledgers, cryptographic attestations, audit logs, and officer reports as accurate representations of Company activity.

ARTICLE V — INCORPORATION OF FOUNDATIONAL CHARTER
Section 5.01 — Charter Incorporated by Reference
The Foundational Governance, Authority & Operations Charter of Clear-Flow (the “Charter”) is hereby incorporated by reference into this Agreement.
Section 5.02 — Governing Effect
The Charter shall govern matters of mission, platform authority, system architecture, fiduciary posture, intellectual property, and internal governance philosophy. In the event of a conflict between this Agreement and the Charter, this Agreement shall control solely to the extent required by mandatory provisions of applicable law.

ARTICLE VI — OFFICERS
Section 6.01 — Officers
The Managers may appoint officers including, but not to, a Chief Executive Officer, Chief Technology Officer, Chief Compliance Officer, Treasurer, and Secretary.
Section 6.02 — Authority of Officers
Officers shall have such authority and responsibilities as delegated by the Managers.

ARTICLE VII — RECORDS, LEDGERS & ACCOUNTING AUTHORITY
Section 7.01 — Records
The Company shall maintain complete and accurate records, including financial ledgers, operating logs, and compliance documentation.
Section 7.02 — Accounting Method
The Company shall use an accounting method determined by the Managers, consistent with applicable law.

ARTICLE VIII — LIABILITY SHIELD, INDEMNIFICATION & RISK ALLOCATION
Section 8.01 — Limitation of Liability
To the fullest extent permitted by law, no Member, Manager, or Officer shall be liable for monetary damages arising from Company activities, except in cases of fraud or willful misconduct.
Section 8.02 — Indemnification
The Company shall indemnify Members, Managers, Officers, employees, and agents against claims arising from good-faith performance of Company duties.

ARTICLE IX — DISSOLUTION
Section 9.01 — Dissolution Events
The Company may be dissolved upon:
- Unanimous consent of the Members
- Entry of a decree of judicial dissolution
- Any other event requiring dissolution under applicable law
Section 9.02 — Winding Up
Upon dissolution, the Managers shall wind up the Company’s affairs in accordance with the Act.

ARTICLE X — AMENDMENTS, SEVERABILITY & SUPREMACY
This Agreement may be amended by majority vote of the Governing Managers, unless a higher threshold is required by the Act or expressly stated herein.
Section 10.02 — Severability
If any provision of this Agreement is held invalid or unenforceable, such provision shall be severed and the remaining provisions shall remain in full force and effect.
Section 10.03 — Supremacy & Integration
This Agreement, together with the Charter incorporated by reference, constitutes the entire agreement governing the Company. In the event of conflict, this Agreement controls solely to the extent required by mandatory law; otherwise, the Charter governs platform authority, architecture, and fiduciary posture.

ARTICLE XI — CONFIDENTIALITY, NON-CIRCUMVENTION & SURVIVAL
Section 11.01 — Confidentiality
Members, Managers, and Officers shall maintain the confidentiality of all non-public Company information, including platform logic, ledgers, security architecture, and business strategy.
Section 11.02 — Non-Circumvention
No Member, Manager, or Officer shall knowingly circumvent the Company, the Clear.Flow Platform, or the Governing Managers in connection with opportunities, integrations, or transactions arising from Company activity.
Section 11.03 — Survival
Provisions relating to intellectual property, confidentiality, indemnification, limitation of liability, and governing authority shall survive withdrawal, dissolution, or termination.

EXECUTION
IN WITNESS WHEREOF, the undersigned Members have executed this Operating Agreement as of the Effective Date.

Member Signatures:
Member
Member
Member
Member
Member`
};

const foundationalCharter = {
  title: 'Foundational Governance, Authority & Operations Charter',
  content: `Plain‑Language Intent Statement
Clear-Flow is intentionally structured as a private, lawful, technology‑driven corporation whose purpose is to design, operate, and license financial infrastructure, record‑keeping systems, and fiduciary automation tools. This document is written in affirmative, constructive, and modern language, describing what Clear.Flow does, is authorized to do, and protects, without negative presumptions or implied prohibitions.

ARTICLE I — NAME & FORM
Section 1.01 — Name
The name of the corporation is Clear-Flow Integrated Financial Management, LLC (the “Company”).
Section 1.02 — Corporate Form
Clear-Flow is a for‑profit private limited liability company (LLC), organized to operate domestically within the United States and internationally through lawful private contract, commercial agreement, and licensed integration.

ARTICLE II — PURPOSE, SCOPE & AUTHORITY
Section 2.01 — Core Purpose
The Corporation exists to design, develop, operate, license, and maintain integrated systems that enable the secure creation, administration, settlement, reconciliation, and governance of:
• Financial ledgers and accounting systems
• Clearing and settlement orchestration (internal, ACH, wire, and future rails)
• Digital identity, cryptographic authorization, and record attestation
• Private lending, investment tracking, collateral management, and interest accounting
• Fiduciary duty automation and performance verification
All such activities are conducted as software, infrastructure, record‑keeping, and administrative services, not as a depository institution unless separately licensed.
Section 2.02 — Lawful Authority
The Corporation is authorized to engage in any lawful activity permitted to private corporations under:
• Applicable United States federal law
• Applicable state commercial and corporate statutes
• International commercial and contract law
• Principles of equity, private ordering, and freedom of contract
Section 2.03 — Regulatory Posture
Clear.Flow is structured to operate in compliance with applicable commercial, consumer, and financial regulations, including those governing payment rails, data security, and record‑keeping, without assuming the role of a regulated bank, depository, or lender of record, unless explicitly licensed or contracted as such. The Corporation may integrate with regulated institutions, sponsors, processors, and authorities as a technology and record‑keeping provider, while retaining internal sovereignty over its software, ledgers, and governance systems.
Section 2.04 — Unlimited Transaction Capability
Subject to lawful use and contractual terms, Clear.Flow systems may support any form of transaction, obligation, settlement, investment, or value exchange authorized by private agreement between users, without artificial limitation as to transaction type, structure, or economic model.

ARTICLE III — JURISDICTION, GOVERNING LAW & VENUE
Section 3.01 — Jurisdictional Neutrality
The Corporation affirms that:
• It operates primarily by private contract and software license
• Jurisdictional authority is invoked only as required for filing, compliance, dispute resolution, or remedy
Section 3.02 — Governing Law (Default)
Unless otherwise agreed in writing, corporate governance matters shall be governed by the law of the state of incorporation. Client agreements, licenses, and commercial contracts may specify:
• Governing law
• Arbitration, mediation, or court venue
• International or cross‑border frameworks
Section 3.03 — Dispute Resolution Preference
Clear.Flow favors private resolution, including:
• Good‑faith negotiation
• Mediation
• Binding arbitration
Judicial remedies are reserved for enforcement or where private resolution is unavailable.

ARTICLE IV — GOVERNING MANAGERS
Section 4.01 — Composition
The Corporation shall be governed by a Governing Council of five (5) Managers.
Section 4.02 — Authority of the Board
The Governing Managers, acting collectively, hold full and exclusive authority to:
• Set corporate strategy and mission alignment
• Approve platforms, APIs, and system architecture
• Authorize financial rails, integrations, and compliance frameworks
• Approve internal credit, lending, and investment structures
• Protect and license intellectual property
• Appoint and remove officers
Section 4.03 — Fiduciary Standard
Managers shall act:
• In good faith
• With reasonable care
• In loyalty to the Corporation’s purpose
• With an affirmative duty to preserve system integrity, user trust, and lawful operation
Section 4.04 — Reliance on Records
Managers may rely fully on:
• Corporate ledgers
• Audit logs
• Cryptographic records
• Officer reports as accurate representations of corporate activity.

ARTICLE V — OFFICERS
Section 5.01 — Officers
The Governing Managers may appoint Officers including, but not to:
• Chief Executive Officer
• Chief Technology Officer
• Chief Compliance Officer
• Treasurer
• Secretary
Section 5.02 — Authority
Officers are empowered to execute day‑to‑day operations consistent with Board policy and this document.

ARTICLE VI — CLIENT RELATIONSHIPS & USERS
Section 6.01 — Nature of Relationship
Clients, users, and entities utilizing Clear.Flow systems do so under private contractual license, not as depositors or beneficiaries of the Corporation.
Section 6.02 — Client Autonomy
Clients retain full responsibility and authority over:
• Their financial decisions
• Their obligations and transactions
• Their compliance with applicable laws
Clear.Flow provides infrastructure, automation, and records, not financial advice unless separately contracted.
Section 6.03 — Ledger Authority
Ledgers generated within Clear.Flow constitute authoritative records for the parties using them, subject to contractual terms.

ARTICLE VII — LIABILITY & INDEMNIFICATION
Section 7.01 — Limitation of Liability
To the fullest extent permitted by law, the Corporation shall not be liable for indirect, consequential, or speculative damages arising from lawful use of its systems.
Section 7.02 — Indemnification
The Corporation shall indemnify Directors, Officers, employees, and authorized agents against claims arising from good‑faith performance of their duties.
Section 7.03 — Client Indemnity
Clients agree to indemnify the Corporation against claims arising from:
• Their transactions
• Their use of the system
• Their contractual relationships with third parties

ARTICLE VIII — RECORDS, DATA & PRIVACY
Section 8.01 — Data Ownership
All data remains the property of the originating entity, subject to license and processing permissions.
Section 8.02 — Security
Clear.Flow employs:
• Encryption
• Role‑based access
• Cryptographic signatures
• Segmented architecture
Section 8.03 — Disclosure
Data is disclosed only:
• By user authorization
• By lawful requirement
• For system operation and compliance

ARTICLE IX — INTELLECTUAL PROPERTY
Section 9.01 — Ownership
All code, schemas, logic, and documentation are the exclusive property of Clear-Flow Integrated Financial Management, LLC
Section 9.02 — Licensing
Users receive limited, revocable, non‑transferable licenses.
Section 9.03 — Trade Secrets
Internal algorithms, reconciliation logic, and compliance engines are protected trade secrets.

ARTICLE X — AMENDMENTS
This Charter may be amended by majority vote of the Governing Managers, subject to the Operating Agreement of the Company.

CLOSING AFFIRMATION
Clear-Flow is established as a constructive, transparent, and lawful financial infrastructure company, designed to empower private and commercial entities through clarity of records, integrity of flow, and excellence in fiduciary automation.

INCORPORATION BY REFERENCE
This Foundational Governance, Authority & Operations Charter is adopted by Clear-Flow Integrated Financial Management, LLC as an authoritative statement of mission, scope, system governance, and fiduciary posture. This Charter is hereby incorporated by reference into, and made supplemental to, the Company’s Operating Agreement, and shall govern matters of platform authority, architectural control, intellectual property, system integrity, and fiduciary automation, except where superseded by mandatory provisions of applicable law or the Operating Agreement.`
};

const dataRetentionPolicy = {
  title: 'Data Retention and Deletion Policy',
  content: `Effective Date: February 1, 2026

This Data Retention and Deletion Policy describes how Clear-Flow Integrated Financial Management, LLC ("Clear-Flow") manages the retention, review, and deletion of data processed through the Clear.Flow platform.

1. Purpose
The purpose of this policy is to ensure that consumer and client data is retained only for as long as necessary to support legitimate business, legal, and contractual requirements, and is securely deleted or de-identified when no longer required.

2. Scope
This policy applies to all consumer data, client data, and system records processed, stored, or transmitted by Clear-Flow systems, including data received through third-party integrations such as Plaid.

3. Data Retention Principles
- Data is retained only for defined operational, legal, regulatory, or contractual purposes.
- Retention periods are determined based on business necessity and applicable laws.
- Clear-Flow does not retain consumer financial data longer than required for the authorized purpose.

4. Data Deletion Procedures
Clear-Flow implements administrative and technical controls to securely delete or deidentify data when:
- A user requests deletion, subject to legal or contractual obligations
- An account is closed or terminated
- Data is no longer required for its original purpose
Deletion methods include secure erasure, logical deletion, or cryptographic destruction, as appropriate.

5. Enforcement and Review
This policy is enforced through access controls, system design, and operational procedures. Compliance with this policy is reviewed periodically by management and updated as necessary to reflect changes in law, technology, or business operations.

6. Compliance
This policy is designed to support compliance with applicable data privacy and protection laws and contractual obligations. Failure to adhere to this policy may result in corrective action.

Approved by: Governing Managers
Organization: Clear-Flow Integrated Financial Management, LLC`
};

const mfaAuthPolicy = {
  title: 'Authentication & MFA Documentation (Google OAuth)',
  content: `Organization: Clear-Flow Integrated Financial Management, LLC

Overview
Clear-Flow secures user access to its web and application interfaces using Google OAuth 2.0 as the primary authentication mechanism prior to exposing sensitive workflows, including third-party integrations such as Plaid Link. Google OAuth provides multi-factor authentication (MFA) by leveraging Google’s identity platform, which enforces MFA based on user configuration and risk signals.

Authentication Flow
1. Users authenticate to the Clear.Flow platform using Google OAuth.
2. Google verifies the user’s identity using password authentication and secondary factors where enabled.
3. Google issues a secure OAuth token upon successful authentication.
4. Clear-Flow validates the token server-side.
5. Plaid Link is surfaced only after successful authentication.

MFA Characteristics
- MFA is provided through Google’s identity infrastructure.
- MFA methods may include authenticator apps, device approvals, or SMS.
- MFA enforcement is risk-based and user-configurable.
- Clear-Flow does not store user passwords.

Security Controls
- TLS encryption for all authentication traffic.
- Server-side token validation.
- Limited session scope.
- Authentication events logged for auditability.

Classification
MFA Provided: Yes
Phishing-Resistant MFA: Not claimed
Authentication Provider: Google OAuth 2.0
Applies Before Plaid Link Exposure: Yes

Approved by: Governing Managers`
};

const mfaSystemsPolicy = {
  title: 'MFA for Critical Systems Documentation',
  content: `Organization: Clear-Flow Integrated Financial Management, LLC

Purpose
This document describes the multi-factor authentication (MFA) controls implemented by Clear-Flow to protect access to critical systems that store or process consumer financial data.

Scope
This documentation applies to all production systems, administrative interfaces, and environments that store, process, or access consumer financial data within the Clear.Flow platform.

MFA Enforcement
Clear-Flow enforces MFA for access to critical systems through Google OAuth 2.0–based authentication and role-based access controls (RBAC). Access to production systems and sensitive data is restricted to authorized personnel only. MFA is required for:
- Administrative access to production environments
- Privileged system and database access
- Access to systems processing consumer financial data
- Management of integrations and credentials

Authentication Mechanism
- Authentication is performed using Google OAuth 2.0
- MFA is enforced through Google’s identity infrastructure
- Secondary authentication factors may include authenticator applications, device-based approvals, or SMS, depending on the user’s Google account configuration
- Clear-Flow does not store user passwords

Security Controls
- TLS encryption for all authentication and access traffic
- Server-side token validation and authorization checks
- Role-based access enforcement and least-privilege principles
- Logging and monitoring of access to critical systems

Audit & Review
Access rights to critical systems are reviewed periodically and upon role changes or termination. Authentication and access events are logged to support auditability and incident response.

Classification
MFA in Place for Critical Systems: Yes
Phishing-Resistant MFA: Not claimed
Authentication Provider: Google OAuth 2.0

Approved by: Governing Managers`
};

const encryptionPolicy = {
  title: 'Data Encryption At-Rest Documentation',
  content: `Organization: Clear-Flow Integrated Financial Management, LLC

Purpose
This document describes the controls used by Clear-Flow to protect consumer data received from the Plaid API when stored or processed at rest.

Scope
This documentation applies to all systems, databases, storage services, and environments that store or process consumer financial data received via the Plaid API within the Clear.Flow platform.

Encryption At Rest
Clear-Flow encrypts consumer data at rest using industry-standard encryption mechanisms appropriate to the storage technology in use. Data received from the Plaid API is encrypted when stored in databases, file systems, or other persistent storage layers. Encryption applies to:
- Consumer financial data received from the Plaid API
- Account, transaction, and metadata records
- System backups and snapshots where applicable

Key Management
- Encryption keys are protected and access-controlled
- Access to encryption keys is restricted to authorized systems and personnel
- Key handling follows least-privilege principles

Security Controls
- Encryption at rest is enforced at the storage or database layer
- Role-based access controls restrict access to encrypted data
- Administrative access to data stores is logged and monitored
- Secure deletion practices are applied when data is no longer required

Monitoring & Review
Encryption configurations and access controls are reviewed periodically and updated as the platform evolves to address new risks and requirements.

Classification
Data encrypted at rest: Yes
Applies to Plaid API consumer data: Yes
Encryption type: Industry-standard at-rest encryption

Approved by: Governing Managers`
};


export const GOVERNANCE_DOCUMENTS: GovernanceDocument[] = [
  operatingAgreement,
  foundationalCharter,
];

export const SECURITY_DOCUMENTS: GovernanceDocument[] = [
  iamPolicy,
  securityPolicy,
  dataRetentionPolicy,
  mfaAuthPolicy,
  mfaSystemsPolicy,
  encryptionPolicy
];

// Combine all documents into a single string for the Gemini API context
const allDocuments = [...GOVERNANCE_DOCUMENTS, ...SECURITY_DOCUMENTS];
export const GOVERNANCE_DOCUMENTS_RAW: string = allDocuments
  .map(doc => `DOCUMENT: "${doc.title}"\n\n${doc.content}`)
  .join('\n\n---\n\n');
