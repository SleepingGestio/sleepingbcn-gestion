import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { cn, formatHHMM, parseHHMM } from "@/lib/utils";

type Props = {
  value: string;
  onChange: (decimalValue: string) => void;
  onValidityChange?: (valid: boolean) => void;
  placeholder?: string;
  className?: string;
  id?: string;
};

function displayFor(value: string): string {
  return value.trim() === "" ? "" : formatHHMM(Number(value));
}

export function HHMMInput({ value, onChange, onValidityChange, placeholder, className, id }: Props) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => displayFor(value));
  const [invalid, setInvalid] = useState(false);

  useEffect(() => {
    if (!focused && !invalid) {
      setText(displayFor(value));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);

  const handleChange = (raw: string) => {
    setText(raw);
    if (raw.trim() === "") {
      setInvalid(false);
      onValidityChange?.(true);
      onChange("");
      return;
    }
    const parsed = parseHHMM(raw);
    if (parsed == null) {
      setInvalid(true);
      onValidityChange?.(false);
      return;
    }
    setInvalid(false);
    onValidityChange?.(true);
    onChange(String(parsed));
  };

  return (
    <Input
      id={id}
      type="text"
      inputMode="numeric"
      value={text}
      placeholder={placeholder ?? "HH:MM"}
      onFocus={() => setFocused(true)}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={() => setFocused(false)}
      className={cn(invalid && "border-red-500 focus-visible:ring-red-500", className)}
    />
  );
}
