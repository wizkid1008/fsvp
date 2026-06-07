"use client";

import { useMemo, useState } from "react";

type CountryOption = {
  country_code: string;
  country_name: string;
};

export function CountryCombobox({
  countries,
  defaultValue = "",
  name = "country",
  label = "Country",
  required = false
}: {
  countries: CountryOption[];
  defaultValue?: string;
  name?: string;
  label?: string;
  required?: boolean;
}) {
  const [query, setQuery] = useState(defaultValue);
  const [selectedCountry, setSelectedCountry] = useState(defaultValue);
  const [open, setOpen] = useState(false);

  const exactMatch = countries.find((country) => country.country_name.toLowerCase() === query.trim().toLowerCase());
  const submittedCountry = selectedCountry || exactMatch?.country_name || "";
  const filteredCountries = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    if (!normalizedQuery) {
      return countries.slice(0, 60);
    }

    return countries
      .filter((country) => {
        const name = country.country_name.toLowerCase();
        const code = country.country_code.toLowerCase();
        return name.includes(normalizedQuery) || code.includes(normalizedQuery);
      })
      .slice(0, 60);
  }, [countries, query]);

  function chooseCountry(country: CountryOption) {
    setQuery(country.country_name);
    setSelectedCountry(country.country_name);
    setOpen(false);
  }

  return (
    <div className="relative">
      <label className="text-sm font-medium text-slate-700" htmlFor={name}>
        {label} {required ? <span className="text-red-500">*</span> : null}
      </label>
      <input name={name} type="hidden" value={submittedCountry} required={required} />
      <input
        id={name}
        value={query}
        onBlur={() => {
          window.setTimeout(() => setOpen(false), 150);
        }}
        onChange={(event) => {
          setQuery(event.target.value);
          setSelectedCountry("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        className="mt-2 h-11 w-full rounded-md border border-line bg-white px-3 outline-none focus:border-forest"
        placeholder="Search countries"
        autoComplete="off"
      />
      {open ? (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-md border border-line bg-white shadow-lg">
          {filteredCountries.length > 0 ? (
            filteredCountries.map((country) => (
              <button
                key={country.country_code}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => chooseCountry(country)}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-slate-50 focus:bg-slate-50 focus:outline-none"
              >
                <span className="text-slate-800">{country.country_name}</span>
                <span className="text-xs font-semibold text-slate-400">{country.country_code}</span>
              </button>
            ))
          ) : (
            <p className="px-3 py-2 text-sm text-slate-500">No countries found.</p>
          )}
        </div>
      ) : null}
      <p className="mt-1 text-xs text-slate-500">Start typing, then choose a country from the list.</p>
    </div>
  );
}
