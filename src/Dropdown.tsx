import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

type Item = {
  key: string;
  id?: string;
  label: string;
  checked?: boolean;
  onSelect: () => void;
};

type Props = {
  id: string;
  label: string;
  accessibilityLabel?: string;
  items: readonly Item[];
};

export function Dropdown({ id, label, accessibilityLabel, items }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const initialFocus = useRef<number | null>(null);

  useLayoutEffect(() => {
    if (!open || initialFocus.current === null) return;
    menu.current?.querySelectorAll('button')[initialFocus.current]?.focus();
    initialFocus.current = null;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function dismissOutside(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    }
    document.addEventListener('pointerdown', dismissOutside);
    return () => document.removeEventListener('pointerdown', dismissOutside);
  }, [open]);

  function moveFocus(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      trigger.current?.focus();
      return;
    }

    const direction = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
    if (direction === 0 && (!open || !['Home','End'].includes(event.key))) return;
    const buttons = Array.from(menu.current?.querySelectorAll('button') ?? []);
    if (!buttons.length) return;
    event.preventDefault();
    event.stopPropagation();
    const current = buttons.findIndex(button => button === document.activeElement);
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 :
      current < 0 ? (direction > 0 ? 0 : buttons.length - 1) :
      (current + direction + buttons.length) % buttons.length;
    if (open) buttons[next].focus();
    else {
      initialFocus.current = next;
      setOpen(true);
    }
  }

  return (
    <div ref={root} className="dropdown" onKeyDown={moveFocus} onBlur={event => {
      if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget)) setOpen(false);
    }}>
      <button id={id} ref={trigger} type="button" className="dropdown-trigger" aria-label={accessibilityLabel}
        aria-controls={id + '-options'} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}>
        {label}<span className="dropdown-chevron" aria-hidden="true" />
      </button>
      <div className="dropdown-panel" hidden={!open}>
        <div id={id + '-options'} ref={menu} className="dropdown-options" role="menu" aria-labelledby={id}>
          {items.map(item => (
            <button id={item.id} key={item.key} type="button" className="dropdown-option"
              role={item.checked === undefined ? 'menuitem' : 'menuitemradio'} aria-checked={item.checked}
              tabIndex={open ? 0 : -1} onClick={() => {
                setOpen(false);
                trigger.current?.focus();
                item.onSelect();
              }}>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
