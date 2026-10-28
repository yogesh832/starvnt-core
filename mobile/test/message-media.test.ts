import { test } from "node:test";
import assert from "node:assert/strict";
import { attachedMessage, messageLinks } from "../src/messageMedia.ts";

test("web attachment messages keep signed URLs and render image previews", () => {
  const url = "https://cdn.example.com/image/upload/photo.jpg?token=a%2Bb";
  const message = attachedMessage("Please review", url);
  assert.equal(message, `Please review\n[Attached Media/Link]: ${url}`);
  assert.deepEqual(messageLinks(`${message}\n${url}`), [{ url, image: true }]);
});
test("links exclude credentials and unsupported schemes; documents stay links", () => {
  assert.deepEqual(
    messageLinks(
      "https://user:secret@example.com/file javascript:alert(1) https://example.com/contract.pdf.",
    ),
    [{ url: "https://example.com/contract.pdf", image: false }],
  );
  assert.throws(() => attachedMessage("", "file:///private/file"));
  assert.throws(() => attachedMessage(""));
  assert.throws(() =>
    attachedMessage("x".repeat(2000), "https://example.com/file"),
  );
});
