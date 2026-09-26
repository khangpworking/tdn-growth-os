import { JSDOM } from 'jsdom';

export function setupDom() {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/', pretendToBeVisual: true });
  const exposed: Record<string, unknown> = {
    window: dom.window,
    self: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    SVGElement: dom.window.SVGElement,
    HTMLInputElement: dom.window.HTMLInputElement,
    HTMLTextAreaElement: dom.window.HTMLTextAreaElement,
    HTMLSelectElement: dom.window.HTMLSelectElement,
    HTMLFormElement: dom.window.HTMLFormElement,
    HTMLButtonElement: dom.window.HTMLButtonElement,
    HTMLFieldSetElement: dom.window.HTMLFieldSetElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    FocusEvent: dom.window.FocusEvent,
    KeyboardEvent: dom.window.KeyboardEvent,
    CustomEvent: dom.window.CustomEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
  };
  const previous = new Map<string, PropertyDescriptor | undefined>();
  for (const [key, value] of Object.entries(exposed)) {
    previous.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { configurable: true, enumerable: true, writable: true, value });
  }
  const actKey = 'IS_REACT_ACT_ENVIRONMENT';
  previous.set(actKey, Object.getOwnPropertyDescriptor(globalThis, actKey));
  Object.defineProperty(globalThis, actKey, { configurable: true, enumerable: true, writable: true, value: true });

  const container = dom.window.document.createElement('div');
  dom.window.document.body.append(container);
  let cleaned = false;
  return {
    container,
    cleanup: () => {
      if (cleaned) return;
      cleaned = true;
      container.remove();
      dom.window.close();
      for (const [key, descriptor] of previous) {
        if (descriptor) Object.defineProperty(globalThis, key, descriptor);
        else delete (globalThis as unknown as Record<string, unknown>)[key];
      }
    },
  };
}
