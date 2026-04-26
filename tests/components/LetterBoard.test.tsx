import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { LetterBoard } from "@/components/LetterBoard";

describe("LetterBoard — filter mode", () => {
  it("renders three filter columns", () => {
    render(
      <LetterBoard
        mode="filter"
        state={{ genre: "ANY", decade: "ANY", minRating: 0 }}
        options={{ genres: ["ANY", "Horror"], decades: ["ANY", "1980s"] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText("GENRE")).toBeInTheDocument();
    expect(screen.getByText("DECADE")).toBeInTheDocument();
    expect(screen.getByText("MIN RATING")).toBeInTheDocument();
  });

  it("displays the NOW SHOWING footer", () => {
    render(
      <LetterBoard
        mode="filter"
        state={{ genre: "ANY", decade: "ANY", minRating: 0 }}
        options={{ genres: ["ANY"], decades: ["ANY"] }}
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/NOW SHOWING/)).toBeInTheDocument();
  });
});

describe("LetterBoard — result mode", () => {
  const film = {
    slug: "the-thing", title: "The Thing", year: 1982, lbxRating: 4.1, tmdbId: 1091,
    genres: ["Horror"], runtime: 109, director: "John Carpenter", posterPath: "/x.jpg", backdropPath: "/b.jpg",
    synopsis: "...", letterboxdUrl: "https://letterboxd.com/film/the-thing/",
  };

  it("renders the title", async () => {
    render(<LetterBoard mode="result" film={film} />);
    expect(await screen.findByText(/THE THING/i)).toBeInTheDocument();
  });

  it("renders DIRECTOR · YEAR · RUNTIME meta", () => {
    render(<LetterBoard mode="result" film={film} />);
    expect(screen.getByText(/CARPENTER/i)).toBeInTheDocument();
    expect(screen.getByText(/1982/)).toBeInTheDocument();
    expect(screen.getByText(/109/)).toBeInTheDocument();
  });
});
