import { type CSSProperties, useEffect, useMemo } from "react";

const PARTICLE_COUNT = 7;
const ANIMATION_DURATION_MS = 800;

interface EmojiFountainProps {
  position: { x: number; y: number };
  emoji: string;
  onComplete: () => void;
}

export function EmojiFountain({
  position,
  emoji,
  onComplete,
}: EmojiFountainProps) {
  const particles = useMemo(
    () =>
      Array.from({ length: PARTICLE_COUNT }, (_, index) => {
        const angle = ((index - (PARTICLE_COUNT - 1) / 2) * 30) / PARTICLE_COUNT;
        const delay = index * 40;
        return { angle, delay, key: index };
      }),
    [],
  );

  useEffect(() => {
    const timerId = setTimeout(onComplete, ANIMATION_DURATION_MS + 100);
    return () => clearTimeout(timerId);
  }, [onComplete]);

  return (
    <div
      aria-hidden="true"
      className="map-surface__emoji-fountain"
      data-testid="emoji-fountain"
      style={{ left: `${position.x}px`, top: `${position.y}px` }}
    >
      {particles.map(({ angle, delay, key }) => (
        <span
          className="map-surface__emoji-particle"
          key={key}
          style={{
            "--particle-angle": `${angle}deg`,
            "--particle-delay": `${delay}ms`,
          } as CSSProperties}
        >
          {emoji}
        </span>
      ))}
    </div>
  );
}
