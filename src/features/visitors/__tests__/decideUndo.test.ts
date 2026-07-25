import {
  cancelDecideUndo,
  resetDecideUndoForTests,
  waitForDecideUndo,
} from "../decideUndo";

describe("waitForDecideUndo", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    resetDecideUndoForTests();
  });

  afterEach(() => {
    resetDecideUndoForTests();
    jest.useRealTimers();
  });

  it("returns false (commit) after the undo window elapses", async () => {
    const pending = waitForDecideUndo("req-1", "approved", {
      undoMs: 1000,
      showToast: false,
    });
    jest.advanceTimersByTime(1000);
    await expect(pending).resolves.toBe(false);
  });

  it("returns true (skip RPC) when Undo is tapped before the window ends", async () => {
    const pending = waitForDecideUndo("req-2", "denied", {
      undoMs: 5000,
      showToast: false,
    });
    jest.advanceTimersByTime(500);
    expect(cancelDecideUndo("req-2")).toBe(true);
    await expect(pending).resolves.toBe(true);
  });

  it("does not commit after Undo even if the original timer would fire", async () => {
    const pending = waitForDecideUndo("req-3", "approved", {
      undoMs: 2000,
      showToast: false,
    });
    cancelDecideUndo("req-3");
    jest.advanceTimersByTime(5000);
    await expect(pending).resolves.toBe(true);
  });
});
