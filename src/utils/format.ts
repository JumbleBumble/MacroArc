export const formatMilliseconds = (ms: number) => {
  if (!Number.isFinite(ms)) return '0 ms';
  if (ms >= 1000) {
    const seconds = ms / 1000;
    if (seconds >= 60) {
      return `${(seconds / 60).toFixed(1)} min`;
    }
    return `${seconds.toFixed(2)} s`;
  }
  return `${Math.round(ms)} ms`;
};

export const formatTimestamp = (timestamp?: number) => {
  if (!timestamp) return 'never';
  const date = new Date(timestamp);
  return date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });
};

export const formatNumber = (value: number) =>
  new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 }).format(value);
