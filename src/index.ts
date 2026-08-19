import { getCalendarEvents, getGroupIds} from "./goit.ts";
import { selectDigestEvents } from "./reminders.ts";
import { sendDailyDigest, sendServiceAlert } from "./slack.ts";
import type { Env } from "./types.ts";

export async function runDailyDigest(env: Env, now = new Date()): Promise<void> {
  const end = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

  const groupIds = await getGroupIds(env);
  const events = await getCalendarEvents(env, now, end, groupIds);
  const digest = selectDigestEvents(events, now);
  await sendDailyDigest(env, digest);
  console.log(JSON.stringify({
    event: "daily_digest_complete",
    groupsChecked: groupIds.length,
    eventsChecked: events.length,
    upcomingEvents: digest.upcomingEvents.length,
    upcomingDeadlines: digest.upcomingDeadlines.length,
  }));
}

export default {
  async scheduled(_controller: ScheduledController, env: Env): Promise<void> {
    try {
      await runDailyDigest(env);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(JSON.stringify({ event: "daily_digest_failed", message }));
      await sendServiceAlert(env, message);
    }
  },

  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return Response.json({ ok: true, service: "goit-slack-reminder-bot" });
    }

    return new Response("Not found", { status: 404 });
  },
} satisfies ExportedHandler<Env>;
