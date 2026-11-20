// Button.
// Props:
//   variant  'default' | 'primary' (timetable red) | 'quiet' (underlined text)
//   small    bool
//   pressed  bool or undefined; when set the button is a toggle (aria-pressed)
//   onClick, disabled, title, type ('button' by default), children
// Seg: a row of joined toggle buttons. Props: options [{value, label, title?}], value, onChange(value), small.
export default function Button({ variant = 'default', small = false, pressed, onClick, disabled, title, type = 'button', children }) {
  return (
    <button
      type={type}
      className={`btn ${variant === 'default' ? '' : variant} ${small ? 'small' : ''}`}
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
