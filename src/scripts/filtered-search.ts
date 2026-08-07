interface PagefindResultData {
  url: string;
  plain_excerpt: string;
  meta: Record<string, string>;
}

interface PagefindApi {
  init(): Promise<void>;
  filters(): Promise<Record<string, Record<string, number>>>;
  search(
    term: string | null,
    options: { filters: Record<string, string> },
  ): Promise<{ results: Array<{ data(): Promise<PagefindResultData> }> }>;
}

class SpiceDocsSearch extends HTMLElement {
  private pagefind?: PagefindApi;
  private selectedProduct = "";
  private request = 0;

  connectedCallback() {
    const dialog = this.querySelector("dialog") as HTMLDialogElement;
    const input = this.querySelector("[data-search-input]") as HTMLInputElement;
    const open = this.querySelector("[data-search-open]") as HTMLButtonElement;
    const close = this.querySelector("[data-search-close]") as HTMLButtonElement;
    const show = async () => {
      dialog.showModal();
      document.body.toggleAttribute("data-search-modal-open", true);
      input.focus();
      await this.load();
    };
    open.addEventListener("click", show);
    close.addEventListener("click", () => dialog.close());
    dialog.addEventListener("close", () => {
      document.body.toggleAttribute("data-search-modal-open", false);
    });
    dialog.addEventListener("click", (event) => {
      if (event.target === dialog) dialog.close();
    });
    window.addEventListener("keydown", (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        dialog.open ? dialog.close() : void show();
      }
      if (event.key === "Escape" && dialog.open) dialog.close();
    });
    input.addEventListener("input", () => void this.search());
    input.addEventListener("keydown", (event) => {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        this.querySelector<HTMLAnchorElement>("[data-search-results] a")?.focus();
      }
    });
    for (const button of this.querySelectorAll<HTMLButtonElement>("[data-product]")) {
      button.addEventListener("click", () => {
        this.selectedProduct =
          this.selectedProduct === button.dataset.product ? "" : (button.dataset.product ?? "");
        for (const candidate of this.querySelectorAll<HTMLButtonElement>("[data-product]")) {
          candidate.setAttribute(
            "aria-pressed",
            String(candidate.dataset.product === this.selectedProduct),
          );
        }
        void this.search();
      });
    }
    for (const control of this.querySelectorAll("[data-filter], [data-include-evidence]")) {
      control.addEventListener("change", () => void this.search());
    }
  }

  private async load() {
    if (this.pagefind) return;
    const moduleUrl = new URL("/pagefind/pagefind.js", window.location.origin).href;
    this.pagefind = (await import(/* @vite-ignore */ moduleUrl)) as PagefindApi;
    await this.pagefind.init();
    const available = await this.pagefind.filters();
    for (const name of ["kind", "maturity", "repository"]) {
      const select = this.querySelector<HTMLSelectElement>(`[data-filter="${name}"]`);
      if (!select) continue;
      for (const value of Object.keys(available[name] ?? {}).sort()) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = `${value} (${available[name]?.[value] ?? 0})`;
        select.append(option);
      }
    }
  }

  private async search() {
    await this.load();
    const input = this.querySelector("[data-search-input]") as HTMLInputElement;
    const status = this.querySelector("[data-search-status]") as HTMLElement;
    const results = this.querySelector("[data-search-results]") as HTMLOListElement;
    const filters: Record<string, string> = {};
    if (this.selectedProduct) filters.lane = this.selectedProduct;
    for (const select of this.querySelectorAll<HTMLSelectElement>("[data-filter]")) {
      if (select.value && select.dataset.filter) filters[select.dataset.filter] = select.value;
    }
    const includeEvidence =
      this.querySelector<HTMLInputElement>("[data-include-evidence]")?.checked;
    if (!includeEvidence) filters.default_visibility = "true";
    const term = input.value.trim();
    if (!term && Object.keys(filters).length === 1 && filters.default_visibility) {
      results.replaceChildren();
      status.textContent = "Type to search the exact reviewed documentation snapshot.";
      return;
    }
    const current = ++this.request;
    status.textContent = "Searching…";
    const response = await this.pagefind?.search(term || null, { filters });
    const data = await Promise.all(
      (response?.results ?? []).slice(0, 30).map((result) => result.data()),
    );
    if (current !== this.request) return;
    results.replaceChildren(...data.map((result) => this.renderResult(result)));
    status.textContent = `${response?.results.length ?? 0} matching page${response?.results.length === 1 ? "" : "s"}.`;
  }

  private renderResult(result: PagefindResultData): HTMLLIElement {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = result.url;
    const title = document.createElement("strong");
    title.textContent = result.meta.title ?? result.url;
    const excerpt = document.createElement("p");
    excerpt.textContent = result.plain_excerpt;
    const metadata = document.createElement("div");
    metadata.className = "result-meta";
    for (const value of [
      result.meta.product,
      result.meta.kind,
      result.meta.maturity,
      result.meta.repository,
    ]) {
      if (!value) continue;
      const badge = document.createElement("span");
      badge.textContent = value;
      metadata.append(badge);
    }
    link.append(title, excerpt, metadata);
    item.append(link);
    return item;
  }
}

if (!customElements.get("spice-docs-search")) {
  customElements.define("spice-docs-search", SpiceDocsSearch);
}
