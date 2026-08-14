/**
 * Pure cancellation/refund eligibility logic. Deliberately has zero
 * dependencies on the database — the actual DB-level bound enforcement
 * lives in the enforce_cinema_policy_within_platform_limits trigger
 * (0002_constraints.sql), which is the authoritative guard. This function
 * is what the application layer calls to *decide* eligibility for a given
 * booking, given policy rows already fetched from the DB.
 */
export interface CancellationPolicy {
  cancellationWindowHours: number;
  refundPercentage: number; // 0-100
}

export interface CancellationEligibility {
  eligible: boolean;
  refundPercentage: number;
  reason?: string;
}

export function evaluateCancellationEligibility(params: {
  now: Date;
  showtimeStartsAt: Date;
  policy: CancellationPolicy;
}): CancellationEligibility {
  const hoursUntilShowtime =
    (params.showtimeStartsAt.getTime() - params.now.getTime()) / (1000 * 60 * 60);

  if (hoursUntilShowtime < 0) {
    return { eligible: false, refundPercentage: 0, reason: "Showtime has already passed" };
  }

  if (hoursUntilShowtime < params.policy.cancellationWindowHours) {
    return {
      eligible: false,
      refundPercentage: 0,
      reason: `Cancellation window (${params.policy.cancellationWindowHours}h before showtime) has passed`,
    };
  }

  return { eligible: true, refundPercentage: params.policy.refundPercentage };
}

export function isPolicyWithinPlatformLimits(params: {
  policy: CancellationPolicy;
  limits: { minCancellationWindowHours: number; maxRefundPercentage: number };
}): { valid: boolean; reason?: string } {
  if (params.policy.cancellationWindowHours < params.limits.minCancellationWindowHours) {
    return {
      valid: false,
      reason: `cancellationWindowHours (${params.policy.cancellationWindowHours}) is below the platform minimum (${params.limits.minCancellationWindowHours})`,
    };
  }
  if (params.policy.refundPercentage > params.limits.maxRefundPercentage) {
    return {
      valid: false,
      reason: `refundPercentage (${params.policy.refundPercentage}) exceeds the platform maximum (${params.limits.maxRefundPercentage})`,
    };
  }
  return { valid: true };
}
