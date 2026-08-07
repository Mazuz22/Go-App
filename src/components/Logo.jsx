/**
 * The wordmark: two stones side by side, the way they sit in the bowl.
 *
 * A white stone carrying 碁 (go) in black, and a black stone carrying "GO" in
 * white — the same word twice, once in each language and each colour, which is
 * also the whole game in miniature.
 */
export default function Logo({ size = 'md', className = '' }) {
  return (
    <span className={`logo logo-${size} ${className}`.trim()} role="img" aria-label="Go">
      <span className="logo-stone logo-stone-white" aria-hidden="true">
        碁
      </span>
      <span className="logo-stone logo-stone-black" aria-hidden="true">
        GO
      </span>
    </span>
  )
}
