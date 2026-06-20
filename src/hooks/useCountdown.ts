import { useEffect, useState } from "react";

export function useCountdown(initialSeconds = 30) {
  const [seconds, setSeconds] = useState(initialSeconds);

  useEffect(() => {
    if (seconds <= 0) return;
    const timer = setTimeout(() => setSeconds((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  return {
    seconds,
    canRun: seconds === 0,
    restart: () => setSeconds(initialSeconds),
  };
}

