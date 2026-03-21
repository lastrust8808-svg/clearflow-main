export type VerificationDeliveryMode = 'in_app_preview' | 'email_sent' | 'sms_sent';

const AUTH_API_BASE =
  typeof window !== 'undefined' && window.location?.origin
    ? window.location.origin.includes('localhost')
      ? 'http://localhost:8000'
      : window.location.origin
    : 'http://localhost:8000';

export async function deliverVerificationCode(input: {
  contactType: 'email' | 'phone';
  contactValue: string;
  maskedTarget: string;
  code: string;
}) {
  try {
    const response = await fetch(`${AUTH_API_BASE}/api/auth/verification/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(input),
    });

    if (!response.ok) {
      throw new Error('Verification delivery failed.');
    }

    return (await response.json()) as {
      success: boolean;
      deliveryMode: VerificationDeliveryMode;
      maskedTarget: string;
      message?: string;
    };
  } catch {
    return {
      success: true,
      deliveryMode: 'in_app_preview' as const,
      maskedTarget: input.maskedTarget,
      message: 'Delivery service is unavailable, so the code remains in preview mode.',
    };
  }
}
