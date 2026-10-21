import assert from "node:assert/strict";
import { once } from "node:events";
import { test } from "node:test";
import express from "express";
import { CustomerContractDocument } from "../src/customer/models/index.js";
import { downloadDocument } from "../src/customer/controllers/customer.controller.js";

test("owned document downloads preserve browser redirects and give native clients a credential-free target", async (t) => {
  const documentId = "0123456789abcdef01234567";
  t.mock.method(CustomerContractDocument, "findOne", (query) => {
    assert.equal(query._id, documentId);
    assert.deepEqual(query.status, { $ne: "ARCHIVED" });
    return {
      lean: async () =>
        query.customer === "owner"
          ? {
              title: "Contract",
              fileName: "contract.pdf",
              fileUrl: "https://media.example.test/contract.pdf",
            }
          : null,
    };
  });
  const app = express();
  app.get("/download/:documentId", (req, res, next) => {
    req.externalUser = { _id: req.get("X-Test-Identity") || "owner" };
    downloadDocument(req, res).catch(next);
  });
  app.use((error, req, res, next) =>
    res.status(error.status || 500).json({ error: error.code }),
  );
  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  });
  const url = `http://127.0.0.1:${server.address().port}/download/contract_${documentId}`;
  const browser = await fetch(url, { redirect: "manual" });
  assert.equal(browser.status, 302);
  assert.equal(
    browser.headers.get("location"),
    "https://media.example.test/contract.pdf",
  );
  const native = await fetch(url, {
    headers: { "X-Starvnt-Client": "native" },
    redirect: "manual",
  });
  assert.equal(native.status, 200);
  assert.equal(native.headers.get("location"), null);
  assert.deepEqual(await native.json(), {
    downloadUrl: "https://media.example.test/contract.pdf",
  });
  const other = await fetch(url, {
    headers: {
      "X-Starvnt-Client": "native",
      "X-Test-Identity": "another-customer",
    },
  });
  assert.equal(other.status, 404);
});
