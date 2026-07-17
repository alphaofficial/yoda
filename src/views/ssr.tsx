import React from 'react';
import { renderToString } from 'react-dom/server';
import { createInertiaApp } from '@inertiajs/react';
import type { InertiaAppResponse, Page } from '@inertiajs/core';

const pages = import.meta.glob('./pages/**/*.tsx', { eager: true }) as Record<
  string,
  { default: React.ComponentType }
>;

export function render(page: Page): InertiaAppResponse {
  return createInertiaApp({
    page,
    render: renderToString,
    resolve: (name) => {
      const mod = pages[`./pages/${name}.tsx`];
      if (!mod) throw new Error(`SSR: page not found: ${name}`);
      return mod.default;
    },
    setup: ({ App, props }) => <App {...props} />,
  });
}
