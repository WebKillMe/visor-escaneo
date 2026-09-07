# Visor de escaneos

Visor 3D en el navegador para los escaneos LiDAR que exporta **Polycam** en `.glb`.
Orbita la planta, mide, y enciende o apaga muros, puertas, ventanas, suelos y techos por separado.

**Demo:** https://webkillme.github.io/visor-escaneo/

## Qué hace

Polycam clasifica la geometría mientras escanea y nombra cada pieza (`Wall_0`, `Window_3`,
`Door_2`, `toilet`, `bathtub`…). El visor lee esos nombres y los usa para:

- colorear cada tipo de elemento y poder aislarlo,
- ocultar los techos por defecto, para ver la planta desde arriba,
- contar cuántos elementos hay de cada tipo.

Además calcula del propio modelo el largo, el fondo, la altura libre y los m² de suelo
(sumando el área de los triángulos de los suelos proyectada en planta).

Arrastrando cualquier otro `.glb` o `.gltf` sobre la vista se abre en su lugar. El archivo
se lee en el navegador con `FileReader`; no se sube a ningún servidor.

## Plano: cotas, medir y tabiques

La pestaña **Plano** añade tres herramientas que comparten el mismo gesto: pulsar sin
arrastrar coloca un punto, y arrastrar sigue girando la vista, así que funciona igual con
ratón que con el dedo.

- **Cotas generales**: largo, fondo y altura libre acotados sobre el modelo.
- **Medir**: dos puntos y la distancia. Se pega al vértice más cercano dentro de 12 cm,
  porque medir esquinas a ojo con el dedo es imposible y las esquinas son justo lo que se
  quiere medir. Si los dos puntos están a distinta altura también da la distancia
  horizontal.
- **Tabique**: dos puntos en planta y sale un tabique nuevo, con espesor y altura
  editables. Se pega a las caras de los muros existentes dentro de 12 cm y, si no, a una
  rejilla de 5 cm; si el trazo está casi a escuadra, se pone a escuadra.
- **Puerta**: pulsando sobre un tabique dibujado se le abre el hueco de verdad — el
  tabique se reconstruye en tramos con su dintel, no es una marca pintada.

Los tabiques salen en color hueso para distinguirlos del escaneo, se guardan en el
navegador y viajan en el `.glb` y en el `.csv` que se exportan desde Muebles.

Las puertas solo se abren en tabiques dibujados aquí, no en los muros del escaneo.

## Muebles

La pestaña **Muebles** sirve para responder a «¿esto me cabe?». Trae un catálogo de 37
piezas con medidas estándar de fabricante (cama de matrimonio 150×190, sofá de 3 plazas
210×90, nevera 60×70×185, inodoro 37×67…), y cada una es editable en centímetros una vez
colocada.

- Al añadir una pieza, se busca en espiral el primer hueco libre desde el centro de la
  vista, para que no aparezca dentro de un muro.
- Se arrastra con el ratón o el dedo sobre el plano; al soltar, si queda a menos de 12 cm
  de un muro se pega a él.
- Gira en pasos de 45° con los botones o la tecla `R`; `Supr` borra la pieza.
- Si una pieza pisa un muro u otro mueble se pone en rojo y el panel lo avisa. La
  detección es por ejes separadores sobre los rectángulos en planta, así que funciona con
  piezas y muros girados en cualquier ángulo.
- La distribución se guarda en `localStorage`: al volver sigue ahí.

**Exportar** deja dos archivos: un `.glb` con el escaneo y los muebles juntos, y un `.csv`
con cada pieza, sus medidas y su posición en metros, con el origen en el centro de la
planta.

## Dos trampas de los `.glb` de Polycam

Merece la pena dejarlas escritas porque no son evidentes:

1. **La malla no trae normales.** Ninguna primitiva tiene atributo `NORMAL`, solo `POSITION`.
   Cualquier visor que no las recalcule pinta el modelo completamente negro. Aquí se resuelve
   con `computeVertexNormals()` en `js/app.js`.
2. **Las texturas son de adorno.** Son PNGs de 4 píxeles, uno por material, es decir colores
   planos. No hay textura real que perder al convertir.

## IFC

El visor no es solo para escaneos. Con **Abrir modelo** se puede cargar un `.ifc`
modelado en Revit y el visor lo clasifica por **clase IFC** en vez de por nombre:
`IfcWall`, `IfcDoor`, `IfcWindow`, `IfcSlab`, `IfcStair`, `IfcSanitaryTerminal`,
`IfcFurnishingElement`… Las mismas categorías, las mismas medidas, los mismos muebles.

Lo lee [web-ifc](https://github.com/ThatOpen/engine_web-ifc) compilado a WebAssembly,
que se descarga solo la primera vez que abres un IFC (unos 6 MB entre el javascript y el
wasm). El archivo no sale de tu navegador.

Dos detalles que costaron encontrar:

1. **Con `COORDINATE_TO_ORIGIN` los ejes ya vienen con Y arriba.** Esa opción centra el
   modelo *y* aplica la matriz de coordinación. Girar -90° sobre X «para pasar de Z arriba
   a Y arriba», que es lo que pide el IFC en crudo, deja el modelo tumbado del revés.
2. **Los colores del IFC se guardan como color por vértice**, porque un elemento puede
   traer varias geometrías con materiales distintos y aquí se funden en una sola malla
   por elemento.

`models/ejemplo.ifc` es una vivienda de juguete generada por
`tools/generar_ifc_ejemplo.py` para poder probar todo esto sin abrir Revit.

## Biblioteca de muebles reales

Además de las cajas de medidas estándar, en la pestaña Muebles se pueden cargar piezas
reales en `.ifc` o `.glb` —de BIMobject, Polantis, del fabricante o exportadas de tu
propio Revit— y colocarlas con su geometría de verdad. El visor las mide solas y las
normaliza a una caja de 1×1×1, así que el imán, los choques y el panel de medidas
funcionan igual que con las cajas.

Las piezas de la biblioteca salen de archivos tuyos y no se guardan en el navegador: al
volver, una pieza colocada se recupera como caja con sus medidas hasta que vuelvas a
cargar su archivo.

## Estructura

```
index.html                     marcado
css/style.css                  estilos
js/app.js                      escena, clasificación y medidas
js/ifc.js                      lectura de .ifc con web-ifc
js/plano.js                    cotas, medición y tabiques
js/catalogo.js                 medidas estándar del mobiliario
js/muebles.js                  colocar, girar, imán, choques y exportar
models/planta-2026-09-05.glb   el escaneo que se carga al abrir
models/ejemplo.ifc             vivienda de juguete para probar la parte IFC
tools/generar_ifc_ejemplo.py   la genera
```

Three.js r128 se carga desde jsDelivr; no hay build ni dependencias que instalar.

## Añadir otro escaneo

Deja el `.glb` en `models/` y cambia la constante `MODELO` al principio de `js/app.js`.

## En local

Hace falta servirlo por HTTP — abriendo `index.html` con doble clic, el navegador bloquea
la carga del `.glb`:

```bash
python -m http.server 8000
```

Y abrir http://localhost:8000

## Y esto en Revit, ¿qué?

Nada directamente: Revit no importa glTF. Y aunque se convierta (Blender → DXF, o Rhino → 3DM),
la clasificación por elementos se pierde y entra como malla muerta, no como muros. Para modelar
sirve la nube de puntos `.e57` del mismo escaneo, indexada con ReCap a `.rcp`. Este visor es para
mirar, medir y decidir.

## Licencia

MIT
