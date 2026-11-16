# @biolibs/bionet-panels

The parts of a Bionet lab application, ready to place: the freezer, the people, the history, what other labs are shown, a whole window that puts them together, and a lab's public page.

```tsx
import "@biolibs/bionet-theme/theme.css";
import "@biolibs/bionet-panels/panels.css";
import { sourceOf } from "@biolibs/bionet-client";
import { LabProvider } from "@biolibs/bionet-react";
import { LabWindow } from "@biolibs/bionet-panels";

<LabProvider source={sourceOf(lab)}>
  <LabWindow />
</LabProvider>
```

## An application owns nothing

That is a whole lab application. What an application adds is only what its platform can do and nothing else can: on a desktop, the keychain, the window and the file the entries are kept in. A web page wanting the same application differs in those and nowhere else, which is the test that the views really are shared.

`LabWindow` takes a person through the places they can be: nobody has said who is at the device, the device is in no lab, the device is waiting to be let into one, and then the lab itself. Each panel also stands alone inside a `LabProvider`.

## The panels hold no state about the lab

A panel is told the lab as it stands and draws it. A button asks for one thing to be done and waits to be told how the lab changed. So what is on screen is always what the signed logs say and never what a form hoped, and a change another member made appears without the panel doing anything.

## The wording is part of the package

What a signature settles, and what it does not; what "on offer" promises; what it means that another lab did not answer. These have to be said the same way everywhere, and a page that words them itself will sooner or later claim more than the checks support. So `Held`, `PeerAnswered`, `PeerSilent` and `WhatASignatureSettles` carry their sentences with them, and `describeEntry` and `syncWords` turn a signed change and a connection's state into words.

The public page's pieces take what was fetched and checked as plain values, so they can be drawn on a server. Everything that uses hooks is marked `"use client"`.

## Styles that stay where they are put

Every rule in `panels.css` is inside `.bionet`, so nothing reaches the page around a panel, and every colour is one of the theme's variables. Both are tested: one test reads the stylesheet and fails if a selector escapes the scope, another fails if a colour is written in directly.

## A host can add a view, and nothing else

`LabWindow` takes `extra` tabs. That is how a desktop app shows the three-dimensional scene without this package depending on three.js, which a lab's public web page should not have to load. The host supplies a component; it still decides no colour and no rule.

## Source layout

```
packages/bionet-panels/
  panels.css            the styles, scoped to .bionet
  src/window.tsx        LabWindow, and the screens before there is a lab
  src/freezer.tsx       parts, tubes, amounts
  src/people.tsx        the roster, and letting somebody in
  src/history.tsx       every signed change, and what became of it
  src/sharing.tsx       what other labs are shown, and the lab's web peer
  src/public.tsx        a lab's public page
  src/parts.tsx         the small pieces they are made of
```
