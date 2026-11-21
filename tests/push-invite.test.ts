import { describe, expect, it } from "vitest";
import { MAX_INVITES, nextInviteRecord, parseInviteRecord, shouldInvite } from "@/lib/push-invite";

const day = (n: number) => new Date(Date.UTC(2026, 10, 1 + n, 9));

describe("invitation to turn phone notifications on", () => {
  it("is shown the first time", () => {
    expect(shouldInvite(null, day(0))).toBe(true);
  });

  it("comes back a week after « Plus tard », three times at most", () => {
    let record = nextInviteRecord(null, "shown", day(0));
    expect(shouldInvite(record, day(6))).toBe(false);
    expect(shouldInvite(record, day(7))).toBe(true);
    record = nextInviteRecord(record, "shown", day(7));
    expect(shouldInvite(record, day(13))).toBe(false);
    record = nextInviteRecord(record, "shown", day(14));
    expect(record.shown).toBe(MAX_INVITES);
    expect(shouldInvite(record, day(60))).toBe(false);
  });

  it("never comes back once accepted", () => {
    const record = nextInviteRecord(nextInviteRecord(null, "shown", day(0)), "accepted", day(0));
    expect(record).toMatchObject({ shown: 1, accepted: true });
    expect(shouldInvite(record, day(30))).toBe(false);
  });

  it("reads what the device remembers, including the first version (a date only)", () => {
    const record = nextInviteRecord(null, "shown", day(0));
    expect(parseInviteRecord(JSON.stringify(record))).toEqual(record);
    expect(parseInviteRecord(day(0).toISOString())).toEqual({ shown: 1, lastAt: day(0).toISOString(), accepted: false });
    expect(parseInviteRecord(null)).toBeNull();
    expect(parseInviteRecord("{abîmé")).toBeNull();
    expect(parseInviteRecord('{"shown":"x"}')).toBeNull();
  });
});
