import { Router } from "express";
import { store } from "../store.js";
import type { NeighborhoodDTO } from "../types/shared.js";

export const neighborhoodsRouter = Router();

function toDto(n: ReturnType<typeof store.findNeighborhoodById> & {}): NeighborhoodDTO {
  return { id: n.id, name: n.name, metro: n.metro, adjacent: n.adjacent };
}

neighborhoodsRouter.get("/", (_req, res) => {
  const all = store
    .listNeighborhoods()
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json(all.map(toDto));
});
