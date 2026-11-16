# @biolibs/bionet-react

A Bionet lab for React, with no appearance of its own: the lab as it stands, asking for a change and
hearing why it was refused, and the Bionet mark and logo drawn in the current theme.

## Install

```bash
npm install @biolibs/bionet-react @biolibs/bionet-client react
```

## The lab

```tsx
import { sourceOf } from "@biolibs/bionet-client";
import { LabProvider, useAct, useLab, useTrouble } from "@biolibs/bionet-react";

function Tubes() {
  const lab = useLab()?.lab;          // drawn again whenever the lab changes
  const act = useAct();
  const { trouble, dismiss } = useTrouble();
  if (!lab) return null;
  return (
    <>
      {trouble && <p onClick={dismiss}>{trouble}</p>}
      {lab.items.map((item) => (
        <button key={item.item} onClick={() => act("adjust", { item: item.item, by: -1 })}>
          {item.amount} {item.unit}
        </button>
      ))}
    </>
  );
}

<LabProvider source={sourceOf(lab)}>
  <Tubes />
</LabProvider>
```

| Hook | Gives |
|---|---|
| `useLab()` | Everything there is to draw, or `null` while the lab is still being opened |
| `useAct()` | A function that asks for one change and resolves to `{ ok, result }` or `{ ok: false, error }` |
| `useTrouble()` | The last refusal, said for a person, and a way to put it away |

`source` is a lab in this process (`sourceOf(lab)`) or a bridge to one elsewhere, such as a desktop
app's main process. The hooks do not care which.

## The mark

```tsx
import "@biolibs/bionet-theme/theme.css";
import { Logo, Mark } from "@biolibs/bionet-react";

<Mark size={34} />
<Logo height={44} />
```

Both are drawn from the geometry in `@biolibs/bionet-theme` in its CSS variables, so they follow a
light or dark theme with no image to swap. An app that does not import the stylesheet can render
`<ThemeStyle />` once instead.

## Testing

`test/react.test.ts` renders to text, with no browser.

## License

MIT
