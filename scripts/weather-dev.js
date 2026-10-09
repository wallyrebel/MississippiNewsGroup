// Dependency-free local preview of the static site and weather functions.
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.geojson':'application/geo+json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon'};
const handlers={
  '/.netlify/functions/weather-data':require('../netlify/functions/weather-data').handler,
  '/.netlify/functions/weather-cameras':require('../netlify/functions/weather-cameras').handler
};
http.createServer(async(req,res)=>{
  try{
    const url=new URL(req.url,'http://localhost');
    if(handlers[url.pathname]){const result=await handlers[url.pathname]({httpMethod:req.method,queryStringParameters:Object.fromEntries(url.searchParams)});res.writeHead(result.statusCode,result.headers);res.end(result.body);return;}
    let pathname=decodeURIComponent(url.pathname);if(pathname==='/weather/live'||pathname==='/weather/live/')pathname='/weather/index.html';if(pathname==='/weather')pathname='/weather/';if(pathname.endsWith('/'))pathname+='index.html';
    // Serve public site assets only; never .git, source functions, or config secrets.
    if(!/^\/(?:weather\/|assets\/|index\.html$|styles\.css$|app\.js$|sites\.js$)/.test(pathname)||pathname.split('/').some(p=>p.startsWith('.'))){res.writeHead(404);res.end('Not found');return;}
    const file=path.resolve(root,'.'+pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end('Forbidden');return;}
    const body=await fs.readFile(file);res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream','Cache-Control':'no-store'});res.end(body);
  }catch(error){res.writeHead(error.code==='ENOENT'?404:500);res.end('Resource unavailable');}
}).listen(4173,'127.0.0.1',()=>console.log('Weather preview: http://127.0.0.1:4173/weather'));
