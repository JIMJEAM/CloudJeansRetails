// Centroides aproximados por municipio (el CSV no trae coordenadas).
// Para agregar un municipio nuevo, añade su nombre sin acentos en minúsculas.
window.GEO = {
  center: [20.7, -102.4],
  zoom: 7,
  municipios: {
    'autlan': [19.7708, -104.3647],
    'ameca': [20.5467, -104.0467],
    'la barca': [20.2833, -102.5500],
    'zapotlanejo': [20.6228, -103.0686],
    'tala': [20.6533, -103.7006],
    'el salto': [20.5192, -103.1814],
    'ixtlahuacan de los membrillos': [20.3486, -103.1903],
    'guadalajara': [20.6767, -103.3475],
    'puerto vallarta': [20.6534, -105.2253],
    'zapopan': [20.7214, -103.3918],
    'tlaquepaque': [20.6409, -103.2933],
    'san pedro tlaquepaque': [20.6409, -103.2933],
    'tonala': [20.6243, -103.2343],
    'tlajomulco de zuniga': [20.4736, -103.4431],
    'lagos de moreno': [21.3564, -101.9356],
    'ocotlan': [20.3486, -102.7731],
    'ciudad guzman': [19.7047, -103.4617],
    'zapotlan el grande': [19.7047, -103.4617],
    'tepatitlan de morelos': [20.8167, -102.7667],
    'arandas': [20.7058, -102.3464],
    'chapala': [20.2958, -103.1911],
    'tequila': [20.8822, -103.8364],
    // Guanajuato
    'leon': [21.1250, -101.6860],
    'irapuato': [20.6767, -101.3542],
    'salamanca': [20.5719, -101.1956],
    'celaya': [20.5235, -100.8157],
    'guanajuato': [21.0190, -101.2574],
  },
};

window.GEO.norm = (s) => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().trim();

// Posición estable: centroide + desplazamiento determinista según el nombre,
// para que las tiendas del mismo municipio no se encimen.
window.GEO.locate = function (municipio, nombre) {
  const base = this.municipios[this.norm(municipio)];
  if (!base) return null;
  let h = 2166136261;
  for (const ch of nombre || '') { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  const a = ((h >>> 0) % 360) * Math.PI / 180;
  const r = 0.004 + (((h >>> 9) % 100) / 100) * 0.012;
  return [base[0] + Math.sin(a) * r, base[1] + Math.cos(a) * r];
};
