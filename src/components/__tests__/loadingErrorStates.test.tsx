import { fireEvent, render } from "@testing-library/react-native";
import { OtaBanner } from "../OtaBanner";
import { QueryErrorState } from "../ui";
import { useOtaUpdateCheck } from "@/lib/ota";

jest.mock("@/lib/ota", () => ({
  useOtaUpdateCheck: jest.fn(),
}));

describe("component loading and error states", () => {
  it("renders a retryable OTA error state", async () => {
    const retry = jest.fn();
    (useOtaUpdateCheck as jest.Mock).mockReturnValue({
      ready: false,
      applying: false,
      checking: false,
      error: "Couldn’t check for updates.",
      apply: jest.fn(),
      retry,
    });
    const screen = await render(<OtaBanner />);
    expect(screen.getByRole("button", { name: "Retry update check" })).toBeTruthy();
    fireEvent.press(screen.getByRole("button", { name: "Retry update check" }));
    expect(retry).toHaveBeenCalled();
  });

  it("exposes query failures as alerts and disables retry while loading", async () => {
    const retry = jest.fn();
    const screen = await render(
      <QueryErrorState
        error={new Error("Network unavailable")}
        onRetry={retry}
        isRetrying
      />,
    );
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Network unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeDisabled();
  });
});
