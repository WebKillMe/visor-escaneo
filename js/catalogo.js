/* Catálogo de mobiliario con medidas estándar de fabricante, en centímetros.
   w = ancho (X)   d = fondo (Z)   h = alto (Y)   base = altura a la que arranca
   forma: 'caja' (por defecto) o 'cilindro' para las piezas redondas.
   Todas son editables una vez colocadas; esto es solo el punto de partida. */

window.CATALOGO = [
  { cat: 'Dormitorio', id: 'cama-90',      nombre: 'Cama individual',      w: 90,  d: 190, h: 50 },
  { cat: 'Dormitorio', id: 'cama-135',     nombre: 'Cama 135',             w: 135, d: 190, h: 50 },
  { cat: 'Dormitorio', id: 'cama-150',     nombre: 'Cama de matrimonio',   w: 150, d: 190, h: 50 },
  { cat: 'Dormitorio', id: 'cama-180',     nombre: 'Cama 180',             w: 180, d: 200, h: 50 },
  { cat: 'Dormitorio', id: 'mesilla',      nombre: 'Mesilla',              w: 45,  d: 40,  h: 55 },
  { cat: 'Dormitorio', id: 'armario-2',    nombre: 'Armario 2 puertas',    w: 100, d: 60,  h: 220 },
  { cat: 'Dormitorio', id: 'armario-4',    nombre: 'Armario 4 puertas',    w: 200, d: 60,  h: 220 },
  { cat: 'Dormitorio', id: 'comoda',       nombre: 'Cómoda',               w: 100, d: 45,  h: 80 },

  { cat: 'Salón',      id: 'sofa-2',       nombre: 'Sofá 2 plazas',        w: 160, d: 90,  h: 85 },
  { cat: 'Salón',      id: 'sofa-3',       nombre: 'Sofá 3 plazas',        w: 210, d: 90,  h: 85 },
  { cat: 'Salón',      id: 'chaise',       nombre: 'Chaise longue',        w: 260, d: 160, h: 85 },
  { cat: 'Salón',      id: 'butaca',       nombre: 'Butaca',               w: 80,  d: 85,  h: 90 },
  { cat: 'Salón',      id: 'mesa-centro',  nombre: 'Mesa de centro',       w: 110, d: 60,  h: 40 },
  { cat: 'Salón',      id: 'mueble-tv',    nombre: 'Mueble de TV',         w: 180, d: 40,  h: 50 },
  { cat: 'Salón',      id: 'estanteria',   nombre: 'Estantería',           w: 80,  d: 30,  h: 180 },

  { cat: 'Comedor',    id: 'mesa-160',     nombre: 'Mesa comedor 6',       w: 160, d: 90,  h: 75 },
  { cat: 'Comedor',    id: 'mesa-200',     nombre: 'Mesa comedor 8',       w: 200, d: 100, h: 75 },
  { cat: 'Comedor',    id: 'mesa-redonda', nombre: 'Mesa redonda Ø120',    w: 120, d: 120, h: 75, forma: 'cilindro' },
  { cat: 'Comedor',    id: 'silla',        nombre: 'Silla',                w: 45,  d: 50,  h: 90 },
  { cat: 'Comedor',    id: 'aparador',     nombre: 'Aparador',             w: 160, d: 45,  h: 85 },

  { cat: 'Cocina',     id: 'bajo-60',      nombre: 'Módulo bajo 60',       w: 60,  d: 60,  h: 85 },
  { cat: 'Cocina',     id: 'bajo-90',      nombre: 'Módulo bajo 90',       w: 90,  d: 60,  h: 85 },
  { cat: 'Cocina',     id: 'alto-60',      nombre: 'Módulo alto 60',       w: 60,  d: 35,  h: 70, base: 140 },
  { cat: 'Cocina',     id: 'columna',      nombre: 'Columna horno',        w: 60,  d: 60,  h: 200 },
  { cat: 'Cocina',     id: 'nevera',       nombre: 'Nevera',               w: 60,  d: 70,  h: 185 },
  { cat: 'Cocina',     id: 'lavadora',     nombre: 'Lavadora',             w: 60,  d: 60,  h: 85 },
  { cat: 'Cocina',     id: 'lavavajillas', nombre: 'Lavavajillas',         w: 60,  d: 60,  h: 85 },
  { cat: 'Cocina',     id: 'isla',         nombre: 'Isla',                 w: 180, d: 90,  h: 90 },

  { cat: 'Baño',       id: 'inodoro',      nombre: 'Inodoro',              w: 37,  d: 67,  h: 80 },
  { cat: 'Baño',       id: 'bide',         nombre: 'Bidé',                 w: 37,  d: 56,  h: 40 },
  { cat: 'Baño',       id: 'lavabo',       nombre: 'Lavabo con mueble',    w: 80,  d: 46,  h: 85 },
  { cat: 'Baño',       id: 'ducha',        nombre: 'Plato de ducha',       w: 80,  d: 120, h: 5 },
  { cat: 'Baño',       id: 'banera',       nombre: 'Bañera',               w: 170, d: 70,  h: 55 },

  { cat: 'Trabajo',    id: 'escritorio',   nombre: 'Escritorio',           w: 140, d: 70,  h: 75 },
  { cat: 'Trabajo',    id: 'silla-of',     nombre: 'Silla de oficina',     w: 60,  d: 60,  h: 110 },
  { cat: 'Trabajo',    id: 'archivador',   nombre: 'Archivador',           w: 45,  d: 60,  h: 130 },

  { cat: 'Medida',     id: 'libre',        nombre: 'Pieza a medida',       w: 100, d: 100, h: 100 }
];
