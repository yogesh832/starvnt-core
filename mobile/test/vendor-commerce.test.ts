import assert from "node:assert/strict";
import { test } from "node:test";
import { completionPayload, quotePricing } from "../src/vendorCommerce.ts";

test("quote revisions retain every pricing component when calculating the offer", () => {
  assert.deepEqual(
    quotePricing({
      basePrice: "10000",
      travelFee: "500",
      equipmentFee: "2000",
      setupFee: "1000",
      additionalFee: "250",
    }),
    {
      basePrice: 10000,
      travelFee: 500,
      equipmentFee: 2000,
      setupFee: 1000,
      additionalFee: 250,
      totalAmount: 13750,
    },
  );
  assert.throws(() => quotePricing({ basePrice: "100", equipmentFee: "-1" }));
  assert.throws(() => quotePricing({ basePrice: "bad" }));
});

test("completion evidence keeps videos separate from photos and preserves actual checklist choices", () => {
  const payload = completionPayload(
    "",
    " Handover completed ",
    [
      {
        url: "https://cdn.example/photo.jpg",
        resourceType: "IMAGE",
        filename: "photo.jpg",
      },
      {
        url: "https://cdn.example/video.mp4",
        resourceType: "VIDEO",
        filename: "video.mp4",
      },
    ],
    [{ item: "Customer handover", checked: false }],
  );
  assert.deepEqual(payload.photos, ["https://cdn.example/photo.jpg"]);
  assert.deepEqual(payload.videos, ["https://cdn.example/video.mp4"]);
  assert.equal(payload.files[1].name, "video.mp4");
  assert.equal(payload.checklist[0].checked, false);
});

test("notes-only completion evidence matches the existing web flow without falsely verifying completion", () => {
  const payload = completionPayload(
    "",
    "The client has received the equipment.",
    [],
    [],
  );
  assert.equal(payload.notes, "The client has received the equipment.");
  assert.equal(payload.deliverablesUrl, "");
  assert.equal(payload.executionStatus, undefined);
  assert.throws(() => completionPayload("", " ", [], []));
  assert.throws(() => completionPayload("javascript:alert(1)", "", [], []));
});
