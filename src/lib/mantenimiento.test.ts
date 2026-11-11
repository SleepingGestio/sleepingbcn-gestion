/// <reference types="node" />
// Run with: node --test src/lib/mantenimiento.test.ts   (Node >= 22.18 strips types natively)
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { incidenciaGrupoId, type AptLite } from "./mantenimiento.ts";

const apts = new Map<number, AptLite>([
  [26, { id_apt: 26, nombre: "Premià PB", id_grupo: 2 }],
  [40, { id_apt: 40, nombre: "Sin grupo", id_grupo: null }],
]);

describe("incidenciaGrupoId (grupo filter)", () => {
  it("uses the incidencia's own id_grup when set", () => {
    assert.equal(incidenciaGrupoId({ id_apt: 26, id_grup: 2 }, apts), 2);
  });

  it("own id_grup wins even if the apartment is in another group", () => {
    assert.equal(incidenciaGrupoId({ id_apt: 26, id_grup: 3 }, apts), 3);
  });

  it("falls back to the apartment's group when id_grup is NULL (incidencia 130 case)", () => {
    assert.equal(incidenciaGrupoId({ id_apt: 26, id_grup: null }, apts), 2);
  });

  it("is null when the apartment itself has no group", () => {
    assert.equal(incidenciaGrupoId({ id_apt: 40, id_grup: null }, apts), null);
  });

  it("is null for an unknown apartment (lists not loaded yet)", () => {
    assert.equal(incidenciaGrupoId({ id_apt: 999, id_grup: null }, apts), null);
    assert.equal(incidenciaGrupoId({ id_apt: 26, id_grup: null }, new Map()), null);
  });

  it("common-area incidencias keep their own id_grup (or null)", () => {
    assert.equal(incidenciaGrupoId({ id_apt: null, id_grup: 5 }, apts), 5);
    assert.equal(incidenciaGrupoId({ id_apt: null, id_grup: null }, apts), null);
  });
});
