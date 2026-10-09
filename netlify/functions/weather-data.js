const {cities} = require('../../weather/config.json');
const {normalizeAlerts, parseRadarTimes} = require('../../weather/model.js');
const RADAR = 'https://opengeo.ncep.noaa.gov/geoserver/conus/conus_bref_qcd/ows';
const cache = new Map();
const pending = new Map();
const USER_AGENT = 'MississippiNewsGroupWeather/1.0 (https://mississippinewsgroup.com/weather; myersgrouponline@gmail.com)';

async function fetchOfficial(url, format='json') {
  const target = new URL(url);
  if (target.protocol !== 'https:' || !['api.weather.gov','opengeo.ncep.noaa.gov'].includes(target.hostname)) throw new Error('Unapproved upstream');
  const response = await fetch(url,{headers:{'User-Agent':USER_AGENT,Accept:format==='json'?'application/geo+json, application/json':'application/xml'},signal:AbortSignal.timeout(12000)});
  if (!response.ok) throw new Error(`Official source returned ${response.status}`);
  return format==='json' ? response.json() : response.text();
}
async function cached(key, ttl, loader) {
  const existing = cache.get(key);
  if (existing && Date.now()-Date.parse(existing.fetchedAt)<ttl) return {...existing,stale:false};
  if (pending.has(key)) return pending.get(key);
  const task = (async () => {
    try {const entry={data:await loader(),fetchedAt:new Date().toISOString()};cache.set(key,entry);return {...entry,stale:false};}
    catch (error) {if(existing) return {...existing,stale:true}; throw error;}
  })();
  pending.set(key,task);
  try {return await task;} finally {pending.delete(key);}
}
function json(statusCode, body, ttl=0) {
  return {statusCode,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':ttl?`public, max-age=0, s-maxage=${ttl}`:'no-store','X-Content-Type-Options':'nosniff'},body:JSON.stringify(body)};
}
async function handler(event) {
  if (event.httpMethod && event.httpMethod!=='GET') return json(405,{error:'Method not allowed'});
  const {kind='alerts',city:cityId} = event.queryStringParameters || {};
  try {
    if (kind==='alerts') {
      const result = await cached('alerts',30000,()=>fetchOfficial('https://api.weather.gov/alerts/active?area=MS'));
      return json(200,{...result,data:normalizeAlerts(result.data),source:'National Weather Service'},result.stale?0:20);
    }
    if (kind==='radar') {
      const result=await cached('radar',60000,async()=>({times:parseRadarTimes(await fetchOfficial(`${RADAR}?service=WMS&version=1.3.0&request=GetCapabilities`,'text')),wms:RADAR,layer:'conus_bref_qcd'}));
      return json(200,{...result,source:'NOAA / NWS MRMS'},result.stale?0:45);
    }
    if (kind==='forecast') {
      const city=cities.find(c=>c.id===cityId);
      if(!city) return json(400,{error:'Unknown Mississippi location'});
      const result=await cached(`forecast:${city.id}`,600000,async()=>{
        const point=await cached(`point:${city.id}`,86400000,()=>fetchOfficial(`https://api.weather.gov/points/${city.lat},${city.lon}`));
        const forecast=await fetchOfficial(point.data.properties.forecast);
        if(!Array.isArray(forecast.properties?.periods) || !forecast.properties.periods.length) throw new Error('Forecast periods unavailable');
        return {city,updated:forecast.properties.updateTime || forecast.properties.generatedAt,periods:forecast.properties.periods,url:`https://forecast.weather.gov/MapClick.php?lat=${city.lat}&lon=${city.lon}`};
      });
      return json(200,{...result,source:'National Weather Service'},result.stale?0:300);
    }
    return json(400,{error:'Unknown weather resource'});
  } catch(error) {
    console.error('Weather source unavailable:',kind,error.message);
    return json(502,{error:'Official weather feed temporarily unavailable',source:'NOAA / National Weather Service'});
  }
}
module.exports={handler,cached,fetchOfficial};
