import { createClientFromRequest } from 'npm:@base44/sdk@0.8.44';
import { secrets } from 'base44:runtime';

// Scheduled public metadata/source hint refresh. NO user addons, RD keys or stream URLs.
// Strict per-run cap. Monthly request cap is a conservative operational guard,
// not an authoritative Base44 integration-credit meter.
const MAX_MONTHLY_REQUESTS = 6000;
const MAX_DAILY_REQUESTS = 180;
const MAX_PER_RUN = 2;
const TMDB = 'https://api.themoviedb.org/3';
export default async function(req: Request) {
  if (req.method !== 'POST') return Response.json({error:'POST required'}, {status:405});
  const client = createClientFromRequest(req);
  // Never expose a publicly invokable privileged scheduled writer.
  const secret = secrets.get('MEDIA_GOD_CATALOGUE_CRON_SECRET');
  if (!secret || req.headers.get('x-media-god-cron-secret') !== secret) {
    return Response.json({error:'Not authorised'}, {status:403});
  }
  const apiKey = secrets.get('TMDB_API_KEY');
  if (!apiKey) return Response.json({error:'TMDB not configured'}, {status:503});
  const month = new Date().toISOString().slice(0,7);
  const day = new Date().toISOString().slice(0,10);
  const dailyRows = await client.asServiceRole.entities.PublicSourceScanBudget.filter({month:day},'-created_date',1);
  const dailyBudget = dailyRows?.[0];
  const dailyUsed = Math.max(0,Number(dailyBudget?.requests)||0);
  if (dailyUsed + 5 > MAX_DAILY_REQUESTS) return Response.json({status:'daily-budget-exhausted',dailyUsed});
  const rows = await client.asServiceRole.entities.PublicSourceScanBudget.filter({month},'-created_date',1);
  const budget = rows?.[0];
  const used = Math.max(0,Number(budget?.requests)||0);
  if (used + 5 > MAX_MONTHLY_REQUESTS) return Response.json({status:'budget-exhausted',used});
  // Reserve the entire maximum before network activity. Serial scheduled calls
  // are required; overlapping writers must be disabled at workflow level.
  if (budget) await client.asServiceRole.entities.PublicSourceScanBudget.update(budget.id,{requests:used+5,updated_at:new Date().toISOString()});
  else await client.asServiceRole.entities.PublicSourceScanBudget.create({month,requests:5,updated_at:new Date().toISOString()});
  if (dailyBudget) await client.asServiceRole.entities.PublicSourceScanBudget.update(dailyBudget.id,{requests:dailyUsed+5,updated_at:new Date().toISOString()});
  else await client.asServiceRole.entities.PublicSourceScanBudget.create({month:day,requests:5,updated_at:new Date().toISOString()});
  const page = Math.floor(Date.now()/900000)%5+1;
  const params = new URLSearchParams({api_key:String(apiKey),sort_by:'primary_release_date.desc', 'primary_release_date.lte':new Date().toISOString().slice(0,10),page:String(page)});
  const response = await fetch(`${TMDB}/discover/movie?${params}`,{signal:AbortSignal.timeout(8000)});
  if (!response.ok) return Response.json({status:'tmdb-unavailable'});
  const data = await response.json();
  let checked = 0;
  for (const movie of (data.results||[]).slice(0,MAX_PER_RUN)) {
    const id = Number(movie.id);
    if (!Number.isInteger(id)||id<=0) continue;
    const key = `movie:${id}`;
    const existing = await client.asServiceRole.entities.PublicSourceAvailability.filter({media_key:key},'-checked_at',1);
    if (existing?.[0] && Date.parse(existing[0].expires_at)>Date.now()) continue;
    // Only publicly accessible source hint. Never classify missing streams as
    // proof of unavailability; public addon discovery is incomplete.
    let status='unknown';
    try {
      const stream = await fetch(`https://torrentio.strem.fun/stream/movie/tmdb:${id}.json`,{signal:AbortSignal.timeout(5000)});
      if (stream.ok) {
        const payload=await stream.json();
        if (Array.isArray(payload.streams) && payload.streams.some((item:any)=>item?.url||item?.infoHash||item?.externalUrl)) status='found';
      }
    } catch { /* fail open */ }
    const now=new Date().toISOString();
    const record={media_key:key,media_type:'movie',tmdb_id:String(id),status,checked_at:now,expires_at:new Date(Date.now()+(status==='found'?3600000:900000)).toISOString(),provider_count:status==='found'?1:0};
    if(existing?.[0]) await client.asServiceRole.entities.PublicSourceAvailability.update(existing[0].id,record);
    else await client.asServiceRole.entities.PublicSourceAvailability.create(record);
    checked++;
  }
  return Response.json({status:'ok',checked,monthly_request_reservation:used+5});
}
