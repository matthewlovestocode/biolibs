# @biolibs/bionet-panels

The parts of a Bionet lab application, ready to place: the freezer, the people, the history, what
other labs are shown, and a whole window that puts them together. Light and dark.

## Install

```bash
npm install @biolibs/bionet-panels @biolibs/bionet-react @biolibs/bionet-client @biolibs/bionet-theme react
```

## A whole application

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

`LabWindow` takes a person through the places they can be: nobody has said who is at the device, the
device is in no lab, the device is waiting to be let into one, and then the lab itself.

## The panels on their own

| Panel | Shows |
|---|---|
| `Freezer` | Every part and its tubes: use or add, count, retire, put on offer, add a part or a tube |
| `People` | The roster, and for a keeper the way to add somebody and the invitation to send |
| `History` | Every signed change, newest first, in words, with what became of it |
| `Sharing` | What other labs are shown, a button to publish it, and the lab's web peer |
| `SyncStatus`, `Trouble`, `DeviceKey` | The small pieces |

Each reads the lab through `@biolibs/bionet-react`, so it goes anywhere inside a `LabProvider`. The
styles apply only inside an element with the class `bionet`, which `LabWindow` supplies; put a panel
used on its own inside one:

```tsx
<div className="bionet"><Freezer /></div>
```

Every colour comes from `@biolibs/bionet-theme`, and no rule reaches outside `.bionet`.

## Testing

`test/panels.test.ts` renders each panel to text against a real lab, and checks that the stylesheet
stays inside `.bionet` and uses only the theme's colours.

## License

MIT
