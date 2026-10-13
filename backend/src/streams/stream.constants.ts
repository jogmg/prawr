export const MIN_STREAM_RATE_PER_MINUTE = 0.001;
export const MAX_STREAM_RATE_PER_MINUTE = 100;

export function normalizeStreamRate(ratePerMinute: number): number {
  if (
    !Number.isFinite(ratePerMinute) ||
    ratePerMinute < MIN_STREAM_RATE_PER_MINUTE ||
    ratePerMinute > MAX_STREAM_RATE_PER_MINUTE
  ) {
    throw new Error(
      `ratePerMinute must be between ${MIN_STREAM_RATE_PER_MINUTE} and ${MAX_STREAM_RATE_PER_MINUTE} USDC.`
    );
  }

  const normalizedRate = Number(ratePerMinute.toFixed(3));
  if (
    normalizedRate < MIN_STREAM_RATE_PER_MINUTE ||
    normalizedRate > MAX_STREAM_RATE_PER_MINUTE
  ) {
    throw new Error(
      `ratePerMinute must be between ${MIN_STREAM_RATE_PER_MINUTE} and ${MAX_STREAM_RATE_PER_MINUTE} USDC.`
    );
  }

  return normalizedRate;
}
