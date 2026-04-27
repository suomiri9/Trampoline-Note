import { MouseSensor, TouchSensor, useSensor, useSensors } from "@dnd-kit/core";

export function useDndSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { distance: 5 } })
  );
}

export function useLongPressDndSensors() {
  return useSensors(
    useSensor(MouseSensor, { activationConstraint: { delay: 120, tolerance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 150, tolerance: 5 } })
  );
}
