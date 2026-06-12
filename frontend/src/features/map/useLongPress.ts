import { useCallback, useRef, useState } from "react";

const LONG_PRESS_MS = 600;
const MOVE_THRESHOLD_PX = 10;

export interface LongPressPosition {
  x: number;
  y: number;
}

export interface UseLongPressResult {
  longPressPosition: LongPressPosition | null;
  clearLongPress: () => void;
  handlePointerDown: (event: React.PointerEvent) => void;
  handlePointerMove: (event: React.PointerEvent) => void;
  handlePointerUp: (event: React.PointerEvent) => void;
}

interface LongPressState {
  pointerId: number;
  startX: number;
  startY: number;
  timerId: ReturnType<typeof setTimeout>;
}

export function useLongPress(
  onLongPress: (position: LongPressPosition) => void,
): UseLongPressResult {
  const stateRef = useRef<LongPressState | null>(null);
  const onLongPressRef = useRef(onLongPress);
  onLongPressRef.current = onLongPress;

  const [longPressPosition, setLongPressPosition] =
    useState<LongPressPosition | null>(null);

  const cancel = useCallback(() => {
    if (stateRef.current) {
      clearTimeout(stateRef.current.timerId);
      stateRef.current = null;
    }
  }, []);

  const clearLongPress = useCallback(() => {
    setLongPressPosition(null);
  }, []);

  const handlePointerDown = useCallback(
    (event: React.PointerEvent) => {
      cancel();
      setLongPressPosition(null);

      const { pointerId, clientX, clientY } = event;
      const timerId = setTimeout(() => {
        stateRef.current = null;
        const position = { x: clientX, y: clientY };
        setLongPressPosition(position);
        onLongPressRef.current(position);
      }, LONG_PRESS_MS);

      stateRef.current = {
        pointerId,
        startX: clientX,
        startY: clientY,
        timerId,
      };
    },
    [cancel],
  );

  const handlePointerMove = useCallback(
    (event: React.PointerEvent) => {
      const state = stateRef.current;
      if (!state || state.pointerId !== event.pointerId) {
        return;
      }
      const dx = Math.abs(event.clientX - state.startX);
      const dy = Math.abs(event.clientY - state.startY);
      if (dx > MOVE_THRESHOLD_PX || dy > MOVE_THRESHOLD_PX) {
        cancel();
      }
    },
    [cancel],
  );

  const handlePointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (stateRef.current?.pointerId === event.pointerId) {
        cancel();
      }
    },
    [cancel],
  );

  return {
    longPressPosition,
    clearLongPress,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
  };
}
