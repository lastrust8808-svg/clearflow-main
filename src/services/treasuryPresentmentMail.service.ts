import type { CoreDataBundle, InstrumentRecord, NegotiableInstrumentRegisterRecord } from '../types/core';

export interface TreasuryPresentmentMailTodo {
  id: string;
  entityId: string;
  entityLabel: string;
  instrumentId?: string;
  registerId?: string;
  title: string;
  legalIdentifier?: string;
  amount: number;
  status: 'needs_packet' | 'ready_to_mail' | 'sent_waiting_evidence' | 'delivered_waiting_response';
  recipientLabel: string;
  nextStep: string;
  checklist: string[];
  coverLetterTitle: string;
  coverLetterBody: string;
}

function isExecutedInstrument(instrument: InstrumentRecord) {
  return (
    instrument.issuanceStatus === 'issued' ||
    instrument.issuanceStatus === 'allocated' ||
    instrument.issuanceStatus === 'pledged' ||
    instrument.issuanceStatus === 'applied' ||
    instrument.realPropertyNoteProfile?.titleAcceptanceStatus === 'presented' ||
    instrument.realPropertyNoteProfile?.titleAcceptanceStatus === 'accepted'
  );
}

function needsPresentment(instrument: InstrumentRecord, data: CoreDataBundle) {
  const isNoteOrBond =
    instrument.instrumentType === 'promissory_note' ||
    instrument.instrumentType === 'bond' ||
    instrument.sourceClass === 'note' ||
    instrument.sourceClass === 'bond';
  if (!isNoteOrBond || !isExecutedInstrument(instrument)) return false;

  return !data.dispatchRecords.some(
    (record) =>
      record.linkedInstrumentId === instrument.id &&
      (record.method === 'postal_mail' || record.method === 'external_courier') &&
      record.status !== 'cancelled',
  );
}

function resolveDispatchStatus(
  instrument: InstrumentRecord,
  register: NegotiableInstrumentRegisterRecord | undefined,
  data: CoreDataBundle,
): TreasuryPresentmentMailTodo['status'] {
  const dispatch = data.dispatchRecords.find(
    (record) =>
      record.linkedInstrumentId === instrument.id ||
      (register?.id && record.subjectId === register.id),
  );
  if (!dispatch) return 'needs_packet';
  if (dispatch.status === 'prepared') return 'ready_to_mail';
  if (dispatch.status === 'sent') return 'sent_waiting_evidence';
  if (dispatch.status === 'delivered') return 'delivered_waiting_response';
  return 'needs_packet';
}

function buildCoverLetter(entityLabel: string, instrument: InstrumentRecord, register?: NegotiableInstrumentRegisterRecord) {
  const amount = instrument.denominationValue || register?.faceAmount || 0;
  return [
    `RE: Presentment of ${instrument.title}`,
    '',
    'To the receiving office / treasury presentment desk:',
    '',
    `${entityLabel} encloses the executed instrument and supporting presentment packet for review, acknowledgment, and processing according to the receiving office instructions.`,
    '',
    `Instrument: ${instrument.title}`,
    `Identifier: ${instrument.legalIdentifier || register?.legalIdentifier || 'See enclosed instrument'}`,
    `Face / stated amount: ${instrument.paymentMedium || register?.currency || 'USD'} ${amount.toLocaleString()}`,
    `Issuer / counterparty: ${instrument.issuerName || instrument.counterpartyLabel || 'See enclosed documents'}`,
    '',
    'Enclosures should include the executed original or controlled copy, authority proof, remittance or application instructions, return-address page, and any required forms requested by the receiving office. Please return stamped, filed, accepted, rejected, or conditional-response evidence to the sender address shown in the packet.',
    '',
    'Sender retains USPS registered/certified mail evidence, USPS EPS/Postage record where available, tracking number, delivery receipt, and any returned response as ClearFlow vault evidence.',
  ].join('\n');
}

export function buildTreasuryPresentmentMailTodos(data: CoreDataBundle): TreasuryPresentmentMailTodo[] {
  return data.instruments
    .filter((instrument) => needsPresentment(instrument, data))
    .map((instrument) => {
      const entity = data.entities.find((item) => item.id === instrument.entityId);
      const register = data.negotiableInstrumentRegisters.find(
        (item) => item.instrumentId === instrument.id,
      );
      const status = resolveDispatchStatus(instrument, register, data);
      const entityLabel = entity?.displayName || entity?.name || 'Entity';
      const amount = instrument.denominationValue || register?.faceAmount || 0;
      const hasUspsSetup = Boolean(
        data.workspaceSettings.uspsGatewayEnabled ||
          data.workspaceSettings.uspsCrid ||
          data.workspaceSettings.uspsMailerId ||
          data.workspaceSettings.uspsPermitNumber,
      );

      return {
        id: `treasury-mail-${instrument.id}`,
        entityId: instrument.entityId,
        entityLabel,
        instrumentId: instrument.id,
        registerId: register?.id,
        title: instrument.title,
        legalIdentifier: instrument.legalIdentifier || register?.legalIdentifier,
        amount,
        status,
        recipientLabel:
          instrument.counterpartyLabel ||
          instrument.realPropertyNoteProfile?.titleCompanyName ||
          'Treasury / receiving presentment office',
        nextStep:
          status === 'needs_packet'
            ? 'Generate the presentment packet, cover letter, USPS registered/certified mail label, and evidence checklist before mailing.'
            : status === 'ready_to_mail'
              ? 'Mail the packet and enter the USPS tracking, registered-mail number, EPS/postage reference, and dispatch date.'
              : status === 'sent_waiting_evidence'
                ? 'Verify USPS delivery, upload receipt/green-card or electronic proof, and record the delivery date.'
                : 'Record the receiving office response, stamped copy, acceptance, rejection, or conditional instructions.',
        checklist: [
          'Confirm executed instrument, note, bond, or controlled copy is retained in the vault.',
          'Attach authority proof for the entity and signer.',
          'Generate cover letter with instrument identifier, amount, issuer/counterparty, and requested receiving action.',
          'Prepare return-address page and response instructions.',
          hasUspsSetup
            ? 'Use saved USPS Business Gateway / EPS profile for postage evidence when available.'
            : 'Add USPS CRID, Mailer ID, permit, EPS, or manual postage receipt after mailing.',
          'Send by registered or certified mail with tracking and restricted delivery if needed.',
          'Upload USPS receipt, registered-mail number, tracking page, delivery proof, green card, or electronic return receipt.',
          'Record receiving-office response and link it to the instrument, dispatch, documents, and settlement trail.',
        ],
        coverLetterTitle: `Presentment Cover Letter - ${instrument.title}`,
        coverLetterBody: buildCoverLetter(entityLabel, instrument, register),
      };
    });
}
