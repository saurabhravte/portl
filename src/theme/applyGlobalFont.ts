import { cloneElement, isValidElement } from "react";
import { StyleSheet, Text, TextInput, type TextStyle } from "react-native";
import { getManropeFamily } from "./fonts";

type Renderable = {
  render: (...args: unknown[]) => unknown;
  __manropePatched?: boolean;
};

function patchComponent(Component: unknown) {
  const target = Component as Renderable;
  if (
    !target ||
    typeof target.render !== "function" ||
    target.__manropePatched
  ) {
    return;
  }

  const originalRender = target.render;

  target.render = function patchedRender(...args: unknown[]) {
    const element = originalRender.apply(this, args);
    if (!isValidElement<{ style?: unknown }>(element)) {
      return element;
    }

    const flattened = (StyleSheet.flatten(element.props.style) ??
      {}) as TextStyle;
    const fontFamily =
      flattened.fontFamily ?? getManropeFamily(flattened.fontWeight);

    return cloneElement(element, {
      style: [{ fontFamily }, element.props.style],
    });
  };

  target.__manropePatched = true;
}

/**
 * Makes Manrope the default font for every `Text` and `TextInput` in the app,
 * including ones rendered by third-party libraries and navigation. Explicit
 * `fontFamily` values are preserved; `fontWeight` is resolved to the matching
 * Manrope family. Call once at app startup, before the UI renders.
 */
export function applyGlobalFont() {
  patchComponent(Text);
  patchComponent(TextInput);
}
