import { Material } from "../types";

/** What a note is called on screen: its topic, else its chapter, else the stored title (taken from the PDF file name). */
export const noteHeading = (m: Pick<Material, "title" | "topic" | "chapter">): string => m.topic?.name || m.chapter?.name || m.title;
