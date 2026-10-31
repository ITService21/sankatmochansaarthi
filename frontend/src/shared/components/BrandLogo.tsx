/** Sankatmochan Saarthi logo (public/logo.png). `height` is in px; width follows the artwork's aspect ratio. */
export function BrandLogo({ height = 44, className = "" }: { height?: number; className?: string }) {
  return <img src="/logo.png" alt="Sankatmochan Saarthi" style={{ height }} className={`w-auto max-w-none shrink-0 select-none object-contain ${className}`} draggable={false} />;
}
