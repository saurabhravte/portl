import { renderHook, waitFor } from "@testing-library/react-native";
import { useAuth } from "@clerk/expo";
import { useRouter, useSegments } from "expo-router";
import {
  ROLE_HOME,
  useSessionRestorationRouting,
} from "../sessionRouting";

jest.mock("expo-router", () => ({
  useRouter: jest.fn(),
  useSegments: jest.fn(),
}));

const replace = jest.fn();
const profile = {
  id: "user_resident",
  society_id: "society-a",
  role: "resident" as const,
  flat_id: "flat-a",
  name: "Resident",
  phone: null,
  expo_push_token: null,
};
type RoutingProps = Parameters<typeof useSessionRestorationRouting>[0];

describe("Clerk session restoration routing", () => {
  beforeEach(() => {
    (useRouter as jest.Mock).mockReturnValue({ replace });
    (useSegments as jest.Mock).mockReturnValue(["index"]);
  });

  it("waits for Clerk, then restores a linked user directly to role home", async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: false,
      isSignedIn: undefined,
    });
    const { rerender } = await renderHook<void, RoutingProps>(
      (props) => useSessionRestorationRouting(props),
      {
        initialProps: {
          onboardingReady: true,
          onboardingDone: true,
          profileStatus: "linked" as const,
          profile,
        },
      },
    );
    expect(replace).not.toHaveBeenCalled();

    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    await rerender({
      onboardingReady: true,
      onboardingDone: true,
      profileStatus: "linked",
      profile,
    });

    await waitFor(() => expect(replace).toHaveBeenCalledWith(ROLE_HOME.resident));
  });

  it("keeps onboarding before auth and sends returning signed-out users to sign-in", async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: false,
    });
    const { rerender } = await renderHook<void, RoutingProps>(
      (props) => useSessionRestorationRouting(props),
      {
        initialProps: {
          onboardingReady: true,
          onboardingDone: false,
          profileStatus: "loading" as const,
          profile: null,
        },
      },
    );
    await waitFor(() =>
      expect(replace).toHaveBeenLastCalledWith("/(auth)/onboarding"),
    );

    await rerender({
      onboardingReady: true,
      onboardingDone: true,
      profileStatus: "loading",
      profile: null,
    });
    await waitFor(() =>
      expect(replace).toHaveBeenLastCalledWith("/(auth)/sign-in"),
    );
  });
});
