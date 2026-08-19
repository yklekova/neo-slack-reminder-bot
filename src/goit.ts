import type { Env, GoitAuthState, GoitEvent } from "./types.ts";

const API_URL = "https://api.edu.goit.global/api/v1";
const AUTH_STATE_KEY = "goit-auth-state";

interface JsonObject {
  [key: string]: unknown;
}

function isObject(value: unknown): value is JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jwtExpiration(token: string): number | undefined {
  try {
    const payload = token.split(".")[1];
    if (!payload) return undefined;

    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    const decoded = JSON.parse(atob(normalized)) as { exp?: number };
    return decoded.exp ? decoded.exp * 1000 : undefined;
  } catch {
    return undefined;
  }
}

async function readAuthState(env: Env): Promise<GoitAuthState | null> {
  const saved = await env.GOIT_AUTH.get<GoitAuthState>(AUTH_STATE_KEY, "json");
  return saved?.refreshToken ? saved : null;
}

async function saveAuthState(env: Env, state: GoitAuthState): Promise<GoitAuthState> {
  await env.GOIT_AUTH.put(AUTH_STATE_KEY, JSON.stringify(state));
  return state;
}

function authStateFromResponse(body: JsonObject, fallbackRefreshToken?: string): GoitAuthState {
  const accessToken = typeof body.accessToken === "string" ? body.accessToken : "";
  const refreshToken =
    typeof body.refreshToken === "string" ? body.refreshToken : fallbackRefreshToken ?? "";

  if (body.success === false || !accessToken || !refreshToken) {
    throw new Error("GoIT authorization returned invalid credentials or missing tokens");
  }

  return {
    accessToken,
    refreshToken,
    accessTokenExpiresAt: jwtExpiration(accessToken),
  };
}

async function loginAuth(env: Env): Promise<GoitAuthState> {
  if (!env.GOIT_USERNAME || !env.GOIT_PASSWORD) {
    throw new Error("GOIT_USERNAME or GOIT_PASSWORD is not configured");
  }

  const response = await fetch(`${API_URL}/auth/login`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      username: env.GOIT_USERNAME,
      password: env.GOIT_PASSWORD,
      authToken: null,
      url: env.CALENDAR_URL ?? "https://www.edu.goit.global/uk/calendar",
    }),
  });

  const body = (await response.json()) as JsonObject;
  if (!response.ok) throw new Error(`GoIT login failed (${response.status})`);
  return saveAuthState(env, authStateFromResponse(body));
}

async function refreshAuth(env: Env, state: GoitAuthState): Promise<GoitAuthState> {
  const response = await fetch(`${API_URL}/auth/refresh`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      RefreshToken: state.refreshToken,
    },
  });

  const body = (await response.json()) as JsonObject;
  if (!response.ok) {
    throw new Error(`GoIT authorization refresh failed (${response.status})`);
  }
  return saveAuthState(env, authStateFromResponse(body, state.refreshToken));
}

async function accessToken(env: Env): Promise<string> {
  let state = await readAuthState(env);
  if (!state) state = await loginAuth(env);

  const expiresSoon =
    !state.accessTokenExpiresAt || state.accessTokenExpiresAt < Date.now() + 60_000;

  if (!state.accessToken || expiresSoon) {
    try {
      state = await refreshAuth(env, state);
    } catch {
      state = await loginAuth(env);
    }
  }
  return state.accessToken!;
}

async function apiGet(env: Env, path: string, params?: URLSearchParams): Promise<unknown> {
  const url = new URL(`${API_URL}${path}`);
  if (params) url.search = params.toString();

  const execute = async (token: string) =>
    fetch(url, {
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
    });

  let response = await execute(await accessToken(env));
  if (response.status === 401) {
    const state = await readAuthState(env);
    let renewed: GoitAuthState;
    try {
      renewed = state ? await refreshAuth(env, state) : await loginAuth(env);
    } catch {
      renewed = await loginAuth(env);
    }
    response = await execute(renewed.accessToken!);
  }

  if (!response.ok) throw new Error(`GoIT API ${path} failed (${response.status})`);

  const body = (await response.json()) as JsonObject;
  if (body.success === false) throw new Error(`GoIT API ${path} returned an error`);
  return body;
}

function arrayAt(body: unknown, keys: string[]): unknown[] {
  if (Array.isArray(body)) return body;
  if (!isObject(body)) return [];

  for (const key of keys) {
    const value = body[key];
    if (Array.isArray(value)) return value;
    if (isObject(value)) {
      const nested = arrayAt(value, keys);
      if (nested.length) return nested;
    }
  }
  return [];
}

export async function getGroupIds(env: Env): Promise<string[]> {
  const configured = env.GROUP_IDS?.split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (configured?.length) return configured;

  const body = await apiGet(env, "/group/listForCalendar");
  const groups = arrayAt(body, ["groupInfos", "groups", "data"]);
  const ids = groups
    .map((group) => (isObject(group) ? group.id : undefined))
    .filter((id): id is string | number => typeof id === "string" || typeof id === "number")
    .map(String);

  if (!ids.length) throw new Error("GoIT API returned no calendar groups");
  return [...new Set(ids)];
}

export async function getCalendarEvents(
  env: Env,
  start: Date,
  end: Date,
  groupIds: string[],
): Promise<GoitEvent[]> {
  const params = new URLSearchParams({
    startUtcDateTime: start.toISOString(),
    endUtcDateTime: end.toISOString(),
  });
  // Axios (used by the GoIT frontend) serializes array query parameters with [].
  for (const groupId of groupIds) params.append("groupIds[]", groupId);

  const body = await apiGet(env, "/groupEvent/listAllowedEvents", params);
  const events = arrayAt(body, ["groupEventInfos", "events", "data"]) as GoitEvent[];

  // GoIT's API doesn't reliably filter by groupIds[], so filter here too.
  const allowedGroupIds = new Set(groupIds.map(String));
  return events.filter((event) => {
    const eventGroupId = event.resource?.groupId;
    return eventGroupId === undefined || allowedGroupIds.has(String(eventGroupId));
  });
}

export async function getBroadcastLink(env: Env, eventId: string): Promise<string | null> {
  if (!eventId) return null;

  const body = await apiGet(
    env,
    "/groupEvent/broadcast/get",
    new URLSearchParams({ eventId }),
  );

  if (!isObject(body)) return null;
  const direct = body.broadcastLink;
  if (typeof direct === "string" && direct.startsWith("http")) return direct;

  const data = body.data;
  if (isObject(data) && typeof data.broadcastLink === "string") {
    return data.broadcastLink.startsWith("http") ? data.broadcastLink : null;
  }
  return null;
}
