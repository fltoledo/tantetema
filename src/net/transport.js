// Canal de mensajes de una sala. Todos los celus de la sala escuchan el mismo canal.
//  - supabase: Supabase Realtime "broadcast" (no requiere tablas).
//  - local: BroadcastChannel entre pestañas del mismo navegador (desarrollo).
import { SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js";

const SUPABASE_ESM = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/+esm";

export const hasRemote = () => Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

let clientPromise = null;
async function supabaseClient() {
  if (!clientPromise) {
    clientPromise = import(SUPABASE_ESM).then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { realtime: { params: { eventsPerSecond: 20 } } }),
    );
  }
  return clientPromise;
}

// onMessage(msg) recibe objetos {type, ...}. onStatus("connected" | "connecting" | "offline").
export async function openRoom(code, { onMessage, onStatus = () => {} }) {
  const name = "tantetema:" + code.toUpperCase();
  if (!hasRemote()) {
    const bc = new BroadcastChannel(name);
    bc.onmessage = (e) => onMessage(e.data);
    queueMicrotask(() => onStatus("connected"));
    return {
      kind: "local",
      send: async (msg) => bc.postMessage(msg),
      close: () => bc.close(),
    };
  }

  const sb = await supabaseClient();
  let channel;
  // Lo que se manda antes de suscribirse sale igual, pero la respuesta llega a un canal
  // que todavía no escucha y se pierde. Por eso los envíos esperan la primera suscripción.
  let subscribed;
  const ready = new Promise((resolve) => (subscribed = resolve));
  const connect = () => {
    onStatus("connecting");
    channel = sb.channel(name, { config: { broadcast: { self: false, ack: false } } });
    channel.on("broadcast", { event: "msg" }, ({ payload }) => onMessage(payload));
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        subscribed();
        onStatus("connected");
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") onStatus("offline");
    });
  };
  connect();
  return {
    kind: "supabase",
    send: async (msg) => {
      await ready;
      return channel.send({ type: "broadcast", event: "msg", payload: msg });
    },
    close: () => sb.removeChannel(channel),
  };
}
