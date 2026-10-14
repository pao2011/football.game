#!/bin/bash
# Reinicia el servidor de pruebas (sin recarga en caliente) en el puerto 5181
SP=${SP:-/tmp/fe3d}
mkdir -p $SP
printf "export default { root: '$(pwd)', server: { hmr: false, watch: null } };\n" > $SP/vite.test.config.mjs
PID=$(lsof -t -iTCP:5181 -sTCP:LISTEN 2>/dev/null)
[ -n "$PID" ] && kill $PID && sleep 1
nohup npx vite --config $SP/vite.test.config.mjs --port 5181 --strictPort > $SP/vite.log 2>&1 &
sleep 3
