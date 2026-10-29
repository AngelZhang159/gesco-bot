# Política de Privacidad

Última actualización: 29 de octubre de 2026

Esta política explica qué datos guarda el bot de Discord **gesco-bot** (en adelante, "el bot"), para
qué los usa y cómo puedes borrarlos. El código es abierto y puede consultarse en
<https://github.com/AngelZhang159/gesco-bot>.

## 1. Qué datos se guardan

El bot guarda **solo lo necesario para funcionar**:

| Dato | Para qué |
|---|---|
| ID del servidor y de los canales configurados, y qué categorías están activas | Saber dónde publicar cada aviso |
| ID de usuario y categorías a las que se ha suscrito con `/avisos` | Mencionarle cuando haya novedades |
| ID de usuario y juegos que sigue o bloquea con `/drops` | Filtrar de qué Twitch Drops le avisa |
| ID de los mensajes publicados por el bot y de los recordatorios enviados | No publicar dos veces lo mismo |

El bot **no** lee ni guarda el contenido de los mensajes del servidor, no guarda nombres de usuario,
correos, direcciones IP ni ningún otro dato personal, y no necesita ningún *Privileged Gateway Intent*
de Discord (ni el de contenido de mensajes ni el de miembros).

También guarda información pública de las fuentes que consulta (juegos gratis, campañas de drops,
noticias y fechas de pick'em), que no contiene datos personales.

## 2. Registros técnicos

El bot escribe registros técnicos (*logs*) para detectar fallos. Pueden incluir el ID y el nombre de
un servidor cuando el bot entra o sale de él y el nombre de un comando que haya fallado. Estos
registros se guardan solo en el equipo donde se ejecuta el bot.

## 3. Dónde se guardan y con quién se comparten

Los datos se guardan en una base de datos SQLite en el equipo donde se ejecuta el bot.
**No se venden, no se comparten con terceros y no se usan para publicidad ni para elaborar perfiles.**

Para funcionar, el bot se comunica con la API de Discord, que trata los datos según su propia
[política de privacidad](https://discord.com/privacy). Las consultas a las fuentes externas (Epic
Games, `twitch-drops-api.sunkwi.com`, Google News, Bing News y los artículos enlazados) no incluyen
ningún dato de los usuarios ni de los servidores.

## 4. Cuánto tiempo se guardan

- Las suscripciones y filtros se guardan mientras estén activos. Desaparecen en cuanto el usuario los
  quita.
- Cuando el bot sale de un servidor (porque lo expulsan o se elimina el servidor), **se borran todos los
  datos de ese servidor**, incluidas las suscripciones y filtros de sus usuarios.
- La información de las fuentes externas se borra automáticamente cuando deja de estar vigente.

## 5. Cómo borrar tus datos

- **Usuarios:** `/avisos desactivar categoria:Todas` borra tus suscripciones y `/drops quitar` borra
  cada juego que sigues o bloqueas. Con `/avisos ver` puedes comprobar qué hay guardado sobre ti.
- **Administradores:** expulsar el bot del servidor borra todos los datos de ese servidor.
- También puedes pedir el borrado abriendo un *issue* en
  <https://github.com/AngelZhang159/gesco-bot/issues> (indica solo tu ID de usuario de Discord, nunca
  datos sensibles).

## 6. Menores

El bot no está dirigido a menores de la edad mínima exigida por Discord en tu país y no recoge
conscientemente datos de ellos.

## 7. Cambios en esta política

Esta política puede cambiar. La versión vigente es siempre la publicada en este repositorio, con su
fecha de actualización.

## 8. Contacto

Para dudas sobre privacidad, abre un *issue* en
<https://github.com/AngelZhang159/gesco-bot/issues>.
