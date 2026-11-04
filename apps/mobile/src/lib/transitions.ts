import { useNavigation } from 'expo-router';
import { useEffect, useRef } from 'react';

type TransitionEndEmitter = {
  addListener: (event: 'transitionEnd', listener: (e: { data?: { closing?: boolean } }) => void) => () => void;
};

/**
 * Runs `callback` once the screen has finished animating in. Use it instead of `autoFocus`:
 * opening the keyboard mid-animation makes the layout jump while the screen is still sliding.
 * Falls back to a short timer in case the navigator doesn't emit the event.
 */
export function useAfterTransition(callback: () => void, enabled = true) {
  const navigation = useNavigation() as unknown as TransitionEndEmitter;
  const cb = useRef(callback);
  useEffect(() => {
    cb.current = callback;
  });

  useEffect(() => {
    if (!enabled) return;
    let done = false;
    const run = () => {
      if (done) return;
      done = true;
      cb.current();
    };
    const fallback = setTimeout(run, 500);
    const unsubscribe = navigation.addListener('transitionEnd', (e) => {
      if (!e?.data?.closing) run();
    });
    return () => {
      done = true;
      clearTimeout(fallback);
      unsubscribe();
    };
  }, [enabled, navigation]);
}
