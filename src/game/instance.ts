import chapterRaw from "./data/chapter_01.json";
import metroRaw from "./data/metro_demo.json";
import { loadChapter, loadMetro } from "./content.ts";

export const chapter = loadChapter(chapterRaw);
export const metro = loadMetro(metroRaw);
