import { useCallback, useEffect, useRef, useState } from 'react';

// Only one tab may run the register at a time. If the POS is opened again in
// another tab, the new tab waits and offers "Use here"; taking over asks the
// old tab to flush its pending save and step aside, then reloads the data.
// Without BroadcastChannel (very old browsers) the tab simply runs.
export function useTabLock({ onAcquire, onRelease }) {
  const [state, setState] = useState('checking'); // checking | active | blocked | released
  const cb = useRef({ onAcquire, onRelease });
  cb.current = { onAcquire, onRelease };
  const me = useRef({ id: Math.random().toString(36).slice(2), ch: null, state: 'checking', waiting: null });

  const set = useCallback((s) => {
    me.current.state = s;
    setState(s);
  }, []);

  useEffect(() => {
    let ch = null;
    try {
      ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('herbal-pos-tab-lock') : null;
    } catch {
      ch = null;
    }
    const self = me.current;
    self.ch = ch;
    if (!ch) {
      set('active');
      cb.current.onAcquire?.();
      return undefined;
    }
    let heard = false;
    ch.onmessage = async (ev) => {
      const m = ev.data || {};
      if (m.from === self.id) return;
      if (m.t === 'who' && self.state === 'active') ch.postMessage({ t: 'here', from: self.id });
      else if (m.t === 'here' && self.state === 'checking') heard = true;
      else if (m.t === 'takeover' && self.state === 'active') {
        try {
          await cb.current.onRelease?.();
        } finally {
          set('released');
          ch.postMessage({ t: 'released', from: self.id, to: m.from });
        }
      } else if (m.t === 'released' && m.to === self.id && self.waiting) self.waiting();
    };
    ch.postMessage({ t: 'who', from: self.id });
    const timer = setTimeout(() => {
      if (heard) set('blocked');
      else {
        set('active');
        cb.current.onAcquire?.();
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      try {
        ch.close();
      } catch {
        // ignore
      }
    };
  }, [set]);

  const takeOver = useCallback(
    () =>
      new Promise((resolve) => {
        const self = me.current;
        let done = false;
        const finish = async () => {
          if (done) return;
          done = true;
          self.waiting = null;
          set('active');
          await cb.current.onAcquire?.();
          resolve();
        };
        if (!self.ch) {
          finish();
          return;
        }
        self.waiting = finish;
        self.ch.postMessage({ t: 'takeover', from: self.id });
        setTimeout(finish, 1500);
      }),
    [set],
  );

  return { state, takeOver };
}
