# Chroma Key Overlay

Pequeña app web móvil que muestra la cámara como fondo y superpone un video con fondo verde usando un material Chroma Key en Three.js.

## Uso rápido
1. Servir carpetas estáticas (por ej. usando `python -m http.server` o cualquier servidor estático) desde la raíz del proyecto.
2. Abrir `http://localhost:8000` en el navegador móvil.
3. Pulsa "Iniciar" para otorgar permisos de cámara.
4. Ajusta color clave, tolerancia y suavizado.

## Cambiar el video
Reemplaza la URL en `js/main.js` (`overlayVideo.src = '...';`) con tu video con fondo verde (idealmente .mp4, codificado H.264). Asegúrate de habilitar CORS si se aloja en otro dominio.

## Notas móviles
- En iOS Safari necesitas interacción del usuario para reproducir video / cámara (el botón ya cubre esto).
- Usa `playsinline` para evitar fullscreen forzado.

## Personalización
- Modifica parámetros iniciales en `index.html` (inputs) o en la creación del material en `main.js`.
- Puedes escalar / mover el plano cambiando su geometría o aplicando transformaciones (por ejemplo `plane.scale.set(0.5,0.5,1);`).

## Licencia
Ejemplo educativo. El shader es una implementación básica inspirada por ideas públicas de chroma key; ajusta a tus necesidades.
