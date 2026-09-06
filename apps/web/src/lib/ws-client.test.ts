import { describe, expect, it } from "vitest";
import { decideOnClose } from "./ws-client";

const fresh = { closedByUser: false, identityAlreadyReset: false };

describe("decideOnClose", () => {
  it("retries on an ordinary drop", () => {
    expect(decideOnClose(1006, fresh)).toBe("retry"); // abnormal closure: wifi, sleep, deploy
    expect(decideOnClose(1001, fresh)).toBe("retry");
  });

  it("gives up when another tab took the seat, instead of kicking it back", () => {
    // Retrying here is what made two tabs evict each other in a loop: each reconnection
    // closes the other's socket with 4002, which makes *it* reconnect, and so on.
    expect(decideOnClose(4002, fresh)).toBe("give-up");
  });

  it("gives up when the host kicked us", () => {
    expect(decideOnClose(4003, fresh)).toBe("give-up");
  });

  it("takes a fresh identity once when the token is refused, then stops", () => {
    expect(decideOnClose(4001, fresh)).toBe("reset-identity");
    expect(decideOnClose(4001, { ...fresh, identityAlreadyReset: true })).toBe("give-up");
  });

  it("does nothing when we closed the socket ourselves", () => {
    expect(decideOnClose(1000, { ...fresh, closedByUser: true })).toBe("ignore");
    expect(decideOnClose(4002, { ...fresh, closedByUser: true })).toBe("ignore");
  });
});
