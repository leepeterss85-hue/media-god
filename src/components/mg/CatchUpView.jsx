import React, { useMemo, useState } from 'react';
import { ExternalLink, Globe2, Search } from 'lucide-react';
import { CATCH_UP_SERVICES, filterCatchUpServices } from '@/components/mg/catchUpServices';
import { openNativeFireTvExternalUrl } from '@/components/mg/nativeFireTvBridge';

const regions = [...new Set(CATCH_UP_SERVICES.map(service => service.region))];
const controlClass = 'min-h-12 rounded-lg border border-white/20 bg-mg-card px-3 py-2 text-white outline-none focus:ring-2 focus:ring-mg-green';

export default function CatchUpView() {
  const [query, setQuery] = useState('');
  const [region, setRegion] = useState('');
  const [country, setCountry] = useState('');
  const countries = useMemo(() => [...new Set(CATCH_UP_SERVICES.filter(service => !region || service.region === region).map(service => service.country))].sort(), [region]);
  const services = useMemo(() => filterCatchUpServices({ query, region, country }), [query, region, country]);
  const reset = () => { setQuery(''); setRegion(''); setCountry(''); };

  return (
    <section className="w-full p-4 pb-24 md:p-6 md:pb-24" aria-labelledby="catchup-title">
      <h1 id="catchup-title" className="flex items-center gap-3 text-2xl font-bold text-white"><Globe2 className="text-mg-green" />Worldwide Catch-up</h1>
      <p className="mt-2 max-w-3xl text-sm text-white/65">Browse official catch-up and on-demand services from around the world. Choose a service to open its website and find a programme.</p>
      <p className="mt-3 max-w-3xl rounded-lg border border-white/10 bg-mg-card p-3 text-sm text-white/60">Availability depends on your location, the programme and your device. Services may require an account or subscription. If playback is unsupported on your TV, use the provider’s official app. Changing the country filter does not change viewing rights.</p>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <label className="flex flex-col gap-1 text-sm text-white/70 sm:col-span-2">
          <span className="flex items-center gap-2"><Search className="h-4 w-4" />Search services, countries or languages</span>
          <input type="search" value={query} onChange={event => setQuery(event.target.value)} className={controlClass} placeholder="Try BBC, Australia or French" data-mg-focus-key="catchup:search" />
        </label>
        <label className="flex flex-col gap-1 text-sm text-white/70">Region
          <select value={region} onChange={event => { setRegion(event.target.value); setCountry(''); }} className={controlClass} data-mg-focus-key="catchup:region">
            <option value="">All regions</option>{regions.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-white/70">Country / area
          <select value={country} onChange={event => setCountry(event.target.value)} className={controlClass} data-mg-focus-key="catchup:country">
            <option value="">All countries / areas</option>{countries.map(value => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
      </div>
      <div className="my-4 flex flex-wrap items-center gap-3">
        <p role="status" className="text-sm text-white/60">{services.length} of {CATCH_UP_SERVICES.length} services</p>
        {(query || region || country) && <button type="button" onClick={reset} className={controlClass}>Clear filters</button>}
      </div>
      {services.length === 0 ? <p className="rounded-xl border border-white/10 p-6 text-white/70">No services match. Try another search or clear the filters.</p> : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 3xl:grid-cols-4">
          {services.map(service => (
            <a key={service.id} href={service.url} target="_blank" rel="noopener noreferrer"
              data-mg-focus-key={`catchup:${service.id}`}
              onClick={event => {
                if (!event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey && openNativeFireTvExternalUrl(service.url)) event.preventDefault();
              }}
              className="flex min-h-48 flex-col rounded-xl border border-white/10 bg-mg-card p-4 text-left transition-colors hover:border-mg-green/60 focus:outline-none focus:ring-2 focus:ring-mg-green">
              <span className="text-xs font-semibold text-mg-green">{service.country}</span>
              <h2 className="mt-2 text-lg font-bold text-white">{service.name}</h2>
              <p className="mt-1 text-xs text-white/50">{service.language}</p>
              <p className="mt-3 flex-1 text-sm text-white/70">{service.description}</p>
              <span className="mt-4 flex items-center gap-2 text-sm font-semibold text-mg-green">Open official service <ExternalLink className="h-4 w-4" /></span>
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
