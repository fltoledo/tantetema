# Tantetema

Juego de fiesta para adivinar en qué año salió cada canción. Inspirado en los juegos de cartas de línea de tiempo musical, pero sin cartas: un celu modera y pone la música, y cada equipo arma su línea de tiempo en su propio celu.

- **Las canciones cambian en cada partida.** Se eligen al azar de playlists públicas de Deezer según el país o estilo que elijas (Uruguay, Argentina, Chile, México, España, Brasil, latino, internacional), o según búsquedas y playlists propias.
- **El año se verifica.** Deezer informa la fecha del álbum, que suele estar mal en remasters y compilados (*Bohemian Rhapsody* figura como 2011). Por eso cada tema se cruza con MusicBrainz y se toma la primera edición. Si no hay un dato confiable, el tema se descarta.
- **Sin spoilers.** El moderador escucha el preview de 30 s dentro de la app sin ver el título, o abre el tema completo en Spotify o YouTube. Los celus de los equipos no reciben la canción hasta que se revela.
- **Es un sitio estático:** corre en GitHub Pages. La sincronización entre celus va por Supabase Realtime (plan gratis).

## Cómo se juega

1. El moderador crea la sala y elige la música, el rango de años y las reglas.
2. Cada equipo escanea el QR o pone el código de 4 letras, y arranca con una carta revelada.
3. Suena una canción y cada equipo marca en su celu dónde va en su línea de tiempo.
4. El moderador revela el año. Si la ubicaron bien, se quedan la carta.
5. Si además dijeron bien artista y canción, el moderador les da una ficha. Con 3 fichas compran una carta. Gana el primero que llega a la meta.

**Modos**

- **Todos a la vez** (por defecto): todos los equipos ubican cada canción en su propia línea.
- **Por turnos**: juega un equipo por ronda. Los demás pueden desafiar gastando una ficha: si el equipo en turno erra y el desafío acierta, se roban la carta.

Si la metadata trae un año equivocado, el moderador lo corrige después de revelar y la ronda se recalcula.

## Publicarlo

### 1. Supabase (sincronización entre celus)

1. Creá un proyecto gratis en [supabase.com](https://supabase.com). No hace falta crear tablas: el juego usa solo Realtime *broadcast*.
2. Tocá **Connect** arriba en el proyecto (o andá a **Project Settings → API Keys**) y copiá la **Project URL** y la **publishable key** (o la `anon` key legacy; cualquiera de las dos sirve).

La anon key es pública por diseño (termina en el navegador de todos), así que no es un secreto. Ojo: Supabase pausa los proyectos gratis después de una semana sin uso. Si se pausó, se reactiva desde el panel.

### 2. GitHub Pages

1. En el repo, andá a **Settings → Secrets and variables → Actions → Variables** y creá `SUPABASE_URL` y `SUPABASE_ANON_KEY`.
2. En **Settings → Pages → Source**, elegí **GitHub Actions**.
3. Hacé push a `main`. El workflow corre los tests, escribe `src/config.js` con esas variables y publica el sitio.

Sin las variables, el sitio funciona igual pero en **modo local**: sincroniza solo entre pestañas del mismo navegador. Sirve para probar.

## Desarrollo

No hay build ni dependencias: es HTML, CSS y módulos ES.

```bash
npm run dev     # sirve el sitio en http://localhost:8080
npm test        # tests de la lógica del juego y de las fuentes (node:test)
```

- `?mock` en la URL usa una lista fija de canciones, sin red (ej. `http://localhost:8080/?mock`).
- Para probar varios celus en la misma compu, abrí una pestaña como moderador y otras como equipos. Sin Supabase configurado, se comunican por `BroadcastChannel`.

### Estructura

```
index.html, styles.css
src/
  app.js              UI (pantallas de inicio, moderador y equipo)
  game.js             reglas del juego, sin red (testeado)
  host.js             el celu del moderador: estado real, canciones, envía la vista a los equipos
  team.js             cliente de cada equipo
  net/transport.js    Supabase Realtime o BroadcastChannel
  sources/
    deezer.js         API pública de Deezer (JSONP, sin clave)
    musicbrainz.js    primera edición de cada grabación
    resolver.js       decide el año cruzando las fuentes
    feed.js           arma el mazo al azar y precarga canciones
    presets.js        búsquedas por país: sumá el tuyo
    mock.js           canciones fijas para desarrollo
test/
```

### Arquitectura

El celu del moderador es la fuente de verdad: corre `Game`, busca las canciones y en cada cambio publica en el canal de la sala una vista sin la canción (`game.view({ role: "team" })`). Los equipos mandan sus jugadas (`place`, `challenge`, `buy`) y el moderador las valida. Si el moderador recarga la página, la partida se retoma desde `localStorage`.

### Por qué Deezer y no Spotify

Desde febrero de 2026, las apps nuevas de la API de Spotify en modo desarrollo necesitan Premium, tienen un tope de 5 usuarios, ya no reciben `popularity` y no pueden leer playlists ajenas. Con esas restricciones no se puede armar un mazo de hits al azar. Deezer ofrece búsqueda de playlists, ranking de popularidad, ISRC y previews sin clave. Spotify queda como link para escuchar el tema completo.

## Limitaciones conocidas

- La sala depende de que el celu del moderador esté abierto. La app pide que la pantalla no se apague, pero si el sistema la suspende, los equipos esperan hasta que vuelva.
- Cualquiera que tenga el código de la sala puede mandar jugadas. Para un juego entre amigos alcanza.
- La música local tiene menos popularidad en Deezer. Si con "Solo hits" salen pocas canciones, el filtro se afloja solo.
- MusicBrainz permite 1 consulta por segundo, así que la primera carga de la sala tarda unos segundos mientras precarga canciones.

## Licencia

MIT. No está afiliado a Deezer, Spotify, MusicBrainz ni a ningún juego comercial.
