import { SearchIcon } from "@/components/ui/icons";
import { MAX_QUERY_LENGTH } from "@/lib/search";

/** Search box of the journal: a plain GET form, it works without JavaScript. */
export function SearchForm({ query = "", autoFocus = false }: { query?: string; autoFocus?: boolean }) {
  return (
    <form action="/search" method="get" role="search" className="flex gap-2">
      <label htmlFor="search-q" className="sr-only">
        Rechercher dans le journal
      </label>
      <input
        id="search-q"
        type="search"
        name="q"
        defaultValue={query}
        maxLength={MAX_QUERY_LENGTH}
        autoFocus={autoFocus}
        placeholder="Rechercher : plage, Marie, volcan…"
        enterKeyHint="search"
        className="block min-w-0 flex-1 rounded-md border border-line bg-white px-3 py-2 text-base outline-none focus:border-accent focus:ring-2 focus:ring-accent/30"
      />
      <button
        type="submit"
        className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 font-medium text-white hover:bg-accent/90"
      >
        <SearchIcon className="size-5" />
        Rechercher
      </button>
    </form>
  );
}
