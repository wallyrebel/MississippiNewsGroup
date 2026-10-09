/* Automatic, source-timestamped weather display. No browser API keys required. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const M = window.WeatherModel;
  const R = window.RadarMap;
  const params = new URLSearchParams(location.search);
  const broadcast = params.get('broadcast') === '1' || /\/weather\/live\/?$/.test(location.pathname);
  document.body.classList.toggle('broadcast',broadcast);
  const NS='http://www.w3.org/2000/svg';
  const state={config:null,cityIndex:0,rotation:params.get('rotate')!=='0',forecasts:new Map(),forecastPending:new Map(),alerts:[],alertsAt:null,alertsFailed:false,radarAt:null,radarFailed:false,frames:[],frame:0,radarPlaying:true,countyFeatures:[],cameraList:[],cameraIndex:0,cameraTimer:null};
  const seconds=Math.max(10,Math.min(120,Number(params.get('seconds')) || 18));
  const radarSeconds=Math.max(10,Math.min(120,Number(params.get('radarseconds')) || 24));
  let radarScenes=[],radarChoice=params.get('radar')||'tour',radarScene='statewide',radarView=null,radarMetadata=null,radarGeneration=0,radarTourTimer=null,radarLoading=false,radarSceneFailed=false;
  let showMode=['radar','camera','warnings','watches','forecast'].includes(params.get('scene'))?params.get('scene'):'auto',mainScene='radar',showIndex=0,showTimer=null,cameraRefreshTimer=null,cameraAttempt=0;
  const featurePages={warnings:0,watches:0};
  const sceneDurations={radar:48,warnings:20,watches:20,camera:15,forecast:25};
  const central = (date,options={}) => new Intl.DateTimeFormat('en-US',{timeZone:'America/Chicago',...options}).format(new Date(date));
  const time = date => date && Number.isFinite(Date.parse(date)) ? central(date,{hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : 'time unavailable';
  const expiry = date => date && Number.isFinite(Date.parse(date)) ? central(date,{weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'}) : 'time unavailable';
  const age = stamp => stamp ? Date.now()-Date.parse(stamp) : Infinity;
  const esc = text => String(text ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const selectedCity=()=>state.config.cities[state.cityIndex];
  const selectedRegion=()=>state.config.regions.find(r=>r.cities.includes(selectedCity().id));
  function svg(tag,attrs={},text) {const el=document.createElementNS(NS,tag);for(const [k,v] of Object.entries(attrs)) el.setAttribute(k,v);if(text) el.textContent=text;return el;}
  async function getJSON(url) {
    const response=await fetch(url,{signal:AbortSignal.timeout(28000),cache:'no-cache'});
    if(!response.ok) throw new Error(`Feed unavailable (${response.status})`);
    return response.json();
  }
  const api=(kind,city)=>getJSON(`/.netlify/functions/weather-data?kind=${kind}${city?`&city=${encodeURIComponent(city)}`:''}`);
  function icon(summary='',night=false) {
    const lower=summary.toLowerCase();
    if(/tropical|hurricane|windy/.test(lower))return '<svg viewBox="0 0 85 82" aria-hidden="true"><path d="M12 27h41c18 0 18-20 4-20-6 0-9 4-9 7M8 42h56c18 0 18 24 2 24-6 0-9-4-9-8M20 55h17c14 0 14 19 1 19" fill="none" stroke="#b8e4ff" stroke-width="5" stroke-linecap="round"/></svg>';
    const thunder=/thunder|storm/.test(lower),rain=/rain|shower|drizzle/.test(lower),snow=/snow|sleet|ice|freez/.test(lower),cloud=/cloud|overcast|fog|haze/.test(lower)||rain||snow||thunder;
    const sun=night ? '<path d="M45 13a21 21 0 1 0 24 27 24 24 0 0 1-24-27" fill="#c1d8f4"/>' : '<g stroke="#ffcf54" stroke-width="3" stroke-linecap="round"><circle cx="40" cy="32" r="14" fill="#ffcf54"/><path d="M40 7v5m0 40v5M15 32h5m40 0h5M22 14l4 4m28 28 4 4M22 50l4-4m28-28 4-4"/></g>';
    const cloudy='<path d="M23 55a12 12 0 0 1 0-24 19 19 0 0 1 36-4 14 14 0 1 1 5 28Z" fill="#d8e5f1" stroke="#acc6db" stroke-width="1.5"/>';
    const precip=thunder?'<path d="m45 49-12 17h10l-5 12 20-22H46l6-7Z" fill="#ffcb48"/>':snow?'<g fill="#d7f0ff"><circle cx="29" cy="65" r="3"/><circle cx="44" cy="70" r="3"/><circle cx="59" cy="64" r="3"/></g>':rain?'<path d="m29 62-4 8m20-8-4 8m20-8-4 8" stroke="#61c9ff" stroke-width="4" stroke-linecap="round"/>':'';
    return `<svg viewBox="0 0 85 82" aria-hidden="true">${sun}${cloud?cloudy:''}${precip}</svg>`;
  }
  function clock() {$('clock').textContent=central(Date.now(),{hour:'numeric',minute:'2-digit',second:'2-digit'});$('date').textContent=central(Date.now(),{weekday:'short',month:'short',day:'numeric',timeZoneName:'short'});}
  function currentPeriods(entry) {return (entry?.data?.periods || []).filter(p=>Date.parse(p.endTime)>Date.now());}
  function forecastStale(entry) {return !entry || entry.stale || entry.failed || age(entry.fetchedAt)>30*60000 || age(entry.data.updated)>18*3600000;}
  async function loadForecast(id) {
    const entry=state.forecasts.get(id);
    if(entry && !entry.failed && age(entry.fetchedAt)<10*60000) return entry;
    if(state.forecastPending.has(id)) return state.forecastPending.get(id);
    const task=(async()=>{
      try {const result=await api('forecast',id);state.forecasts.set(id,result);}
      catch {if(entry) state.forecasts.set(id,{...entry,failed:true});}
      finally {state.forecastPending.delete(id);if(selectedCity().id===id) renderForecast();renderRegion();if(mainScene==='forecast')renderFeature();}
      return state.forecasts.get(id);
    })();
    state.forecastPending.set(id,task);return task;
  }
  function selectCity(id,manual=false) {
    const index=state.config.cities.findIndex(c=>c.id===id);if(index<0)return;
    state.cityIndex=index;if(manual){state.rotation=false;renderRotation();}
    $('city-select').value=id;
    for(const button of $('regions').querySelectorAll('button')) button.setAttribute('aria-current',String(button.dataset.region===selectedRegion().id));
    renderForecast();renderRegion();renderLabels();if(mainScene==='forecast')renderFeature();
    loadForecast(id);
    // Two at a time limits cold-start requests and NWS load.
    const others=selectedRegion().cities.filter(c=>c!==id);
    (async()=>{for(let i=0;i<others.length;i+=2) await Promise.all(others.slice(i,i+2).map(loadForecast));})();
  }
  function renderForecast() {
    const city=selectedCity(),entry=state.forecasts.get(city.id),period=currentPeriods(entry)[0],stale=forecastStale(entry);
    $('city-name').textContent=city.name;$('region-name').textContent=selectedRegion().name.toUpperCase();$('outlook-city').textContent=`/ ${city.name.toUpperCase()}`;
    $('hero-temp').textContent=period?.temperature ?? '—';$('hero-icon').innerHTML=period?icon(period.shortForecast,!period.isDaytime):'';
    $('period-name').textContent=period?`${period.name} · forecast`:'FORECAST UNAVAILABLE';
    $('hero-summary').textContent=period?.shortForecast || 'Waiting for the National Weather Service. Retrying automatically.';
    $('rain-chance').textContent=period?.probabilityOfPrecipitation?.value==null?'—':`${period.probabilityOfPrecipitation.value}%`;
    $('wind').textContent=period?`${period.windDirection} ${period.windSpeed}`:'—';
    $('forecast-status').textContent=entry?`${stale?'DELAYED · ':''}NWS issued ${time(entry.data.updated)}`:'NWS forecast is temporarily unavailable';
    $('forecast-status').classList.toggle('stale',stale);
    const days=M.forecastDays(entry?.data?.periods || []);
    $('forecast-days').innerHTML=Array.from({length:7},(_,i)=>{
      const d=days[i];return d?`<article class="day"><span class="day-name">${esc(d.label)}</span><div class="day-icon">${icon(d.summary,!d.isDaytime)}</div><div class="day-temperatures">${d.high??'—'}°<span>${d.low??'—'}°</span></div><div class="day-summary" title="${esc(d.summary)}">${esc(d.summary)}</div><span class="day-rain">${d.precipitation==null?'Rain —':`${d.precipitation}% rain`}</span></article>`:'<article class="day empty"><span class="day-name">—</span><span>Awaiting NWS</span><span>— / —</span></article>';
    }).join('');
    $('outlook-note').textContent=stale?'Forecast delayed / unavailable · highs / lows °F':'NWS highs / lows °F · rain: day/night maximum';
  }
  function renderRegion() {
    $('region-cities').innerHTML=selectedRegion().cities.filter(id=>id!==selectedCity().id).map(id=>{
      const city=state.config.cities.find(c=>c.id===id),entry=state.forecasts.get(id),p=currentPeriods(entry)[0];
      return `<div class="region-row"><span class="row-name">${esc(city.name)}</span><small>${entry&&forecastStale(entry)?'Delayed':esc(p?.shortForecast||'Loading…')}</small><span class="row-temp">${p?.temperature??'—'}°</span></div>`;
    }).join('');
  }
  function renderRotation() {$('rotation-toggle').textContent=state.rotation?'Pause city rotation':'Resume city rotation';}

  const xy=R.xy;
  function geoPath(geometry) {
    if(!geometry)return '';
    if(geometry.type==='GeometryCollection')return geometry.geometries.map(geoPath).join('');
    const polygons=geometry.type==='Polygon'?[geometry.coordinates]:geometry.type==='MultiPolygon'?geometry.coordinates:[];
    return polygons.map(poly=>poly.map(ring=>ring.map((c,i)=>{const [x,y]=xy(c);return `${i?'L':'M'}${x.toFixed(1)},${y.toFixed(1)}`;}).join('')+'Z').join('')).join('');
  }
  async function loadMap() {
    try {const [states,counties]=await Promise.all([getJSON('/weather/states.geojson'),getJSON('/weather/counties.geojson')]);
      for(const feature of states.features) $('states').append(svg('path',{d:geoPath(feature.geometry),class:`state-shape ${feature.properties.STATE==='28'?'mississippi':''}`}));
      state.countyFeatures=counties.features;
      for(const feature of counties.features) $('counties').append(svg('path',{d:geoPath(feature.geometry),class:'county-shape'}));
      renderLabels();renderAlertMap();
    }catch{$('map-message').textContent='Map boundaries unavailable · retrying';setTimeout(loadMap,60000);}
  }
  function renderLabels() {
    $('map-labels').replaceChildren();
    const scale=(radarView?.height||680)/680;
    const labels=[['ARKANSAS',-92.4,34.45],['LOUISIANA',-92.25,31.1],['ALABAMA',-87.1,33.1],['TENNESSEE',-89.6,35.17]];
    for(const [name,lon,lat] of labels){const [x,y]=xy([lon,lat]);$('map-labels').append(svg('text',{x,y,class:'state-label','text-anchor':'middle',style:`font-size:${18*scale}px;letter-spacing:${3*scale}px`},name));}
    const [gx,gy]=xy([-88.25,30.02]);$('map-labels').append(svg('text',{x:gx,y:gy,class:'water-label','text-anchor':'middle',style:`font-size:${20*scale}px;letter-spacing:${3*scale}px`},'GULF OF MEXICO'));
    // Labels are intentionally thinned at the crowded Coast; selected city always appears.
    const hidden=['cleveland','greenwood','brookhaven','bay-st-louis','biloxi','columbus','picayune'];
    for(const city of state.config.cities){const active=city.id===selectedCity().id;if((!radarView||radarView.id==='statewide')&&hidden.includes(city.id)&&!active)continue;const [x,y]=xy([city.lon,city.lat]);const left=['greenville','clarksdale','natchez','vicksburg','southaven','mccomb','gulfport'].includes(city.id);$('map-labels').append(svg('circle',{cx:x,cy:y,r:(active?4.5:2.7)*scale,class:'city-dot','stroke-width':1.5*scale}),svg('text',{x:x+(left?-7:7)*scale,y:y-5*scale,'text-anchor':left?'end':'start',class:`city-label ${active?'selected':''}`,style:`font-size:${(active?26:22)*scale}px;stroke-width:${3*scale}px`},city.name));}
  }
  function radarURL(data,stamp,view) {
    const url=new URL(data.wms);url.search=new URLSearchParams({service:'WMS',version:'1.1.1',request:'GetMap',layers:data.layer,styles:'',format:'image/png',transparent:'true',srs:'EPSG:3857',bbox:view.bbox.join(','),width:String(view.pixels[0]),height:String(view.pixels[1]),time:stamp});return url.href;
  }
  function preloadFrame(data,stamp,view) {return new Promise((resolve,reject)=>{
    const img=new Image(),timer=setTimeout(()=>{img.src='';reject(new Error('Radar image timed out'));},18000);img.onload=()=>{clearTimeout(timer);resolve({stamp,url:img.src});};img.onerror=()=>{clearTimeout(timer);reject(new Error('Radar image unavailable'));};img.src=radarURL(data,stamp,view);
  });}
  function scheduleRadarTour(){
    clearTimeout(radarTourTimer);
    if(radarChoice==='tour'&&mainScene==='radar')radarTourTimer=setTimeout(()=>{const index=radarScenes.findIndex(s=>s.id===radarScene);radarScene=radarScenes[(index+1)%radarScenes.length].id;loadRadarScene();},radarSeconds*1000);
  }
  async function loadRadarScene(){
    if(!radarMetadata)return;
    const generation=++radarGeneration,scene=radarScenes.find(s=>s.id===radarScene)||radarScenes[0];
    const rect=$('radar-map').getBoundingClientRect(),view=R.view(scene,Math.round(rect.width/rect.height*100)/100),result=radarMetadata;
    radarLoading=true;radarSceneFailed=false;clearTimeout(radarTourTimer);renderHealth();
    // Six scans span the advertised loop, including the newest. Only the current view is retained.
    const times=[...new Set(Array.from({length:Math.min(6,result.data.times.length)},(_,i)=>result.data.times[Math.round(i*(result.data.times.length-1)/Math.max(1,Math.min(6,result.data.times.length)-1))]))];
    try{
      const frames=[];
      for(let i=0;i<times.length;i+=3){const settled=await Promise.allSettled(times.slice(i,i+3).map(t=>{const old=radarView?.key===view.key&&state.frames.find(f=>f.stamp===t);return old?Promise.resolve(old):preloadFrame(result.data,t,view);}));if(generation!==radarGeneration)return;for(const r of settled)if(r.status==='fulfilled')frames.push(r.value);}
      if(!frames.length)throw new Error('No radar images loaded');
      radarView=view;state.frames=frames;state.frame=frames.length-1;state.radarAt=result.fetchedAt;state.radarFailed=result.stale||frames.at(-1).stamp!==result.data.times.at(-1);
      $('radar-map').setAttribute('viewBox',`${view.x} ${view.y} ${view.width} ${view.height}`);
      $('radar-map').setAttribute('aria-label',`${view.name} Mississippi radar with county boundaries and available warning polygons`);
      $('radar-title').textContent=`${view.name.toUpperCase()} RADAR`;
      $('radar-images').replaceChildren(...frames.map(f=>svg('image',{href:f.url,x:view.x,y:view.y,width:view.width,height:view.height,opacity:'.85',visibility:'hidden',preserveAspectRatio:'none'})));
      $('radar-timeline').max=String(frames.length-1);renderLabels();showFrame();
    }catch{radarSceneFailed=true;if(!state.frames.length)state.radarFailed=true;}
    finally{if(generation===radarGeneration){radarLoading=false;renderHealth();scheduleRadarTour();}}
  }
  let refreshingRadar=false;
  async function refreshRadar() {
    if(refreshingRadar)return;refreshingRadar=true;
    try {const result=await api('radar');
      radarMetadata=result;
      if(result.data.times.at(-1)===state.frames.at(-1)?.stamp){state.radarAt=result.fetchedAt;state.radarFailed=result.stale;if(radarSceneFailed)await loadRadarScene();return;}
      await loadRadarScene();
    }catch{state.radarFailed=true;}finally{refreshingRadar=false;renderHealth();}
  }
  function showFrame() {
    const frame=state.frames[state.frame];if(!frame)return;
    [...$('radar-images').children].forEach((el,i)=>el.setAttribute('visibility',i===state.frame?'visible':'hidden'));
    $('radar-timeline').value=state.frame;$('radar-time').textContent=time(frame.stamp);
  }
  function alertsStale(){return !state.alertsAt||state.alertsFailed||age(state.alertsAt)>150000;}
  let spotlight=0;
  async function refreshAlerts(){
    try{
      const result=await api('alerts'),previousTop=M.spotlightAlerts(state.alerts)[0]?.id;
      state.alerts=M.activeAlerts(result.data);
      const top=M.spotlightAlerts(state.alerts)[0];
      if(top?.id!==previousTop){spotlight=0;featurePages.warnings=0;}
      state.alertsAt=result.fetchedAt;state.alertsFailed=result.stale;
      if(showMode==='auto'&&!result.stale&&top&&M.priority(top)<=1&&top.id!==previousTop){showIndex=0;setMainScene('warnings');}
    }catch{state.alertsFailed=true;}
    renderAlerts();renderAlertMap();renderHealth();if(['warnings','watches'].includes(mainScene))renderFeature();
  }
  function renderAlerts(){
    state.alerts=M.activeAlerts(state.alerts);const stale=alertsStale(),featured=M.spotlightAlerts(state.alerts),alert=featured[spotlight%Math.max(1,featured.length)];
    $('alert-count').textContent=state.alertsAt?String(state.alerts.length):'—';
    $('alert-status').textContent=`${stale?'DELAYED · ':''}${state.alertsAt?`Checked ${time(state.alertsAt)}`:'NWS alert feed unavailable'}`;
    const spot=$('alert-spotlight');
    if(alert){spot.style.borderColor=M.alertColor(alert);spot.innerHTML=`<strong>${stale?'LAST RECEIVED · ':''}${esc(alert.event)}</strong><p>${esc(alert.areaDesc)}</p><span class="expires">Until ${esc(expiry(alert.ends||alert.expires))} · ${spotlight%featured.length+1} of ${featured.length} priority alerts</span>`;}
    else{spot.style.borderColor=stale?'#ffc857':'#68d5b0';spot.textContent=stale?'Alert status unavailable. Check weather.gov for current warnings.':'No active NWS alerts for Mississippi.';}
    const ticker=state.alerts.length?state.alerts.map(a=>`${a.event.toUpperCase()} — ${a.areaDesc} · Until ${expiry(a.ends||a.expires)}`).join('     •     '):'No active NWS alerts for Mississippi. Regional forecasts rotate automatically, from the Delta to the Coast.';
    const message=stale?`ALERT FEED DELAYED — Check weather.gov for current warnings. ${state.alerts.length?'Last received: '+ticker:''}`:ticker;
    if($('ticker-text').textContent!==message){$('ticker-text').textContent=message;$('ticker-text').style.setProperty('--ticker-duration',`${Math.max(30,message.length/9)}s`);}
    $('ticker-tag').textContent=stale?'FEED DELAYED':state.alerts.some(a=>/Warning/.test(a.event))?'WARNINGS':'NWS ALERTS';
    $('ticker-tag').style.background=stale?'#ffc857':state.alerts.some(a=>/Warning/.test(a.event))?'#ff8155':'';
    if($('alerts-dialog').open)renderAlertDetails();
  }
  function renderAlertMap(){
    $('alert-shapes').replaceChildren();
    // County outlines are only a broad affected-area fallback, not storm polygons.
    for(const a of [...state.alerts].reverse()){
      const geometries=a.geometry?[a.geometry]:state.countyFeatures.filter(f=>(a.geocode.SAME||[]).some(code=>String(code).slice(-5)===f.properties.GEOID)).map(f=>f.geometry);
      for(const geometry of geometries){const el=svg('path',{d:geoPath(geometry),class:'alert-shape',fill:M.alertColor(a),stroke:M.alertColor(a),'stroke-dasharray':a.geometry?'none':'5 4'});el.append(svg('title',{},`${a.event}${a.geometry?'':' · affected county, not exact warning polygon'}`));$('alert-shapes').append(el);}
    }
    $('alert-shapes').setAttribute('opacity',alertsStale()?'.4':'1');
  }
  function renderAlertDetails(){
    $('dialog-status').textContent=`National Weather Service · ${alertsStale()?'Feed delayed. Verify at weather.gov.':`Last checked ${time(state.alertsAt)}`}. Dashed map outlines show affected counties where no exact polygon was supplied.`;
    $('alerts-list').innerHTML=state.alerts.length?state.alerts.map(a=>`<article class="alert-detail"><h3 style="color:${M.alertColor(a)}">${esc(a.event)}</h3><p>${esc(a.areaDesc)}</p><p>Issued ${esc(time(a.sent))} · Expires ${esc(time(a.ends||a.expires))}</p><strong>${esc(a.headline)}</strong><pre>${esc(a.description)}</pre>${a.instruction?`<pre class="instruction">${esc(a.instruction)}</pre>`:''}</article>`).join(''):`<p>${alertsStale()?'Alert status unavailable.':'No active NWS alerts for Mississippi.'}</p>`;
  }
  function renderHealth(){
    const latest=state.frames.at(-1),radarOld=state.radarFailed||!latest||age(latest.stamp)>15*60000||age(state.radarAt)>5*60000;
    $('radar-status').textContent=latest?`${radarOld?'DELAYED · ':''}Latest scan ${time(latest.stamp)}`:'Radar unavailable · retrying';$('radar-status').classList.toggle('stale',radarOld);
    $('map-message').textContent=latest?`${radarOld?'Radar delayed · ':''}${state.radarPlaying?'Radar loop':'Paused'} · ${state.frames.length} frames${state.alerts.length?' · alerts outlined':''}`:'Radar unavailable · this map does not show current precipitation';
    $('radar-images').setAttribute('opacity',latest&&age(latest.stamp)>30*60000?'0':radarOld?'.5':'1');
    $('radar-tour-status').textContent=radarLoading?`LOADING ${radarScenes.find(s=>s.id===radarScene)?.name.toUpperCase()}…`:radarSceneFailed?'REGIONAL VIEW UNAVAILABLE · RETRYING':radarChoice==='tour'?`MS RADAR TOUR · ${radarScenes.findIndex(s=>s.id===radarView?.id)+1} / ${radarScenes.length}`:'MISSISSIPPI · FIXED RADAR VIEW';
    const issues=[];if(alertsStale())issues.push('Alert feed delayed');if(radarOld)issues.push('Radar delayed');if(forecastStale(state.forecasts.get(selectedCity().id)))issues.push('Forecast delayed');
    $('feed-health').textContent=issues.length?issues.join(' · '):'Official sources connected · NWS alerts / forecasts · NOAA radar';$('feed-health').classList.toggle('degraded',issues.length>0);
  }
  async function loadCameras(){try{const result=await getJSON('/.netlify/functions/weather-cameras');state.cameraList=result.cameras||[];if(mainScene==='camera')showCamera();}catch{state.cameraList=[];}}
  function sequence(){return M.showSequence(alertsStale()?[]:M.activeAlerts(state.alerts),params.get('cameras')!=='0'&&state.cameraList.length>0);}
  function nextMainScene(){const scenes=sequence();showIndex=(showIndex+1)%scenes.length;setMainScene(scenes[showIndex]);}
  function setMainScene(scene){
    clearTimeout(showTimer);clearInterval(cameraRefreshTimer);clearTimeout(radarTourTimer);cameraAttempt++;mainScene=scene;
    const panel=document.querySelector('.radar-panel');panel.setAttribute('aria-labelledby',scene==='radar'?'radar-title':'feature-title');
    for(const child of panel.children)if(!['main-feature','show-progress'].includes(child.id)){child.inert=scene!=='radar';child.setAttribute('aria-hidden',String(scene!=='radar'));}
    $('main-feature').hidden=scene==='radar';$('show-progress').textContent=showMode==='auto'?`AUTOMATIC SHOW · ${scene==='camera'?'MDOT CAMERAS':scene.toUpperCase()}`:`${scene.toUpperCase()} · FIXED VIEW`;
    if(scene==='radar')scheduleRadarTour();else if(scene==='camera')showCamera();else renderFeature();
    if(showMode==='auto')showTimer=setTimeout(nextMainScene,sceneDurations[scene]*1000);
  }
  function renderFeature(){
    if(mainScene==='radar'||mainScene==='camera')return;
    const content=$('feature-content');
    if(mainScene==='forecast'){
      const region=selectedRegion();$('feature-title').textContent=`${region.name.toUpperCase()} · FORECAST`;$('feature-source').textContent='National Weather Service';
      content.className='feature-content forecast-grid';
      content.innerHTML=region.cities.map(id=>{const city=state.config.cities.find(c=>c.id===id),entry=state.forecasts.get(id),p=currentPeriods(entry)[0];return `<article class="feature-forecast"><div><h3>${esc(city.name)}</h3><span>${esc(p?.name||'Awaiting forecast')}</span></div><div class="feature-temperature"><b>${p?.temperature??'—'}°</b>${icon(p?.shortForecast,!p?.isDaytime)}</div><p>${esc(p?.shortForecast||'Forecast unavailable · retrying')}</p><small>${forecastStale(entry)?'DELAYED · ':''}Rain ${p?.probabilityOfPrecipitation?.value??'—'}% · Wind ${esc(p?.windSpeed||'—')} ${esc(p?.windDirection||'')}</small></article>`;}).join('');
      $('feature-note').textContent='Forecast temperatures · the seven-day outlook below follows the selected city';return;
    }
    const warnings=mainScene==='warnings',current=M.activeAlerts(state.alerts),immediate=warnings&&current.some(a=>M.priority(a)<=1),all=current.filter(a=>warnings?(immediate?M.priority(a)<=1:/Warning/.test(a.event)):/Watch/.test(a.event)),stale=alertsStale(),pages=Math.max(1,Math.ceil(all.length/3)),page=featurePages[mainScene]%pages;
    $('feature-title').textContent=`${immediate?'PRIORITY WARNINGS':warnings?'WARNINGS':'WATCHES'} ACROSS MISSISSIPPI`;$('feature-source').textContent=stale?'NWS FEED DELAYED':`${all.length} ACTIVE · NATIONAL WEATHER SERVICE`;
    content.className='feature-content feature-alerts';
    content.innerHTML=all.length?all.slice(page*3,page*3+3).map(a=>`<article class="feature-alert" style="--alert-color:${M.alertColor(a)}"><div><h3>${esc(a.event)}</h3><span>Until ${esc(expiry(a.ends||a.expires))}</span></div><p>${esc(a.areaDesc)}</p><small>${esc(a.headline||a.instruction||'Follow National Weather Service instructions for your location.')}</small></article>`).join(''):`<div class="feature-empty"><span>${stale?'STATUS UNAVAILABLE':`NO ACTIVE ${warnings?'WARNINGS':'WATCHES'}`}</span><h3>${stale?'Check weather.gov for current alerts.':`No active NWS ${warnings?'warnings':'watches'} for Mississippi.`}</h3><p>${warnings?'Warnings mean hazardous weather is occurring or imminent.':'Watches mean conditions are favorable for hazardous weather.'}</p></div>`;
    $('feature-note').textContent=`${stale?'LAST RECEIVED DATA · ':''}${state.alertsAt?'Checked '+time(state.alertsAt):'Waiting for NWS'} · ${pages>1?`Page ${page+1} of ${pages} · `:''}Full affected areas continue in the ticker`;
  }
  function showCamera(){
    clearInterval(cameraRefreshTimer);const attempt=++cameraAttempt;
    $('feature-title').textContent='MDOT · MISSISSIPPI TRAFFIC CAMERAS';$('feature-source').textContent='PUBLIC CAMERA SNAPSHOT';$('feature-content').className='feature-content feature-camera';
    if(!state.cameraList.length||params.get('cameras')==='0'){$('feature-content').innerHTML='<div class="feature-empty"><h3>Camera unavailable</h3><p>Weather information continues to update.</p></div>';$('feature-note').textContent='MDOT cameras are optional';return;}
    const current=M.activeAlerts(state.alerts);
    const scored=state.cameraList.map(c=>({...c,score:alertsStale()?0:M.cameraScore(c,current)})).sort((a,b)=>b.score-a.score);
    const relevant=scored.filter(c=>c.score>0),pool=relevant.length?relevant:scored,camera=pool[state.cameraIndex++%pool.length];
    $('feature-title').textContent=camera.name.toUpperCase();$('feature-source').textContent=camera.score?'MDOT · CAMERA IN AN ALERT COUNTY':'MDOT · AROUND MISSISSIPPI';$('feature-note').textContent='Connecting to MDOT · refreshed still snapshot';
    const element=document.createElement('img');element.alt=camera.name;element.referrerPolicy='no-referrer';
    const snapshotURL=()=>{const url=new URL(camera.url);url.searchParams.set('t',Math.floor(Date.now()/10000)*10000);return url.href;};
    let loaded=false;
    const fallback=()=>{if(attempt===cameraAttempt&&mainScene==='camera'){clearInterval(cameraRefreshTimer);cameraAttempt++;if(showMode==='auto')nextMainScene();else{$('feature-content').innerHTML='<div class="feature-empty"><h3>MDOT camera unavailable</h3><p>Retrying another camera shortly.</p></div>';$('feature-note').textContent='Snapshot failed to load';}}};
    element.onload=()=>{if(attempt!==cameraAttempt)return;loaded=true;$('feature-note').textContent=`MDOT still snapshot loaded ${time(new Date().toISOString())} · capture time may vary`;};element.onerror=fallback;element.src=snapshotURL();
    cameraRefreshTimer=setInterval(()=>{element.src=snapshotURL();},10000);
    setTimeout(()=>{if(!loaded)fallback();},8000);$('feature-content').replaceChildren(element);
  }
  async function init(){
    clock();setInterval(clock,1000);
    try{state.config=await getJSON('/weather/config.json');}catch{$('feed-health').textContent='Weather configuration unavailable. Reload to retry.';return;}
    radarScenes=R.scenes(state.config);if(radarChoice!=='tour'&&!radarScenes.some(s=>s.id===radarChoice))radarChoice='tour';radarScene=radarChoice==='tour'?'statewide':radarChoice;
    $('radar-view').innerHTML='<option value="tour">Automatic statewide + regional tour</option>'+radarScenes.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');$('radar-view').value=radarChoice;
    $('radar-view').onchange=event=>{radarChoice=event.target.value;radarScene=radarChoice==='tour'?'statewide':radarChoice;loadRadarScene();};
    $('show-mode').value=showMode;$('show-mode').onchange=event=>{showMode=event.target.value;showIndex=0;setMainScene(showMode==='auto'?sequence()[0]:showMode);};
    let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(()=>{if(radarMetadata)loadRadarScene();},500);}).observe($('radar-map'));
    $('regions').innerHTML=state.config.regions.map(r=>`<button type="button" data-region="${r.id}">${r.short}</button>`).join('');
    $('city-select').innerHTML=state.config.cities.map(c=>`<option value="${c.id}">${esc(c.name)}</option>`).join('');
    $('regions').addEventListener('click',event=>{const region=state.config.regions.find(r=>r.id===event.target.dataset.region);if(region)selectCity(region.cities[0],true);});
    $('city-select').addEventListener('change',event=>selectCity(event.target.value,true));
    $('rotation-toggle').onclick=()=>{state.rotation=!state.rotation;renderRotation();};
    $('next-city').onclick=()=>selectCity(state.config.cities[(state.cityIndex+1)%state.config.cities.length].id,true);
    $('radar-play').onclick=()=>{state.radarPlaying=!state.radarPlaying;$('radar-play').textContent=state.radarPlaying?'Ⅱ':'▶';$('radar-play').setAttribute('aria-label',state.radarPlaying?'Pause radar animation':'Play radar animation');renderHealth();};
    $('radar-timeline').oninput=event=>{state.frame=Number(event.target.value);state.radarPlaying=false;$('radar-play').textContent='▶';$('radar-play').setAttribute('aria-label','Play radar animation');showFrame();renderHealth();};
    $('latest-radar').onclick=()=>{state.frame=Math.max(0,state.frames.length-1);showFrame();};
    $('alerts-open').onclick=()=>{renderAlertDetails();$('alerts-dialog').showModal();};$('alerts-close').onclick=()=>$('alerts-dialog').close();
    selectCity(state.config.cities.some(c=>c.id===params.get('city'))?params.get('city'):'jackson');renderRotation();
    loadMap();refreshRadar();refreshAlerts();loadCameras();setMainScene(showMode==='auto'?'radar':showMode);
    setInterval(()=>{if(state.rotation)selectCity(state.config.cities[(state.cityIndex+1)%state.config.cities.length].id);},seconds*1000);
    setInterval(()=>{if(mainScene==='radar'&&state.radarPlaying&&state.frames.length){state.frame=(state.frame+1)%state.frames.length;showFrame();}},900);
    setInterval(refreshAlerts,60000);setInterval(refreshRadar,120000);
    setInterval(()=>{for(const id of selectedRegion().cities)loadForecast(id);},60000);
    setInterval(()=>{spotlight++;renderAlerts();renderAlertMap();renderHealth();renderForecast();},12000);
    setInterval(()=>{if(['warnings','watches'].includes(mainScene)){featurePages[mainScene]++;renderFeature();}},8000);
    setInterval(()=>{if(showMode==='camera'&&mainScene==='camera')showCamera();},20000);setInterval(loadCameras,30*60000);
    window.addEventListener('online',()=>{refreshAlerts();refreshRadar();loadForecast(selectedCity().id);});
    document.addEventListener('visibilitychange',()=>{if(!document.hidden){refreshAlerts();refreshRadar();loadForecast(selectedCity().id);}});
  }
  init();
})();
