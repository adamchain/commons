import { useEffect, useRef, useState } from "react";
import { api } from "../api/http";
import { formatPlaceAddress } from "../lib/format";

export type LocationValue = { name: string; address: string; lat?: number; lng?: number };

interface LocationSuggestion {
  name: string;
  address: string;
  placeId?: string;
}

interface NominatimResult {
  display_name: string;
  name?: string;
  address?: Record<string, string>;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

function buildNominatimSuggestion(result: NominatimResult): LocationSuggestion {
  const fallbackName = result.display_name.split(",")[0]?.trim() ?? result.display_name;
  const name = (result.name && result.name.trim()) || fallbackName;
  return { name, address: result.display_name };
}

/** Drop duplicate venue rows (same placeId, or same name+address). */
function dedupeSuggestions(items: LocationSuggestion[]): LocationSuggestion[] {
  const seen = new Set<string>();
  const out: LocationSuggestion[] = [];
  for (const s of items) {
    const idKey = s.placeId?.trim();
    const nameKey = `${(s.name || "").trim().toLowerCase()}|${(s.address || "").trim().toLowerCase()}`;
    const key = idKey ? `id:${idKey}` : `name:${nameKey}`;
    if (seen.has(key)) continue;
    // Also collapse same display name when placeIds differ but labels match.
    const bareName = (s.name || "").trim().toLowerCase();
    if (bareName && seen.has(`bare:${bareName}`)) continue;
    seen.add(key);
    if (bareName) seen.add(`bare:${bareName}`);
    out.push(s);
  }
  return out;
}

export function LocationAutocomplete({
  name,
  address,
  onChange,
  placeholder = "Venue name — e.g. La Colombe",
}: {
  name: string;
  address: string;
  onChange: (next: LocationValue) => void;
  placeholder?: string;
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
    if (term.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }
    const controller = new AbortController();
    aborterRef.current = controller;
    setLoading(true);

    void (async () => {
      try {
        const g = await api<{ predictions: Array<{ placeId: string; name: string; address: string }> }>(
          `/api/places/autocomplete?q=${encodeURIComponent(term)}`,
          { signal: controller.signal },
        );
        if (g.predictions?.length) {
          setSuggestions(dedupeSuggestions(g.predictions.map((p) => ({
            name: p.name,
            address: p.address,
            placeId: p.placeId,
          }))));
          setLoading(false);
          return;
        }
      } catch {
        /* fall through to OSM */
      }

      if (term.trim().length < 3) {
        setSuggestions([]);
        setLoading(false);
        return;
      }
      // Keep the OSM fallback in the US and biased toward the Philly area —
      // without countrycodes/viewbox it returns worldwide matches, surfacing
      // venues in other countries.
      const url =
        `${NOMINATIM_URL}?format=jsonv2&addressdetails=1&limit=6` +
        `&countrycodes=us&viewbox=-75.60,40.20,-74.90,39.70&bounded=0` +
        `&q=${encodeURIComponent(term)}`;
      fetch(url, {
        signal: controller.signal,
        headers: { Accept: "application/json" },
      })
        .then((res) => (res.ok ? (res.json() as Promise<NominatimResult[]>) : Promise.reject()))
        .then((results) => {
          setSuggestions(dedupeSuggestions(results.map(buildNominatimSuggestion)));
          setLoading(false);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name === "AbortError") return;
          setSuggestions([]);
          setLoading(false);
        });
    })();
  };

  const handleInput = (value: string) => {
    setQuery(value);
    onChange({ name: value, address });
    setOpen(true);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => runSearch(value), 320);
  };

  const pick = async (suggestion: LocationSuggestion) => {
    // Bind immediately so the parent location field is set before any Details
    // round-trip — otherwise submit can still see an empty/unbound location.
    const fallbackName =
      (suggestion.name && suggestion.name.trim()) ||
      (suggestion.address && suggestion.address.split(",")[0]?.trim()) ||
      query.trim();
    const fallbackAddress = (suggestion.address && suggestion.address.trim()) || fallbackName;
    setQuery(fallbackName);
    onChange({ name: fallbackName, address: fallbackAddress });
    setOpen(false);
    setSuggestions([]);

    if (!suggestion.placeId) return;
    try {
      const d = await api<{ name: string; address: string; lat?: number; lng?: number }>(
        `/api/places/details?placeId=${encodeURIComponent(suggestion.placeId)}`,
      );
      const name = (d.name && d.name.trim()) || fallbackName;
      const address = (d.address && d.address.trim()) || fallbackAddress;
      setQuery(name);
      onChange({ name, address, lat: d.lat, lng: d.lng });
    } catch {
      /* already bound above */
    }
  };

  return (
    <div className="location-autocomplete" ref={containerRef}>
      <input
        placeholder={placeholder}
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
              onClick={() => void pick(s)}
            >
              <div className="location-suggestion-name">{s.name}</div>
              <div className="location-suggestion-address">{formatPlaceAddress(s.address)}</div>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
