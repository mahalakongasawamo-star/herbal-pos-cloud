import React, { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { categoryHue } from '../lib/seed';

export const cx = (...a) => a.filter(Boolean).join(' ');

// ---------------------------------------------------------------- Buttons
const BTN_BASE =
  'inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold whitespace-nowrap select-none transition-colors ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:ring-offset-surface ' +
  'disabled:cursor-not-allowed disabled:opacity-45';
const BTN_SIZE = {
  sm: 'h-9 px-3 text-sm',
  md: 'h-11 px-4 text-[15px]',
  lg: 'h-14 px-5 text-base',
};
const BTN_VARIANT = {
  primary: 'bg-turmeric text-turmeric-ink hover:bg-turmeric-2 disabled:hover:bg-turmeric',
  leaf: 'bg-leaf text-leaf-ink hover:bg-leaf-2 disabled:hover:bg-leaf',
  secondary: 'border border-line-strong bg-surface text-ink hover:bg-sunken disabled:hover:bg-surface',
  ghost: 'text-ink-2 hover:bg-sunken hover:text-ink',
  danger: 'bg-bad text-surface hover:opacity-90',
  dangerGhost: 'text-bad hover:bg-bad-soft',
};

export function Button({ variant = 'secondary', size = 'md', icon: Icon, iconRight: IconRight, className, children, ...rest }) {
  const s = size === 'sm' ? 16 : 18;
  return (
    <button type="button" className={cx(BTN_BASE, BTN_SIZE[size], BTN_VARIANT[variant], className)} {...rest}>
      {Icon && <Icon size={s} aria-hidden="true" strokeWidth={2.2} />}
      {children}
      {IconRight && <IconRight size={s} aria-hidden="true" strokeWidth={2.2} />}
    </button>
  );
}

export function IconButton({ icon: Icon, label, className, size = 36, tone = 'default', ...rest }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cx(
        'inline-flex shrink-0 items-center justify-center rounded-[10px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf disabled:cursor-not-allowed disabled:opacity-40',
        tone === 'danger' ? 'text-muted hover:bg-bad-soft hover:text-bad' : 'text-ink-2 hover:bg-sunken hover:text-ink',
        className,
      )}
      style={{ width: size, height: size }}
      {...rest}
    >
      <Icon size={18} aria-hidden="true" strokeWidth={2.2} />
    </button>
  );
}

// ---------------------------------------------------------------- Form fields
export const inputCls =
  'h-11 w-full min-w-0 rounded-[10px] border border-line-strong bg-surface px-3 text-[15px] text-ink placeholder:text-muted ' +
  'focus:border-leaf focus:outline-none focus:ring-2 focus:ring-leaf/30 disabled:bg-sunken disabled:text-muted read-only:bg-sunken';

export function Field({ label, htmlFor, hint, error, required, className, children, labelAside }) {
  return (
    <div className={cx('flex min-w-0 flex-col gap-1.5', className)}>
      {(label || labelAside) && (
        <div className="flex items-baseline justify-between gap-2">
          {label && (
            <label htmlFor={htmlFor} className="text-sm font-semibold text-ink-2">
              {label}
              {required && (
                <span className="text-bad" aria-hidden="true">
                  {' '}
                  *
                </span>
              )}
            </label>
          )}
          {labelAside}
        </div>
      )}
      {children}
      {error ? (
        <p className="text-sm font-medium text-bad" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="text-xs leading-snug text-muted">{hint}</p>
      ) : null}
    </div>
  );
}

export const Input = React.forwardRef(function Input({ className, invalid, ...rest }, ref) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cx(inputCls, invalid && 'border-bad focus:border-bad focus:ring-bad/25', className)}
      {...rest}
    />
  );
});

export function Select({ className, invalid, children, ...rest }) {
  return (
    <select aria-invalid={invalid || undefined} className={cx(inputCls, 'pr-8', invalid && 'border-bad', className)} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }) {
  return <textarea className={cx(inputCls, 'h-auto min-h-[88px] py-2.5 leading-snug', className)} {...rest} />;
}

/** Radio group rendered as buttons. options: [{ value, label, disabled, icon, render }] */
export function Segmented({ value, onChange, options, disabled, size = 'md', ariaLabel, className, invalid }) {
  const refs = useRef([]);
  const enabled = options.filter((o) => !o.disabled && !disabled);
  const onKey = (e, i) => {
    if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
    e.preventDefault();
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1;
    const cur = enabled.findIndex((o) => o.value === options[i].value);
    const next = enabled[(cur + dir + enabled.length) % enabled.length];
    if (!next) return;
    onChange(next.value);
    refs.current[options.indexOf(next)]?.focus();
  };
  const checkedIdx = options.findIndex((o) => o.value === value);
  return (
    <div role="radiogroup" aria-label={ariaLabel} aria-invalid={invalid || undefined} className={cx('flex flex-wrap gap-2', className)}>
      {options.map((o, i) => {
        const on = o.value === value;
        const off = disabled || o.disabled;
        const focusable = on || (checkedIdx < 0 && i === options.findIndex((x) => !x.disabled));
        return (
          <button
            key={o.value}
            ref={(el) => (refs.current[i] = el)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={off ? -1 : focusable ? 0 : -1}
            disabled={off}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={cx(
              'inline-flex items-center gap-2 whitespace-nowrap rounded-[10px] border font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-1 focus-visible:ring-offset-surface',
              size === 'sm' ? 'h-9 px-3 text-sm' : 'h-11 px-4 text-[15px]',
              on ? 'border-leaf bg-leaf text-leaf-ink' : 'border-line-strong bg-surface text-ink hover:bg-sunken',
              invalid && !on && 'border-bad/70',
              off && 'cursor-not-allowed opacity-45 hover:bg-surface',
            )}
          >
            {o.icon && <o.icon size={16} aria-hidden="true" strokeWidth={2.2} />}
            {o.render ? o.render(on) : o.label}
          </button>
        );
      })}
    </div>
  );
}

export function Toggle({ checked, onChange, label, disabled, id }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cx(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-leaf focus-visible:ring-offset-2 focus-visible:ring-offset-surface disabled:opacity-45',
        checked ? 'bg-leaf' : 'bg-line-strong',
      )}
    >
      <span className={cx('inline-block h-5 w-5 rounded-full bg-surface shadow transition-transform', checked ? 'translate-x-[22px]' : 'translate-x-0.5')} />
    </button>
  );
}

// ---------------------------------------------------------------- Display
const STATUS = {
  in: { label: 'In stock', cls: 'bg-ok-soft text-ok' },
  low: { label: 'Low stock', cls: 'bg-warn-soft text-warn' },
  out: { label: 'Out of stock', cls: 'bg-bad-soft text-bad' },
};
export function StatusBadge({ status, className }) {
  const s = STATUS[status] || STATUS.in;
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold', s.cls, className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {s.label}
    </span>
  );
}

export function Pill({ tone = 'neutral', className, children }) {
  const tones = {
    neutral: 'bg-sunken text-ink-2',
    leaf: 'bg-leaf-soft text-leaf',
    turmeric: 'bg-turmeric-soft text-turmeric-ink',
    ok: 'bg-ok-soft text-ok',
    warn: 'bg-warn-soft text-warn',
    bad: 'bg-bad-soft text-bad',
  };
  return <span className={cx('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-bold', tones[tone], className)}>{children}</span>;
}

export function CategoryDot({ category, size = 8, className }) {
  return (
    <span
      aria-hidden="true"
      className={cx('inline-block shrink-0 rounded-full', className)}
      style={{ width: size, height: size, background: categoryHue(category) }}
    />
  );
}

export function Sku({ children, className }) {
  return <span className={cx('font-mono text-[12.5px] tracking-tight text-muted', className)}>{children}</span>;
}

export function Panel({ title, description, actions, className, bodyClassName, children, as: Tag = 'section', id }) {
  return (
    <Tag id={id} className={cx('rounded-2xl border border-line bg-surface', className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-4 pb-1 pt-4 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-lg font-bold leading-tight text-ink">{title}</h2>}
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={bodyClassName ?? 'px-4 pb-4 pt-3 sm:px-5 sm:pb-5'}>{children}</div>
    </Tag>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-2xl font-extrabold tracking-tight text-ink sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1 max-w-[70ch] text-[15px] text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon: Icon, title, children, action, className }) {
  return (
    <div className={cx('flex flex-col items-center px-6 py-10 text-center', className)}>
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-leaf-soft text-leaf">
          <Icon size={22} aria-hidden="true" />
        </div>
      )}
      <p className="font-bold text-ink">{title}</p>
      {children && <div className="mt-1 max-w-[46ch] text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

/** Horizontal meter used by reports. */
export function Meter({ value, max, tone = 'leaf' }) {
  const w = max > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0;
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-sunken" aria-hidden="true">
      <div className={cx('h-full rounded-full', tone === 'turmeric' ? 'bg-turmeric' : 'bg-leaf')} style={{ width: `${w}%` }} />
    </div>
  );
}

// ---------------------------------------------------------------- Overlays
function useDialogBehaviour(open, onClose, panelRef) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.activeElement;
    const t = setTimeout(() => {
      const el = panelRef.current;
      if (!el) return;
      const target = el.querySelector('[data-autofocus]') || el.querySelector('input:not([disabled]),select,textarea,button:not([data-close]):not([hidden])');
      (target || el).focus?.();
    }, 20);
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      }
      if (e.key === 'Tab' && panelRef.current) {
        const nodes = panelRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])');
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      document.removeEventListener('keydown', onKey, true);
      if (prev && prev.focus) setTimeout(() => prev.focus(), 0);
    };
  }, [open, onClose, panelRef]);
}

const MODAL_SIZE = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };

export function Modal({ open, onClose, title, description, size = 'md', footer, children, bodyClassName }) {
  const panelRef = useRef(null);
  const titleId = useId();
  useDialogBehaviour(open, onClose, panelRef);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 bg-ink/45" onClick={onClose} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cx(
          'relative flex max-h-[92%] w-full flex-col rounded-t-2xl bg-surface text-ink shadow-2xl outline-none sm:max-h-[88%] sm:rounded-2xl',
          MODAL_SIZE[size],
        )}
      >
        <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg font-bold leading-tight">
              {title}
            </h2>
            {description && <p className="mt-1 text-sm text-muted">{description}</p>}
          </div>
          <IconButton icon={X} label="Close" onClick={onClose} data-close="" />
        </header>
        <div className={cx('min-h-0 flex-1 overflow-y-auto px-5 py-4', bodyClassName)}>{children}</div>
        {footer && <footer className="pb-safe flex flex-wrap justify-end gap-2 border-t border-line px-5 pt-4">{footer}</footer>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({ open, onClose, title, children }) {
  const panelRef = useRef(null);
  const titleId = useId();
  useDialogBehaviour(open, onClose, panelRef);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-ink/35" onClick={onClose} aria-hidden="true" />
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="drawer-panel relative flex h-full w-full max-w-[520px] flex-col bg-surface text-ink shadow-2xl outline-none"
      >
        <header className="flex items-center justify-between gap-4 border-b border-line px-5 py-4">
          <h2 id={titleId} className="text-xl font-extrabold tracking-tight">
            {title}
          </h2>
          <IconButton icon={X} label="Close" onClick={onClose} data-close="" />
        </header>
        <div className="pb-safe min-h-0 flex-1 overflow-y-auto px-5 pt-4">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------- Toasts
const ToastCtx = createContext(() => {});
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const dismiss = useCallback((id) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const toast = useCallback(
    ({ tone = 'ok', title, message, duration = 4200 }) => {
      const id = Math.random().toString(36).slice(2);
      setItems((xs) => [...xs.slice(-3), { id, tone, title, message }]);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );
  const icon = { ok: CircleCheck, warn: TriangleAlert, bad: TriangleAlert, info: Info };
  const tone = { ok: 'text-ok', warn: 'text-warn', bad: 'text-bad', info: 'text-leaf' };
  return (
    <ToastCtx.Provider value={toast}>
      {children}
      {createPortal(
        <div aria-live="polite" className="toast-region pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-5 sm:items-end">
          {items.map((t) => {
            const I = icon[t.tone] || Info;
            return (
              <div key={t.id} role="status" className="toast-in pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-ink shadow-xl">
                <I size={20} className={cx('mt-0.5 shrink-0', tone[t.tone])} aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <p className="font-bold leading-snug">{t.title}</p>
                  {t.message && <p className="mt-0.5 break-words text-sm text-muted">{t.message}</p>}
                </div>
                <IconButton icon={X} label="Dismiss" size={28} onClick={() => dismiss(t.id)} />
              </div>
            );
          })}
        </div>,
        document.body,
      )}
    </ToastCtx.Provider>
  );
}

// ---------------------------------------------------------------- Confirm
const ConfirmCtx = createContext(async () => false);
export const useConfirm = () => useContext(ConfirmCtx);

/**
 * confirm({ title, message, confirmLabel, tone, input: { label, placeholder, required }, typeToConfirm })
 * resolves false, true, or the typed input text when `input` is given.
 */
export function ConfirmProvider({ children }) {
  const [req, setReq] = useState(null);
  const [text, setText] = useState('');
  const resolver = useRef(null);
  const confirm = useCallback((opts) => {
    setText('');
    setReq(opts);
    return new Promise((resolve) => {
      resolver.current = resolve;
    });
  }, []);
  const close = useCallback((result) => {
    resolver.current?.(result);
    resolver.current = null;
    setReq(null);
  }, []);
  const needsText = !!req?.input?.required || !!req?.typeToConfirm;
  const textOk = req?.typeToConfirm ? text.trim().toLowerCase() === req.typeToConfirm.toLowerCase() : !req?.input?.required || text.trim().length > 0;
  const submit = () => {
    if (needsText && !textOk) return;
    close(req?.input ? text.trim() : true);
  };
  return (
    <ConfirmCtx.Provider value={confirm}>
      {children}
      <Modal
        open={!!req}
        onClose={() => close(false)}
        title={req?.title}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => close(false)} data-autofocus={!needsText && req?.tone === 'danger' ? '' : undefined}>
              {req?.cancelLabel || 'Cancel'}
            </Button>
            <Button
              variant={req?.tone === 'danger' ? 'danger' : 'leaf'}
              onClick={submit}
              disabled={needsText && !textOk}
              data-autofocus={!needsText && req?.tone !== 'danger' ? '' : undefined}
            >
              {req?.confirmLabel || 'Confirm'}
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          {req?.message && <div className="text-[15px] leading-relaxed text-ink-2">{req.message}</div>}
          {(req?.input || req?.typeToConfirm) && (
            <Field
              className="mt-4"
              label={req.input?.label || `Type “${req.typeToConfirm}” to confirm`}
              htmlFor="confirm-text"
            >
              <Input
                id="confirm-text"
                data-autofocus=""
                value={text}
                placeholder={req.input?.placeholder || ''}
                onChange={(e) => setText(e.target.value)}
                autoComplete="off"
              />
            </Field>
          )}
          <button type="submit" hidden aria-hidden="true" tabIndex={-1} />
        </form>
      </Modal>
    </ConfirmCtx.Provider>
  );
}
