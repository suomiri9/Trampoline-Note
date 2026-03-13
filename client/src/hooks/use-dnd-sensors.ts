import { MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";

export function useDndSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } })
  );
}
