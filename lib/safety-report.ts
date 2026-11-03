export const OPEN_SAFETY_REPORT_EVENT = 'pana-open-safety-report';

export const SAFETY_REPORT_TARGETS = {
  content: 'A post, story, message, or other content',
  user: 'A user',
  other: 'Another safety concern',
};

export const SAFETY_REPORT_REASONS = {
  child_safety: 'Child safety or sexual exploitation',
  harassment: 'Harassment or bullying',
  hate_or_violence: 'Hate, threats, or violence',
  sexual_content: 'Prohibited sexual content',
  privacy: 'Private information shared without permission',
  impersonation_or_fraud: 'Impersonation or fraud',
  spam: 'Spam',
  other: 'Another safety concern',
};

export type SafetyReportTargetType = keyof typeof SAFETY_REPORT_TARGETS;
export type SafetyReportReason = keyof typeof SAFETY_REPORT_REASONS;

export function isSafetyReportTargetType(
  value: unknown
): value is SafetyReportTargetType {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(SAFETY_REPORT_TARGETS, value)
  );
}

export function isSafetyReportReason(
  value: unknown
): value is SafetyReportReason {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(SAFETY_REPORT_REASONS, value)
  );
}

export function safetyReportUrl(value: string, base?: string): string | null {
  if (!value || value.length > 2000) return null;
  try {
    const url = new URL(value, base);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function openSafetyReport(target: {
  type: SafetyReportTargetType;
  url: string;
}): void {
  window.dispatchEvent(
    new CustomEvent(OPEN_SAFETY_REPORT_EVENT, { detail: target })
  );
}
