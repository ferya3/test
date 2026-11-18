"use client";

import { useEffect, useRef, useState } from "react";
import { wsUrl } from "./api";
import type { ProjectEvent } from "./types";

/**
 * Live events for one project (pipeline progress, new versions, QA scores...).
 * Reconnects with backoff; `onEvent` is kept in a ref so callers can pass an
 * inline function without reconnecting on every render.
 */
export function useProjectEvents(projectId: string | undefined, onEvent: (event: ProjectEvent) => void) {
  const handler = useRef(onEvent);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    handler.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    if (!projectId) return;
    let socket: WebSocket | null = null;
    let closed = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      socket = new WebSocket(wsUrl(projectId));
      socket.onopen = () => {
        attempt = 0;
        setConnected(true);
      };
      socket.onmessage = (msg) => {
        try {
          const event = JSON.parse(msg.data) as ProjectEvent;
          if (event.type !== "ping") handler.current(event);
        } catch {
          /* ignore malformed frames */
        }
      };
      socket.onclose = (e) => {
        setConnected(false);
        if (closed || e.code === 4403) return;
        attempt += 1;
        timer = setTimeout(connect, Math.min(15000, 500 * 2 ** attempt));
      };
    };
    connect();
    return () => {
      closed = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    };
  }, [projectId]);

  return connected;
}
