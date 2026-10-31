/**
 * Deterministic, non-posting schedule for a fixed-rate, monthly amortizing note.
 * This is a mathematical projection, not evidence of an executed note, a
 * payment, collateral value, bank balance, settlement, or enforceable debt.
 *
 * Contract: nominal annual interest rate in integer basis points (1 bp=0.01%),
 * divided by 12; monthly interest rounded half-up to the nearest minor unit.
 * Scheduled payment is rounded UP to the nearest minor unit to avoid negative
 * amortization; the final payment is adjusted to extinguish the balance.
 * No fees, prepayments, compounding beyond monthly accrual, or irregular first
 * periods are modeled. Dates are calendar-only; no timezone conversions.
 * The caller must authenticate/authorize tenant/entity/note ownership.
 */
const RATE_DENOMINATOR = 120_000n; // 12 months * 10,000 basis points
const MAX_PERIODS = 600;
const TERMS_FIELDS = new Set([
  'tenantId', 'entityId', 'noteId', 'currency', 'principalMinor',
  'annualRateBps', 'paymentCount', 'firstDueDate',
]);

// A projection must not silently accept inherited, accessor-derived, hidden,
// or extra fields claiming an actual payment, execution, or settlement.
function requirePlainNoteTerms(terms) {
  if (!terms || typeof terms !== 'object' || Array.isArray(terms)) {
    throw new TypeError('Note terms must be a plain data record');
  }
  const prototype = Object.getPrototypeOf(terms);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('Note terms must be a plain data record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(terms);
  for (const key of Reflect.ownKeys(descriptors)) {
    if (typeof key !== 'string' || !TERMS_FIELDS.has(key)) {
      throw new TypeError('Unsupported note terms field');
    }
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, 'value')) {
      throw new TypeError('Note terms fields must be enumerable data properties');
    }
  }
  for (const key of TERMS_FIELDS) {
    if (!Object.hasOwn(descriptors, key)) {
      throw new TypeError('Note terms.' + key + ' must be an own data field');
    }
  }
}


function requiredString(value, field) {
  if (typeof value !== 'string' || value.length === 0 || value.trim() !== value) {
    throw new TypeError(`${field} must be a nonempty unpadded string`);
  }
  // Match the reserve, trustee and private-note identifier boundary. These
  // terms may later be matched to tenant-scoped immutable note records;
  // control bytes must never create ambiguous ledger identifiers.
  if (/[\u0000-\u001f\u007f-\u009f]/u.test(value)) {
    throw new TypeError(`${field} must not contain control characters`);
  }
  return value;
}

function safeInteger(value, field, min = 0, max = Number.MAX_SAFE_INTEGER) {
  if (!Number.isSafeInteger(value) || value < min || value > max) {
    throw new RangeError(`${field} must be a safe integer between ${min} and ${max}`);
  }
  return value;
}

function safeNumber(value, field) {
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError(`${field} exceeds safe integer range`);
  }
  return Number(value);
}

function roundHalfUp(numerator, denominator) {
  return (numerator + denominator / 2n) / denominator;
}

function ceilDivide(numerator, denominator) {
  return (numerator + denominator - 1n) / denominator;
}

function parseCalendarDate(date) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new TypeError('firstDueDate must be a YYYY-MM-DD calendar date');
  }
  const [year, month, day] = date.split('-').map(Number);
  if (year < 1900 || year > 9949 || month < 1 || month > 12 || day < 1 || day > 31) {
    throw new RangeError('Invalid firstDueDate');
  }
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day > days) throw new RangeError('Invalid firstDueDate');
  return { year, month, day };
}

function monthlyDueDate(first, offset) {
  const monthIndex = first.year * 12 + first.month - 1 + offset;
  const year = Math.floor(monthIndex / 12);
  const month = monthIndex % 12 + 1;
  const day = Math.min(first.day, new Date(Date.UTC(year, month, 0)).getUTCDate());
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * @param {{tenantId:string, entityId:string, noteId:string, currency:string,
 * principalMinor:number, annualRateBps:number, paymentCount:number,
 * firstDueDate:string}} terms
 */
export function buildFixedMonthlyNoteSchedule(terms) {
  requirePlainNoteTerms(terms);
  const tenantId = requiredString(terms.tenantId, 'tenantId');
  const entityId = requiredString(terms.entityId, 'entityId');
  const noteId = requiredString(terms.noteId, 'noteId');
  const currency = requiredString(terms.currency, 'currency');
  if (!/^[A-Z]{3}$/.test(currency)) throw new TypeError('currency must be a three-letter uppercase code');
  const principalMinor = safeInteger(terms.principalMinor, 'principalMinor', 1);
  const annualRateBps = safeInteger(terms.annualRateBps, 'annualRateBps', 0, 100_000);
  const paymentCount = safeInteger(terms.paymentCount, 'paymentCount', 1, MAX_PERIODS);
  const firstDue = parseCalendarDate(terms.firstDueDate);

  const principal = BigInt(principalMinor);
  const rate = BigInt(annualRateBps);
  const periods = BigInt(paymentCount);
  let payment;
  if (rate === 0n) {
    payment = ceilDivide(principal, periods);
  } else {
    const factor = (RATE_DENOMINATOR + rate) ** periods;
    const base = RATE_DENOMINATOR ** periods;
    payment = ceilDivide(principal * rate * factor, RATE_DENOMINATOR * (factor - base));
  }
  const scheduledPaymentMinor = safeNumber(payment, 'scheduledPaymentMinor');
  const installments = [];
  let balance = principal;
  let totalInterest = 0n;
  for (let index = 0; index < paymentCount; index++) {
    const interest = roundHalfUp(balance * rate, RATE_DENOMINATOR);
    if (index < paymentCount - 1 && payment <= interest) {
      throw new RangeError('Scheduled payment would cause negative amortization');
    }
    const principalPaid = index === paymentCount - 1 ? balance : (payment - interest > balance ? balance : payment - interest);
    const amount = interest + principalPaid;
    balance -= principalPaid;
    // Rounding the scheduled payment up can extinguish very small notes
    // before the contracted term. Do not manufacture later zero-value
    // installments and misrepresent them as scheduled payments.
    if (index < paymentCount - 1 && balance === 0n) {
      throw new RangeError('Note terms would create zero-value future installments');
    }
    totalInterest += interest;
    installments.push(Object.freeze({
      installmentNumber: index + 1,
      dueDate: monthlyDueDate(firstDue, index),
      paymentMinor: safeNumber(amount, 'paymentMinor'),
      principalMinor: safeNumber(principalPaid, 'principalMinor'),
      interestMinor: safeNumber(interest, 'interestMinor'),
      remainingPrincipalMinor: safeNumber(balance, 'remainingPrincipalMinor'),
    }));
  }
  return Object.freeze({
    tenantId, entityId, noteId, currency, principalMinor, annualRateBps,
    paymentCount, firstDueDate: terms.firstDueDate, scheduledPaymentMinor,
    totalInterestMinor: safeNumber(totalInterest, 'totalInterestMinor'),
    totalRepaymentMinor: safeNumber(principal + totalInterest, 'totalRepaymentMinor'),
    installments: Object.freeze(installments),
  });
}
