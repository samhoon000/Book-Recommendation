/** Libria wordmark: a lit spine standing in for the "i". */
export function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`flex items-baseline font-display text-[1.7rem] font-semibold leading-none tracking-[-0.01em] text-vellum ${className}`}>
      Libr
      <span className="relative mx-[0.06em] inline-block h-[0.72em] w-[0.16em] translate-y-[0.02em] rounded-[1px] bg-lamp shadow-[0_0_14px_rgba(224,170,72,0.7)]" aria-hidden />
      a<span className="sr-only">Libria</span>
    </span>
  );
}
