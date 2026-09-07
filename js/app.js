/* Visor de modelos de vivienda.

   Lee dos cosas distintas y las clasifica cada una a su manera:
   - el .glb que exporta Polycam de un escaneo LiDAR, por nombre de nodo
     (Wall_0, Window_3, Door_2, toilet...);
   - un .ifc modelado en Revit o similar, por clase IFC (IfcWall, IfcDoor...).

   El resto del visor —medidas, categorías, muebles— es común a los dos. */

(function () {
  'use strict';

  // Modelo que se carga al abrir. Para cambiarlo, déjalo en models/ y toca esta ruta.
  var MODELO = {
    url: 'models/planta-2026-09-05.glb',
    titulo: 'Planta completa',
    fuente: '5_9_2026.glb · escaneado el 5 sep 2026',
    origen: 'Polycam · escaneo LiDAR'
  };

  // Clasificación de los .glb de Polycam, por el nombre que pone la app.
  var CATS_POLYCAM = [
    { id: 'wall',   label: 'Muros',    color: '#BFC8D2', on: true,  test: function (m) { return /^Wall_/i.test(m.name); } },
    { id: 'joint',  label: 'Uniones',  color: '#6E7B88', on: true,  test: function (m) { return /^Joint_/i.test(m.name); } },
    { id: 'door',   label: 'Puertas',  color: '#D98B45', on: true,  test: function (m) { return /^Door/i.test(m.name); } },
    { id: 'window', label: 'Ventanas', color: '#4EB3C4', on: true,  test: function (m) { return /^Window/i.test(m.name); } },
    { id: 'open',   label: 'Huecos',   color: '#9A86D4', on: true,  test: function (m) { return /^Opening/i.test(m.name); } },
    { id: 'floor',  label: 'Suelos',   color: '#B0895A', on: true,  test: function (m) { return /^Floor(_|$)/i.test(m.name); } },
    { id: 'ceil',   label: 'Techos',   color: '#4F6472', on: false, test: function (m) { return /^Ceiling/i.test(m.name); } },
    { id: 'obj',    label: 'Sanitarios y muebles', color: '#D4685F', on: true, test: function () { return true; } }
  ];

  // Clasificación de los .ifc, por clase IFC. Un mismo hueco puede venir como
  // IfcDoor o como IfcDoorStandardCase según quién exporte, de ahí los prefijos.
  function esTipo(m, lista) {
    var t = m.userData.ifc ? m.userData.ifc.tipo : '';
    for (var i = 0; i < lista.length; i++) {
      if (t.indexOf(lista[i]) === 0) return true;
    }
    return false;
  }

  var CATS_IFC = [
    { id: 'wall',   label: 'Muros',      color: '#BFC8D2', on: true,  test: function (m) { return esTipo(m, ['IFCWALL', 'IFCCURTAINWALL', 'IFCPLATE']); } },
    { id: 'door',   label: 'Puertas',    color: '#D98B45', on: true,  test: function (m) { return esTipo(m, ['IFCDOOR']); } },
    { id: 'window', label: 'Ventanas',   color: '#4EB3C4', on: true,  test: function (m) { return esTipo(m, ['IFCWINDOW']); } },
    { id: 'floor',  label: 'Forjados',   color: '#B0895A', on: true,  test: function (m) { return esTipo(m, ['IFCSLAB', 'IFCFOOTING']); } },
    { id: 'ceil',   label: 'Acabados',   color: '#4F6472', on: false, test: function (m) { return esTipo(m, ['IFCCOVERING']); } },
    { id: 'estr',   label: 'Estructura', color: '#8B93A1', on: true,  test: function (m) { return esTipo(m, ['IFCCOLUMN', 'IFCBEAM', 'IFCMEMBER']); } },
    { id: 'esc',    label: 'Escaleras',  color: '#9A86D4', on: true,  test: function (m) { return esTipo(m, ['IFCSTAIR', 'IFCRAMP', 'IFCRAILING']); } },
    { id: 'san',    label: 'Sanitarios', color: '#D4685F', on: true,  test: function (m) { return esTipo(m, ['IFCSANITARY', 'IFCFLOWTERMINAL']); } },
    { id: 'mob',    label: 'Mobiliario', color: '#6F8F7B', on: true,  test: function (m) { return esTipo(m, ['IFCFURNI', 'IFCSYSTEMFURNITURE']); } },
    { id: 'space',  label: 'Recintos',   color: '#3E5A66', on: false, test: function (m) { return esTipo(m, ['IFCSPACE']); } },
    { id: 'obj',    label: 'Otros',      color: '#7C8797', on: true,  test: function () { return true; } }
  ];

  var CATS = CATS_POLYCAM;

  var stage = document.getElementById('stage');
  var dropzone = document.getElementById('dropzone');

  var mode = 'cat';
  var buckets = {};
  var current = null;   // raíz del modelo cargado
  var grid = null;
  var home = { center: new THREE.Vector3(), radius: 0 };
  var planta = false;
  var tocado = false;   // ¿ha movido el usuario la cámara?

  // Dirección de la vista 3D por defecto: aérea a tres cuartos.
  var DIR = new THREE.Vector3(0.55, 0.62, 0.66).normalize();

  /* ---------- escena ---------- */

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0A0D11);

  var camera = new THREE.PerspectiveCamera(45, 1, 0.05, 400);

  var renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputEncoding = THREE.sRGBEncoding;
  stage.appendChild(renderer.domElement);

  var controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.autoRotateSpeed = 0.9;

  scene.add(new THREE.HemisphereLight(0xC5D4E6, 0x2A2318, 0.85));

  var key = new THREE.DirectionalLight(0xFFF4E8, 1.15);
  key.position.set(3, 6, 4);
  scene.add(key);

  var fill = new THREE.DirectionalLight(0x9FBBD6, 0.45);
  fill.position.set(-4, 2, -3);
  scene.add(fill);

  controls.addEventListener('start', function () { tocado = true; });

  function resize() {
    var w = stage.clientWidth;
    var h = stage.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    // Al girar el móvil cambia el encuadre; se recoloca salvo que el usuario
    // ya esté navegando por su cuenta.
    if (!tocado) reset();
  }
  window.addEventListener('resize', resize);

  /* ---------- utilidades ---------- */

  function fmt(v, d) { return v.toFixed(d).replace('.', ','); }

  function set(id, html) { document.getElementById(id).innerHTML = html; }

  function catDe(malla) {
    for (var i = 0; i < CATS.length; i++) {
      if (CATS[i].test(malla)) return CATS[i];
    }
    return CATS[CATS.length - 1];
  }

  function aplicar(cat) {
    var lista = buckets[cat.id] || [];
    for (var i = 0; i < lista.length; i++) {
      lista[i].visible = cat.on;
      lista[i].material = mode === 'cat' ? lista[i].userData.catMat : lista[i].userData.rawMat;
    }
  }

  function pintarLeyenda() {
    var host = document.getElementById('cats');
    host.innerHTML = '';
    CATS.forEach(function (c) {
      var n = (buckets[c.id] || []).length;
      if (!n) return;
      var b = document.createElement('button');
      b.className = 'cat';
      b.setAttribute('aria-pressed', String(c.on));
      b.style.setProperty('--c', c.color);
      b.innerHTML = '<span class="swatch"></span><span class="name"></span><span class="n">' + n + '</span>';
      b.querySelector('.name').textContent = c.label;
      b.addEventListener('click', function () {
        c.on = !c.on;
        b.setAttribute('aria-pressed', String(c.on));
        aplicar(c);
      });
      host.appendChild(b);
    });
  }

  /* ---------- montaje del modelo ---------- */

  function montar(root, titulo, fuente, origen, cats) {
    CATS = cats || CATS_POLYCAM;
    document.getElementById('model-origen').textContent = origen || MODELO.origen;
    document.getElementById('mode-raw').textContent =
      CATS === CATS_IFC ? 'Colores IFC' : 'Colores Polycam';
    document.querySelector('.legend .eyebrow').textContent =
      CATS === CATS_IFC ? 'Elementos del modelo' : 'Elementos del escaneo';

    if (current) {
      scene.remove(current);
      current.traverse(function (o) {
        if (o.isMesh) {
          o.geometry.dispose();
          if (o.userData.catMat) o.userData.catMat.dispose();
        }
      });
    }
    if (grid) scene.remove(grid);

    // Se vacía entero: al pasar de Polycam a IFC cambian las categorías, y las
    // que ya no existen dejarían dentro mallas del modelo anterior.
    buckets = {};
    CATS.forEach(function (c) { buckets[c.id] = []; });

    var tris = 0;
    var meshes = 0;
    var areaSuelo = 0;
    var v0 = new THREE.Vector3();
    var v1 = new THREE.Vector3();
    var v2 = new THREE.Vector3();

    root.traverse(function (o) {
      if (!o.isMesh) return;
      meshes++;

      // Polycam exporta la malla sin normales: sin esto todo se renderiza negro.
      if (!o.geometry.attributes.normal) o.geometry.computeVertexNormals();

      var cat = catDe(o);

      o.userData.rawMat = o.material;
      o.userData.rawMat.flatShading = true;
      o.userData.rawMat.side = THREE.DoubleSide;
      o.userData.rawMat.needsUpdate = true;

      o.userData.catMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(cat.color),
        roughness: 0.82,
        metalness: 0.0,
        flatShading: true,
        side: THREE.DoubleSide
      });

      o.material = o.userData.catMat;
      buckets[cat.id].push(o);

      var pos = o.geometry.attributes.position;
      var idx = o.geometry.index;
      var count = idx ? idx.count : pos.count;
      tris += count / 3;

      // Superficie de suelo: área de los triángulos proyectada en planta.
      // Las piezas de Polycam son cerradas, así que la mitad son la cara inferior.
      if (cat.id === 'floor') {
        o.updateWorldMatrix(true, false);
        for (var t = 0; t < count; t += 3) {
          var a = idx ? idx.getX(t) : t;
          var b = idx ? idx.getX(t + 1) : t + 1;
          var c = idx ? idx.getX(t + 2) : t + 2;
          v0.fromBufferAttribute(pos, a).applyMatrix4(o.matrixWorld);
          v1.fromBufferAttribute(pos, b).applyMatrix4(o.matrixWorld);
          v2.fromBufferAttribute(pos, c).applyMatrix4(o.matrixWorld);
          var e1x = v1.x - v0.x, e1z = v1.z - v0.z;
          var e2x = v2.x - v0.x, e2z = v2.z - v0.z;
          areaSuelo += Math.abs(e1x * e2z - e1z * e2x) / 2;
        }
      }
    });

    var box = new THREE.Box3().setFromObject(root);
    var size = box.getSize(new THREE.Vector3());
    var mid = box.getCenter(new THREE.Vector3());

    // Centrar en planta y apoyar sobre la cota 0.
    root.position.sub(new THREE.Vector3(mid.x, box.min.y, mid.z));
    scene.add(root);
    current = root;

    var span = Math.ceil(Math.max(size.x, size.z)) + 2;
    grid = new THREE.GridHelper(span, span * 2, 0x2A333F, 0x161B22);
    grid.position.y = -0.002;
    scene.add(grid);

    set('m-x', fmt(size.x, 2) + '<span class="u">m</span>');
    set('m-z', fmt(size.z, 2) + '<span class="u">m</span>');
    set('m-y', fmt(size.y, 2) + '<span class="u">m</span>');
    set('m-a', fmt(areaSuelo / 2, 1) + '<span class="u">m²</span>');
    document.getElementById('m-n').textContent = meshes;
    document.getElementById('m-t').textContent = Math.round(tris).toLocaleString('es-ES');
    document.getElementById('model-title').textContent = titulo;
    document.getElementById('model-source').textContent = fuente;

    pintarLeyenda();
    CATS.forEach(aplicar);

    // Encuadre por esfera envolvente: así entra entero tanto en pantalla
    // apaisada como en el móvil en vertical, donde manda el ancho.
    home.center.set(0, size.y / 2, 0);
    home.radius = 0.5 * Math.sqrt(size.x * size.x + size.y * size.y + size.z * size.z);
    home.radioXZ = 0.5 * Math.sqrt(size.x * size.x + size.z * size.z);
    tocado = false;
    reset();

    root.updateMatrixWorld(true);
    murosEnPlanta();
    API.tam = size.clone();

    var l = document.getElementById('loading');
    if (l) l.remove();
    resize();

    if (window.PLANO) window.PLANO.modeloNuevo();
    if (window.MUEBLES) window.MUEBLES.modeloNuevo();
  }

  /* ---------- huella de los muros en planta ----------
     Para el imán y la detección de choques del mobiliario hace falta saber
     dónde están los muros vistos desde arriba. Cada muro es una caja girada
     sobre el eje Y, así que sus 8 esquinas proyectadas en XZ forman un
     rectángulo; ordenándolas por ángulo alrededor del centro sale el polígono. */

  var muros = [];
  var murosPoly = [];

  function murosEnPlanta() {
    muros = (buckets.wall || []).concat(buckets.joint || []);
    murosPoly = [];

    muros.forEach(function (m) {
      if (!m.geometry.boundingBox) m.geometry.computeBoundingBox();
      var bb = m.geometry.boundingBox;
      var pts = [];
      for (var i = 0; i < 8; i++) {
        var v = new THREE.Vector3(
          (i & 1) ? bb.max.x : bb.min.x,
          (i & 2) ? bb.max.y : bb.min.y,
          (i & 4) ? bb.max.z : bb.min.z
        ).applyMatrix4(m.matrixWorld);
        pts.push([v.x, v.z]);
      }

      var cx = 0, cz = 0;
      pts.forEach(function (p) { cx += p[0]; cz += p[1]; });
      cx /= pts.length;
      cz /= pts.length;
      pts.sort(function (a, b) {
        return Math.atan2(a[1] - cz, a[0] - cx) - Math.atan2(b[1] - cz, b[0] - cx);
      });
      murosPoly.push(pts);
    });

    API.muros = muros;
    API.murosPoly = murosPoly;
  }

  // Lo que la capa de mobiliario necesita del visor.
  var API = {
    scene: scene,
    camera: camera,
    renderer: renderer,
    controls: controls,
    stage: stage,
    muros: [],
    murosPoly: [],
    tam: null,          // dimensiones del modelo, para las cotas
    modelo: function () { return current; }
  };
  window.VISOR = API;

  /* ---------- cámara ---------- */

  // Distancia a la que la esfera envolvente cabe entera, mirando el lado
  // más estrecho del encuadre (en vertical, el horizontal).
  function distancia(radio) {
    var fovV = camera.fov * Math.PI / 180;
    var fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
    return (radio / Math.sin(Math.min(fovV, fovH) / 2)) * 1.06;
  }

  function reset() {
    if (!home.radius) return;
    if (planta) {
      // Desde arriba solo cuenta la huella; la altura no ocupa encuadre.
      camera.position.set(0.001, distancia(home.radioXZ), 0);
      controls.target.set(0, 0, 0);
    } else {
      var d = distancia(home.radius);
      camera.position.set(
        home.center.x + DIR.x * d,
        home.center.y + DIR.y * d,
        home.center.z + DIR.z * d
      );
      controls.target.copy(home.center);
    }
    controls.update();
    tocado = false;
  }

  document.getElementById('btn-reset').addEventListener('click', reset);

  var btnPlan = document.getElementById('btn-plan');
  btnPlan.addEventListener('click', function () {
    planta = !planta;
    btnPlan.setAttribute('aria-pressed', String(planta));
    reset();
  });

  var btnSpin = document.getElementById('btn-spin');
  btnSpin.addEventListener('click', function () {
    controls.autoRotate = !controls.autoRotate;
    btnSpin.setAttribute('aria-pressed', String(controls.autoRotate));
  });

  document.getElementById('mode-cat').addEventListener('click', function () { setMode('cat'); });
  document.getElementById('mode-raw').addEventListener('click', function () { setMode('raw'); });

  function setMode(m) {
    mode = m;
    document.getElementById('mode-cat').setAttribute('aria-pressed', String(m === 'cat'));
    document.getElementById('mode-raw').setAttribute('aria-pressed', String(m === 'raw'));
    CATS.forEach(aplicar);
  }

  /* ---------- carga ---------- */

  var loader = new THREE.GLTFLoader();

  function fallo(msg) {
    var l = document.getElementById('loading');
    if (!l) {
      l = document.createElement('div');
      l.className = 'loading';
      l.id = 'loading';
      stage.appendChild(l);
    }
    l.textContent = msg;
  }

  // Compilado con el modelo dentro (página suelta, sin servidor): se parsea de memoria.
  // Si no, se pide el .glb a models/ como cualquier otro recurso.
  if (window.MODELO_GLB_B64) {
    var bin = atob(window.MODELO_GLB_B64);
    var bytes = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    loader.parse(bytes.buffer, '', function (gltf) {
      montar(gltf.scene, MODELO.titulo, MODELO.fuente, MODELO.origen, CATS_POLYCAM);
    }, function (err) {
      console.error(err);
      fallo('NO SE PUDO LEER EL MODELO INCRUSTADO');
    });
  } else {
    loader.load(
      MODELO.url,
      function (gltf) { montar(gltf.scene, MODELO.titulo, MODELO.fuente, MODELO.origen, CATS_POLYCAM); },
      null,
      function (err) {
        console.error(err);
        fallo('NO SE PUDO CARGAR ' + MODELO.url + ' — ABRE UN MODELO CON EL BOTÓN');
      }
    );
  }

  /* ---------- abrir un archivo ---------- */

  function tamano(bytes) {
    return bytes > 1048576
      ? (bytes / 1048576).toFixed(1).replace('.', ',') + ' MB'
      : Math.round(bytes / 1024) + ' KB';
  }

  function abrir(file) {
    if (!file) return;
    var nombre = file.name.replace(/\.(glb|gltf|ifc)$/i, '');
    var pie = file.name + ' · ' + tamano(file.size);

    if (/\.ifc$/i.test(file.name)) {
      fallo('LEYENDO IFC… LA PRIMERA VEZ DESCARGA EL MOTOR (6 MB)');
      file.arrayBuffer().then(function (buf) {
        return window.IFC.cargar(buf);
      }).then(function (res) {
        if (!res.elementos) {
          fallo('EL IFC NO TRAE GEOMETRÍA LEGIBLE');
          return;
        }
        montar(res.grupo, nombre, pie, 'IFC · ' + res.elementos + ' elementos', CATS_IFC);
      }).catch(function (err) {
        console.error(err);
        fallo('NO SE PUDO LEER EL IFC');
      });
      return;
    }

    if (!/\.(glb|gltf)$/i.test(file.name)) {
      fallo('SOLO .IFC, .GLB O .GLTF');
      return;
    }

    file.arrayBuffer().then(function (buf) {
      loader.parse(buf, '', function (gltf) {
        montar(gltf.scene, nombre, pie, 'Modelo abierto · .glb', CATS_POLYCAM);
      }, function (err) {
        console.error(err);
        fallo('NO SE PUDO LEER ESE ARCHIVO');
      });
    });
  }

  // En el móvil no se puede arrastrar: hace falta el botón. La versión
  // incrustada del visor no lo lleva, así que puede no existir.
  var entrada = document.getElementById('file-modelo');
  if (entrada) {
    entrada.addEventListener('change', function (e) {
      abrir(e.target.files[0]);
      e.target.value = '';
    });
  }

  ['dragenter', 'dragover'].forEach(function (ev) {
    stage.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.add('on');
    });
  });

  ['dragleave', 'drop'].forEach(function (ev) {
    stage.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.remove('on');
    });
  });

  stage.addEventListener('drop', function (e) {
    abrir(e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]);
  });

  /* ---------- bucle ---------- */

  /* ---------- pestañas del panel ---------- */

  var PANELES = ['escaneo', 'plano', 'muebles'];

  function pestana(cual) {
    PANELES.forEach(function (p) {
      var t = document.getElementById('tab-' + p);
      var d = document.getElementById('panel-' + p);
      if (t) t.setAttribute('aria-pressed', String(cual === p));
      if (d) d.hidden = cual !== p;
    });
  }

  PANELES.forEach(function (p) {
    var t = document.getElementById('tab-' + p);
    if (t) t.addEventListener('click', function () { pestana(p); });
  });

  // PLANO antes que MUEBLES: cuando hay una herramienta de plano activa,
  // el clic no debe además coger un mueble.
  if (window.PLANO) window.PLANO.init(API);
  if (window.MUEBLES) window.MUEBLES.init(API);

  resize();

  (function loop() {
    requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  })();
})();
