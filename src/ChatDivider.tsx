import { useEffect, useRef, useState } from 'react';

const storageKey = 'nxsoos.chatWidth';
const defaultWidth = 400;
export function ChatDivider() {
  const handle = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(defaultWidth);
  const [dragging, setDragging] = useState(false);
  const apply = (requested: number, persist = true) => {
    const parent = handle.current?.parentElement;
    if (!parent) return;
    const maximum = Math.max(310, parent.clientWidth - 328);
    const next = Math.round(Math.max(310, Math.min(maximum, requested)));
    parent.style.setProperty('--chat-width', next + 'px');
    setWidth(next);
    if (persist)
      try {
        localStorage.setItem(storageKey, String(next));
      } catch {}
  };
  useEffect(() => {
    let saved = defaultWidth;
    try {
      const value = Number(localStorage.getItem(storageKey));
      if (value >= 310 && value <= 3000) saved = value;
    } catch {}
    apply(saved, false);
    return () => document.body.classList.remove('chat-resizing');
  }, []);
  const stop = () => {
    setDragging(false);
    document.body.classList.remove('chat-resizing');
  };
  return (
    <div
      ref={handle}
      className={'chat-divider' + (dragging ? ' dragging' : '')}
      role="separator"
      tabIndex={0}
      aria-label="Resize CEO chat"
      aria-orientation="vertical"
      aria-valuemin={310}
      aria-valuemax={Math.max(
        width,
        Math.round((handle.current?.parentElement?.clientWidth || 1000) - 328),
      )}
      aria-valuenow={width}
      aria-valuetext={`${width} pixels wide`}
      title="Drag to resize chat. Arrow keys adjust; double-click resets."
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        event.currentTarget.focus();
        event.currentTarget.setPointerCapture(event.pointerId);
        setDragging(true);
        document.body.classList.add('chat-resizing');
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          const right = event.currentTarget.parentElement!.getBoundingClientRect().right;
          apply(right - event.clientX);
        }
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
        stop();
      }}
      onPointerCancel={stop}
      onLostPointerCapture={stop}
      onDoubleClick={() => apply(defaultWidth)}
      onKeyDown={(event) => {
        if (['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) {
          event.preventDefault();
          apply(
            event.key === 'Home' ? defaultWidth : width + (event.key === 'ArrowLeft' ? 32 : -32),
          );
        }
      }}
    >
      <span />
    </div>
  );
}
