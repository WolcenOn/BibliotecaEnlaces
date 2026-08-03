# Rutas configurables

Los handlers están implementados en `configurable_resources.go` y registrados desde `main.go` mediante:

```go
a.registerConfigurableRoutes(mux)
```

La función registra campos personalizados, recursos genéricos y el endpoint autenticado de inspección de metadatos:

```text
POST /api/v1/resources/inspect
```
