"use client";

import {
  ChakraProvider,
  defaultSystem,
  createSystem,
  defineConfig,
} from "@chakra-ui/react";
import { ColorModeProvider, type ColorModeProviderProps } from "./color-mode";

const config = defineConfig({
  theme: {
    tokens: {
      colors: {},
    },
  },
});

const system = createSystem(config);

export function Provider(props: ColorModeProviderProps) {
  return (
    <ChakraProvider value={defaultSystem}>
      <ColorModeProvider {...props} />
    </ChakraProvider>
  );
}
