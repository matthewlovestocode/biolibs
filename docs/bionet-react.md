# @biolibs/bionet-react

A Bionet lab for React, with no appearance of its own: the lab as it stands, asking for a change and hearing why it was refused, and the Bionet mark and logo drawn in the current theme.

```tsx
import { sourceOf } from "@biolibs/bionet-client";
import { LabProvider, Mark, useAct, useLab, useTrouble } from "@biolibs/bionet-react";

function Tubes() {
  const lab = useLab()?.lab;                 // drawn again whenever the lab changes
  const act = useAct();
  const { trouble } = useTrouble();          // why the last change was refused, if one was
  return lab?.items.map((item) => (
    <button key={item.item} onClick={() => act("adjust", { item: item.item, by: -1 })}>
      {item.amount} {item.unit}
    </button>
  ));
}

<LabProvider source={sourceOf(lab)}>
  <Mark size={34} />
  <Tubes />
</LabProvider>
```

## Hooks, and nothing drawn

What a lab looks like is an application's business, or `@biolibs/bionet-panels`'. This package stops at the three things every React view of a lab needs: the lab as it stands (`useLab`), a way to ask for a change (`useAct`), and the last refusal (`useTrouble`).

The refusal is the one piece of state kept here. When a change is turned down, the reason is worth showing wherever the application shows such things, not only beside the button that was pressed, so it is held by the provider for any component to read and dismiss.

## It does not hold the lab

`LabProvider` is given a `LabSource`, not a `Lab`. In a desktop app the lab is in a different process from the window, and the hooks cannot tell: a lab in the same process and a bridge to one elsewhere satisfy the same interface. `useLab` is React's external-store hook over that source, which is why the source's snapshot must be the same object until something changes.

## The mark follows the theme

`Mark` and `Logo` draw the geometry from `@biolibs/bionet-theme` with colours taken from its CSS variables, so they change with a light or dark theme and there is no image to swap. The variables have to be on the page: import the theme's stylesheet, or render `ThemeStyle` once.

## Drawing on a server first

The file with the hooks is marked `"use client"`, so a framework that draws on a server first can import the package. `Mark` and `Logo` use no hooks and can be drawn there.

## Source layout

```
packages/bionet-react/src/
  lab.tsx      LabProvider and the hooks
  brand.tsx    the mark and the logo, in the current theme's colours
```
