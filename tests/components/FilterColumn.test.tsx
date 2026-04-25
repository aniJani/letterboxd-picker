import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { FilterColumn } from "@/components/FilterColumn";

describe("FilterColumn", () => {
  it("renders the current value", () => {
    render(<FilterColumn label="GENRE" options={["ANY", "Horror", "Drama"]} value="Horror" onChange={() => {}} />);
    expect(screen.getByText("Horror")).toBeInTheDocument();
    expect(screen.getByText("GENRE")).toBeInTheDocument();
  });

  it("calls onChange with the next option when down arrow clicked", () => {
    const onChange = vi.fn();
    render(<FilterColumn label="GENRE" options={["ANY", "Horror", "Drama"]} value="ANY" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/next/i));
    expect(onChange).toHaveBeenCalledWith("Horror");
  });

  it("calls onChange with the previous option when up arrow clicked", () => {
    const onChange = vi.fn();
    render(<FilterColumn label="GENRE" options={["ANY", "Horror", "Drama"]} value="Horror" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/previous/i));
    expect(onChange).toHaveBeenCalledWith("ANY");
  });

  it("wraps around at the boundaries", () => {
    const onChange = vi.fn();
    render(<FilterColumn label="GENRE" options={["A", "B", "C"]} value="C" onChange={onChange} />);
    fireEvent.click(screen.getByLabelText(/next/i));
    expect(onChange).toHaveBeenCalledWith("A");
  });

  it("supports keyboard arrow navigation", () => {
    const onChange = vi.fn();
    render(<FilterColumn label="GENRE" options={["A", "B", "C"]} value="A" onChange={onChange} />);
    const listbox = screen.getByRole("listbox");
    listbox.focus();
    fireEvent.keyDown(listbox, { key: "ArrowDown" });
    expect(onChange).toHaveBeenCalledWith("B");
  });
});
