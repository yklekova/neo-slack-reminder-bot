import { getBroadcastLink } from "./goit.ts";
import {
  getEventId,
  getEventStart,
  getEventTitle,
  isDeadline,
} from "./reminders.ts";
import type { DigestEvents } from "./reminders.ts";
import type { Env, GoitEvent } from "./types.ts";

function absoluteGoitUrl(path: string): string {
  return new URL(path, "https://www.edu.goit.global").toString();
}

function homeworkLink(event: GoitEvent): string | null {
  const { groupId, courseId, moduleId } = event.resource ?? {};
  if (groupId == null || courseId == null || moduleId == null) return null;

  return absoluteGoitUrl(
    `/uk/learn/${encodeURIComponent(String(groupId))}/${encodeURIComponent(
      String(courseId),
    )}/${encodeURIComponent(String(moduleId))}/homework`,
  );
}

function formatDate(date: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("uk-UA", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function slackEscape(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function actionLink(
  env: Env,
  event: GoitEvent,
): Promise<{ label: string; url: string }> {
  if (isDeadline(event)) {
    const homework = homeworkLink(event);
    if (homework) return { label: "Перейти до завдання", url: homework };
  } else {
    try {
      const broadcast = await getBroadcastLink(env, getEventId(event));
      if (broadcast) return { label: "Приєднатися до зустрічі", url: broadcast };
    } catch (error) {
      console.warn("Meeting link is not available", error);
    }
  }

  return {
    label: "Відкрити календар Neoversity",
    url: env.CALENDAR_URL ?? "https://www.edu.goit.global/uk/calendar",
  };
}

async function eventBlock(env: Env, event: GoitEvent): Promise<Record<string, unknown>> {
  const start = getEventStart(event);
  if (!start) throw new Error("Cannot render an event without a date");
  const action = await actionLink(env, event);
  const title = slackEscape(getEventTitle(event));
  const date = formatDate(start, env.TIMEZONE ?? "Europe/Kyiv");
  const course = event.resource?.courseName;
  const courseLine = course ? `\n🎓 ${slackEscape(course)}` : "";

  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `*${title}*\n🗓 ${date}${courseLine}\n<${action.url}|${action.label}>`,
    },
  };
}

export async function sendDailyDigest(env: Env, digest: DigestEvents): Promise<void> {
  const { upcomingEvents, upcomingDeadlines } = digest;
  if (!upcomingEvents.length && !upcomingDeadlines.length) return;

  const blocks: Array<Record<string, unknown>> = [
    {
      type: "header",
      text: { type: "plain_text", text: "📅 NEOVERSITY: найближчі події", emoji: true },
    },
  ];

  if (upcomingEvents.length) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*Заняття протягом наступних 24 годин*" },
    });
    blocks.push(...(await Promise.all(upcomingEvents.slice(0, 15).map((event) => eventBlock(env, event)))));
  }

  if (upcomingDeadlines.length) {
    blocks.push({
      type: "section",
      text: { type: "mrkdwn", text: "*Дедлайни протягом наступних 3 діб*" },
    });
    blocks.push(...(await Promise.all(upcomingDeadlines.slice(0, 15).map((event) => eventBlock(env, event)))));
  }

  const response = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      text: `NEOVERSITY: ${upcomingEvents.length} подій, ${upcomingDeadlines.length} дедлайнів`,
      blocks,
    }),
  });

  if (!response.ok) {
    throw new Error(`Slack webhook failed (${response.status})`);
  }
}

export async function sendServiceAlert(env: Env, message: string): Promise<void> {
  const alertKey = "service-alert-cooldown";
  if (await env.GOIT_AUTH.get(alertKey)) return;

  const response = await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: `⚠️ NEOVERSITY reminder bot: ${message}` }),
  });

  if (!response.ok) {
    console.error("Could not send a service alert", response.status);
    return;
  }

  await env.GOIT_AUTH.put(alertKey, "1", { expirationTtl: 6 * 60 * 60 });
}
