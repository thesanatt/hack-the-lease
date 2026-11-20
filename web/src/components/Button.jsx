// Button. One primary per screen; everything else reads as a quiet text button.
// Props:
//   variant  'default' (text button with a soft hover) | 'primary' (filled green) | 'quiet' (underlined gray text)
//   tone     same as variant (older callers)
//   small    bool
//   pressed  bool or undefined; when set the button is a toggle (aria-pressed)
//   onClick, disabled, title, type ('button' by default), children
// Seg: joined toggles on one soft track. Props: options [{value, label, title?}], value, onChange(value), small, label.
export default function Button({ variant, tone, small = false, pressed, onClick, disabled, title, type = 'button', children }) {
  const v = variant || tone || 'default';
  return (
    <button
      type={type}
      className={`btn${v === 'default' ? '' : ` ${v}`}${small ? ' small' : ''}`}
      aria-pressed={pressed === undefined ? undefined : !!pressed}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      {children}
    </button>
  );
}

export function Seg({ options, value, onChange, small = true, label }) {
  return (
    <span className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <Button key={String(o.value)} small={small} pressed={o.value === value} title={o.title} onClick={() => onChange(o.value)}>
          {o.label}
        </Button>
      ))}
    </span>
  );
}
