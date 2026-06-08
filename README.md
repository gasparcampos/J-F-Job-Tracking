# J&F Job Tracker

Sistema de seguimiento de trabajos para taller mecánico con tablero Kanban y extracción de datos con IA.

## Características

- 📋 **Tablero Kanban** - Drag & drop para mover trabajos entre etapas
- 🤖 **Extracción con IA** - Lee documentos PDF/imagen y extrae datos automáticamente
- 📊 **Vista de tabla** - Lista completa de trabajos
- 📄 **Visor de PDF** - Visualiza documentos adjuntos
- 🔥 **En progreso** - Marca trabajos en proceso
- 📜 **Historial** - Registro de movimientos por etapa

## Tecnologías

- Next.js 16 + TypeScript
- Tailwind CSS + shadcn/ui
- dnd-kit (drag & drop)
- pdfjs-dist (visor PDF)
- z-ai-web-dev-sdk (IA para extracción)

## Instalación

```bash
# Instalar dependencias
bun install

# Iniciar servidor de desarrollo
bun run dev
```

## Uso

1. Click en **"New Job"** para crear un trabajo
2. Sube un documento PDF o imagen - la IA extraerá los datos automáticamente
3. Arrastra las tarjetas entre columnas para mover trabajos
4. Click en **"In Progress"** para marcar como en proceso
5. Click en **"Completar"** para pasar a la siguiente etapa

## Estructura del Proyecto

```
src/
├── app/
│   ├── page.tsx          # Página principal
│   ├── layout.tsx        # Layout
│   └── api/              # API routes
├── components/
│   ├── job-tracker/      # Componentes del sistema
│   └── ui/               # shadcn/ui components
├── lib/
│   ├── json-db.ts        # Base de datos JSON
│   └── utils.ts          # Utilidades
└── types/
    └── index.ts          # TypeScript types
```

## Etapas del Proceso

1. NEW MATERIAL
2. Cut Saw (Segueta)
3. WOOD PALLET
4. Night shift
5. BLUE PALLET
6. ARTURO
7. GERMAN
8. ROMULO
9. LATHE DEBURR
10. LATHE INSPECTION
11. MILL
12. MILL DEBURR
13. FINAL INSPECTION
14. STAMP
15. NDE
16. O.S
17. READY TO SHIP

---

**J&F MACHINE SHOP** - Sistema de gestión de trabajos
