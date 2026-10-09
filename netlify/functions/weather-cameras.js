// Public snapshot URLs used by MDOT's own map, verified 2026-10-09.
// No MDOT developer credential or private streaming URL is sent to visitors.
const catalog=require('../../data/weather-cameras.json');
function validCamera(camera) {
  try {const u=new URL(camera.url);return camera.type==='image' && u.protocol==='https:' && (u.hostname==='mdottraffic.com'||u.hostname.endsWith('.mdottraffic.com')) && u.pathname==='/thumbnail' && /^28\d{3}$/.test(camera.countyFips);}
  catch{return false;}
}
exports.handler=async event=>({
  statusCode:event.httpMethod && event.httpMethod!=='GET'?405:200,
  headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'public, max-age=0, s-maxage=600','X-Content-Type-Options':'nosniff'},
  body:JSON.stringify(event.httpMethod && event.httpMethod!=='GET'?{error:'Method not allowed'}:{cameras:catalog.filter(validCamera),source:'Mississippi Department of Transportation',type:'Periodically refreshed public snapshots'})
});
exports.validCamera=validCamera;
