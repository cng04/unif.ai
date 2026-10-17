import * as copy from "./copy.ts";
import { continueInterview, reviseProfile, startInterview } from "./interviewer.ts";
import { createMember, lookupMember, lookupPool, saveMemberProfile, saveSelfReport, shareLinks, waitForScraped } from "./members.ts";
import { extractImportedProfile, extractLinks, followUps, parseAccounts, summarize, toServerProfile } from "./profile.ts";
import { newSession, saveProfile, type Session } from "./store.ts";

/** Sends bubbles to the user (and records them in the transcript). */
export type Say = (...bubbles: string[]) => Promise<void>;

const SCRAPE_ENABLED = /^(1|true|yes)$/i.test(process.env.SCRAPE_ENABLED ?? "");

const YES = /^\s*(y|yes|yep|yeah|yup|looks good|lgtm|good|perfect|correct|confirm(ed)?|that'?s right|all good|👍)\W*$/i;
const NONE = /^\s*(none|no|nope|nah|nothing|n\/a)\W*$/i;
const SKIP = /^\s*(skip|no thanks|nah|pass)\W*$/i;
const DONE = /^\s*(done|that'?s (it|all|everything))\W*$/i;

/** Advance the onboarding state machine by one inbound text message. Mutates and returns the session. */
export async function handle(s: Session, text: string, say: Say): Promise<Session> {
  if (/^\s*restart\s*$/i.test(text)) {
    s = newSession(s.spaceId, s.platform, s.senderId);
  }

  switch (s.stage) {
    case "new": {
      // People who signed up on the join page already gave us their name.
      const member = await lookupMember(s.senderId, s.platform);
      if (member) {
        s.userId = member.id;
        s.name = member.fullName.trim().slice(0, 120);
        await say(...copy.WELCOME_KNOWN(s.name.split(/\s+/)[0]));
        s.stage = "accounts";
        return s;
      }
      // People arriving from a join page send "join <code>" first; otherwise ask which group before anything else.
      if (await pickPool(s, text)) {
        await say(...copy.WELCOME_POOL(s.pool!.name));
        s.stage = "name";
      } else {
        await say(...copy.ASK_POOL);
        s.stage = "pool";
      }
      return s;
    }

    case "pool": {
      if (/^\s*(no code|none|skip|no)\W*$/i.test(text)) {
        await say(...copy.WELCOME_GENERAL);
        s.stage = "name";
      } else if (await pickPool(s, text)) {
        await say(...copy.POOL_OK(s.pool!.name));
        s.stage = "name";
      } else {
        await say(copy.BAD_CODE);
      }
      return s;
    }

    case "name": {
      s.name = text.trim().slice(0, 120);
      // No join-page signup: add them to the default pool so scraping, logging and matching work.
      s.userId ??= (await createMember(s.name, s.senderId, s.platform, s.pool?.id)) ?? undefined;
      await say(...copy.ACCOUNTS(s.name.split(/\s+/)[0]));
      s.stage = "accounts";
      return s;
    }

    case "accounts": {
      const platforms = parseAccounts(text);
      const links = extractLinks(text);
      s.accounts = { raw: text.slice(0, 1000), platforms, links };
      // Members' links are stored on the server; it scrapes them only when SCRAPE_ENABLED is on (both sides).
      if (s.userId && Object.keys(links).length > 0) await shareLinks(s.userId, links);
      const scraping = SCRAPE_ENABLED && !!s.userId && Object.keys(links).length > 0;
      await say(copy.ACCOUNTS_ACK(platforms, !!scraping), ...copy.PASTE_INTRO, copy.AI_PROMPT, copy.PASTE_OUTRO);
      s.stage = "paste";
      return s;
    }

    case "paste": {
      if (SKIP.test(text) && !s.pasteBuffer) {
        await say(copy.PASTE_SKIPPED);
        return beginInterview(s, say);
      }
      if (DONE.test(text)) {
        await say(copy.PASTE_NO_JSON);
        s.pasteBuffer = "";
        return beginInterview(s, say);
      }
      s.pasteBuffer += `\n${text}`;
      const imported = extractImportedProfile(s.pasteBuffer);
      if (!imported) {
        await say(copy.PASTE_PARTIAL);
        return s;
      }
      // Only the validated, schema-stripped object is kept. The raw paste is dropped.
      s.imported = imported;
      s.followUps = followUps(imported);
      if (s.userId) await saveSelfReport(s.userId, imported);
      s.pasteBuffer = "";
      await say(copy.PASTE_OK(s.followUps.length));
      return beginInterview(s, say);
    }

    case "interview": {
      const turn = await continueInterview(s, text);
      if (turn.bubbles.length) await say(...turn.bubbles);
      if (turn.profile) {
        s.draft = turn.profile;
        s.stage = "review";
        await say(copy.REVIEW_INTRO, ...summarize(turn.profile), copy.REVIEW_ASK);
      }
      return s;
    }

    case "review": {
      if (YES.test(text)) {
        s.stage = "dealbreakers";
        await askDealbreakers(s, say);
        return s;
      }
      const turn = await reviseProfile(s.draft!, text);
      if (turn.profile) s.draft = turn.profile;
      await say(...turn.bubbles, ...summarize(s.draft!), copy.REVIEW_ASK);
      return s;
    }

    case "dealbreakers": {
      const empty = s.draft!.private.dealbreakers.length === 0;
      if ((empty && NONE.test(text)) || (!empty && YES.test(text))) {
        await saveProfile(s, s.draft!);
        if (s.userId) {
          // Where matching reads it. If this throws, the user gets the error bubble and their
          // "confirm" is retried on resend, so a confirmed profile never silently misses the DB.
          const { extras, ...profile } = toServerProfile(s.draft!);
          await saveMemberProfile(s.userId, profile, {
            imessage_onboarding: {
              ...extras,
              accounts: s.accounts,
              imported_from_ai: s.imported,
              dealbreakers_confirmed_at: new Date().toISOString(),
            },
          });
        }
        s.stage = "done";
        await say(...copy.DONE(s.pool?.name));
        return s;
      }
      // Anything else is an edit to the dealbreaker list.
      const turn = await reviseProfile(
        s.draft!,
        `Change ONLY the dealbreakers list based on this message, using the user's words: ${text}`,
      );
      if (turn.profile) s.draft = turn.profile;
      await askDealbreakers(s, say);
      return s;
    }

    case "done":
      await say(copy.ALREADY_DONE);
      return s;
  }
}

async function beginInterview(s: Session, say: Say): Promise<Session> {
  s.stage = "interview";
  if (s.userId) {
    // Give in-flight scrapes a little longer; whatever has landed (including links from the join page) is used.
    const pending = SCRAPE_ENABLED ? Object.keys(s.accounts?.links ?? {}) : [];
    s.scraped = await waitForScraped(s.userId, pending, pending.length ? 20_000 : 0);
  }
  const turn = await startInterview(s);
  await say(...turn.bubbles);
  return s;
}

async function askDealbreakers(s: Session, say: Say) {
  const d = s.draft!.private.dealbreakers;
  await say(...(d.length ? copy.DEALBREAKERS_ASK(d) : copy.NO_DEALBREAKERS_ASK));
}

/** Set s.pool from a "join <code>" message (or a bare code). True if it named an open pool. */
async function pickPool(s: Session, text: string): Promise<boolean> {
  const code = text.match(/^\s*(?:join\s+)?([A-Za-z0-9_-]{4,40})\s*$/i)?.[1];
  if (!code) return false;
  const found = await lookupPool(code);
  if (found) s.pool = found;
  return !!found;
}
