interface SpiceToken {
  kind: string;
  start: number;
  end: number;
}

interface SpiceLine {
  line: number;
  tokens: SpiceToken[];
  concealment: [number, number] | null;
}

const preferenceKey = "spice-code-view";

function decode<T>(value: string | undefined): T {
  if (!value) throw new Error("missing Spice code metadata");
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes)) as T;
}

function decodeText(value: string | undefined): string {
  if (!value) return "";
  const bytes = Uint8Array.from(atob(value), (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

function semanticLine(source: string, tokens: SpiceToken[]): DocumentFragment {
  const fragment = document.createDocumentFragment();
  let offset = 0;
  for (const token of tokens) {
    if (token.start > offset) fragment.append(source.slice(offset, token.start));
    const span = document.createElement("span");
    span.className = `spice-token spice-token--${token.kind.toLowerCase().replaceAll("_", "-")}`;
    span.textContent = source.slice(token.start, token.end);
    fragment.append(span);
    offset = token.end;
  }
  if (offset < source.length) fragment.append(source.slice(offset));
  return fragment;
}

function decorateLayer(layer: HTMLElement, lines: SpiceLine[], source: string): void {
  const sourceLines = source.split("\n");
  const renderedLines = [...layer.querySelectorAll<HTMLElement>("code > .line, .ec-line > .code")];
  for (const line of lines) {
    const rendered = renderedLines[line.line];
    const canonical = sourceLines[line.line];
    if (!rendered || canonical === undefined) continue;
    rendered.replaceChildren(semanticLine(canonical, line.tokens));
  }
}

function controls(): HTMLElement {
  const group = document.createElement("div");
  group.className = "spice-code__controls";
  group.setAttribute("role", "group");
  group.setAttribute("aria-label", "Code view");
  for (const [value, label] of [
    ["source", "Go source"],
    ["spice", "Spice view"],
    ["compare", "Compare"],
  ]) {
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.spiceSelect = value;
    button.textContent = label;
    group.append(button);
  }
  return group;
}

function rangeControl(): HTMLLabelElement {
  const label = document.createElement("label");
  label.className = "spice-code__range";
  const text = document.createElement("span");
  text.textContent = "Spice reveal";
  const range = document.createElement("input");
  range.type = "range";
  range.min = "0";
  range.max = "100";
  range.value = "50";
  range.dataset.spiceRange = "";
  label.append(text, range);
  return label;
}

function wrapExpressiveCode(block: HTMLElement): HTMLElement {
  const wrapper = document.createElement("figure");
  wrapper.className = "spice-code spice-code--expressive";
  wrapper.dataset.spiceViewer = "";
  wrapper.dataset.spiceView = block.dataset.spiceView ?? "spice";
  wrapper.dataset.spiceAnalysis = block.dataset.spiceAnalysis;
  wrapper.dataset.spiceSource = block.dataset.spiceSource;
  const viewport = document.createElement("div");
  viewport.className = "spice-code__viewport";
  const sourceLayer = document.createElement("div");
  sourceLayer.className = "spice-code__layer spice-code__source";
  sourceLayer.dataset.spiceSourceLayer = "";
  const renderedLayer = document.createElement("div");
  renderedLayer.className = "spice-code__layer spice-code__rendered";
  renderedLayer.dataset.spiceRenderedLayer = "";
  renderedLayer.setAttribute("aria-hidden", "true");
  const clone = block.cloneNode(true) as HTMLElement;
  clone.removeAttribute("data-spice-code");
  clone.querySelectorAll("button").forEach((button) => {
    button.remove();
  });
  block.before(wrapper);
  sourceLayer.append(block);
  renderedLayer.append(clone);
  viewport.append(sourceLayer, renderedLayer);
  wrapper.append(controls(), viewport, rangeControl());
  return wrapper;
}

function enhance(wrapper: HTMLElement): void {
  if (wrapper.dataset.spiceEnhanced === "true") return;
  wrapper.dataset.spiceEnhanced = "true";
  const lines = decode<SpiceLine[]>(wrapper.dataset.spiceAnalysis);
  const source = decodeText(wrapper.dataset.spiceSource);
  const rendered = wrapper.querySelector<HTMLElement>("[data-spice-rendered-layer]");
  if (!rendered) return;
  decorateLayer(rendered, lines, source);

  const range = wrapper.querySelector<HTMLInputElement>("[data-spice-range]");
  range?.addEventListener("input", () => {
    wrapper.style.setProperty("--spice-reveal", `${range.value}%`);
  });
  range?.addEventListener("keydown", (event) => {
    if (event.key === "Home") range.value = "0";
    if (event.key === "End") range.value = "100";
    wrapper.style.setProperty("--spice-reveal", `${range.value}%`);
  });

  const select = (value: string, remember = true) => {
    wrapper.dataset.spiceView = value;
    wrapper.querySelectorAll<HTMLButtonElement>("[data-spice-select]").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.spiceSelect === value));
    });
    if (remember) localStorage.setItem(preferenceKey, value);
  };
  wrapper.querySelectorAll<HTMLButtonElement>("[data-spice-select]").forEach((button) => {
    button.addEventListener("click", () => select(button.dataset.spiceSelect ?? "source"));
  });
  const remembered = localStorage.getItem(preferenceKey);
  select(
    remembered && ["source", "spice", "compare"].includes(remembered)
      ? remembered
      : (wrapper.dataset.spiceView ?? "source"),
    false,
  );

  wrapper
    .querySelector<HTMLButtonElement>("[data-spice-copy]")
    ?.addEventListener("click", async (event) => {
      await navigator.clipboard.writeText(source);
      (event.currentTarget as HTMLButtonElement).textContent = "Copied valid Go";
    });

  const sourcePre = wrapper.querySelector<HTMLElement>("[data-spice-source-layer] pre");
  const renderedPre = wrapper.querySelector<HTMLElement>("[data-spice-rendered-layer] pre");
  sourcePre?.addEventListener("scroll", () => {
    if (renderedPre) {
      renderedPre.scrollLeft = sourcePre.scrollLeft;
      renderedPre.scrollTop = sourcePre.scrollTop;
    }
  });
}

function initialize(): void {
  document.querySelectorAll<HTMLElement>("[data-spice-code]").forEach((block) => {
    if (!block.closest("[data-spice-viewer]")) enhance(wrapExpressiveCode(block));
  });
  document.querySelectorAll<HTMLElement>("[data-spice-viewer]").forEach(enhance);
}

function initializeScrollableCode() {
  for (const pre of document.querySelectorAll<HTMLElement>(".expressive-code pre")) {
    if (pre.scrollWidth > pre.clientWidth) pre.tabIndex = 0;
  }
}

function initializePage() {
  initialize();
  initializeScrollableCode();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializePage);
} else {
  initializePage();
}
