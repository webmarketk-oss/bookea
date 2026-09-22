"use client";

import { useEffect, useRef, useState } from "react";

export const SIDEBAR_CLOSED_WIDTH = 80;
export const SIDEBAR_OPEN_WIDTH = 288;
const SNAP_WIDTH = (SIDEBAR_CLOSED_WIDTH + SIDEBAR_OPEN_WIDTH) / 2;
const DRAG_THRESHOLD = 10;

function clampWidth(value: number) {
  return Math.min(SIDEBAR_OPEN_WIDTH, Math.max(SIDEBAR_CLOSED_WIDTH, value));
}

export function useSidebarSlide(
  collapsed: boolean,
  onCollapsedChange: (collapsed: boolean) => void,
) {
  const sidebarRef = useRef<HTMLElement | null>(null);
  const [dragWidth, setDragWidth] = useState<number | null>(null);
  const dragWidthRef = useRef<number | null>(null);
  const collapsedRef = useRef(collapsed);
  const didDragRef = useRef(false);
  const pointerIdRef = useRef<number | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(SIDEBAR_OPEN_WIDTH);
  const wheelTimerRef = useRef<number>(0);

  collapsedRef.current = collapsed;

  const settledWidth = collapsed ? SIDEBAR_CLOSED_WIDTH : SIDEBAR_OPEN_WIDTH;
  const width = dragWidth ?? settledWidth;
  const isDragging = dragWidth !== null;
  const visuallyCollapsed = width < SNAP_WIDTH;

  useEffect(() => {
    const sidebar = sidebarRef.current;

    if (!sidebar) {
      return;
    }

    const node: HTMLElement = sidebar;

    function snap(nextWidth: number) {
      dragWidthRef.current = null;
      setDragWidth(null);
      onCollapsedChange(nextWidth < SNAP_WIDTH);
    }

    function currentWidth() {
      return (
        dragWidthRef.current ??
        (collapsedRef.current ? SIDEBAR_CLOSED_WIDTH : SIDEBAR_OPEN_WIDTH)
      );
    }

    function onPointerDown(event: PointerEvent) {
      if (event.button !== 0) {
        return;
      }

      const target = event.target;

      if (
        target instanceof HTMLElement &&
        target.closest("a, button, input, select, textarea, [data-sidebar-logout='true']")
      ) {
        return;
      }

      didDragRef.current = false;
      pointerIdRef.current = event.pointerId;
      startXRef.current = event.clientX;
      startWidthRef.current = currentWidth();
      node.setPointerCapture(event.pointerId);
    }

    function onPointerMove(event: PointerEvent) {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }

      const deltaX = event.clientX - startXRef.current;

      if (!didDragRef.current && Math.abs(deltaX) < DRAG_THRESHOLD) {
        return;
      }

      didDragRef.current = true;
      const nextWidth = clampWidth(startWidthRef.current + deltaX);
      dragWidthRef.current = nextWidth;
      setDragWidth(nextWidth);
    }

    function onPointerUp(event: PointerEvent) {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }

      pointerIdRef.current = null;

      if (didDragRef.current) {
        snap(currentWidth());
      }
    }

    function onWheel(event: WheelEvent) {
      if (Math.abs(event.deltaX) <= Math.abs(event.deltaY)) {
        return;
      }

      const target = event.target;
      const inSidebar = target instanceof Node && node.contains(target);

      if (!inSidebar) {
        return;
      }

      event.preventDefault();
      const nextWidth = clampWidth(currentWidth() - event.deltaX);
      dragWidthRef.current = nextWidth;
      setDragWidth(nextWidth);

      window.clearTimeout(wheelTimerRef.current);
      wheelTimerRef.current = window.setTimeout(() => {
        snap(nextWidth);
      }, 140);
    }

    node.addEventListener("pointerdown", onPointerDown);
    node.addEventListener("pointermove", onPointerMove);
    node.addEventListener("pointerup", onPointerUp);
    node.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      node.removeEventListener("pointerdown", onPointerDown);
      node.removeEventListener("pointermove", onPointerMove);
      node.removeEventListener("pointerup", onPointerUp);
      node.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("wheel", onWheel);
      window.clearTimeout(wheelTimerRef.current);
    };
  }, [onCollapsedChange]);

  return {
    sidebarRef,
    width,
    isDragging,
    visuallyCollapsed,
    didDragRef,
  };
}
