import { useEffect, useRef, useState } from 'react';

interface AnimatedNumberProps {
  value: number;
  durationMs?: number;
  className?: string;
  locale?: string;
}

export function AnimatedNumber({
  value,
  durationMs = 600,
  className,
  locale = 'en-US',
}: AnimatedNumberProps) {
  const [displayValue, setDisplayValue] = useState<number>(value || 0);
  const startValueRef = useRef<number>(value || 0);
  const startTimeRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof value !== 'number' || Number.isNaN(value)) return;

    // Cancel any running animation
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
    }

    const startValue = displayValue;
    startValueRef.current = startValue;
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }
      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / durationMs, 1);

      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = startValue + (value - startValue) * eased;
      setDisplayValue(current);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      } else {
        setDisplayValue(value);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [value, durationMs]); // eslint-disable-line react-hooks/exhaustive-deps

  const formatter = useRef(
    new Intl.NumberFormat(locale, {
      maximumFractionDigits: 0,
    })
  ).current;

  return <span className={className}>{formatter.format(Math.round(displayValue))}</span>;
}


