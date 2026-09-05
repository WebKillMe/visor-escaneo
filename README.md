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

## Dos trampas de los `.glb` de Polycam

Merece la pena dejarlas escritas porque no son evidentes:

1. **La malla no trae normales.** Ninguna primitiva tiene atributo `NORMAL`, solo `POSITION`.
   Cualquier visor que no las recalcule pinta el modelo completamente negro. Aquí se resuelve
   con `computeVertexNormals()` en `js/app.js`.
2. **Las texturas son de adorno.** Son PNGs de 4 píxeles, uno por material, es decir colores
   planos. No hay textura real que perder al convertir.

## Estructura

```
index.html                     marcado
css/style.css                  estilos
js/app.js                      escena, clasificación y medidas
models/planta-2026-09-05.glb   el escaneo que se carga al abrir
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
