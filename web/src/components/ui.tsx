import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type CSSProperties, type ReactNode,
} from "react";
import { Check, X } from "lucide-react";
import { cn } from "../lib/utils";

/* =============================== Button =============================== */
type ButtonVariant = "primary" | "mint" | "butter" | "lilac" | "sky" | "plain" | "ghost" | "danger";

export function Button({
  children, variant = "plain", size = "md", className, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: "sm" | "md" | "lg";
}) {
  const variantClass: Record<ButtonVariant, string> = {
    primary: "btn--primary",
    mint: "btn--mint",
    butter: "btn--butter",
    lilac: "btn--lilac",
    sky: "btn--sky",
    plain: "",
    ghost: "btn--ghost",
    danger: "btn--danger",
  };
  const sizeClass = size === "sm" ? "btn--sm" : size === "lg" ? "text-base px-6 py-3" : "";
  return (
    <button type="button" className={cn("btn", variantClass[variant], sizeClass, className)} {...rest}>
      {children}
    </button>
  );
}

export function IconButton({
  children, className, active, ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      aria-label={rest["aria-label"] || rest.title}
      className={cn(
        "btn btn--icon btn--ghost",
        active && "bg-[rgba(242,120,159,0.16)] text-[var(--color-pink)]",
        className
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ============================== Segmented ============================= */
export function Segmented<T extends string>({
  value, options, onChange, className,
}: {
  value: T;
  options: { value: T; label: ReactNode; title?: string }[];
  onChange: (v: T) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "rounded-full border-2 px-3 py-1.5 text-xs font-bold transition-all duration-200",
            value === o.value
              ? "border-[var(--color-ink)] bg-[var(--color-butter)] text-[var(--color-ink)] shadow-[2px_2px_0_rgba(61,52,40,0.85)]"
              : "border-transparent bg-white/70 text-[var(--color-ink-soft)] hover:border-[rgba(61,52,40,0.25)] hover:text-[var(--color-ink)]"
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* =============================== Fields =============================== */
export function Field({
  label, error, hint, children, className,
}: {
  label?: string;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      {label && (
        <span className="mb-1.5 block text-sm font-bold text-[var(--color-ink-soft)]">{label}</span>
      )}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-[var(--color-ink-faint)]">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-bold text-[var(--color-pink)]">{error}</span>}
    </label>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-block size-5 shrink-0 animate-spin rounded-full border-2 border-[rgba(61,52,40,0.18)] border-t-[var(--color-pink)]",
        className
      )}
    />
  );
}

/* ================================ Toast =============================== */
interface Toast {
  id: number;
  text: string;
  tone: "info" | "success" | "error";
}

const ToastCtx = createContext<{ push: (text: string, tone?: Toast["tone"]) => void }>({
  push: () => {},
});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);

  const push = useCallback((text: string, tone: Toast["tone"] = "info") => {
    seq.current += 1;
    const id = seq.current;
    setToasts((prev) => [...prev.slice(-2), { id, text, tone }]);
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2600);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div aria-live="polite" role="status" className="pointer-events-none fixed inset-x-0 bottom-24 z-[100] flex flex-col items-center gap-2 px-4 sm:bottom-8">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={cn(
              "anim-pop pointer-events-auto flex max-w-[92vw] items-center gap-2 rounded-full border-2 border-[var(--color-ink)] px-4 py-2 text-sm font-bold shadow-[3px_3px_0_rgba(61,52,40,0.85)]",
              t.tone === "success" && "bg-[var(--color-mint)] text-[#17352b]",
              t.tone === "error" && "bg-[var(--color-pink)] text-white",
              t.tone === "info" && "bg-[var(--color-paper)] text-[var(--color-ink)]"
            )}
          >
            {t.tone === "success" && <Check size={16} />}
            {t.tone === "error" && <X size={16} />}
            <span className="line-clamp-2">{t.text}</span>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

/* ================================ Modal =============================== */
function useDialog(open: boolean, onClose: () => void) {
  const reference = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const dialog = reference.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => reference.current?.focus());
    const onKey = (event: KeyboardEvent) => {
      if (event.isComposing || event.keyCode === 229) return;
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
      }
      if (event.key !== "Tab") return;
      const elements = Array.from(reference.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select, a[href], [tabindex="0"]') || []).filter((element) => element.getClientRects().length > 0);
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && (document.activeElement === first || document.activeElement === reference.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === reference.current)) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      const currentFocus = document.activeElement;
      if (!currentFocus || currentFocus === document.body || dialog?.contains(currentFocus)) previousFocus?.focus();
    };
  }, [open]);
  return reference;
}

export function Modal({
  open, onClose, title, children, footer, width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  const dialogRef = useDialog(open, onClose);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-end justify-center sm:items-center">
      <div
        className="absolute inset-0 bg-[rgba(61,52,40,0.35)] anim-fade-in"
        onClick={onClose}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "对话框"}
        tabIndex={-1}
        className={cn(
          "card-paper paper-grain anim-slide-up relative z-10 max-h-[88vh] w-full overflow-y-auto rounded-t-3xl sm:rounded-3xl",
          width
        )}
      >
        <div className="tape tape--pink" style={{ top: -13, left: "50%", marginLeft: -46, width: 92 }} />
        {title && (
          <div className="flex items-center justify-between px-5 pt-6 pb-3">
            <h3 className="font-[family-name:var(--font-brush)] text-2xl">{title}</h3>
            <IconButton onClick={onClose} aria-label="关闭">
              <X size={18} />
            </IconButton>
          </div>
        )}
        <div className="px-5 pb-5">{children}</div>
        {footer && <div className="flex justify-end gap-2 px-5 pb-5">{footer}</div>}
      </div>
    </div>
  );
}

/* ============================== BottomSheet =========================== */
export function Sheet({
  open, onClose, title, children, height = "58vh", dragging = false,
}: {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  height?: string;
  dragging?: boolean;
}) {
  const dialogRef = useDialog(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center transition-opacity duration-150" style={dragging ? { opacity: 0, pointerEvents: "none" } : undefined}>
      <div className="absolute inset-0 bg-[rgba(61,52,40,0.32)] anim-fade-in" onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : "编辑工具"}
        tabIndex={-1}
        className="card-paper relative z-10 w-full rounded-t-3xl anim-slide-up flex flex-col"
        style={{ height, paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <div className="mx-auto h-1.5 w-10 rounded-full bg-[rgba(61,52,40,0.18)] sm:hidden" />
          <h3 className="font-[family-name:var(--font-brush)] text-xl">{title}</h3>
          <IconButton onClick={onClose} className="ml-auto" aria-label="收起">
            <X size={18} />
          </IconButton>
        </div>
        <div className="thin-scroll flex-1 overflow-y-auto px-5 pb-6">{children}</div>
      </div>
    </div>
  );
}

/* ================================ Logo ================================ */
export function Logo({ size = 40 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 select-none">
      <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden>
        <rect x="1" y="1" width="62" height="62" rx="14" fill="#5b6650" />
        <path d="M22 48V18h23M22 32h17" fill="none" stroke="#f6f2e8" strokeWidth="2.8" strokeLinecap="round" />
        <path d="M31 47q0-15 17-18c1 13-7 20-17 18Z" fill="#c5c9b4" />
        <path d="m31 47 11-12" stroke="#5b6650" strokeWidth="1.2" />
      </svg>
      <span
        className="text-[var(--color-ink)]"
        style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontStyle: "italic", fontSize: size * 0.78, letterSpacing: "-.04em", lineHeight: 1 }}
      >
        Foliette
      </span>
    </span>
  );
}

/* ============================== Decoration ============================ */
const FLOATERS: { style: CSSProperties; content: string; anim: string }[] = [
  { style: { top: "8%", left: "6%", fontSize: 30 }, content: "✿", anim: "anim-float" },
  { style: { top: "16%", right: "9%", fontSize: 22 }, content: "❀", anim: "anim-float-slow" },
  { style: { bottom: "14%", left: "10%", fontSize: 26 }, content: "✧", anim: "anim-float-slow" },
  { style: { bottom: "8%", right: "7%", fontSize: 30 }, content: "❁", anim: "anim-float" },
  { style: { top: "46%", left: "3%", fontSize: 18 }, content: "✦", anim: "anim-float" },
];

export function FloatingPetals() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {FLOATERS.map((f, i) => (
        <span
          key={i}
          className={`absolute ${f.anim} text-[var(--color-pink)]/35`}
          style={{ ...f.style, animationDelay: `${i * 0.7}s` }}
        >
          {f.content}
        </span>
      ))}
    </div>
  );
}
