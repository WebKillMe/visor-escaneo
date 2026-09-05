/* Visor de escaneos LiDAR de Polycam.
   Lee el .glb tal y como lo exporta Polycam y lo colorea por categorías
   usando los nombres de nodo (Wall_0, Window_3, Door_2, toilet...). */

(function () {
  'use strict';

  // Modelo que se carga al abrir. Para añadir otro, déjalo en models/ y cambia esta ruta.
  var MODELO = {
    url: 'models/planta-2026-09-05.glb',
    titulo: 'Planta completa',
    fuente: '5_9_2026.glb · escaneado el 5 sep 2026'
  };

  var CATS = [
    { id: 'wall',   label: 'Muros',    color: '#BFC8D2', on: true,  test: function (n) { return /^Wall_/i.test(n); } },
    { id: 'joint',  label: 'Uniones',  color: '#6E7B88', on: true,  test: function (n) { return /^Joint_/i.test(n); } },
    { id: 'door',   label: 'Puertas',  color: '#D98B45', on: true,  test: function (n) { return /^Door/i.test(n); } },
    { id: 'window', label: 'Ventanas', color: '#4EB3C4', on: true,  test: function (n) { return /^Window/i.test(n); } },
    { id: 'open',   label: 'Huecos',   color: '#9A86D4', on: true,  test: function (n) { return /^Opening/i.test(n); } },
    { id: 'floor',  label: 'Suelos',   color: '#B0895A', on: true,  test: function (n) { return /^Floor(_|$)/i.test(n); } },
    { id: 'ceil',   label: 'Techos',   color: '#4F6472', on: false, test: function (n) { return /^Ceiling/i.test(n); } },
    { id: 'obj',    label: 'Sanitarios y muebles', color: '#D4685F', on: true, test: function () { return true; } }
  ];

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

  function catDe(nombre) {
    for (var i = 0; i < CATS.length; i++) {
      if (CATS[i].test(nombre)) return CATS[i];
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

  function montar(root, titulo, fuente) {
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

      var cat = catDe(o.name);

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
    tocado = false;
    reset();

    var l = document.getElementById('loading');
    if (l) l.remove();
    resize();
  }

  /* ---------- cámara ---------- */

  // Distancia a la que la esfera envolvente cabe entera, mirando el lado
  // más estrecho del encuadre (en vertical, el horizontal).
  function distancia() {
    var fovV = camera.fov * Math.PI / 180;
    var fovH = 2 * Math.atan(Math.tan(fovV / 2) * camera.aspect);
    return (home.radius / Math.sin(Math.min(fovV, fovH) / 2)) * 1.06;
  }

  function reset() {
    if (!home.radius) return;
    var d = distancia();
    if (planta) {
      camera.position.set(0.001, home.center.y + d, 0);
      controls.target.set(0, 0, 0);
    } else {
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
      montar(gltf.scene, MODELO.titulo, MODELO.fuente);
    }, function (err) {
      console.error(err);
      fallo('NO SE PUDO LEER EL MODELO INCRUSTADO');
    });
  } else {
    loader.load(
      MODELO.url,
      function (gltf) { montar(gltf.scene, MODELO.titulo, MODELO.fuente); },
      null,
      function (err) {
        console.error(err);
        fallo('NO SE PUDO CARGAR ' + MODELO.url + ' — ARRASTRA UN .GLB AQUÍ');
      }
    );
  }

  /* ---------- arrastrar y soltar ---------- */

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
    var file = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (!file) return;
    if (!/\.(glb|gltf)$/i.test(file.name)) {
      fallo('SOLO .GLB O .GLTF');
      return;
    }
    var kb = Math.round(file.size / 1024);
    file.arrayBuffer().then(function (buf) {
      loader.parse(buf, '', function (gltf) {
        montar(gltf.scene, file.name.replace(/\.(glb|gltf)$/i, ''), file.name + ' · ' + kb + ' KB');
      }, function (err) {
        console.error(err);
        fallo('NO SE PUDO LEER ESE ARCHIVO');
      });
    });
  });

  /* ---------- bucle ---------- */

  resize();

  (function loop() {
    requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  })();
})();
