import { useEffect, useRef, useState } from "react";

interface LocationSuggestion {
  name: string;
  address: string;
}

interface NominatimResult {
  display_name: string;
  name?: string;
  address?: Record<string, string>;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function buildSuggestion(result: NominatimResult): LocationSuggestion {
  const fallbackName = result.display_name.split(",")[0]?.trim() ?? result.display_name;
  const name = (result.name && result.name.trim()) || fallbackName;
  return { name, address: result.display_name };
}

export function LocationAutocomplete({
  name,
  address,
  onChange,
}: {
  name: string;
  address: string;
  onChange: (next: { name: string; address: string }) => void;
}) {
  const [query, setQuery] = useState(name);
  const [suggestions, setSuggestions] = useState<LocationSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const aborterRef = useRef<AbortController | null>(null);

  useEffect(() => {
    setQuery(name);
  }, [name]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const runSearch = (term: string) => {
    aborterRef.current?.abort();
    if (term.trim().length < 3) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    aborterRef.current = controller;
    setLoading(true);
    const url = `${NOMINATIM_URL}?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(term)}`;
    fetch(url, {
      signal: controller.signal,
      headers: { Accept: "application/json" },
    })
      .then((res) => (res.ok ? (res.json() as Promise<NominatimResult[]>) : Promise.reject()))
      .then((results) => {
        setSuggestions(results.map(buildSuggestion));
        setLoading(false);
      })
      .catch((err: unknown) => {
        if ((err as { name?: string })?.name === "AbortError") return;
        setSuggestions([]);
        setLoading(false);
      });
  };

  const handleInput = (value: string) => {
    setQuery(value);
    onChange({ name: value, address });
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 320);
  };

  const pick = (suggestion: LocationSuggestion) => {
    setQuery(suggestion.name);
    onChange(suggestion);
    setOpen(false);
    setSuggestions([]);
  };

  return (
    <div className="location-autocomplete" ref={containerRef}>
      <input
        placeholder="Drinker's Pub, La Colombe, Lloyd Hall…"
        value={query}
        onChange={(e) => handleInput(e.target.value)}
        onFocus={() => {
          if (suggestions.length > 0) setOpen(true);
        }}
        autoComplete="off"
      />
      {open && (loading || suggestions.length > 0) ? (
        <div className="location-suggestions" role="listbox">
          {loading && suggestions.length === 0 ? (
            <div className="location-suggestion-empty">Searching…</div>
          ) : null}
          {suggestions.map((s, idx) => (
            <button
              key={`${s.name}-${idx}`}
              type="button"
              className="location-suggestion"
              onClick={() => pick(s)}
            >
              <div className="location-suggestion-name">{s.name}</div>
              <div className="location-suggestion-address">{s.address}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
