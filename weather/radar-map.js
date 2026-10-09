(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RadarMap = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // The same Web Mercator coordinates position NOAA pixels and all map overlays.
  const merc = ([lon, lat]) => [lon * 20037508.34 / 180, Math.log(Math.tan((90 + lat) * Math.PI / 360)) * 20037508.34 / Math.PI];
  const ymin = merc([0, 29.75])[1], ymax = merc([0, 35.3])[1], center = merc([-89.7, 0])[0];
  const units = (ymax - ymin) / 680;
  const origin = [center - units * 500, ymax];
  const xy = coordinates => { const [x, y] = merc(coordinates); return [(x - origin[0]) / units, (origin[1] - y) / units]; };
  function scenes(config) {
    return [{id:'statewide', name:'Statewide', bounds:[-91.7,29.75,-88.05,35.3]}, ...config.regions.map(region => {
      const cities = config.cities.filter(c => region.cities.includes(c.id));
      return {id:region.id, name:region.short, bounds:[Math.min(...cities.map(c=>c.lon))-.5, Math.min(...cities.map(c=>c.lat))-.5, Math.max(...cities.map(c=>c.lon))+.5, Math.max(...cities.map(c=>c.lat))+.5]};
    })];
  }
  function view(scene, aspect) {
    aspect = Math.max(.7, Math.min(4, Number(aspect) || 1.5));
    const [west,south,east,north] = scene.bounds;
    const [left,bottom] = xy([west,south]), [right,top] = xy([east,north]);
    const height = Math.max(bottom-top, (right-left)/aspect), width = height*aspect;
    const x = (left+right-width)/2, y = (top+bottom-height)/2;
    const bbox = [origin[0]+x*units, origin[1]-(y+height)*units, origin[0]+(x+width)*units, origin[1]-y*units];
    return {...scene, x, y, width, height, bbox, key:`${scene.id}:${aspect.toFixed(2)}`, pixels:[1200,Math.round(1200/aspect)]};
  }
  return {merc, xy, scenes, view};
});
