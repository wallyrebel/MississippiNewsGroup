// Explicit opt-in integration check; never used as a synthetic production feed.
const {handler}=require('../netlify/functions/weather-data');
const {cities}=require('../weather/config.json');
async function check(kind,city){
 const response=await handler({queryStringParameters:{kind,city}});const payload=JSON.parse(response.body);
 const ok=response.statusCode===200&&!payload.stale;
 console.log(`${ok?'PASS':'FAIL'} ${kind}${city?' '+city:''}${ok?` · fetched ${payload.fetchedAt}`:` · ${payload.error}`}`);
 return ok;
}
(async()=>{
 let ok=true;
 for(const kind of ['alerts','radar'])ok=await check(kind)&&ok;
 for(let i=0;i<cities.length;i+=2){const results=await Promise.all(cities.slice(i,i+2).map(c=>check('forecast',c.id)));ok=results.every(Boolean)&&ok;}
 process.exitCode=ok?0:1;
})();
