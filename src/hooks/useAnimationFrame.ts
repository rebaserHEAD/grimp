import { useEffect, useRef } from 'react';

export function useAnimationFrame(callback: (timestamp: number) => void) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    let frameId: number;
    function loop(timestamp: number) {
      callbackRef.current(timestamp);
      frameId = requestAnimationFrame(loop);
    }
    frameId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frameId);
  }, []);
}
