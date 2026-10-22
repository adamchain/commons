import { Router } from "express";
import { store } from "../store.js";
export const neighborhoodsRouter = Router();
function toDto(n) {
    return { id: n.id, name: n.name, metro: n.metro, adjacent: n.adjacent, lat: n.lat, lng: n.lng };
}
neighborhoodsRouter.get("/", (_req, res) => {
    const all = store
        .listNeighborhoods()
        .sort((a, b) => a.name.localeCompare(b.name));
    res.json(all.map(toDto));
});
