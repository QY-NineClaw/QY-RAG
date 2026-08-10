import '@testing-library/jest-dom';
import { TransformStream as NodeTransformStream } from 'node:stream/web';
import {
  TextDecoder as NodeTextDecoder,
  TextEncoder as NodeTextEncoder,
} from 'node:util';
import React from 'react';

// esbuild-jest emits the classic JSX runtime. Umi's former test setup
// provided this global implicitly; keep that behavior after the v0.26.1
// Jest migration so TSX constants can be imported by isolated unit tests.
(globalThis as typeof globalThis & { React: typeof React }).React = React;

if (!globalThis.TransformStream) {
  Object.defineProperty(globalThis, 'TransformStream', {
    configurable: true,
    value: NodeTransformStream,
    writable: true,
  });
}

if (!globalThis.TextEncoder) {
  Object.defineProperty(globalThis, 'TextEncoder', {
    configurable: true,
    value: NodeTextEncoder,
    writable: true,
  });
}

if (!globalThis.TextDecoder) {
  Object.defineProperty(globalThis, 'TextDecoder', {
    configurable: true,
    value: NodeTextDecoder,
    writable: true,
  });
}
