"use client";

/**
 * What a thing in the scene is made of, as far as drawing it goes.
 *
 * Everything here used to be drawn the same way: bright edges and a fill of three or four per cent,
 * at every distance. That is the right drawing of one machine you are standing at and the wrong
 * drawing of a room, because nothing ever hides anything: from across a lab you see every shelf,
 * every box and every tube through every wall at once, and it reads as a thicket.
 *
 * So a piece has a skin, and a skin is how solid it is — not what colour it is. Colour in this
 * scene means something: `yours`, `theirs`, `held`, `found`, `attention`. A skin that carried
 * colour would take that language away, so it carries only how much of the colour is there.
 *
 * How solid depends on how near you are to that piece, and not on how deep you have navigated —
 * you can orbit up to a freezer without going into it. Far off it is solid and hides what is
 * inside; up close it clears and the shelves show through. That is the whole idea: a lab is a room
 * of objects until you walk up to one, and then it is a mechanism.
 *
 * Two things stay see-through whatever: the machine being used, because you are at it, and
 * anything a search has matched, because being able to see it through a wall is what a search is
 * for.
 */
import { useState } from "react";

/**
 * Whether the scene draws what things are made of.
 *
 * Off is the drawing this scene has always had: edges, and a fill of a few per cent at every
 * distance. It is the default, because it is what people here are used to looking at and because
 * skins change what can be seen through what — which is the point of them and also a reason to
 * ask for them rather than to be given them.
 */
export type Skins = "on" | "off";

/** What each setting says, for whoever is deciding whether to change it. */
export const SKIN_SAYS: Readonly<Record<Skins, string>> = {
  on: "Things are solid from across the room and clear when you are at them. Press for the wireframe.",
  off: "The wireframe: edges, and the same faint fill at every distance. Press to turn skins on.",
};

/** How solid one kind of thing is, at each end of the range. */
export interface Skin {
  /** How solid it is seen from across the room, from 0 to 1. */
  far: number;
  /** How solid it is when you are at it. */
  near: number;
}

/**
 * The skins there are.
 *
 * One, for now. Going piece by piece through the equipment and giving each part its own is the work
 * this is here to make possible; starting with every part the same is what makes that work visible,
 * because anything that then wants a skin of its own will look wrong until it gets one.
 */
export const SKINS: Readonly<Record<string, Skin>> = {
  plain: { far: 0.92, near: 0.05 },
};

/** How far off a thing has to be, in its own widths, before it is drawn solid. */
export const FAR = 4;

/** How near, in its own widths, before it is drawn clear. */
export const NEAR = 1.2;

/** Above this much fill, a thing hides what is behind it. */
export const HIDES_ABOVE = 0.6;

/**
 * How near the camera is to a thing, from 0 (across the room) to 1 (at it).
 *
 * It is measured in the thing's own size rather than in metres, so that a freezer and a tube both
 * clear at the point somebody would call being at them.
 *
 * @param distance - How far the camera is from it, in metres.
 * @param size - How big it is: its largest side, in metres.
 * @returns 0 to 1.
 *
 * @example
 * ```ts
 * import { nearness } from "@biolibs/bionet-scene";
 *
 * nearness(10, 2);    // 0: four of its own widths away or more
 * nearness(1, 2);     // 1: nearer than one and a bit of them
 * ```
 */
export function nearness(distance: number, size: number): number {
  if (!(size > 0)) return 1;
  const near = size * NEAR;
  const far = size * FAR;
  if (distance <= near) return 1;
  if (distance >= far) return 0;
  const through = (far - distance) / (far - near);
  // Eased, so that walking towards something dissolves it rather than switching it.
  return through * through * (3 - 2 * through);
}

/** How a piece ends up drawn. */
export interface Drawn {
  /** How solid the fill is, from 0 to 1. */
  fill: number;
  /** Whether it hides what is behind it. */
  hides: boolean;
  /** How far the fill's colour is pulled towards the room's own darkness, from 0 to 1. */
  darkened: number;
}

/**
 * How solid a piece is drawn, given what it is made of and how near you are.
 *
 * The colour is darkened as the fill rises, for two reasons. A solid thing in this theme should
 * read as an object with a lit edge rather than as a glowing block; and the dark theme runs a bloom
 * pass over anything bright, which a solid fill in the theme's own colours would blow straight
 * through, turning a lab into a white haze.
 *
 * @param skin - What it is made of.
 * @param how - How near the camera is, from 0 to 1.
 * @param setting - What the scene is set to.
 * @returns The fill, whether it hides, and how far to darken it.
 *
 * @example
 * ```ts
 * import { SKINS, skinAt } from "@biolibs/bionet-scene";
 *
 * skinAt(SKINS["plain"]!, 0, "on").hides;     // true: far off, so it hides what is inside
 * skinAt(SKINS["plain"]!, 1, "on").hides;     // false: you are at it, so it does not
 * ```
 */
export function skinAt(skin: Skin, how: number, setting: Skins, was = skin.near): Drawn {
  // Off is the wireframe as it was: whatever fill the piece was drawn with, at every distance,
  // hiding nothing. The piece passes its own `was` so that turning skins off puts back exactly
  // what was there, rather than something close to it.
  if (setting === "off") return { fill: was, hides: false, darkened: 0 };
  const close = Math.min(1, Math.max(0, how));
  const fill = skin.far + (skin.near - skin.far) * close;
  return { fill, hides: fill >= HIDES_ABOVE, darkened: Math.min(1, fill / skin.far) };
}

/**
 * Whether a thing should stay see-through whatever the setting says.
 *
 * @param why - What the thing means: the tone it is drawn in, and whether it is being used.
 * @returns Whether to leave it clear.
 *
 * @example
 * ```ts
 * import { staysClear } from "@biolibs/bionet-scene";
 *
 * staysClear({ tone: "found" });     // true: a search match seen through a wall is the point
 * staysClear({ inUse: true });       // true: you are at it
 * staysClear({ opened: true });      // true: it is what was opened, and its own skin is in the way
 * ```
 */
export function staysClear(why: { tone?: string; inUse?: boolean; opened?: boolean }): boolean {
  return why.inUse === true || why.opened === true || why.tone === "found" || why.tone === "attention";
}

/**
 * The skins setting, and a way to change it.
 *
 * It starts off, which is the drawing this scene has always had.
 *
 * @param pinned - A setting to use whatever anybody picks.
 * @returns The setting, and a function that flips it.
 */
export function useSkins(pinned?: Skins): [Skins, () => void] {
  const [chosen, setChosen] = useState<Skins>("off");
  const skins = pinned ?? chosen;
  return [skins, () => setChosen(skins === "off" ? "on" : "off")];
}

/**
 * How to draw one fill, for a piece that may have no skin and a scene that may have skins off.
 *
 * This is the whole of the decision the renderer makes each frame for each fill, so that what is
 * drawn can be checked without a scene: a piece with nothing to be made of, and a scene with the
 * setting off, both come out as the fill the piece was authored with and hide nothing.
 *
 * @param skin - What it is made of, or `null` for something never filled, such as a room.
 * @param setting - What the scene is set to.
 * @param how - How near the camera is, from 0 across the room to 1 at it.
 * @param was - The fill the piece is drawn with when skins are off.
 * @returns How solid to draw it.
 */
export function fillAt(skin: Skin | null, setting: Skins, how: number, was: number): Drawn {
  if (skin === null || setting === "off") return { fill: was, hides: false, darkened: 0 };
  return skinAt(skin, how, setting, was);
}
