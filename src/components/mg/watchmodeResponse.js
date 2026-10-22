export function watchmodeError(error) {
 const body=error?.response?.data;
 const payload=body?.data && typeof body.data==="object" ? body.data : body;
 const detail=payload?.error || payload?.message;
 if(typeof detail==="string" && detail.trim()) return detail;
 const status=Number(error?.response?.status || error?.status);
 if(status===503) return "Watchmode is unavailable. The server may be missing its Watchmode API key, or the provider may be temporarily offline. Check the Watchmode connection in Base44 backend secrets.";
 if(status===401 || status===403) return "Watchmode access was refused. Check the API key, permitted country and feature access for the Watchmode account.";
 if(status===429) return "Watchmode’s request limit has been reached. Please try again later.";
 return error?.message || "Watchmode data could not be loaded.";
}
export function watchmodeRows(value, keys=["events","live_events","leaving_dates","title_results","titles","results","leagues","changes","title_ids","awards","data"]) {
 if(Array.isArray(value)) return value;
 if(!value || typeof value!=="object") return [];
 for(const key of keys) {
  if(Array.isArray(value[key])) return value[key];
  if(value[key] && typeof value[key]==="object") {
   const rows=watchmodeRows(value[key], keys.filter(k=>k!==key));
   if(rows.length) return rows;
  }
 }
 return [];
}
