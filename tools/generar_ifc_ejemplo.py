"""Genera un IFC4 mínimo pero válido para probar el visor sin depender de Revit.

Una vivienda de juguete: forjado, cuatro muros de fachada, un tabique, una puerta,
una ventana, un recinto y una mesa. Sirve de fixture de pruebas y de archivo de
ejemplo para quien abra la web sin tener un IFC a mano.

    python tools/generar_ifc_ejemplo.py
"""

import pathlib
import random
import string

SALIDA = pathlib.Path(__file__).resolve().parent.parent / "models" / "ejemplo.ifc"

# Alfabeto de los GlobalId de IFC (base64 propia del formato).
ALFA = string.digits + string.ascii_uppercase + string.ascii_lowercase + "_$"


class Ifc:
    def __init__(self):
        self.lineas = []
        self.n = 0
        self.rnd = random.Random(20260906)

    def add(self, texto):
        self.n += 1
        self.lineas.append("#%d=%s;" % (self.n, texto))
        return self.n

    def guid(self):
        return "'" + "".join(self.rnd.choice(ALFA) for _ in range(22)) + "'"


f = Ifc()

# ---------- contexto, unidades y proyecto ----------

origen = f.add("IFCCARTESIANPOINT((0.,0.,0.))")
eje_z = f.add("IFCDIRECTION((0.,0.,1.))")
eje_x = f.add("IFCDIRECTION((1.,0.,0.))")
ejes = f.add("IFCAXIS2PLACEMENT3D(#%d,#%d,#%d)" % (origen, eje_z, eje_x))

contexto = f.add("IFCGEOMETRICREPRESENTATIONCONTEXT($,'Model',3,1.E-05,#%d,$)" % ejes)
u_long = f.add("IFCSIUNIT(*,.LENGTHUNIT.,$,.METRE.)")
u_area = f.add("IFCSIUNIT(*,.AREAUNIT.,$,.SQUARE_METRE.)")
u_vol = f.add("IFCSIUNIT(*,.VOLUMEUNIT.,$,.CUBIC_METRE.)")
unidades = f.add("IFCUNITASSIGNMENT((#%d,#%d,#%d))" % (u_long, u_area, u_vol))

proyecto = f.add(
    "IFCPROJECT(%s,$,'Vivienda de ejemplo',$,$,$,$,(#%d),#%d)"
    % (f.guid(), contexto, unidades)
)

# ---------- estructura espacial ----------

sitio_pl = f.add("IFCLOCALPLACEMENT($,#%d)" % ejes)
sitio = f.add(
    "IFCSITE(%s,$,'Solar',$,$,#%d,$,$,.ELEMENT.,$,$,$,$,$)" % (f.guid(), sitio_pl)
)

edificio_pl = f.add("IFCLOCALPLACEMENT(#%d,#%d)" % (sitio_pl, ejes))
edificio = f.add(
    "IFCBUILDING(%s,$,'Edificio',$,$,#%d,$,$,.ELEMENT.,$,$,$)" % (f.guid(), edificio_pl)
)

planta_pl = f.add("IFCLOCALPLACEMENT(#%d,#%d)" % (edificio_pl, ejes))
planta = f.add(
    "IFCBUILDINGSTOREY(%s,$,'Planta baja',$,$,#%d,$,$,.ELEMENT.,0.)"
    % (f.guid(), planta_pl)
)

f.add("IFCRELAGGREGATES(%s,$,$,$,#%d,(#%d))" % (f.guid(), proyecto, sitio))
f.add("IFCRELAGGREGATES(%s,$,$,$,#%d,(#%d))" % (f.guid(), sitio, edificio))
f.add("IFCRELAGGREGATES(%s,$,$,$,#%d,(#%d))" % (f.guid(), edificio, planta))


# ---------- ayudas de geometría ----------


def colocar(x, y, z, giro_grados=0.0):
    """IfcLocalPlacement colgado de la planta, con giro sobre el eje Z."""
    import math

    p = f.add("IFCCARTESIANPOINT((%.4f,%.4f,%.4f))" % (x, y, z))
    a = math.radians(giro_grados)
    d = f.add("IFCDIRECTION((%.6f,%.6f,0.))" % (math.cos(a), math.sin(a)))
    ax = f.add("IFCAXIS2PLACEMENT3D(#%d,#%d,#%d)" % (p, eje_z, d))
    return f.add("IFCLOCALPLACEMENT(#%d,#%d)" % (planta_pl, ax))


def caja(largo, ancho, alto):
    """Perfil rectangular centrado, extruido hacia arriba."""
    o2 = f.add("IFCCARTESIANPOINT((0.,0.))")
    pos2 = f.add("IFCAXIS2PLACEMENT2D(#%d,$)" % o2)
    perfil = f.add(
        "IFCRECTANGLEPROFILEDEF(.AREA.,$,#%d,%.4f,%.4f)" % (pos2, largo, ancho)
    )
    solido = f.add(
        "IFCEXTRUDEDAREASOLID(#%d,#%d,#%d,%.4f)" % (perfil, ejes, eje_z, alto)
    )
    rep = f.add(
        "IFCSHAPEREPRESENTATION(#%d,'Body','SweptSolid',(#%d))" % (contexto, solido)
    )
    return f.add("IFCPRODUCTDEFINITIONSHAPE($,$,(#%d))" % rep)


productos = []


def elemento(clase, nombre, x, y, z, largo, ancho, alto, giro=0.0, extra="$,$"):
    pl = colocar(x, y, z, giro)
    forma = caja(largo, ancho, alto)
    eid = f.add(
        "%s(%s,$,'%s',$,$,#%d,#%d,%s)" % (clase, f.guid(), nombre, pl, forma, extra)
    )
    productos.append(eid)
    return eid


# ---------- la vivienda ----------

M = 0.15   # espesor de muro
H = 2.60   # altura libre
ANCHO, FONDO = 7.00, 5.00

# Forjado
elemento("IFCSLAB", "Forjado planta baja", ANCHO / 2, FONDO / 2, -0.20,
         ANCHO, FONDO, 0.20, extra="$,.FLOOR.")

# Fachadas
elemento("IFCWALL", "Fachada sur",  ANCHO / 2, M / 2,        0., ANCHO, M, H, extra="$,$")
elemento("IFCWALL", "Fachada norte", ANCHO / 2, FONDO - M / 2, 0., ANCHO, M, H, extra="$,$")
elemento("IFCWALL", "Fachada oeste", M / 2,     FONDO / 2,    0., FONDO, M, H, 90., extra="$,$")
elemento("IFCWALL", "Fachada este",  ANCHO - M / 2, FONDO / 2, 0., FONDO, M, H, 90., extra="$,$")

# Tabique interior que parte la planta en dos
elemento("IFCWALL", "Tabique salón-dormitorio", 4.20, FONDO / 2, 0.,
         FONDO, 0.08, H, 90., extra="$,$")

# Puerta en el tabique y ventana en la fachada sur
elemento("IFCDOOR", "Puerta de paso", 4.20, 1.10, 0., 0.90, 0.08, 2.10, 90.,
         extra="$,2.10,0.90,$,$")
elemento("IFCWINDOW", "Ventana salón", 2.00, M / 2, 1.00, 1.40, M, 1.20,
         extra="$,1.20,1.40,$,$")

# Recinto y una mesa
elemento("IFCSPACE", "Salón", 2.10, FONDO / 2, 0., 4.05, FONDO - 2 * M, H,
         extra="$,.ELEMENT.,$")
elemento("IFCFURNISHINGELEMENT", "Mesa de comedor", 2.10, 2.50, 0.71,
         1.60, 0.90, 0.04, extra="$")

f.add(
    "IFCRELCONTAINEDINSPATIALSTRUCTURE(%s,$,$,$,(%s),#%d)"
    % (f.guid(), ",".join("#%d" % p for p in productos), planta)
)

# ---------- volcado ----------

cabecera = """ISO-10303-21;
HEADER;
FILE_DESCRIPTION(('ViewDefinition [CoordinationView]'),'2;1');
FILE_NAME('ejemplo.ifc','2026-09-06T00:00:00',(''),(''),'visor-escaneo','generar_ifc_ejemplo.py','');
FILE_SCHEMA(('IFC4'));
ENDSEC;
DATA;"""

SALIDA.parent.mkdir(parents=True, exist_ok=True)
SALIDA.write_text(
    cabecera + "\n" + "\n".join(f.lineas) + "\nENDSEC;\nEND-ISO-10303-21;\n",
    encoding="utf-8",
)
print("escrito", SALIDA, SALIDA.stat().st_size, "bytes,", len(productos), "productos")
