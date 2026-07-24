import { renderHook, waitFor } from "@testing-library/react-native";
import { useAuth, useUser } from "@clerk/expo";
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
  phone: "+919876543210",
  expo_push_token: null,
};
type RoutingProps = Parameters<typeof useSessionRestorationRouting>[0];

describe("Clerk session restoration routing", () => {
  beforeEach(() => {
    replace.mockClear();
    (useRouter as jest.Mock).mockReturnValue({ replace });
    (useSegments as jest.Mock).mockReturnValue(["index"]);
    (useUser as jest.Mock).mockReturnValue({ user: null });
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

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith(ROLE_HOME.resident),
    );
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

  it("sends Google users missing phone to complete-profile", async () => {
    (useAuth as jest.Mock).mockReturnValue({
      isLoaded: true,
      isSignedIn: true,
    });
    (useUser as jest.Mock).mockReturnValue({
      user: {
        username: null,
        externalAccounts: [
          { provider: "google", verification: { status: "verified" } },
        ],
      },
    });
    (useSegments as jest.Mock).mockReturnValue(["(resident)", "home"]);

    renderHook(() =>
      useSessionRestorationRouting({
        onboardingReady: true,
        onboardingDone: true,
        profileStatus: "linked",
        profile: { ...profile, phone: null, name: "Ada Lovelace" },
      }),
    );

    await waitFor(() =>
      expect(replace).toHaveBeenCalledWith("/(auth)/complete-profile"),
    );
  });
});
