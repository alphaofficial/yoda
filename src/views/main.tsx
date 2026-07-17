import React from 'react'
import { createRoot, hydrateRoot } from 'react-dom/client'
import { createInertiaApp } from '@inertiajs/react'
import './styles/global.css'

createInertiaApp({
  resolve: (name) => {
    const pages = import.meta.glob('./pages/**/*.tsx', { eager: true }) as Record<string, { default: React.ComponentType }>;
    return pages[`./pages/${name}.tsx`]?.default;
  },
  setup({ el, App, props }) {
    if (el.hasChildNodes()) {
      hydrateRoot(el, <App {...props} />)
    } else {
      createRoot(el).render(<App {...props} />)
    }
  },
  progress: {
    color: '#4B5563',
  },
})
