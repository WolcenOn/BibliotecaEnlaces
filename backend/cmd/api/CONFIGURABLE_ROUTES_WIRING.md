# Conexión de rutas configurables

Los handlers están implementados en `configurable_resources.go`.

Para activarlos, añade esta llamada al final de `registerRoutes` en `main.go`:

```go
a.registerConfigurableRoutes(mux)
```

Debe quedar antes del cierre de la función. Este paso se mantiene separado para facilitar la revisión del archivo principal, que todavía contiene la API musical heredada.
