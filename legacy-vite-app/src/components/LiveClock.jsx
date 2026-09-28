import React, { useEffect, useState } from 'react';

/** Ticks once a second without re-rendering anything else. */
export function LiveClock({ render }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return render(now);
}
