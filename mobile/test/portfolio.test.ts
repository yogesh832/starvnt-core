import { test } from "node:test";
import assert from "node:assert/strict";
import { portfolioProject } from "../src/portfolio.ts";

const draft = {
  projectName: " Anniversary ",
  eventType: "Anniversary",
  eventDate: "2026-09-17",
  city: "Kolkata",
  venue: "Client venue",
  style: "Documentary",
  tags: "family, candid",
};
test("project saves use backend review status and actual uploaded assets", () => {
  const body = portfolioProject(
    draft,
    [{ url: "https://cdn.example.com/video.mp4", resourceType: "VIDEO" }],
    "VENDOR_REVIEW",
  );
  assert.equal(body.status, "VENDOR_REVIEW");
  assert.equal(body.projectName, "Anniversary");
  assert.equal(body.mediaItems[0].mediaType, "VIDEO");
  assert.equal(body.coverUrl, "https://cdn.example.com/video.mp4");
  assert.deepEqual(body.tags, ["family", "candid"]);
});
test("projects cannot silently use stock media, impossible dates or unsupported draft status", () => {
  const media = [{ url: "https://cdn.example.com/image.jpg" }];
  assert.throws(() => portfolioProject(draft, [], "PUBLISHED"));
  assert.throws(() =>
    portfolioProject({ ...draft, eventDate: "2026-02-31" }, media, "PUBLISHED"),
  );
  assert.throws(() => portfolioProject(draft, media, "DRAFT"));
});
