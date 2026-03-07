type SearchBarProps = {
  value: string;
  placeholder?: string;
  onChange: (value: string) => void;
};

export default function SearchBar({ value, placeholder = "Search", onChange }: SearchBarProps) {
  return (
    <input
      value={value}
      className="w-full rounded border px-3 py-2"
      placeholder={placeholder}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}
