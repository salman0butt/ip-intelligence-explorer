import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "../src/App";

interface HealthState {
  readonly isPending: boolean;
  readonly isSuccess: boolean;
}

interface LookupState {
  readonly data: undefined;
  readonly error: null;
  readonly isPending: boolean;
  readonly isSuccess: boolean;
  readonly lookup: (ip: string) => void;
  readonly reset: () => void;
}

const mocks = vi.hoisted(() => ({
  useHealth: vi.fn<() => HealthState>(),
  useLookup: vi.fn<() => LookupState>(),
  lookup: vi.fn<(ip: string) => void>(),
  reset: vi.fn<() => void>(),
}));

vi.mock("../src/features/ip-intelligence/hooks/useApiHealth", () => ({
  useApiHealth: mocks.useHealth,
}));

vi.mock("../src/features/ip-intelligence/hooks/useIpLookup", () => ({
  useIpLookup: mocks.useLookup,
}));

describe("Explorer Workspace smoke test", () => {
  beforeEach(() => {
    mocks.lookup.mockReset();
    mocks.reset.mockReset();
    mocks.useHealth.mockReturnValue({ isPending: false, isSuccess: true });
    mocks.useLookup.mockReturnValue({
      data: undefined,
      error: null,
      isPending: false,
      isSuccess: false,
      lookup: mocks.lookup,
      reset: mocks.reset,
    });
  });

  it("renders the initial workspace without starting a lookup", () => {
    render(<App />);
    expect(screen.getByText("IP Intelligence Explorer")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Explore any public IP" }))
      .toBeInTheDocument();
    expect(screen.getByLabelText("IP address")).toBeInTheDocument();
    expect(mocks.lookup).not.toHaveBeenCalled();
  });

  it("submits a trimmed IP through the lookup hook", async () => {
    render(<App />);
    await userEvent.type(screen.getByLabelText("IP address"), " 8.8.8.8 ");
    await userEvent.click(screen.getByRole("button", { name: "Analyze IP" }));
    expect(mocks.lookup).toHaveBeenCalledOnce();
    expect(mocks.lookup).toHaveBeenCalledWith("8.8.8.8");
  });
});
