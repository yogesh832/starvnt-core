import React, { useCallback, useEffect, useRef } from 'react';
import { Keyboard, Platform, ScrollView, ScrollViewProps, TextInput } from 'react-native';

/** Keep the focused field above Android's resized keyboard viewport. */
export function KeyboardScrollView({ onFocus, onBlur, onScroll, onLayout, ...props }: ScrollViewProps) {
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const ownedInput = useRef<ReturnType<typeof TextInput.State.currentlyFocusedInput>>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const revealInput = useCallback(() => {
    if (Platform.OS !== 'android') return;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const focused = TextInput.State.currentlyFocusedInput();
      const keyboard = Keyboard.metrics();
      if (focused && focused === ownedInput.current && keyboard) {
        focused.measureInWindow((_x, inputY, _width, inputHeight) => {
          scroll.current?.getNativeScrollRef()?.measureInWindow((_sx, viewY, _sw, viewHeight) => {
            // Window coordinates include the stack header and persistent tabs.
            const bottom = Math.min(viewY + viewHeight, keyboard.screenY) - 24;
            const overflow = inputY + inputHeight - bottom;
            if (overflow > 0) scroll.current?.scrollTo({ y: offset.current + overflow, animated: true });
          });
        });
      }
    }, 100);
  }, []);
  useEffect(() => {
    const listener = Keyboard.addListener('keyboardDidShow', revealInput);
    return () => { listener.remove(); clearTimeout(timer.current); };
  }, [revealInput]);
  return <ScrollView {...props} ref={scroll} scrollEventThrottle={16}
    onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; onScroll?.(event); }}
    onLayout={event => { onLayout?.(event); revealInput(); }}
    onBlur={event => { ownedInput.current = null; onBlur?.(event); }}
    onFocus={event => { if (Platform.OS === 'android') ownedInput.current = TextInput.State.currentlyFocusedInput(); onFocus?.(event); revealInput(); }} />;
}
