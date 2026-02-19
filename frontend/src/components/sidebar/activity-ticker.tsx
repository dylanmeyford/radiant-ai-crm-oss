import { useEffect, useMemo, useRef, useState } from 'react';
import { Circle } from 'lucide-react';
import { useActivityStats } from '@/hooks/useActivityStats';

interface ActivityTickerProps {
  className?: string;
  onClick?: () => void;
}

const FALLBACK_LINES = [
  'Looking for new actions',
  'Analyzing opportunities',
  'Considering actions',
  'Determining next steps',
  'Analysing results',
  'Searching for insights',
  'Evaluating options',
];

export function ActivityTicker({ className, onClick }: ActivityTickerProps) {
  const { data, isLoading, hasLiveActivity } = useActivityStats();
  const [index, setIndex] = useState(0);
  const [show, setShow] = useState(true);
  const intervalRef = useRef<number | null>(null);
  const idleTimeoutRef = useRef<number | null>(null);
  const [isIdle, setIsIdle] = useState(false);
  const shouldForceIdle = (data?.metrics?.opportunitiesManaged ?? 0) === 0;

  const messages = useMemo(() => {
    const priority: string[] = [];
    if (data?.live?.activitiesBeingProcessed && data.live.activitiesBeingProcessed > 0) {
      priority.push(`Processing ${data.live.activitiesBeingProcessed} activities…`);
    }
    if (data?.live?.nextStepsBeingMade && data.live.nextStepsBeingMade > 0) {
      priority.push(`Generating ${data.live.nextStepsBeingMade} next steps…`);
    }

    const base = [...priority];
    // If no live items, include fallbacks
    if (base.length === 0) {
      base.push(...FALLBACK_LINES);
    } else {
      // Mix in one fallback between live updates to keep motion
      base.push(FALLBACK_LINES[(index + 1) % FALLBACK_LINES.length]);
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, index]);

  useEffect(() => {
    // If there are no opportunities yet (new user), force Idle and stop cycling
    if (shouldForceIdle) {
      if (intervalRef.current) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      setShow(true);
      setIsIdle(true);
      return () => {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
        if (idleTimeoutRef.current) window.clearTimeout(idleTimeoutRef.current);
      };
    }

    // Cycle messages with a small fade/slide transition
    // Slow down when idle; keep current pace when live activity exists
    if (isIdle) {
      // While idle, do not rotate messages; idle timeout will exit
      return () => {
        if (intervalRef.current) window.clearInterval(intervalRef.current);
      };
    }

    const TICK_MS = hasLiveActivity ? 6000 : 12000;
    const REDUCED = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const tick = () => {
      // Randomly enter an idle period when no live activity
      if (!hasLiveActivity) {
        const shouldIdle = Math.random() < 0.25; // 25% chance per tick
        if (shouldIdle) {
          if (intervalRef.current) {
            window.clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          // Ensure Idle text is visible during idle period
          setShow(true);
          setIsIdle(true);
          // Stay monitoring for up to 5 minutes (or until live activity starts)
          const minMs = 15000; // 15s minimum so it feels intentional
          const maxMs = 300000; // 5 minutes
          const idleMs = Math.floor(minMs + Math.random() * (maxMs - minMs));
          idleTimeoutRef.current = window.setTimeout(() => {
            setIsIdle(false);
            setShow(true);
          }, idleMs);
          return;
        }
      }

      if (!REDUCED) setShow(false);
      window.setTimeout(() => {
        setIndex((prev) => (prev + 1) % Math.max(1, messages.length));
        if (!REDUCED) setShow(true);
      }, REDUCED ? 0 : 250);
    };

    intervalRef.current = window.setInterval(tick, TICK_MS);
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
    };
  }, [messages.length, hasLiveActivity, isIdle, shouldForceIdle]);

  // Exit idle immediately if live activity begins
  useEffect(() => {
    if ((hasLiveActivity && isIdle) && !shouldForceIdle) {
      if (idleTimeoutRef.current) {
        window.clearTimeout(idleTimeoutRef.current);
        idleTimeoutRef.current = null;
      }
      setIsIdle(false);
    }
  }, [hasLiveActivity, isIdle, shouldForceIdle]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) window.clearInterval(intervalRef.current);
      if (idleTimeoutRef.current) window.clearTimeout(idleTimeoutRef.current);
    };
  }, []);

  const currentText = isIdle
    ? 'Monitoring'
    : (messages[index] || (isLoading ? 'Initializing…' : FALLBACK_LINES[0]));
  const isActive = !isIdle && !shouldForceIdle && (data?.live?.isActive ?? false);

  return (
    <div
      className={`w-full px-3 py-2 ${className ?? ''} ${onClick ? 'cursor-pointer hover:bg-gray-50 rounded-md' : ''}`}
      onClick={onClick}
      role={onClick ? 'button' as const : undefined}
      aria-pressed={undefined}
      tabIndex={onClick ? 0 : -1}
    >
      <div className={`flex items-center gap-2`}>
        <Circle
          className={`h-3 w-3 ${
            isActive ? 'text-red-500' : (isIdle ? 'text-blue-500' : 'text-green-500')
          } ${isActive ? 'animate-pulse' : ''}`}
          fill="currentColor"
        />
        <div className="relative flex-1 overflow-hidden">
          <div
            className={`
              text-xs text-gray-700 whitespace-nowrap
              transition-all duration-200
              ${show ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-1'}
            `}
          >
            {currentText}
          </div>
          {/* Shimmer overlay */}
          <div className="pointer-events-none absolute inset-0">
            <div
              className={`
                h-full w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent
                ${
                  isIdle
                    ? 'motion-reduce:animate-none'
                    : isActive
                      ? 'animate-[shimmer_1500ms_linear_infinite]'
                      : 'animate-[shimmer_2500ms_linear_infinite]'
                }
                motion-reduce:animate-none
              `}
            />
          </div>
        </div>
      </div>
    </div>
  );
}


