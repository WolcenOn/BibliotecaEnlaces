# Music Discovery PWA

Biblioteca musical colaborativa para recopilar, clasificar, valorar y comentar enlaces compartidos por un grupo.

## Arquitectura

- `frontend/`: PWA en HTML, CSS y JavaScript para GitHub Pages.
- `backend/`: API REST en Go para Railway.
- `migrations/`: esquema PostgreSQL.

## Desarrollo local

### Frontend

Sirve la carpeta `frontend` con cualquier servidor estático.

### Backend

```bash
cd backend
cp .env.example .env
go run ./cmd/api
```

La primera entrega contiene la estructura inicial, una interfaz navegable, el manifiesto PWA y una API con endpoints de salud e inspección básica de enlaces.
