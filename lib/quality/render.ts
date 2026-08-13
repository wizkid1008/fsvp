/**
 * Rendering server components in tests, without a DOM.
 *
 * app-invariants.test.ts says rendering pages "would need jsdom and a mocked
 * Supabase, which this project has no setup for", and so 47 pages and 59 routes
 * have only ever been checked for shape. Four bugs on 2026-08-13 were found by
 * a person clicking, and two earlier ones before that.
 *
 * jsdom turns out to be unnecessary. An App Router server component is an async
 * function returning React elements, and a React element is a plain object —
 * { type, props, key }. So a test can call the page, await it, and walk what
 * comes back. No DOM, no renderer, no new dependency.
 *
 * The limit is real and worth stating: this sees the element TREE, not layout,
 * CSS or anything a browser computes. It catches "the wrong thing is on the
 * page" and "the right thing is missing", which is the category every bug found
 * today belonged to. It cannot catch a button pushed off-screen by a missing
 * max-height — that one needed a real viewport.
 */

import type { ReactElement, ReactNode } from "react";

type Rendered = ReactNode;

function isElement(node: unknown): node is ReactElement {
  return typeof node === "object" && node !== null && "type" in node && "props" in node;
}

/**
 * Resolves a tree, calling any nested function components it contains.
 *
 * Server components compose: a page returns <AppShell><ImporterDashboard/></AppShell>
 * where the child is itself an async function that has not run yet. Without
 * this, a test asserting on the page sees only the outermost element and
 * silently passes on an empty tree.
 *
 * Client components ("use client") are left unresolved on purpose. They do not
 * execute on the server, and calling one here would run hooks outside React and
 * throw. They still appear in the tree as elements, so a test can assert one is
 * present and check the props it was handed.
 */
export async function resolve(node: Rendered, depth = 0): Promise<Rendered> {
  if (depth > 50) return node; // cycles are a bug, not something to hang on
  if (Array.isArray(node)) {
    return Promise.all(node.map((child) => resolve(child, depth + 1)));
  }
  if (!isElement(node)) return node;

  const { type, props } = node as ReactElement & { props: Record<string, unknown> };

  if (typeof type === "function") {
    let output: unknown;
    try {
      output = await (type as (p: unknown) => unknown)(props);
    } catch {
      // A client component, or one that needs a browser. Keep the element so
      // its presence and props remain assertable.
      return node;
    }
    return resolve(output as Rendered, depth + 1);
  }

  if (props && "children" in props) {
    const children = await resolve(props.children as Rendered, depth + 1);
    return { ...node, props: { ...props, children } } as ReactElement;
  }

  return node;
}

/** Every string in the tree, joined — the page as a reader would read it. */
export function text(node: Rendered): string {
  const out: string[] = [];

  const walk = (n: Rendered) => {
    if (n === null || n === undefined || typeof n === "boolean") return;
    if (typeof n === "string" || typeof n === "number") {
      out.push(String(n));
      return;
    }
    if (Array.isArray(n)) {
      n.forEach(walk);
      return;
    }
    if (isElement(n)) {
      const props = (n.props ?? {}) as Record<string, unknown>;
      if ("children" in props) walk(props.children as Rendered);
    }
  };

  walk(node);
  // Collapse whitespace so assertions do not depend on JSX indentation.
  return out.join(" ").replace(/\s+/g, " ").trim();
}

/** Every element whose component function or tag matches `name`. */
export function findAll(node: Rendered, name: string): ReactElement[] {
  const found: ReactElement[] = [];

  const walk = (n: Rendered) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!isElement(n)) return;

    const { type } = n;
    const typeName =
      typeof type === "string" ? type :
      typeof type === "function" ? (type.name || "") :
      "";

    if (typeName === name) found.push(n);

    const props = (n.props ?? {}) as Record<string, unknown>;
    if ("children" in props) walk(props.children as Rendered);
  };

  walk(node);
  return found;
}

/** Every href on the page, in tree order. Duplicates kept — order is evidence. */
export function links(node: Rendered): string[] {
  const hrefs: string[] = [];

  const walk = (n: Rendered) => {
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (!isElement(n)) return;

    const props = (n.props ?? {}) as Record<string, unknown>;
    if (typeof props.href === "string") hrefs.push(props.href);
    if ("children" in props) walk(props.children as Rendered);
  };

  walk(node);
  return hrefs;
}
