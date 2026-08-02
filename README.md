# Biblioteca de Enlaces

PWA colaborativa para capturar, enriquecer, clasificar y recuperar recursos compartidos por un grupo.

La aplicación mantiene el flujo rápido del proyecto original: desde el menú **Compartir** del móvil se envía una URL a la PWA, se inspeccionan sus metadatos y el usuario solo revisa los campos incompletos antes de guardarla.

## Casos de uso iniciales

- Biblioteca de recursos de Audición y Lenguaje.
- Biblioteca colaborativa para segundo de ASIR.
- Cualquier grupo que necesite una clasificación propia sin modificar el código.

## Principios del producto

- Los metadatos técnicos son comunes: URL, título, descripción, tipo, proveedor y miniatura.
- Cada grupo configura sus propios campos y opciones de clasificación.
- Los mismos campos personalizados generan el formulario de alta y los filtros de búsqueda.
- Las etiquetas libres complementan la clasificación estructurada.
- WhatsApp sigue siendo el canal de conversación; la PWA conserva y ordena los recursos.

## Arquitectura

- `frontend/`: PWA en HTML, CSS y JavaScript para GitHub Pages.
- `backend/`: API REST en Go para Railway.
- `backend/internal/database/migrations/`: esquema PostgreSQL embebido en el backend.

## Modelo configurable

La migración `010_configurable_resources.sql` introduce:

- `resources`: metadatos comunes de los enlaces.
- `custom_fields`: campos definidos por cada grupo.
- `custom_field_options`: opciones para selecciones simples o múltiples.
- `resource_field_values`: valores asignados a cada recurso.
- `tags` y `resource_tags`: etiquetado libre.
- `import_batches` e `import_items`: revisión de cargas masivas.

Los tipos de campo previstos son:

- `single_select`
- `multi_select`
- `text`
- `number`
- `date`
- `boolean`

La primera interfaz se centrará en selección única y selección múltiple.

## Importación desde WhatsApp

`frontend/js/whatsapp-import.js` procesa en el navegador una exportación `.txt` sin multimedia. Extrae URL, remitente, fecha y texto del mensaje, elimina parámetros de seguimiento y agrupa duplicados antes de enviar datos al backend.

El archivo completo del chat no necesita almacenarse en el servidor.

## Desarrollo local

### Frontend

Sirve la carpeta `frontend` con cualquier servidor estático.

### Backend

```bash
cd backend
cp .env.example .env
go run ./cmd/api
```

Variables principales:

```text
DATABASE_URL=
JWT_SECRET=
ADMIN_SETUP_TOKEN=
FRONTEND_APP_URL=
```

## Hoja de ruta inmediata

1. Generalizar la interfaz y la API de canciones a recursos.
2. Ampliar la inspección de enlaces para PDF, imágenes, vídeos, documentos y páginas web.
3. Crear la administración de campos personalizados.
4. Generar formularios y filtros dinámicos.
5. Añadir la pantalla de importación y revisión masiva de WhatsApp.
6. Configurar backend y PostgreSQL en Railway.
