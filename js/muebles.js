/* Capa de mobiliario: colocar piezas de medidas estándar sobre la planta
   escaneada, moverlas, girarlas, ajustarles las medidas, y exportar la
   distribución. Todo en metros dentro de la escena; el catálogo y el panel
   hablan en centímetros, que es como se piensan los muebles. */

(function () {
  'use strict';

  var COLOR = 0x6F8F7B;   // mobiliario
  var COLOR_SEL = 0x4EB3C4;   // pieza seleccionada
  var COLOR_MAL = 0xD9534F;   // pieza que choca
  var IMAN = 0.12;   // distancia a la que una pieza se pega al muro, en metros
  var CLAVE = 'visor-escaneo:muebles:v1';

  var V = null;          // API del visor (js/app.js)
  var grupo = null;      // contenedor de todas las piezas
  var piezas = [];
  var sel = null;
  var contador = 0;

  var geoCaja = null;
  var geoCil = null;
  var plano = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  var ray = new THREE.Raycaster();
  var puntero = new THREE.Vector2();

  var arrastre = null;    // { pieza, offset }

  /* ---------- construcción de piezas ---------- */

  function defDe(id) {
    for (var i = 0; i < window.CATALOGO.length; i++) {
      if (window.CATALOGO[i].id === id) return window.CATALOGO[i];
    }
    return null;
  }

  function crear(estado) {
    var geo = estado.forma === 'cilindro' ? geoCil : geoCaja;

    var mat = new THREE.MeshStandardMaterial({
      color: new THREE.Color(COLOR),
      roughness: 0.7,
      metalness: 0.0,
      flatShading: estado.forma !== 'cilindro'
    });

    var m = new THREE.Mesh(geo, mat);
    m.userData.es = estado;
    m.userData.mat = mat;

    var borde = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: 0x0A0D11, transparent: true, opacity: 0.45 })
    );
    m.add(borde);

    grupo.add(m);
    piezas.push(m);
    aplicarEstado(m);
    return m;
  }

  function aplicarEstado(m) {
    var e = m.userData.es;
    m.scale.set(e.w / 100, e.h / 100, e.d / 100);
    m.position.set(e.x, (e.base / 100) + (e.h / 100) / 2, e.z);
    m.rotation.y = e.rot * Math.PI / 180;
  }

  function nuevaDesdeCatalogo(def) {
    var estado = {
      id: 'p' + (++contador),
      tipo: def.id,
      nombre: def.nombre,
      forma: def.forma || 'caja',
      w: def.w, d: def.d, h: def.h,
      base: def.base || 0,
      x: 0, z: 0, rot: 0
    };
    // Se deja delante de la cámara, sobre el suelo, para que aparezca a la vista.
    var mira = V.controls.target;
    estado.x = +(mira.x).toFixed(3);
    estado.z = +(mira.z).toFixed(3);
    buscarHueco(estado);

    var m = crear(estado);
    seleccionar(m);
    revisarChoques();
    guardar();
    return m;
  }

  // Busca en espiral desde el centro de la vista el primer sitio donde la pieza
  // no pise ni un muro ni otro mueble, para que no aparezca siempre en rojo.
  function buscarHueco(estado) {
    var x0 = estado.x, z0 = estado.z;

    for (var r = 0; r <= 8; r += 0.4) {
      var pasos = r === 0 ? 1 : Math.max(8, Math.round(r * 8));
      for (var k = 0; k < pasos; k++) {
        var a = (k / pasos) * Math.PI * 2;
        var x = x0 + Math.cos(a) * r;
        var z = z0 + Math.sin(a) * r;
        if (libre(esquinas(x, z, estado.w, estado.d, estado.rot))) {
          estado.x = +x.toFixed(3);
          estado.z = +z.toFixed(3);
          return;
        }
      }
    }
  }

  function libre(poly) {
    for (var i = 0; i < piezas.length; i++) {
      if (solapan(poly, poligonoDe(piezas[i]))) return false;
    }
    var muros = V.murosPoly || [];
    for (var j = 0; j < muros.length; j++) {
      if (solapan(poly, muros[j])) return false;
    }
    return true;
  }

  /* ---------- geometría 2D: rectángulos y solapes ---------- */

  function esquinas(cx, cz, w, d, rotGrados) {
    var r = rotGrados * Math.PI / 180;
    var c = Math.cos(r), s = Math.sin(r);
    var hw = w / 200, hd = d / 200;   // cm -> m, y a la mitad
    var p = [[-hw, -hd], [hw, -hd], [hw, hd], [-hw, hd]];
    var out = [];
    for (var i = 0; i < 4; i++) {
      out.push([cx + p[i][0] * c - p[i][1] * s, cz + p[i][0] * s + p[i][1] * c]);
    }
    return out;
  }

  function poligonoDe(pieza) {
    var e = pieza.userData.es;
    return esquinas(e.x, e.z, e.w, e.d, e.rot);
  }

  // Teorema de los ejes separadores sobre dos polígonos convexos.
  function solapan(A, B) {
    var caras = [A, B];
    for (var k = 0; k < 2; k++) {
      var poly = caras[k];
      for (var i = 0; i < poly.length; i++) {
        var j = (i + 1) % poly.length;
        var nx = -(poly[j][1] - poly[i][1]);
        var nz = poly[j][0] - poly[i][0];
        var len = Math.sqrt(nx * nx + nz * nz);
        if (len < 1e-6) continue;
        nx /= len; nz /= len;

        var minA = Infinity, maxA = -Infinity, minB = Infinity, maxB = -Infinity;
        for (var a = 0; a < A.length; a++) {
          var va = A[a][0] * nx + A[a][1] * nz;
          if (va < minA) minA = va;
          if (va > maxA) maxA = va;
        }
        for (var b = 0; b < B.length; b++) {
          var vb = B[b][0] * nx + B[b][1] * nz;
          if (vb < minB) minB = vb;
          if (vb > maxB) maxB = vb;
        }
        // Un poco de holgura: rozar no es chocar.
        if (maxA < minB + 0.005 || maxB < minA + 0.005) return false;
      }
    }
    return true;
  }

  function revisarChoques() {
    var malas = {};
    for (var i = 0; i < piezas.length; i++) {
      var pi = poligonoDe(piezas[i]);
      for (var j = i + 1; j < piezas.length; j++) {
        if (solapan(pi, poligonoDe(piezas[j]))) {
          malas[piezas[i].userData.es.id] = true;
          malas[piezas[j].userData.es.id] = true;
        }
      }
      var muros = V.murosPoly;
      for (var k = 0; k < muros.length; k++) {
        if (solapan(pi, muros[k])) { malas[piezas[i].userData.es.id] = true; break; }
      }
    }

    var n = 0;
    for (var p = 0; p < piezas.length; p++) {
      var mala = !!malas[piezas[p].userData.es.id];
      piezas[p].userData.choca = mala;
      if (mala) n++;
      pintar(piezas[p]);
    }

    var aviso = document.getElementById('mb-aviso');
    if (n) {
      aviso.textContent = n === 1
        ? '1 pieza choca con un muro u otro mueble'
        : n + ' piezas chocan con un muro u otro mueble';
      aviso.hidden = false;
    } else {
      aviso.hidden = true;
    }
  }

  function pintar(m) {
    var c = m === sel ? COLOR_SEL : (m.userData.choca ? COLOR_MAL : COLOR);
    m.userData.mat.color.setHex(c);
    m.userData.mat.emissive.setHex(m === sel ? 0x0E2A30 : 0x000000);
  }

  /* ---------- imán a los muros ---------- */

  function pegar(m) {
    var e = m.userData.es;
    var r = e.rot * Math.PI / 180;
    var centro = new THREE.Vector3(e.x, 0.5, e.z);

    var dirs = [
      { v: new THREE.Vector3(Math.sin(r), 0, Math.cos(r)),   mitad: e.d / 200 },
      { v: new THREE.Vector3(-Math.sin(r), 0, -Math.cos(r)), mitad: e.d / 200 },
      { v: new THREE.Vector3(Math.cos(r), 0, -Math.sin(r)),  mitad: e.w / 200 },
      { v: new THREE.Vector3(-Math.cos(r), 0, Math.sin(r)),  mitad: e.w / 200 }
    ];

    var mejor = null;
    for (var i = 0; i < dirs.length; i++) {
      ray.set(centro, dirs[i].v);
      var hits = ray.intersectObjects(V.muros, false);
      if (!hits.length) continue;
      var hueco = hits[0].distance - dirs[i].mitad;
      if (hueco > 0 && hueco < IMAN && (!mejor || hueco < mejor.hueco)) {
        mejor = { hueco: hueco, dir: dirs[i].v };
      }
    }

    if (mejor) {
      e.x = +(e.x + mejor.dir.x * mejor.hueco).toFixed(3);
      e.z = +(e.z + mejor.dir.z * mejor.hueco).toFixed(3);
      aplicarEstado(m);
    }
  }

  /* ---------- selección y panel ---------- */

  function seleccionar(m) {
    var antes = sel;
    sel = m;
    if (antes) pintar(antes);
    if (sel) pintar(sel);
    pintarPanel();
  }

  function pintarPanel() {
    var panel = document.getElementById('mb-props');
    if (!sel) { panel.hidden = true; return; }
    panel.hidden = false;
    var e = sel.userData.es;
    document.getElementById('mb-nombre').textContent = e.nombre;
    document.getElementById('mb-w').value = e.w;
    document.getElementById('mb-d').value = e.d;
    document.getElementById('mb-h').value = e.h;
    document.getElementById('mb-rot').value = Math.round(e.rot);
  }

  function leerPanel() {
    if (!sel) return;
    var e = sel.userData.es;
    e.w = Math.max(5, Math.min(1200, +document.getElementById('mb-w').value || e.w));
    e.d = Math.max(5, Math.min(1200, +document.getElementById('mb-d').value || e.d));
    e.h = Math.max(1, Math.min(400, +document.getElementById('mb-h').value || e.h));
    e.rot = (+document.getElementById('mb-rot').value || 0) % 360;
    aplicarEstado(sel);
    revisarChoques();
    guardar();
  }

  function girar(grados) {
    if (!sel) return;
    var e = sel.userData.es;
    e.rot = (e.rot + grados + 360) % 360;
    aplicarEstado(sel);
    pegar(sel);
    revisarChoques();
    pintarPanel();
    guardar();
  }

  function borrar() {
    if (!sel) return;
    // La geometría es compartida por todas las piezas: no se destruye aquí.
    grupo.remove(sel);
    sel.userData.mat.dispose();
    piezas.splice(piezas.indexOf(sel), 1);
    seleccionar(null);
    revisarChoques();
    inventario();
    guardar();
  }

  function duplicar() {
    if (!sel) return;
    var e = sel.userData.es;
    var copia = JSON.parse(JSON.stringify(e));
    copia.id = 'p' + (++contador);
    copia.x += 0.3;
    copia.z += 0.3;
    var m = crear(copia);
    seleccionar(m);
    revisarChoques();
    inventario();
    guardar();
  }

  /* ---------- puntero ---------- */

  function ndc(ev) {
    var r = V.renderer.domElement.getBoundingClientRect();
    puntero.x = ((ev.clientX - r.left) / r.width) * 2 - 1;
    puntero.y = -((ev.clientY - r.top) / r.height) * 2 + 1;
  }

  function suelo(ev) {
    ndc(ev);
    ray.setFromCamera(puntero, V.camera);
    var p = new THREE.Vector3();
    return ray.ray.intersectPlane(plano, p) ? p : null;
  }

  function onDown(ev) {
    if (!grupo.visible || ev.button === 2) return;
    ndc(ev);
    ray.setFromCamera(puntero, V.camera);
    var hits = ray.intersectObjects(piezas, false);

    if (!hits.length) {
      if (sel) seleccionar(null);
      return;
    }

    var m = hits[0].object;
    seleccionar(m);

    var p = suelo(ev);
    if (!p) return;

    arrastre = { pieza: m, dx: m.userData.es.x - p.x, dz: m.userData.es.z - p.z };
    V.controls.enabled = false;
    ev.stopPropagation();
    ev.preventDefault();
  }

  function onMove(ev) {
    if (!arrastre) return;
    var p = suelo(ev);
    if (!p) return;
    var e = arrastre.pieza.userData.es;
    e.x = +(p.x + arrastre.dx).toFixed(3);
    e.z = +(p.z + arrastre.dz).toFixed(3);
    aplicarEstado(arrastre.pieza);
    ev.preventDefault();
  }

  function onUp() {
    if (!arrastre) return;
    pegar(arrastre.pieza);
    arrastre = null;
    V.controls.enabled = true;
    revisarChoques();
    guardar();
  }

  /* ---------- inventario y persistencia ---------- */

  function inventario() {
    var host = document.getElementById('mb-lista');
    host.innerHTML = '';
    document.getElementById('mb-total').textContent = piezas.length;

    piezas.forEach(function (m) {
      var e = m.userData.es;
      var b = document.createElement('button');
      b.className = 'mb-item';
      b.innerHTML = '<span class="mb-item-n"></span><span class="mb-item-med"></span>';
      b.querySelector('.mb-item-n').textContent = e.nombre;
      b.querySelector('.mb-item-med').textContent = e.w + '×' + e.d;
      b.addEventListener('click', function () { seleccionar(m); });
      host.appendChild(b);
    });
  }

  function guardar() {
    inventario();
    try {
      localStorage.setItem(CLAVE, JSON.stringify(piezas.map(function (m) { return m.userData.es; })));
    } catch (err) { /* modo privado, cuota llena: no es crítico */ }
  }

  function restaurar() {
    var raw = null;
    try { raw = localStorage.getItem(CLAVE); } catch (err) { return; }
    if (!raw) return;
    var datos;
    try { datos = JSON.parse(raw); } catch (err) { return; }
    if (!Array.isArray(datos)) return;

    datos.forEach(function (e) {
      if (!e || typeof e.w !== 'number') return;
      contador++;
      e.id = 'p' + contador;
      crear(e);
    });
    revisarChoques();
    inventario();
  }

  /* ---------- exportar ---------- */

  function bajar(blob, nombre) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function fecha() {
    var d = new Date();
    return d.getFullYear() + '-' +
      String(d.getMonth() + 1).padStart(2, '0') + '-' +
      String(d.getDate()).padStart(2, '0');
  }

  function exportarCSV() {
    var filas = [['pieza', 'ancho_cm', 'fondo_cm', 'alto_cm', 'base_cm', 'x_m', 'z_m', 'rotacion_grados']];
    piezas.forEach(function (m) {
      var e = m.userData.es;
      filas.push([e.nombre, e.w, e.d, e.h, e.base, e.x.toFixed(3), e.z.toFixed(3), Math.round(e.rot)]);
    });
    var csv = filas.map(function (f) {
      return f.map(function (c) {
        return /[";,\n]/.test(String(c)) ? '"' + String(c).replace(/"/g, '""') + '"' : c;
      }).join(';');
    }).join('\r\n');

    // BOM para que Excel en español lo abra en UTF-8 sin destrozar los acentos.
    bajar(new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' }), 'muebles-' + fecha() + '.csv');
  }

  function exportarGLB() {
    if (typeof THREE.GLTFExporter === 'undefined') return;
    var btn = document.getElementById('mb-glb');
    btn.disabled = true;
    btn.textContent = 'Exportando…';

    var lista = [grupo];
    if (V.modelo()) lista.unshift(V.modelo());

    new THREE.GLTFExporter().parse(lista, function (res) {
      bajar(new Blob([res], { type: 'model/gltf-binary' }), 'distribucion-' + fecha() + '.glb');
      btn.disabled = false;
      btn.textContent = 'Exportar .glb';
    }, { binary: true });
  }

  function vaciar() {
    if (!piezas.length) return;
    if (!window.confirm('¿Quitar las ' + piezas.length + ' piezas colocadas?')) return;
    piezas.forEach(function (m) { grupo.remove(m); });
    piezas = [];
    seleccionar(null);
    revisarChoques();
    guardar();
  }

  /* ---------- catálogo en el panel ---------- */

  function pintarCatalogo() {
    var host = document.getElementById('mb-catalogo');
    var cats = [];
    window.CATALOGO.forEach(function (d) {
      if (cats.indexOf(d.cat) === -1) cats.push(d.cat);
    });

    cats.forEach(function (c) {
      var h = document.createElement('div');
      h.className = 'eyebrow mb-cat';
      h.textContent = c;
      host.appendChild(h);

      var caja = document.createElement('div');
      caja.className = 'mb-rejilla';
      window.CATALOGO.filter(function (d) { return d.cat === c; }).forEach(function (d) {
        var b = document.createElement('button');
        b.className = 'mb-add';
        b.innerHTML = '<span class="mb-add-n"></span><span class="mb-add-med"></span>';
        b.querySelector('.mb-add-n').textContent = d.nombre;
        b.querySelector('.mb-add-med').textContent = d.w + '×' + d.d + '×' + d.h;
        b.addEventListener('click', function () { nuevaDesdeCatalogo(d); });
        caja.appendChild(b);
      });
      host.appendChild(caja);
    });
  }

  /* ---------- arranque ---------- */

  window.MUEBLES = {
    init: function (visor) {
      V = visor;

      geoCaja = new THREE.BoxGeometry(1, 1, 1);
      geoCil = new THREE.CylinderGeometry(0.5, 0.5, 1, 32);

      grupo = new THREE.Group();
      grupo.name = 'Muebles';
      V.scene.add(grupo);

      pintarCatalogo();

      var lienzo = V.renderer.domElement;
      lienzo.addEventListener('pointerdown', onDown, true);
      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);

      // La versión incrustada del visor no lleva los botones de exportar,
      // así que aquí no se da por hecho que un id exista.
      function on(id, ev, fn) {
        var el = document.getElementById(id);
        if (el) el.addEventListener(ev, fn);
      }

      ['mb-w', 'mb-d', 'mb-h', 'mb-rot'].forEach(function (id) {
        on(id, 'change', leerPanel);
      });

      on('mb-rot-menos', 'click', function () { girar(-45); });
      on('mb-rot-mas', 'click', function () { girar(45); });
      on('mb-dup', 'click', duplicar);
      on('mb-del', 'click', borrar);
      on('mb-csv', 'click', exportarCSV);
      on('mb-glb', 'click', exportarGLB);
      on('mb-vaciar', 'click', vaciar);

      var ver = document.getElementById('mb-ver');
      on('mb-ver', 'click', function () {
        grupo.visible = !grupo.visible;
        ver.setAttribute('aria-pressed', String(grupo.visible));
      });

      window.addEventListener('keydown', function (ev) {
        if (/^(INPUT|TEXTAREA)$/.test(ev.target.tagName)) return;
        if (!sel) return;
        if (ev.key === 'Delete' || ev.key === 'Backspace') { borrar(); ev.preventDefault(); }
        if (ev.key === 'r' || ev.key === 'R') girar(ev.shiftKey ? -45 : 45);
        if (ev.key === 'Escape') seleccionar(null);
      });

      restaurar();
      inventario();
    },

    // El visor avisa cuando cambia el modelo: los muros son otros.
    modeloNuevo: function () {
      revisarChoques();
    }
  };
})();
