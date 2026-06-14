import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BottomDrawer } from "../src/components/BottomDrawer";

describe("BottomDrawer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders a wide drawer class when the wide size is requested", () => {
    render(
      <BottomDrawer open title="历史预测记录" size="wide" onClose={vi.fn()}>
        <p>drawer body</p>
      </BottomDrawer>
    );

    expect(screen.getByRole("dialog", { name: "历史预测记录" })).toHaveClass("bottom-drawer", "bottom-drawer-wide");
  });
});
