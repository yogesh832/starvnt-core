# Proposal Studio — How to Run and Demo

Branch: `feature/proposal-studio`

## 1. One-time setup

```bash
cd starvnt-core
npm install
```

**PDF browser:** PDFs are rendered by the Chrome or Edge already installed on the machine (`puppeteer-core`; nothing is downloaded).
- If neither browser is in its normal location, set `PROPOSAL_BROWSER_PATH` in `server/.env` to a Chromium/Chrome executable.
- On a Linux server, install `chromium` and set `PROPOSAL_BROWSER_PATH=/usr/bin/chromium`.

**Generated PDFs:** stored privately in `server/var/proposals/`, which is git-ignored. Set `PROPOSAL_STORAGE_DIR` to change the location.

## 2. Load demo data

```bash
npm run seed:proposal-demo
```

- Re-runnable. It only resets events the demo itself created.

**Customer signs in with OTP only?** Attach the demo to your own account instead. Sign in once on the website so the account exists, then run:

```bash
node server/scripts/seed-proposal-demo.js --email=your-email@example.com
```

- Your account and your own events are not changed.
- Three demo events are added to the account.
- Sign in with OTP as usual and open **Home**.
- It refuses to run when `NODE_ENV=production`.

**Demo accounts** (password `Demo@2027` for all):

| Who | Email | Where to sign in |
|---|---|---|
| Customer | `proposal.customer@starvnt.demo` | `/login` → email + password |
| Admin (maker: prepares, composes, publishes) | `proposal.maker@starvnt.demo` | `/admin/login` |
| Admin (Finance checker: approves pricing) | `proposal.checker@starvnt.demo` | `/admin/login` |

**Three journeys** are created at different stages:

| Journey | Stage it starts at |
|---|---|
| A. Wedding Reception (₹4,95,000) | Final proposal generated and sent to the customer |
| B. Birthday (Space theme) | The cake vendor has not approved, so final generation is **blocked**; a watermarked preliminary preview is shared |
| C. Corporate Summit | Commercial record waiting for the Finance checker |

## 3. Start the app

Use two terminals, both run from `starvnt-core`:

```bash
npm run dev        # backend  → http://localhost:4000
npm run dev:web    # web app  → http://localhost:5173
```

## 4. Demo script

1. **Customer: review the wedding proposal**
   - Sign in as the customer. The dashboard shows the **My Event Proposal** card.
   - Open **View proposal** and walk through the Overview, Services, Budget, Terms, Pending and History tabs.
   - **View PDF / Download** opens the generated A4 proposal.
   - **Ask Aura+**: try "What is my payment schedule?" or "What is excluded?". Answers come only from the approved proposal.
2. **Customer: request a change, or approve**
   - **Request changes** sends a change request. The version is then closed for decision until the team issues a new one.
   - **Approve v1** records approval of that exact version. The screen states that this does **not** confirm a booking; booking still goes through the normal payment flow.
3. **Admin: Proposal Studio overview**
   - Sign in as the **maker** and open **Proposal Studio** in the sidebar.
   - The list shows every proposal with its readiness state, as validated by Core.
4. **Admin: blocked birthday proposal**
   - Open the Birthday proposal. Readiness shows **Vendor approval pending — Cake agreement is pending**.
   - **Generate final proposal** stays disabled. The server would refuse it anyway.
5. **Admin: maker–checker on the corporate summit**
   - Open the Corporate Summit. The commercial record is *Pending approval*.
   - The maker cannot approve it. Sign out, sign in as the **checker**, and approve it from Proposal Studio.
6. **Admin: generate and publish the corporate proposal**
   - Back as the maker, readiness is now **Ready for generation**.
   - Click **Generate final proposal**, then **Render PDF**, check the **QA** column, use **Preview** and **PDF**, then **Send to customer**.
7. **Customer: see the new proposal**
   - Sign in as the customer again. The corporate proposal is now available.

**Handing the wedding change request back:** open the wedding proposal in Proposal Studio and click **Generate final proposal** again. This creates v2 and keeps v1 as history. Then **Render PDF** → **Send to customer**.

## 5. Proof (automated tests)

```bash
cd server
node --test test/proposal-studio.test.js test/proposal-demo.test.js test/proposal-phase0.test.js
npm test            # whole server suite
cd ../web && npm test
```

What the tests prove:
- Final generation is blocked when an agreement is pending, rejected, expired or superseded; when commercial approval is missing; when pricing does not reconcile; when requirements are invalid; or when the approved data changed.
- A maker cannot approve their own commercial record.
- Generation is idempotent.
- Vendor prices and margin never appear in customer APIs, the snapshot, the PDF text or Aura+ answers.
- Customer approval is tied to the exact version and creates no booking or payment.
- v2 preserves v1.
- Preliminary proposals carry a watermark on every page and cannot be approved.
- Aura+ answers that invent an amount are replaced with snapshot facts.

## 6. API map

| Area | Base path |
|---|---|
| Admin | `/api/admin/proposal-studio/*`: readiness, manifest, agreements, commercial, generate, render, preview, pdf, publish, change requests, access log |
| Vendor | `/api/vendor/agreements*`: list, approve / reject / request revision |
| Customer | `/api/customer/proposals*`: list, view, pdf, decision, change requests, ask |

## 7. Images: vendor photos, AI concepts, customer references

**Admin:** Proposal Studio → open an event → **5 · Visual assets**.

- **Upload a photo:** choose the source type, section and (for portfolio photos) the vendor.
  - The **licence / owner** field is required.
  - Images are checked (real image, at least 600 px wide), resized to at most 2000 px, and stripped of EXIF/GPS.
- **Generate an AI concept:** the prompt is built from the frozen manifest (event type, theme, palette, guests, preferences).
  - Requires `GEMINI_API_KEY` with image quota. The model is set by `PROPOSAL_IMAGE_MODEL` (default `gemini-2.5-flash-image`).
  - Without quota, admins see a clear "AI image generation failed" message.
- **Approve / Reject:** only approved images enter the next preliminary or final version. Published versions keep the images they were generated with.
- **Labels:** each label is fixed by the source type and cannot be typed by an admin:
  - "AI-generated concept — illustrative only, not an actual event"
  - "Vendor portfolio — actual past work"
  - "STARVNT event photograph"
  - "Illustrative reference — not a guaranteed deliverable"
  - "Your reference image"
- **PDF:** labels are printed on every image. QA blocks publishing if an approved image is missing.

**Customer:** the event page shows the event's proposal card and an **Inspiration images** section.
- Uploaded references wait for STARVNT review before any proposal uses them.
- The proposal page shows the approved images with their labels.

Images are stored privately in `server/var/assets/` (git-ignored; set `PROPOSAL_ASSET_DIR` to change).

## 8. Known limits (next phase)

- **Vendor portal agreements screen** (`web/src/pages/vendor/pages/AgreementsPage.jsx`): the screen exists, but `/vendor` is disabled on the customer branch by the branch policy. It becomes visible when promoted to `codex/development` or `main`. In the demo, vendor approval is done by the seed or through the API.
- **Mobile app (Expo):** proposal screens are not built yet. The web customer pages are mobile-responsive.
