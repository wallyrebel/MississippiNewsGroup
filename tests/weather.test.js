const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../weather/model');
const {handler,cached,fetchOfficial}=require('../netlify/functions/weather-data');
const config=require('../weather/config.json');
const now=Date.parse('2026-10-09T18:00:00Z');
const feature=(event,extra={})=>({id:event,geometry:null,properties:{event,status:'Actual',messageType:'Alert',sent:'2026-10-09T17:00:00Z',effective:'2026-10-09T17:00:00Z',expires:'2026-10-09T20:00:00Z',...extra}});
test('excludes test, future, cancelled, expired and ended alerts; prioritizes tornado warnings',()=>{
 const result=M.normalizeAlerts({features:[feature('Flood Watch'),feature('Test',{status:'Test'}),feature('Expired',{expires:'2026-10-09T17:59:00Z'}),feature('Ended',{ends:'2026-10-09T17:50:00Z'}),feature('Future',{effective:'2026-10-09T19:00:00Z'}),feature('Cancelled',{messageType:'Cancel'}),feature('Tornado Warning'),feature('Flash Flood Warning')]},now);
 assert.deepEqual(result.map(a=>a.event),['Tornado Warning','Flash Flood Warning','Flood Watch']);
 assert.equal(M.activeAlerts(result,Date.parse('2026-10-09T21:00:00Z')).length,0);
});
test('bad alert response must not become an all-clear',()=>assert.throws(()=>M.normalizeAlerts({})));
test('immediate warnings stay in the spotlight ahead of watches and statements',()=>{
 const alerts=[{event:'Flood Watch'},{event:'Tornado Warning'},{event:'Flash Flood Warning'},{event:'Severe Thunderstorm Warning'},{event:'Tropical Cyclone Local Statement'}];
 assert.deepEqual(M.spotlightAlerts(alerts).map(a=>a.event),['Tornado Warning','Flash Flood Warning']);
 assert.deepEqual(M.spotlightAlerts(alerts.filter(a=>!['Tornado Warning','Flash Flood Warning'].includes(a.event))).map(a=>a.event),['Severe Thunderstorm Warning']);
});
test('radar uses advertised scans including the newest, accepts interval metadata',()=>{
 const times=M.parseRadarTimes('<Dimension name="time">2026-10-09T17:00:00Z/2026-10-09T18:00:00Z/PT2M</Dimension>');
 assert.equal(times.at(-1),'2026-10-09T18:00:00.000Z');assert.ok(times.length<=12);
 assert.throws(()=>M.parseRadarTimes('<Exception>Unavailable</Exception>'));
 assert.throws(()=>M.parseRadarTimes('<Dimension name="time">bad</Dimension>'));
});
test('night forecast stays on its Central Time date and missing high is not invented',()=>{
 const result=M.forecastDays([{startTime:'2026-10-10T00:00:00Z',endTime:'2026-10-10T12:00:00Z',isDaytime:false,temperature:60,shortForecast:'Clear',probabilityOfPrecipitation:{value:null}},{startTime:'2026-10-10T12:00:00Z',endTime:'2026-10-11T00:00:00Z',isDaytime:true,temperature:82,shortForecast:'Sunny',probabilityOfPrecipitation:{value:0}}],now);
 assert.equal(result[0].label,'Fri');assert.equal(result[0].high,null);assert.equal(result[0].low,60);assert.equal(result[0].precipitation,null);assert.equal(result[1].high,82);assert.equal(result[1].precipitation,0);
});
test('camera priority matches exact county / SAME codes, not similarly named counties',()=>{
 assert.ok(M.cameraScore({county:'Jackson',countyFips:'28059'},[{event:'Hurricane Warning',geocode:{SAME:['028059']}}])>0);
 assert.equal(M.cameraScore({county:'Jackson'},[{event:'Warning',areaDesc:'Jacksonville; Harrison'}]),0);
 assert.ok(M.cameraScore({county:'Harrison'},[{event:'Tropical Storm Warning',areaDesc:'Hancock; Harrison; Jackson'}])>0);
});
test('24 cities are all assigned to exactly one north-to-coast region',()=>{
 assert.equal(config.cities.length,24);const ids=config.regions.flatMap(r=>r.cities);assert.equal(new Set(ids).size,24);assert.deepEqual([...ids].sort(),config.cities.map(c=>c.id).sort());
});
test('regional radar fits every city and WMS pixels align with Mercator overlays',()=>{
 const R=require('../weather/radar-map');
 for(const region of config.regions){
  const scene=R.scenes(config).find(s=>s.id===region.id);
  for(const aspect of [1.35,2.65]){
   const v=R.view(scene,aspect);
   assert.ok(Math.abs(v.width/v.height-aspect)<1e-9);
   for(const city of config.cities.filter(c=>region.cities.includes(c.id))){
    const [x,y]=R.xy([city.lon,city.lat]),[mx,my]=R.merc([city.lon,city.lat]);
    assert.ok(x>v.x&&x<v.x+v.width&&y>v.y&&y<v.y+v.height,`${city.name} inside ${region.id}`);
    assert.ok(Math.abs((x-v.x)/v.width-(mx-v.bbox[0])/(v.bbox[2]-v.bbox[0]))<1e-9);
    assert.ok(Math.abs((y-v.y)/v.height-(v.bbox[3]-my)/(v.bbox[3]-v.bbox[1]))<1e-9);
   }
  }
 }
});
test('broadcast includes all screen types and suppresses cameras during immediate warnings',()=>{
 assert.deepEqual(M.showSequence([],true),['radar','warnings','camera','radar','watches','forecast']);
 assert.ok(!M.showSequence([],false).includes('camera'));
 for(const event of ['Tornado Warning','Flash Flood Warning'])assert.deepEqual(M.showSequence([{event}],true),['warnings','radar']);
 assert.ok(M.showSequence([{event:'Flood Watch'}],true).includes('camera'));
});
test('function rejects unknown city, resource, method and foreign upstream URL',async()=>{
 assert.equal((await handler({queryStringParameters:{kind:'forecast',city:'not-ms'}})).statusCode,400);
 assert.equal((await handler({queryStringParameters:{kind:'other'}})).statusCode,400);
 assert.equal((await handler({httpMethod:'POST'})).statusCode,405);
 await assert.rejects(fetchOfficial('https://example.com/data'),/Unapproved/);
});
test('cache coalesces concurrent requests and flags fallback without resetting timestamp',async()=>{
 let calls=0;const loader=async()=>{calls++;return {ok:true};};const key='test-'+Date.now();const [a,b]=await Promise.all([cached(key,0,loader),cached(key,0,loader)]);assert.equal(calls,1);assert.equal(a.fetchedAt,b.fetchedAt);
 const fallback=await cached(key,0,async()=>{throw new Error('outage');});assert.equal(fallback.stale,true);assert.equal(fallback.fetchedAt,a.fetchedAt);
});
test('camera catalog only exposes official public MDOT snapshots',async()=>{
 const {handler:cameraHandler,validCamera}=require('../netlify/functions/weather-cameras');
 const result=JSON.parse((await cameraHandler({httpMethod:'GET'})).body);
 assert.equal(result.cameras.length,10);
 assert.equal(validCamera({type:'image',url:'https://evil.example/thumbnail',countyFips:'28049'}),false);
 assert.equal(validCamera({type:'image',url:'https://mdottraffic.com.evil.example/thumbnail',countyFips:'28049'}),false);
 assert.equal(validCamera({type:'image',url:'https://www.mdottraffic.com/images/novideo.jpg',countyFips:'28049'}),false);
});
