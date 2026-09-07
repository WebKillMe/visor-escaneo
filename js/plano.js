/* Cotas, medición y tabiques.

   Tres herramientas que comparten el mismo gesto: pulsar sobre el modelo.
   Un clic corto coloca un punto; arrastrar sigue girando la vista, así que
   funciona igual con ratón que con el dedo.

   Todo lo que se dibuja aquí vive en metros dentro de la escena y se guarda
   en el navegador; el panel habla en centímetros. */

(function () {
  'use strict';

  var COLOR_COTA = '#7C8797';
  var COLOR_MEDIDA = '#4EB3C4';
  var COLOR_TABIQUE = 0xE8DCC8;   // obra nueva: se distingue del muro escaneado
  var COLOR_HUECO = 0xD98B45;

  var CLAVE = 'visor-escaneo:plano:v1';
  var SNAP = 0.05;      // rejilla de 5 cm
  var IMAN = 0.12;      // distancia a la que se pega a una cara de muro

  var V = null;
  var raiz = null;      // todo lo que dibuja este módulo
  var gCotas = null;
  var gMedidas = null;
  var gObra = null;

  var herramienta = null;   // null | 'medir' | 'tabique' | 'puerta'
  var pendiente = null;     // primer punto de una medición o tabique
  var medidas = [];
  var tabiques = [];
  var contador = 0;

  var ray = new THREE.Raycaster();
  var puntero = new THREE.Vector2();
  var plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var abajo = null;         // posición del pointerdown, para distinguir clic de arrastre

  /* ---------- etiquetas ---------- */

  function etiqueta(texto, color) {
    var pad = 16;
    var f = 44;
    var med = document.createElement('canvas').getContext('2d');
    med.font = '500 ' + f + 'px "IBM Plex Mono", ui-monospace, monospace';
    var ancho = Math.ceil(med.measureText(texto).width) + pad * 2;
    var alto = f + pad;

    var c = document.createElement('canvas');
    c.width = ancho;
    c.height = alto;
    var ctx = c.getContext('2d');
    ctx.font = '500 ' + f + 'px "IBM Plex Mono", ui-monospace, monospace';
    ctx.fillStyle = 'rgba(10,13,17,0.88)';
    ctx.fillRect(0, 0, ancho, alto);
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(1.5, 1.5, ancho - 3, alto - 3);
    ctx.fillStyle = color;
    ctx.textBaseline = 'middle';
    ctx.fillText(texto, pad, alto / 2 + 2);

    var tex = new THREE.CanvasTexture(c);
    tex.minFilter = THREE.LinearFilter;
    var spr = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex, depthTest: false, transparent: true
    }));
    var h = 0.26;
    spr.scale.set(h * ancho / alto, h, 1);
    spr.renderOrder = 999;
    return spr;
  }

  function linea(puntos, color, encima) {
    var g = new THREE.BufferGeometry().setFromPoints(puntos);
    var m = new THREE.LineBasicMaterial({ color: color, depthTest: !encima, transparent: true });
    var l = new THREE.Line(g, m);
    if (encima) l.renderOrder = 998;
    return l;
  }

  function metros(v) {
    return (v >= 1 ? v.toFixed(2) : v.toFixed(3)).replace('.', ',') + ' m';
  }

  /* ---------- cotas generales ---------- */

  function pintarCotas() {
    while (gCotas.children.length) gCotas.remove(gCotas.children[0]);
    if (!V.tam) return;

    var t = V.tam;
    var x = t.x / 2, z = t.z / 2;
    var s = 0.55;    // separación de la cota respecto al modelo
    var m = 0.18;    // longitud de las marcas de extremo

    // Largo, por delante. Fondo, por el lado. Altura, en una esquina.
    var zc = z + s;
    gCotas.add(linea([v(-x, 0, zc), v(x, 0, zc)], COLOR_COTA, true));
    gCotas.add(linea([v(-x, 0, zc - m), v(-x, 0, zc + m)], COLOR_COTA, true));
    gCotas.add(linea([v(x, 0, zc - m), v(x, 0, zc + m)], COLOR_COTA, true));
    poner(etiqueta(metros(t.x), COLOR_COTA), 0, 0.05, zc);

    var xc = x + s;
    gCotas.add(linea([v(xc, 0, -z), v(xc, 0, z)], COLOR_COTA, true));
    gCotas.add(linea([v(xc - m, 0, -z), v(xc + m, 0, -z)], COLOR_COTA, true));
    gCotas.add(linea([v(xc - m, 0, z), v(xc + m, 0, z)], COLOR_COTA, true));
    poner(etiqueta(metros(t.z), COLOR_COTA), xc, 0.05, 0);

    gCotas.add(linea([v(xc, 0, zc), v(xc, t.y, zc)], COLOR_COTA, true));
    gCotas.add(linea([v(xc - m, 0, zc), v(xc + m, 0, zc)], COLOR_COTA, true));
    gCotas.add(linea([v(xc - m, t.y, zc), v(xc + m, t.y, zc)], COLOR_COTA, true));
    poner(etiqueta(metros(t.y), COLOR_COTA), xc, t.y / 2, zc);
  }

  function v(x, y, z) { return new THREE.Vector3(x, y, z); }

  function poner(spr, x, y, z) {
    spr.position.set(x, y, z);
    gCotas.add(spr);
  }

  /* ---------- puntos sobre el modelo ---------- */

  function ndc(ev) {
    var r = V.renderer.domElement.getBoundingClientRect();
    puntero.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    puntero.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  }

  // Devuelve el punto del modelo bajo el cursor, o el del suelo si no hay modelo.
  function punto(ev, soloSuelo) {
    ndc(ev);
    ray.setFromCamera(puntero, V.camera);

    if (!soloSuelo) {
      var modelo = V.modelo();
      if (modelo) {
        var h = ray.intersectObject(modelo, true);
        if (h.length) return ajustarAVertice(h[0]);
      }
      var obra = ray.intersectObjects(gObra.children, true);
      if (obra.length) return obra[0].point.clone();
    }

    var p = new THREE.Vector3();
    return ray.ray.intersectPlane(plano, p) ? p : null;
  }

  // Se pega al vértice más cercano de la cara tocada: medir esquinas a ojo
  // con el dedo es imposible, y las esquinas es justo lo que se quiere medir.
  function ajustarAVertice(hit) {
    var p = hit.point.clone();
    var geo = hit.object.geometry;
    var pos = geo.attributes.position;
    if (!pos || !hit.face) return p;

    var mejor = null;
    var dist = 0.12;
    [hit.face.a, hit.face.b, hit.face.c].forEach(function (i) {
      var q = new THREE.Vector3().fromBufferAttribute(pos, i).applyMatrix4(hit.object.matrixWorld);
      var d = q.distanceTo(p);
      if (d < dist) { dist = d; mejor = q; }
    });
    return mejor || p;
  }

  /* ---------- imán al dibujar tabiques ---------- */

  var carasX = [];
  var carasZ = [];

  function recogerCaras() {
    carasX = [];
    carasZ = [];
    (V.muros || []).forEach(function (m) {
      var b = new THREE.Box3().setFromObject(m);
      carasX.push(b.min.x, b.max.x);
      carasZ.push(b.min.z, b.max.z);
    });
  }

  function pegar(valor, lista) {
    var mejor = valor;
    var d = IMAN;
    for (var i = 0; i < lista.length; i++) {
      var dd = Math.abs(lista[i] - valor);
      if (dd < d) { d = dd; mejor = lista[i]; }
    }
    if (mejor !== valor) return mejor;
    return Math.round(valor / SNAP) * SNAP;
  }

  function ajustar(p) {
    return new THREE.Vector3(pegar(p.x, carasX), 0, pegar(p.z, carasZ));
  }

  /* ---------- tabiques ---------- */

  function geometriaTabique(t) {
    var g = new THREE.Group();
    var dx = t.x2 - t.x1;
    var dz = t.z2 - t.z1;
    var largo = Math.sqrt(dx * dx + dz * dz);
    if (largo < 0.05) return g;

    var ang = Math.atan2(dz, dx);
    var esp = t.esp / 100;
    var alto = t.alto / 100;

    // Tramos macizos entre huecos, más el dintel de cada hueco.
    var cortes = (t.huecos || []).slice().sort(function (a, b) { return a.t - b.t; });
    var trozos = [];
    var cursor = 0;

    cortes.forEach(function (h) {
      var a = Math.max(0, h.t - h.ancho / 200);
      var b = Math.min(largo, h.t + h.ancho / 200);
      if (a > cursor) trozos.push({ a: cursor, b: a, y0: 0, y1: alto });
      if (h.alto / 100 < alto) trozos.push({ a: a, b: b, y0: h.alto / 100, y1: alto });
      cursor = b;
    });
    if (cursor < largo) trozos.push({ a: cursor, b: largo, y0: 0, y1: alto });

    trozos.forEach(function (tr) {
      var l = tr.b - tr.a;
      var h = tr.y1 - tr.y0;
      if (l <= 0.001 || h <= 0.001) return;
      var caja = new THREE.Mesh(
        new THREE.BoxGeometry(l, h, esp),
        new THREE.MeshStandardMaterial({
          color: COLOR_TABIQUE, roughness: 0.9, metalness: 0, flatShading: true
        })
      );
      var mitad = (tr.a + tr.b) / 2;
      caja.position.set(
        t.x1 + Math.cos(ang) * mitad,
        tr.y0 + h / 2,
        t.z1 + Math.sin(ang) * mitad
      );
      caja.rotation.y = -ang;
      g.add(caja);
    });

    // Marca del hueco a ras de suelo, para verlo en planta.
    cortes.forEach(function (h) {
      var marca = new THREE.Mesh(
        new THREE.BoxGeometry(h.ancho / 100, 0.02, esp * 1.02),
        new THREE.MeshStandardMaterial({ color: COLOR_HUECO, roughness: 0.8 })
      );
      marca.position.set(
        t.x1 + Math.cos(ang) * h.t,
        0.01,
        t.z1 + Math.sin(ang) * h.t
      );
      marca.rotation.y = -ang;
      g.add(marca);
    });

    g.userData.tabique = t;
    return g;
  }

  function repintarObra() {
    while (gObra.children.length) {
      var o = gObra.children[0];
      o.traverse(function (n) {
        if (n.isMesh) { n.geometry.dispose(); n.material.dispose(); }
      });
      gObra.remove(o);
    }
    tabiques.forEach(function (t) { gObra.add(geometriaTabique(t)); });
    listar();
    guardar();
  }

  function largoDe(t) {
    return Math.sqrt(Math.pow(t.x2 - t.x1, 2) + Math.pow(t.z2 - t.z1, 2));
  }

  /* ---------- medidas ---------- */

  function anadirMedida(a, b) {
    var d = a.distanceTo(b);
    var horiz = Math.sqrt(Math.pow(b.x - a.x, 2) + Math.pow(b.z - a.z, 2));
    var dy = Math.abs(b.y - a.y);

    var g = new THREE.Group();
    g.add(linea([a, b], COLOR_MEDIDA, true));

    var texto = metros(d);
    if (dy > 0.02 && horiz > 0.02) texto += '  (h ' + metros(horiz) + ')';
    var spr = etiqueta(texto, COLOR_MEDIDA);
    spr.position.copy(a.clone().add(b).multiplyScalar(0.5));
    g.add(spr);

    [a, b].forEach(function (p) {
      var e = new THREE.Mesh(
        new THREE.SphereGeometry(0.035, 10, 8),
        new THREE.MeshBasicMaterial({ color: COLOR_MEDIDA, depthTest: false })
      );
      e.position.copy(p);
      e.renderOrder = 998;
      g.add(e);
    });

    gMedidas.add(g);
    medidas.push({ id: 'm' + (++contador), a: a.toArray(), b: b.toArray(), d: d, obj: g });
    listar();
    guardar();
  }

  /* ---------- gestos ---------- */

  function onDown(ev) {
    if (!herramienta) return;
    abajo = { x: ev.clientX, y: ev.clientY };
  }

  function onUp(ev) {
    if (!herramienta || !abajo) return;
    var movido = Math.abs(ev.clientX - abajo.x) + Math.abs(ev.clientY - abajo.y);
    abajo = null;
    if (movido > 6) return;   // era un giro de cámara, no un clic

    if (herramienta === 'medir') {
      var p = punto(ev, false);
      if (!p) return;
      if (!pendiente) { pendiente = p; marcarPendiente(p); return; }
      limpiarPendiente();
      anadirMedida(pendiente, p);
      pendiente = null;
      return;
    }

    if (herramienta === 'tabique') {
      var q = punto(ev, true);
      if (!q) return;
      q = ajustar(q);
      if (!pendiente) { pendiente = q; marcarPendiente(q); return; }

      var a = pendiente;
      var b = q;
      // Si está casi a escuadra, se pone a escuadra.
      if (Math.abs(b.x - a.x) < 0.1) b.x = a.x;
      if (Math.abs(b.z - a.z) < 0.1) b.z = a.z;

      limpiarPendiente();
      pendiente = null;

      if (a.distanceTo(b) < 0.1) return;
      tabiques.push({
        id: 't' + (++contador),
        x1: +a.x.toFixed(3), z1: +a.z.toFixed(3),
        x2: +b.x.toFixed(3), z2: +b.z.toFixed(3),
        esp: +document.getElementById('pl-esp').value || 10,
        alto: +document.getElementById('pl-alto').value || 250,
        huecos: []
      });
      repintarObra();
      return;
    }

    if (herramienta === 'puerta') {
      abrirHueco(ev);
    }
  }

  function abrirHueco(ev) {
    ndc(ev);
    ray.setFromCamera(puntero, V.camera);
    var hits = ray.intersectObjects(gObra.children, true);
    var aviso = document.getElementById('pl-aviso');

    if (!hits.length) {
      aviso.hidden = false;
      aviso.textContent = 'Las puertas se abren en tabiques dibujados. Pulsa sobre uno.';
      return;
    }

    var g = hits[0].object;
    while (g && !g.userData.tabique) g = g.parent;
    if (!g) return;

    var t = g.userData.tabique;
    var p = hits[0].point;
    var dx = t.x2 - t.x1, dz = t.z2 - t.z1;
    var largo = Math.sqrt(dx * dx + dz * dz);
    var pos = ((p.x - t.x1) * dx + (p.z - t.z1) * dz) / largo;

    var ancho = +document.getElementById('pl-ancho').value || 80;
    var altoH = +document.getElementById('pl-alto-h').value || 203;

    pos = Math.max(ancho / 200, Math.min(largo - ancho / 200, pos));
    t.huecos.push({ t: +pos.toFixed(3), ancho: ancho, alto: altoH });
    aviso.hidden = true;
    repintarObra();
  }

  var marca = null;

  function marcarPendiente(p) {
    limpiarPendiente();
    marca = new THREE.Mesh(
      new THREE.SphereGeometry(0.05, 12, 10),
      new THREE.MeshBasicMaterial({ color: COLOR_MEDIDA, depthTest: false })
    );
    marca.position.copy(p);
    marca.renderOrder = 999;
    raiz.add(marca);
  }

  function limpiarPendiente() {
    if (!marca) return;
    raiz.remove(marca);
    marca.geometry.dispose();
    marca.material.dispose();
    marca = null;
  }

  /* ---------- panel ---------- */

  function elegir(cual) {
    herramienta = herramienta === cual ? null : cual;
    pendiente = null;
    limpiarPendiente();

    ['medir', 'tabique', 'puerta'].forEach(function (k) {
      var b = document.getElementById('pl-' + k);
      if (b) b.setAttribute('aria-pressed', String(herramienta === k));
    });

    var ayuda = document.getElementById('pl-ayuda');
    ayuda.textContent =
      herramienta === 'medir' ? 'Pulsa dos puntos del modelo. Se pega a las esquinas.' :
      herramienta === 'tabique' ? 'Pulsa el principio y el final. Se pega a las caras de los muros y a 5 cm.' :
      herramienta === 'puerta' ? 'Pulsa sobre un tabique dibujado para abrirle el hueco.' :
      'Arrastrar sigue girando la vista; para colocar un punto, pulsa sin arrastrar.';

    if (herramienta) recogerCaras();
  }

  function listar() {
    var host = document.getElementById('pl-lista');
    host.innerHTML = '';

    tabiques.forEach(function (t) {
      fila(host, 'Tabique', metros(largoDe(t)) + ' · ' + t.esp + ' cm' +
        (t.huecos.length ? ' · ' + t.huecos.length + ' hueco' + (t.huecos.length > 1 ? 's' : '') : ''),
        function () {
          tabiques.splice(tabiques.indexOf(t), 1);
          repintarObra();
        });
    });

    medidas.forEach(function (m) {
      fila(host, 'Medida', metros(m.d), function () {
        gMedidas.remove(m.obj);
        medidas.splice(medidas.indexOf(m), 1);
        listar();
        guardar();
      });
    });

    if (!tabiques.length && !medidas.length) {
      var p = document.createElement('p');
      p.className = 'note';
      p.textContent = 'Todavía no hay nada medido ni dibujado.';
      host.appendChild(p);
    }
  }

  function fila(host, tipo, texto, borrar) {
    var d = document.createElement('div');
    d.className = 'pl-fila';
    d.innerHTML = '<span class="pl-tipo"></span><span class="pl-val"></span>' +
      '<button class="pl-x" title="Quitar">×</button>';
    d.querySelector('.pl-tipo').textContent = tipo;
    d.querySelector('.pl-val').textContent = texto;
    d.querySelector('.pl-x').addEventListener('click', borrar);
    host.appendChild(d);
  }

  /* ---------- guardar ---------- */

  function guardar() {
    try {
      localStorage.setItem(CLAVE, JSON.stringify({
        tabiques: tabiques,
        medidas: medidas.map(function (m) { return { a: m.a, b: m.b, d: m.d }; })
      }));
    } catch (e) { /* sin sitio o en privado: no es crítico */ }
  }

  function restaurar() {
    var raw = null;
    try { raw = localStorage.getItem(CLAVE); } catch (e) { return; }
    if (!raw) return;
    var datos;
    try { datos = JSON.parse(raw); } catch (e) { return; }

    (datos.tabiques || []).forEach(function (t) {
      contador++;
      t.id = 't' + contador;
      t.huecos = t.huecos || [];
      tabiques.push(t);
    });

    (datos.medidas || []).forEach(function (m) {
      if (!m.a || !m.b) return;
      anadirMedida(new THREE.Vector3().fromArray(m.a), new THREE.Vector3().fromArray(m.b));
    });

    repintarObra();
  }

  /* ---------- API ---------- */

  window.PLANO = {

    init: function (visor) {
      V = visor;

      raiz = new THREE.Group();
      raiz.name = 'Plano';
      gCotas = new THREE.Group();
      gCotas.name = 'Cotas';
      gMedidas = new THREE.Group();
      gMedidas.name = 'Medidas';
      gObra = new THREE.Group();
      gObra.name = 'Obra';
      raiz.add(gCotas, gMedidas, gObra);
      V.scene.add(raiz);

      gCotas.visible = false;

      var lienzo = V.renderer.domElement;
      lienzo.addEventListener('pointerdown', onDown, true);
      window.addEventListener('pointerup', onUp);

      ['medir', 'tabique', 'puerta'].forEach(function (k) {
        var b = document.getElementById('pl-' + k);
        if (b) b.addEventListener('click', function () { elegir(k); });
      });

      var vc = document.getElementById('pl-cotas');
      if (vc) {
        vc.addEventListener('click', function () {
          gCotas.visible = !gCotas.visible;
          vc.setAttribute('aria-pressed', String(gCotas.visible));
          if (gCotas.visible) pintarCotas();
        });
      }

      var vo = document.getElementById('pl-ver');
      if (vo) {
        vo.addEventListener('click', function () {
          raiz.visible = !raiz.visible;
          vo.setAttribute('aria-pressed', String(raiz.visible));
        });
      }

      window.addEventListener('keydown', function (ev) {
        if (/^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
        if (ev.key === 'Escape' && herramienta) elegir(herramienta);
      });

      restaurar();
      listar();
    },

    // El visor avisa cuando cambia el modelo: cambian las cotas y los muros.
    modeloNuevo: function () {
      recogerCaras();
      if (gCotas.visible) pintarCotas();
    },

    activo: function () { return !!herramienta; },
    grupo: function () { return gObra; },
    tabiques: function () { return tabiques; },
    medidas: function () { return medidas; }
  };
})();
