/**
 * Preparación común de las pruebas unitarias.
 *
 * Angular 22 ejecuta las pruebas con Vitest a través del builder
 * `@angular/build:unit-test`, en sustitución de Karma y Jasmine, que quedaron
 * obsoletos y ya no se distribuyen con el framework.
 */
import '@angular/compiler';
import { vi } from 'vitest';

import './zone-flags';

// Los plugins de Capacitor no existen fuera del dispositivo: se sustituyen por
// una implementación en memoria para que los servicios que los usan puedan
// probarse en Node.
vi.mock('@capacitor/preferences', () => {
  const store = new Map<string, string>();

  return {
    Preferences: {
      get: ({ key }: { key: string }) => Promise.resolve({ value: store.get(key) ?? null }),
      set: ({ key, value }: { key: string; value: string }) => {
        store.set(key, value);

        return Promise.resolve();
      },
      remove: ({ key }: { key: string }) => {
        store.delete(key);

        return Promise.resolve();
      },
      clear: () => {
        store.clear();

        return Promise.resolve();
      },
    },
  };
});
