(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.WeatherModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const priorities = {'Tornado Warning':0,'Flash Flood Warning':1,'Hurricane Warning':2,'Storm Surge Warning':3,'Severe Thunderstorm Warning':4,'Tropical Storm Warning':5,'Tornado Watch':6,'Severe Thunderstorm Watch':7};
  function priority(a) { return priorities[a.event] ?? (/Warning/.test(a.event) ? 8 : /Watch/.test(a.event) ? 9 : 10); }
  function alertColor(a) { return /Tornado Warning/.test(a.event) ? '#ff4b67' : /Warning/.test(a.event) ? '#ff8155' : /Watch/.test(a.event) ? '#ffc857' : '#6bc9ff'; }
  function spotlightAlerts(alerts) {
    const immediate=alerts.filter(a=>priority(a)<=1);
    const warnings=alerts.filter(a=>/Warning/.test(a.event));
    const watches=alerts.filter(a=>/Watch/.test(a.event));
    return immediate.length?immediate:warnings.length?warnings:watches.length?watches:alerts;
  }
  function showSequence(alerts, camerasEnabled=true) {
    if (alerts.some(a=>priority(a)<=1)) return ['warnings','radar'];
    return ['radar','warnings',...(camerasEnabled?['camera']:[]),'radar','watches','forecast'];
  }
  function normalizeAlerts(data, now = Date.now()) {
    if (!Array.isArray(data.features)) throw new Error('Invalid NWS alerts response');
    return data.features.filter(f => {
      const p = f.properties || {};
      const end = Math.min(Date.parse(p.expires) || Infinity, Date.parse(p.ends) || Infinity);
      return p.status === 'Actual' && p.messageType !== 'Cancel' && end > now && (!p.effective || Date.parse(p.effective) <= now);
    }).map(f => {const p = f.properties; return {
      id: p.id || f.id, event: p.event, headline: p.headline, description: p.description,
      instruction: p.instruction, areaDesc: p.areaDesc, severity: p.severity,
      sent: p.sent, effective: p.effective, expires: p.expires, ends: p.ends,
      geometry: f.geometry, geocode: p.geocode || {}, affectedZones: p.affectedZones || [],
      url: p['@id'] || f.id
    };}).sort((a,b) => priority(a)-priority(b) || Date.parse(b.sent)-Date.parse(a.sent));
  }
  function activeAlerts(alerts, now = Date.now()) {
    return alerts.filter(a => Math.min(Date.parse(a.expires) || Infinity, Date.parse(a.ends) || Infinity) > now);
  }
  function parseRadarTimes(xml) {
    const value = xml.match(/<Dimension\b[^>]*name=["']time["'][^>]*>([^<]+)<\/Dimension>/i)?.[1];
    if (!value) throw new Error('Radar time metadata unavailable');
    let times;
    if (value.includes('/')) {
      const [start,end,step] = value.trim().split('/');
      const duration = step?.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
      const ms = duration ? ((+duration[1] || 0)*3600+(+duration[2] || 0)*60+(+duration[3] || 0))*1000 : 0;
      if (!ms || !Number.isFinite(Date.parse(end))) throw new Error('Unsupported radar time interval');
      times = [];
      for (let t=Date.parse(end); t>=Date.parse(start) && times.length<90; t-=ms) times.unshift(new Date(t).toISOString());
    } else times = value.split(',').map(s => s.trim()).filter(s => Number.isFinite(Date.parse(s)));
    times = [...new Set(times)].sort((a,b) => Date.parse(a)-Date.parse(b));
    if (!times.length) throw new Error('No radar frames available');
    // Approximately the last hour, every third source frame, always including newest.
    const recent = times.filter(t => Date.parse(t) >= Date.parse(times.at(-1))-60*60*1000);
    return [...new Set(recent.filter((_,i) => i%3===0).concat(times.at(-1)))].slice(-12);
  }
  function dayKey(time) { return new Intl.DateTimeFormat('en-CA',{timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time)); }
  function forecastDays(periods, now = Date.now()) {
    const days = new Map();
    for (const p of periods || []) {
      if (Date.parse(p.endTime)<=now) continue;
      const key = dayKey(p.startTime);
      if (!days.has(key)) days.set(key,{key, label:new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',weekday:'short'}).format(new Date(p.startTime)), high:null,low:null,summary:p.shortForecast,precipitation:null,isDaytime:p.isDaytime});
      const day = days.get(key);
      if (p.isDaytime) {day.high=p.temperature;day.summary=p.shortForecast;day.isDaytime=true;} else day.low=p.temperature;
      const pop = p.probabilityOfPrecipitation?.value;
      if (pop != null) day.precipitation=Math.max(day.precipitation ?? 0,pop);
    }
    return [...days.values()].slice(0,7);
  }
  function cameraScore(camera, alerts) {
    const county = String(camera.county || '').replace(/ County$/i,'').toLowerCase();
    const matches = alerts.filter(a => (a.geocode?.SAME || []).some(s => String(s).slice(-5)===camera.countyFips) || (county && (a.areaDesc || '').split(';').some(area => area.trim().replace(/ County$/i,'').toLowerCase()===county)));
    return matches.length ? 100 - Math.min(...matches.map(priority)) : 0;
  }
  return {priority,alertColor,spotlightAlerts,showSequence,normalizeAlerts,activeAlerts,parseRadarTimes,forecastDays,cameraScore};
});
