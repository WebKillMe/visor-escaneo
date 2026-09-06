/* Lectura de IFC en el navegador con web-ifc (WebAssembly).

   Devuelve un THREE.Group con una malla por elemento IFC, cada una con
   userData.ifc = { tipo, nombre, expressID } y los colores del IFC guardados
   como color por vértice.

   web-ifc pesa unos 6 MB entre el javascript y el wasm, así que no se carga
   hasta que hace falta: solo al abrir el primer .ifc. */

(function () {
  'use strict';

  var VERSION = '0.0.77';
  var BASE = 'https://cdn.jsdelivr.net/npm/web-ifc@' + VERSION + '/';

  var api = null;        // instancia de WebIFC.IfcAPI ya inicializada
  var cargando = null;   // promesa en curso, para no cargarlo dos veces
  var nombres = null;    // código numérico de tipo IFC -> 'IFCWALL'

  function guion(texto) {
    return texto.charAt(0) + texto.slice(1).toLowerCase();
  }

  function tabla() {
    if (nombres) return nombres;
    nombres = {};
    for (var k in WebIFC) {
      if (/^IFC[A-Z0-9]+$/.test(k) && typeof WebIFC[k] === 'number') nombres[WebIFC[k]] = k;
    }
    return nombres;
  }

  function script(src) {
    return new Promise(function (ok, mal) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = ok;
      s.onerror = function () { mal(new Error('No se pudo descargar web-ifc')); };
      document.head.appendChild(s);
    });
  }

  function motor() {
    if (api) return Promise.resolve(api);
    if (cargando) return cargando;

    cargando = script(BASE + 'web-ifc-api-iife.js')
      .then(function () {
        var a = new WebIFC.IfcAPI();
        // El segundo argumento es «la ruta es absoluta»: sin él, web-ifc la
        // cuelga de la carpeta de la página y no encuentra el wasm.
        a.SetWasmPath(BASE, true);
        return a.Init().then(function () { api = a; return a; });
      });

    return cargando;
  }

  /* ---------- construcción de la geometría ---------- */

  function mallaDeElemento(modelo, malla) {
    var pos = [];
    var nor = [];
    var col = [];
    var ind = [];
    var alfa = 1;
    var base = 0;

    var geos = malla.geometries;
    for (var i = 0; i < geos.size(); i++) {
      var pg = geos.get(i);
      var g = api.GetGeometry(modelo, pg.geometryExpressID);
      var v = api.GetVertexArray(g.GetVertexData(), g.GetVertexDataSize());
      var idx = api.GetIndexArray(g.GetIndexData(), g.GetIndexDataSize());

      var m = new THREE.Matrix4().fromArray(pg.flatTransformation);
      var n = new THREE.Matrix3().getNormalMatrix(m);

      var c = pg.color || { x: 0.8, y: 0.8, z: 0.8, w: 1 };
      if (c.w < alfa) alfa = c.w;

      var vec = new THREE.Vector3();
      var nvec = new THREE.Vector3();

      // web-ifc entrega los vértices intercalados: x,y,z,nx,ny,nz
      for (var j = 0; j < v.length; j += 6) {
        vec.set(v[j], v[j + 1], v[j + 2]).applyMatrix4(m);
        nvec.set(v[j + 3], v[j + 4], v[j + 5]).applyMatrix3(n).normalize();
        pos.push(vec.x, vec.y, vec.z);
        nor.push(nvec.x, nvec.y, nvec.z);
        col.push(c.x, c.y, c.z);
      }

      for (var k = 0; k < idx.length; k++) ind.push(base + idx[k]);
      base += v.length / 6;

      g.delete();
    }

    if (!ind.length) return null;

    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
    geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    geo.setIndex(ind);

    var mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.85,
      metalness: 0.0,
      side: THREE.DoubleSide,
      transparent: alfa < 0.98,
      opacity: alfa
    });

    return new THREE.Mesh(geo, mat);
  }

  /* ---------- API ---------- */

  window.IFC = {

    /* buffer: ArrayBuffer del .ifc
       Devuelve una promesa con { grupo, elementos, triangulos, tipos } */
    cargar: function (buffer) {
      return motor().then(function () {
        var bytes = new Uint8Array(buffer);

        // COORDINATE_TO_ORIGIN hace dos cosas: centra el modelo en el origen y
        // aplica la matriz de coordinación, que ya deja los ejes con Y hacia
        // arriba. Sin él habría que girar -90° sobre X; con él, girar sobra.
        var modelo = api.OpenModel(bytes, { COORDINATE_TO_ORIGIN: true });

        var grupo = new THREE.Group();
        grupo.name = 'IFC';

        var mapa = tabla();
        var tipos = {};
        var triangulos = 0;

        api.StreamAllMeshes(modelo, function (malla) {
          var m = mallaDeElemento(modelo, malla);
          if (!m) return;

          var codigo = api.GetLineType(modelo, malla.expressID);
          var tipo = mapa[codigo] || 'IFCDESCONOCIDO';

          var nombre = '';
          try {
            var linea = api.GetLine(modelo, malla.expressID);
            nombre = linea && linea.Name && linea.Name.value ? linea.Name.value : '';
          } catch (e) { /* algún elemento sin Name legible */ }

          m.name = nombre || guion(tipo.slice(3)) + ' ' + malla.expressID;
          m.userData.ifc = { tipo: tipo, nombre: nombre, expressID: malla.expressID };

          tipos[tipo] = (tipos[tipo] || 0) + 1;
          triangulos += m.geometry.index.count / 3;
          grupo.add(m);
        });

        api.CloseModel(modelo);

        return {
          grupo: grupo,
          elementos: grupo.children.length,
          triangulos: triangulos,
          tipos: tipos
        };
      });
    },

    // Para el panel de muebles: saber si el motor ya está en memoria.
    listo: function () { return !!api; }
  };
})();
