/// <reference lib="webworker" />

import { calculate } from "@costeo/domain";
import type { CalculationInput } from "@costeo/domain";

self.onmessage = (event: MessageEvent<CalculationInput>) => {
  self.postMessage(calculate(event.data));
};

export {};
