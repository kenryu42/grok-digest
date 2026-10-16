import { SearchIcon } from "lucide-react";
import { Button } from "./ui/button.tsx";
import { Input } from "./ui/input.tsx";
import type { Controls } from "../lib/bookmark-controls.ts";

export function SearchField({ controls }: { controls: Controls }) {
  const { searchRef, query, setQuery, leaveSearch, closeSearch } = controls;
  return (
    <>
      <div className="relative flex-1">
        <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onBlur={leaveSearch}
          placeholder="Search all bookmarks"
          aria-label="Search bookmarks"
          className="h-10 rounded-full bg-card pl-9 dark:bg-card"
        />
      </div>
      <Button type="button" variant="ghost" onClick={closeSearch} className="h-10 rounded-full px-3 sm:hidden">
        Cancel
      </Button>
    </>
  );
}
