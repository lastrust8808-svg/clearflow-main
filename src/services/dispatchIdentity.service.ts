type DispatchIdentityInput = {
  entityId: string;
  entityName: string;
  country?: string;
  uspsMailerId?: string;
  uspsCrid?: string;
};

type DispatchIdentityRecord = {
  mailingLine: string;
  proofSealCode: string;
  qrPayload: string;
  qrSealSvg: string;
  mailingBarcodeSvg: string;
};

type EntitySealInput = {
  entityName: string;
  jurisdiction?: string;
  template?: 'round' | 'oval' | 'notary' | 'minimal';
  primaryText?: string;
  secondaryText?: string;
  inkColor?: string;
};

function normalizeCode(input: string) {
  return input.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
}

function hashSeed(input: string) {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0).toString(36).toUpperCase();
}

function buildMatrixBits(seed: string, count: number) {
  const source = Array.from(seed || 'CLEARFLOW');
  const bits: number[] = [];
  for (let index = 0; index < count; index += 1) {
    const code = source[index % source.length].charCodeAt(0);
    bits.push((code + index * 17) % 2);
  }
  return bits;
}

function buildMatrixSvg(seed: string) {
  const size = 21;
  const cell = 6;
  const margin = 8;
  const bits = buildMatrixBits(seed, size * size);
  const rects: string[] = [];

  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      const index = row * size + col;
      const isFinderZone =
        (row < 7 && col < 7) ||
        (row < 7 && col >= size - 7) ||
        (row >= size - 7 && col < 7);
      const shouldFill = isFinderZone
        ? row === 0 ||
          row === 6 ||
          col === 0 ||
          col === 6 ||
          (row >= 2 && row <= 4 && col >= 2 && col <= 4)
        : bits[index] === 1;

      if (shouldFill) {
        rects.push(
          `<rect x="${margin + col * cell}" y="${margin + row * cell}" width="${cell}" height="${cell}" rx="1" ry="1" />`
        );
      }
    }
  }

  const dimension = margin * 2 + size * cell;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" width="${dimension}" height="${dimension}" role="img" aria-label="ClearFlow dispatch proof seal"><rect width="${dimension}" height="${dimension}" rx="14" fill="#ffffff"/><g fill="#0f172a">${rects.join('')}</g></svg>`;
}

function buildBarcodeSvg(seed: string) {
  const normalized = normalizeCode(seed) || 'CLEARFLOWMAIL';
  const bars: string[] = [];
  let x = 10;
  for (let index = 0; index < normalized.length; index += 1) {
    const charCode = normalized.charCodeAt(index);
    const width = 1 + (charCode % 4);
    const height = 26 + (charCode % 14);
    bars.push(`<rect x="${x}" y="${40 - height}" width="${width}" height="${height}" rx="1" ry="1" />`);
    x += width + 1;
  }
  const width = x + 10;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 54" width="${width}" height="54" role="img" aria-label="ClearFlow mailing barcode"><rect width="${width}" height="54" rx="10" fill="#ffffff"/><g fill="#0f172a">${bars.join('')}</g></svg>`;
}

export function buildEntityDispatchIdentity(
  input: DispatchIdentityInput
): DispatchIdentityRecord {
  const entityCode = normalizeCode(input.entityName).slice(0, 10) || 'ENTITY';
  const entitySuffix = normalizeCode(input.entityId).slice(-6) || '000000';
  const mailerId = normalizeCode(input.uspsMailerId || 'CFMAIL').slice(0, 9) || 'CFMAIL';
  const crid = normalizeCode(input.uspsCrid || 'CFCRID').slice(0, 9) || 'CFCRID';
  const country = normalizeCode(input.country || 'US').slice(0, 3) || 'US';
  const proofSeed = `${entityCode}-${entitySuffix}-${mailerId}-${crid}-${country}`;
  const proofSealCode = `CFS-${hashSeed(proofSeed).slice(0, 12)}`;
  const mailingLine = `CFM|${country}|${mailerId}|${crid}|${entityCode}|${entitySuffix}`;
  const qrPayload = `clearflow://dispatch/${proofSealCode}?mail=${encodeURIComponent(mailingLine)}&entity=${encodeURIComponent(entityCode)}`;

  return {
    mailingLine,
    proofSealCode,
    qrPayload,
    qrSealSvg: buildMatrixSvg(`${proofSealCode}|${mailingLine}`),
    mailingBarcodeSvg: buildBarcodeSvg(mailingLine),
  };
}

export function buildDispatchFooter(input: {
  mailingLine?: string;
  proofSealCode?: string;
  qrPayload?: string;
}) {
  if (!input.mailingLine || !input.proofSealCode || !input.qrPayload) {
    return '';
  }

  return `\n\n## ClearFlow Dispatch Identity\n- Mailing line: ${input.mailingLine}\n- Proof seal: ${input.proofSealCode}\n- QR payload: ${input.qrPayload}\n- Operator note: Use this dispatch identity to tie the original outgoing packet, mailing record, and proof-chain evidence back to the issuing entity.`;
}

function wrapSealText(input: string, maxLength: number) {
  const normalized = input.trim();
  if (!normalized) {
    return '';
  }

  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

export function buildEntitySealDesign(input: EntitySealInput) {
  const template = input.template || 'round';
  const primaryText = wrapSealText(input.primaryText || input.entityName, 34);
  const secondaryText = wrapSealText(
    input.secondaryText || input.jurisdiction || 'ClearFlow Entity Seal',
    34,
  );
  const ink = input.inkColor || '#36d7ff';

  if (template === 'minimal') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180" width="320" height="180" role="img" aria-label="Entity seal"><rect x="12" y="12" width="296" height="156" rx="26" fill="rgba(255,255,255,0.02)" stroke="${ink}" stroke-width="4"/><text x="160" y="78" text-anchor="middle" fill="${ink}" font-size="22" font-family="Georgia, serif" font-weight="700">${primaryText}</text><text x="160" y="116" text-anchor="middle" fill="${ink}" font-size="12" font-family="Georgia, serif" letter-spacing="2">${secondaryText.toUpperCase()}</text></svg>`;
  }

  if (template === 'oval') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="320" height="200" role="img" aria-label="Entity seal"><ellipse cx="160" cy="100" rx="138" ry="78" fill="rgba(255,255,255,0.02)" stroke="${ink}" stroke-width="5"/><ellipse cx="160" cy="100" rx="122" ry="63" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="5 6"/><text x="160" y="92" text-anchor="middle" fill="${ink}" font-size="22" font-family="Georgia, serif" font-weight="700">${primaryText}</text><text x="160" y="124" text-anchor="middle" fill="${ink}" font-size="12" font-family="Georgia, serif" letter-spacing="2">${secondaryText.toUpperCase()}</text></svg>`;
  }

  if (template === 'notary') {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220" width="320" height="220" role="img" aria-label="Entity seal"><path d="M160 20 L282 70 L250 190 L70 190 L38 70 Z" fill="rgba(255,255,255,0.02)" stroke="${ink}" stroke-width="5"/><path d="M160 44 L254 82 L230 172 L90 172 L66 82 Z" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="6 5"/><text x="160" y="102" text-anchor="middle" fill="${ink}" font-size="21" font-family="Georgia, serif" font-weight="700">${primaryText}</text><text x="160" y="132" text-anchor="middle" fill="${ink}" font-size="12" font-family="Georgia, serif" letter-spacing="2">${secondaryText.toUpperCase()}</text><text x="160" y="156" text-anchor="middle" fill="${ink}" font-size="10" font-family="Georgia, serif">ORIGINAL RECORD CONTROL</text></svg>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 240" width="240" height="240" role="img" aria-label="Entity seal"><circle cx="120" cy="120" r="98" fill="rgba(255,255,255,0.02)" stroke="${ink}" stroke-width="5"/><circle cx="120" cy="120" r="82" fill="none" stroke="${ink}" stroke-width="2" stroke-dasharray="4 6"/><text x="120" y="112" text-anchor="middle" fill="${ink}" font-size="20" font-family="Georgia, serif" font-weight="700">${primaryText}</text><text x="120" y="142" text-anchor="middle" fill="${ink}" font-size="11" font-family="Georgia, serif" letter-spacing="2">${secondaryText.toUpperCase()}</text></svg>`;
}
